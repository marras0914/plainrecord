/**
 * PlainRecord: party splits on the floor votes for bills the traditions named
 *
 *   npm run data:faith:votes
 *
 * 1. Lists every recorded floor vote of the 119th Congress: the House from
 *    the congress.gov API (DATA_GOV_API_KEY in .env.local), the Senate from
 *    senate.gov's vote menus.
 * 2. Gets each voted measure's titles from congress.gov and matches them, and
 *    the measure numbers, against every bill named in faith_advocacy.ts. It
 *    refuses to write if a named bill has a roll call and is not in
 *    FLOOR_BILLS (faith_floor_votes.ts), so "no floor vote" is checked, not
 *    assumed.
 * 3. For each FLOOR_BILLS measure, reads every roll call's question and checks
 *    that the listed votes are exactly the rule's: each chamber's passage or
 *    concurrence votes, or, where a chamber has none, its vote to proceed.
 * 4. Reads each listed vote's official XML (House Clerk, Senate) and writes
 *    the party splits to data/faith/floor_votes.json.
 *
 * Raw downloads are kept in data/faith_sources/votes/ (gitignored).
 */

import dns from 'node:dns';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { ADVOCACY } from '../faith_advocacy';
import { FLOOR_BILLS, FLOOR_VOTES_FILE, numberTokens, type FloorVote, type FloorVoteRef, type VoteKind, type Split, type FloorVotesData } from '../faith_floor_votes';

// api.congress.gov times out over IPv6 from here.
dns.setDefaultResultOrder('ipv4first');

const ROOT = new URL('../', import.meta.url);
const RAW = new URL('data/faith_sources/votes/', ROOT);
mkdirSync(RAW, { recursive: true });
const env = Object.fromEntries(readFileSync(new URL('.env.local', ROOT), 'utf8').split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const KEY = env.DATA_GOV_API_KEY;
if (!KEY) throw new Error('fetch_floor_votes: DATA_GOV_API_KEY is not in .env.local');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(path: string): Promise<any> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://api.congress.gov/v3${path}${path.includes('?') ? '&' : '?'}format=json&api_key=${KEY}`);
    if (r.ok) return r.json();
    if (r.status === 404) return null;
    await sleep(2000 * (i + 1));
  }
  throw new Error(`fetch_floor_votes: congress.gov failed on ${path.split('?')[0]}`);
}

