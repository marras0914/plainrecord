/**
 * PlainRecord: which House vote passed each bill the bishops took a side on
 *
 *   npm run data:faith:passage
 *
 * For every bill in data/faith/tccb_89_positions.json, reads its history page
 * on Texas Legislature Online (capitol.texas.gov), cached in data/cache/history/
 * (gitignored), and writes data/faith/house_passage_89R.json (committed).
 *
 * THE RULE: the House's passage vote is the record vote the history lists with
 * the House's "Passed" (or, for a resolution, "Adopted") action, on the same
 * date and journal page. That is the third-reading vote, on the bill as the
 * House passed it. Not counted: second-reading votes ("Passed to 3rd reading"),
 * amendment and procedural votes, and later votes to concur with the Senate or
 * adopt a conference report. If the House passed a bill more than once, the
 * script stops: a person decides, and the rule gets a line for it.
 *
 * A bill the House never passed, or passed without a record vote, gets a status
 * saying so; no vote is invented for it.
 *
 * Why the history page: the published vote corpus (votes_89R.json) carries the
 * House Journal's record-vote number but not what the vote was on, and four
 * record votes on one bill (SB 2: two amendments' worth of tabling, second
 * reading, third reading) look alike without it. The history page is the
 * Legislature's own list of actions, with each record vote's number.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORK_DIR } from './paths';
import { TCCB_FILE } from './extract_tccb_positions';

export const PASSAGE_FILE = join(WORK_DIR, 'faith', 'house_passage_89R.json');
const CACHE = join(WORK_DIR, 'cache', 'history');

export const historyUrl = (bill: string) => {
  const [t, n] = bill.split(' ');
  return `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=${t}${n}`;
};

export interface Action { chamber: string; desc: string; comment: string; date: string; page: string }

/** The bill's official caption as the history page gives it ("Relating to ..."). Public record. */
export function captionOf(html: string): string {
  const m = html.match(/id="lblCaptionText"[^>]*>([\s\S]*?)<\/span>/);
  const c = m ? m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim() : '';
  if (!c) throw new Error('no caption on the history page');
  return c;
}

export function parseHistory(html: string): Action[] {
  const h = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const cell = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const out: Action[] = [];
  for (const m of h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => cell(x[1]));
    if (c.length >= 6 && (c[0] === 'H' || c[0] === 'S' || c[0] === 'E')) {
      out.push({ chamber: c[0], desc: c[1], comment: c[2], date: c[3], page: c[5] });
    }
  }
  return out;
}

/** What TLO says for a number never filed that session (the bishops' report names a few). */
export const NO_SUCH_BILL = 'The bill number does not exist for the selected legislative session.';

export type Passage =
  | { status: 'record'; rv: number; date: string; journalPage: string }
  | { status: 'no-such-bill' }
  | { status: 'no-record-vote'; date: string; journalPage: string }
  | { status: 'not-passed' };

const PASS = new Set(['Passed', 'Adopted']);

/** Actions come newest first, as the page lists them. */
export function housePassage(actions: Action[]): Passage {
  const idx = actions.flatMap((a, i) => (a.chamber === 'H' && PASS.has(a.desc) ? [i] : []));
  if (idx.length === 0) return { status: 'not-passed' };
  if (idx.length > 1) throw new Error(`House "Passed" appears ${idx.length} times; decide by hand and add a rule`);
  const i = idx[0];
  const p = actions[i];
  // The record vote is listed just above the action it records, same date and journal page.
  for (let j = i - 1; j >= 0 && actions[j].chamber === 'H' && actions[j].date === p.date; j--) {
    const rv = actions[j].comment.match(/^RV#(\d+)$/);
    if (actions[j].desc === 'Record vote' && rv && actions[j].page === p.page) {
      return { status: 'record', rv: Number(rv[1]), date: p.date, journalPage: p.page };
    }
    if (actions[j].desc === 'Record vote') break;
  }
  return { status: 'no-record-vote', date: p.date, journalPage: p.page };
}

async function fetchHistory(bill: string): Promise<string> {
  const f = join(CACHE, `89R_${bill.replace(' ', '')}.html`);
  if (existsSync(f)) return readFileSync(f, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(historyUrl(bill), { headers: { 'user-agent': 'PlainRecord data script' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (!html.includes(`History for 89(R)`) && !html.includes(NO_SUCH_BILL)) throw new Error('not a history page');
      writeFileSync(f, html);
      await new Promise((r) => setTimeout(r, 700));
      return html;
    } catch (e) {
      if (attempt >= 3) throw new Error(`${bill}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  const pos = JSON.parse(readFileSync(TCCB_FILE, 'utf8'));
  const bills: string[] = pos.positions.map((p: { bill: string }) => p.bill);
  const out: Record<string, Passage & { url: string; caption?: string }> = {};
  let n = 0;
  for (const b of bills) {
    const html = await fetchHistory(b);
    if (html.includes(NO_SUCH_BILL)) {
      out[b] = { status: 'no-such-bill', url: historyUrl(b) };
      continue;
    }
    const actions = parseHistory(html);
    if (actions.length === 0) throw new Error(`${b}: no actions parsed from its history page`);
    try {
      out[b] = { ...housePassage(actions), url: historyUrl(b), caption: captionOf(html) };
    } catch (e) {
      throw new Error(`${b}: ${(e as Error).message}`);
    }
    if (++n % 50 === 0) console.log(`  ${n}/${bills.length}`);
  }
  const count = (s: string) => Object.values(out).filter((p) => p.status === s).length;
  writeFileSync(PASSAGE_FILE, JSON.stringify({
    about: 'For each bill the Texas Catholic bishops took a side on, the record vote by which the Texas House passed it (third reading), from the bill history on Texas Legislature Online.',
    rule: 'The record vote listed with the House "Passed" (or "Adopted") action, same date and journal page. Not second reading, amendments, procedural motions, concurrence or conference reports.',
    counts: { record: count('record'), noRecordVote: count('no-record-vote'), notPassed: count('not-passed'), noSuchBill: count('no-such-bill') },
    bills: out,
  }, null, 1) + '\n');
  console.log(`\n  ${PASSAGE_FILE}  record vote ${count('record')}, passed without one ${count('no-record-vote')}, not passed by the House ${count('not-passed')}, no such bill ${count('no-such-bill')}\n`);
  for (const [b, p] of Object.entries(out)) if (p.status === 'no-such-bill') console.log(`  no such bill in 89(R): ${b}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