async function text(url: string, file: string): Promise<string> {
  const p = new URL(file, RAW);
  if (existsSync(p)) return readFileSync(p, 'utf8');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch_floor_votes: ${r.status} on ${url}`);
  const t = await r.text();
  writeFileSync(p, t);
  return t;
}

/** "H.R. 29", "HR", "S." → "hr/29"-style keys. */
const key = (type: string, num: string | number) => `${type.toLowerCase().replace(/[.\s]/g, '')}/${num}`;
const keyOf = (bill: string) => { const m = bill.match(/^([A-Za-z.\s]+?)\s*(\d+)$/); return m ? key(m[1], m[2]) : null; };
const tag = (x: string, t: string) => (x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]?.trim() ?? '';

// --- 1. every roll call -------------------------------------------------------

const house: any[] = [];
for (let off = 0; ; off += 250) {
  const j = await api(`/house-vote/119?limit=250&offset=${off}`);
  house.push(...j.houseRollCallVotes);
  if (!j.pagination.next) break;
}
const senate: { session: 1 | 2; vote: number; date: string; issue: string; question: string }[] = [];
for (const s of [1, 2] as const) {
  const r = await fetch(`https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_${s}.xml`);
  if (r.status === 404) continue;
  if (!r.ok) throw new Error(`fetch_floor_votes: senate vote menu ${s}: ${r.status}`);
  const x = await r.text();
  for (const m of x.matchAll(/<vote>([\s\S]*?)<\/vote>/g)) {
    senate.push({ session: s, vote: Number(tag(m[1], 'vote_number')), date: tag(m[1], 'vote_date'), issue: tag(m[1], 'issue'), question: tag(m[1], 'question').replace(/<[\s\S]*$/, '').trim() });
  }
}
const houseKey = (v: any) => (v.legislationType && v.legislationNumber ? key(v.legislationType, v.legislationNumber) : null);
const senateKey = (v: { issue: string }) => keyOf(v.issue);
const measures = new Set<string>([...house.map(houseKey), ...senate.map(senateKey)].filter((k): k is string => !!k));
console.log(`  ${house.length} House and ${senate.length} Senate roll calls, on ${measures.size} measures`);

// --- 2. which named bills had one ---------------------------------------------

const titlesFile = new URL('bill_titles.json', RAW);
const titles: Record<string, string[]> = existsSync(titlesFile) ? JSON.parse(readFileSync(titlesFile, 'utf8')) : {};
for (const m of measures) {
  if (titles[m]) continue;
  const [t, n] = m.split('/');
  const j = await api(`/bill/119/${t}/${n}/titles?limit=250`);
  titles[m] = j ? [...new Set<string>(j.titles.map((x: any) => x.title))] : [];
  await sleep(150);
}
writeFileSync(titlesFile, JSON.stringify(titles, null, 1));

const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
// Long official titles ("To amend...", "Providing for consideration of...")
// mention bills in passing; only short titles name one.
const LONG = /^(to |a bill|an act|providing for|a resolution|making |relating |disapproving|condemning|expressing|recognizing the|supporting the|authorizing|directing)/i;
const named = new Map<string, Set<string>>(); // measure -> what matched
for (const m of measures) {
  const short = titles[m].filter((t) => !LONG.test(t));
  for (const a of ADVOCACY) {
    for (const n of numberTokens(a.numbers)) if (keyOf(n) === m) (named.get(m) ?? named.set(m, new Set()).get(m)!).add(`number ${n}`);
    for (const n of a.named) {
      // One-word names (RESTORE) only as written, in capitals.
      const hit = n.split(/\s+/).length === 1
        ? short.some((t) => new RegExp(`\\b${n}\\b`).test(t))
        : short.some((t) => norm(t).includes(norm(n)));
      if (hit) (named.get(m) ?? named.set(m, new Set()).get(m)!).add(`name ${n}`);
    }
  }
}
const configured = new Set(FLOOR_BILLS.flatMap((b) => b.numbers.map((n) => keyOf(n)!)));
const stray = [...named.keys()].filter((m) => !configured.has(m));
if (stray.length) throw new Error(`fetch_floor_votes: named bills with a roll call that FLOOR_BILLS does not list: ${stray.map((m) => `${m} (${[...named.get(m)!].join(', ')})`).join('; ')}`);
for (const b of FLOOR_BILLS) if (!b.numbers.some((n) => named.has(keyOf(n)!))) throw new Error(`fetch_floor_votes: ${b.id} matched no roll call`);
console.log(`  named bills with a roll call: ${[...named.keys()].join(', ')}`);

// --- 3. the rule: which of each bill's votes count --------------------------------

function kindOf(chamber: 'house' | 'senate', question: string): VoteKind | null {
  if (/^On Passage( of the Bill)?$/i.test(question)) return 'passage';
  if (chamber === 'house' && /^On Motion to Concur in the Senate Amendment$/i.test(question)) return 'concur';
  if (chamber === 'senate' && /^On Cloture on the Motion to Proceed$/i.test(question)) return 'cloture-proceed';
  return null;
}
const refId = (r: FloorVoteRef) => (r.chamber === 'house' ? `house ${r.year}-${r.roll}` : `senate ${r.session}-${r.vote}`);

const houseXml = async (year: number, roll: number) => text(`https://clerk.house.gov/evs/${year}/roll${String(roll).padStart(3, '0')}.xml`, `house_${year}_${roll}.xml`);
const senateXml = async (s: number, n: number) => text(`https://www.senate.gov/legislative/LIS/roll_call_votes/vote119${s}/vote_119_${s}_${String(n).padStart(5, '0')}.xml`, `senate_${s}_${n}.xml`);

for (const b of FLOOR_BILLS) {
  const keys = new Set(b.numbers.map((n) => keyOf(n)!));
  const want: string[] = [];
  for (const chamber of ['house', 'senate'] as const) {
    const all: { id: string; kind: VoteKind | null }[] = [];
    if (chamber === 'house') {
      for (const v of house.filter((v) => keys.has(houseKey(v)!))) {
        const year = Number(v.startDate.slice(0, 4));
        const x = await houseXml(year, v.rollCallNumber);
        all.push({ id: `house ${year}-${v.rollCallNumber}`, kind: kindOf('house', tag(x, 'vote-question')) });
      }
    } else {
      for (const v of senate.filter((v) => keys.has(senateKey(v)!))) all.push({ id: `senate ${v.session}-${v.vote}`, kind: kindOf('senate', v.question) });
    }
    const final = all.filter((v) => v.kind === 'passage' || v.kind === 'concur');
    want.push(...(final.length ? final : all.filter((v) => v.kind === 'cloture-proceed')).map((v) => v.id));
  }
  const have = b.votes.map(refId);
  if (want.sort().join() !== [...have].sort().join()) throw new Error(`fetch_floor_votes: ${b.id} lists ${have.join(', ')} but the rule picks ${want.join(', ')}`);
}

// --- 4. the splits ---------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const isoDate = (d: string) => { // "7-Jan-2025" or "January 20, 2025,  06:12 PM"
  let m = d.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = d.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})/);
  if (m) return `${m[3]}-${String(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  throw new Error(`fetch_floor_votes: unreadable date ${d}`);
};
const keep = (s: Split) => (s[0] + s[1] ? s : undefined);

const votes: FloorVote[] = [];
for (const b of FLOOR_BILLS) for (const r of b.votes) {
  if (r.chamber === 'house') {
    const x = await houseXml(r.year!, r.roll!);
    const by: Record<string, Split> = {};
    for (const m of x.matchAll(/<totals-by-party>([\s\S]*?)<\/totals-by-party>/g)) by[tag(m[1], 'party')] = [Number(tag(m[1], 'yea-total')), Number(tag(m[1], 'nay-total'))];
    const kind = kindOf('house', tag(x, 'vote-question'))!;
    votes.push({
      billId: b.id, chamber: 'house', kind, measure: tag(x, 'legis-num').replace(/^H R /, 'H.R. ').replace(/^S /, 'S. '),
      date: isoDate(tag(x, 'action-date')), result: /^Passed$/i.test(tag(x, 'vote-result')) ? 'passed' : 'failed',
      parties: { R: by.Republican, D: by.Democratic, ...(keep(by.Independent ?? [0, 0]) ? { I: by.Independent } : {}) },
      url: `https://clerk.house.gov/Votes/${r.year}${r.roll}`,
    });
  } else {
    const x = await senateXml(r.session!, r.vote!);
    const by: Record<string, Split> = { R: [0, 0], D: [0, 0], I: [0, 0] };
    for (const m of x.matchAll(/<member>([\s\S]*?)<\/member>/g)) {
      const p = tag(m[1], 'party'); const c = tag(m[1], 'vote_cast');
      if (!(p in by)) throw new Error(`fetch_floor_votes: unknown party ${p}`);
      if (c === 'Yea') by[p][0]++; else if (c === 'Nay') by[p][1]++;
    }
    const resultText = tag(x, 'vote_result_text');
    votes.push({
      billId: b.id, chamber: 'senate', kind: kindOf('senate', tag(x, 'question'))!, measure: tag(x, 'document_name'),
      date: isoDate(tag(x, 'vote_date')), result: /Passed|Agreed to/i.test(tag(x, 'vote_result')) ? 'passed' : 'failed',
      ...(/Vice President/i.test(resultText) ? { tieBroken: true } : {}),
      parties: { R: by.R, D: by.D, ...(keep(by.I) ? { I: by.I } : {}) },
      url: `https://www.senate.gov/legislative/LIS/roll_call_votes/vote119${r.session}/vote_119_${r.session}_${String(r.vote).padStart(5, '0')}.htm`,
    });
  }
}
for (const v of votes) if (!v.kind) throw new Error(`fetch_floor_votes: ${v.billId} ${v.measure} ${v.date} has an unrecognized question`);

const out: FloorVotesData = {
  _meta: 'Written by scripts/fetch_floor_votes.ts from congress.gov, the House Clerk and senate.gov. Party splits are [yes, no]; members not voting or voting present are not counted.',
  fetched: new Date().toISOString().slice(0, 10),
  houseRollCalls: house.length, senateRollCalls: senate.length, measuresWithRollCall: measures.size,
  votes,
};
writeFileSync(FLOOR_VOTES_FILE, JSON.stringify(out, null, 2) + '\n');
for (const v of votes) console.log(`  ${v.billId.padEnd(12)} ${v.chamber.padEnd(7)} ${v.kind.padEnd(16)} ${v.measure.padEnd(8)} ${v.date} ${v.result}${v.tieBroken ? ' (VP)' : ''}  R ${v.parties.R.join('-')}  D ${v.parties.D.join('-')}${v.parties.I ? `  I ${v.parties.I.join('-')}` : ''}`);
