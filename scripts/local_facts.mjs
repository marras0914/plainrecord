/**
 * PlainRecord — one postable local fact per Texas House district
 *
 *   node scripts/local_facts.mjs            ranked table
 *   node scripts/local_facts.mjs --json private/local_facts.json
 *
 * WHY THIS EXISTS
 *
 * Measured on 21 September 2026: one r/FortWorth post produced 3,147 views,
 * roughly three times the site's entire fortnight of traffic. Eight media and
 * institutional emails sent since 8 September have produced no recorded reply.
 * The evidence says the channel that works is posting a locally specific fact
 * where a community already is, and the constraint has been having a fresh fact
 * for each place.
 *
 * There is no such constraint. 144 of 149 sitting members broke with their own
 * party at least once on the 67 selected votes, so almost every district in
 * Texas has a fact about its own representative that cannot be guessed from a
 * party label. This turns that into a worklist.
 *
 * RANKING
 *
 * Sorted by how postable the fact is, not by district number:
 *   - a crossing on a HEADLINE bill outranks one on a bill nobody has heard of,
 *     because the reader needs to recognise the bill for the fact to land;
 *   - a crossing against type outranks one with it — a Democrat voting for the
 *     Ten Commandments bill is a story, a Republican doing so is not;
 *   - more crossings beat fewer.
 *
 * NOTHING HERE IS A CLAIM ABOUT MOTIVE. A crossing is a recorded vote against
 * the majority of one's own caucus on a bill where the caucuses opposed each
 * other. It is not evidence of anything else, and any post built from it should
 * say what it is and link the roll call.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const q = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
const M = JSON.parse(readFileSync(resolve(ROOT, 'public/data/members_89R.json'), 'utf8'));
const Z = JSON.parse(readFileSync(resolve(ROOT, 'public/data/zips_89R.json'), 'utf8'));

const at = {};
M.itemOrder.forEach((id, i) => { at[id] = i; });
const divisive = q.items.filter((i) => i.rYea !== null && i.dYea !== null
  && ((i.rYea > 0.5) !== (i.dYea > 0.5)));

// Which ZIPs reach each district, and how badly split they are. The ZIP fact is
// the second string to a post's bow when the member has no crossing.
const zipsFor = {};
for (const [zip, v] of Object.entries(Z.zips)) {
  const list = typeof v === 'number' ? [[v, 1, 100]] : v;
  for (const [d] of list) (zipsFor[d] ??= []).push({ zip, n: Array.isArray(v) ? v.length : 1 });
}

const rows = [];
for (const m of M.members) {
  const crossings = [];
  for (const it of divisive) {
    const c = m.v[at[it.id]];
    const cast = c === 'y' ? 1 : c === 'n' ? -1 : null;
    if (cast === null) continue;
    const own = m.p === 'R' ? (it.rYea > 0.5 ? 1 : -1) : m.p === 'D' ? (it.dYea > 0.5 ? 1 : -1) : null;
    if (own === null) continue;
    if (cast !== own) crossings.push({ billId: it.billId, label: it.label ?? null, cast });
  }

  const headline = crossings.filter((c) => c.label);
  const zips = zipsFor[m.d] ?? [];
  const worstSplit = zips.reduce((a, z) => (z.n > (a?.n ?? 0) ? z : a), null);

  // Postability. Recognition first: a reader has to know the bill.
  let score = crossings.length;
  score += headline.length * 10;
  // Against type is the part that stops a scroll.
  const againstType = headline.filter((c) =>
    (m.p === 'D' && c.cast === 1) || (m.p === 'R' && c.cast === -1)).length;
  score += againstType * 15;

  rows.push({
    d: m.d, member: m.n, party: m.p, voted: m.voted,
    crossings: crossings.length,
    headline: headline.map((c) => `${c.label} (${c.cast === 1 ? 'Yea' : 'Nay'})`),
    againstType,
    worstZip: worstSplit ? `${worstSplit.zip} spans ${worstSplit.n}` : null,
    score,
  });
}

rows.sort((a, b) => b.score - a.score || a.d - b.d);

console.log('');
console.log(`  ${rows.filter((r) => r.crossings > 0).length} of ${rows.length} districts have a member who crossed their own party.`);
console.log(`  ${rows.filter((r) => r.headline.length).length} crossed on a bill with a recognisable name.`);
console.log(`  ${rows.filter((r) => r.againstType > 0).length} crossed AGAINST TYPE on one, which is the strongest kind.`);
console.log('');
console.log('  The 20 most postable, ranked:\n');
console.log('   HD   member                     party  crossings  the fact');
for (const r of rows.slice(0, 20)) {
  console.log(`  ${String(r.d).padStart(3)}  ${r.member.padEnd(26)} ${r.party.padEnd(5)} ${String(r.crossings).padStart(6)}     ${r.headline.join('; ') || '(no headline bill)'}`);
}

const jsonArg = process.argv.indexOf('--json');
if (jsonArg > 0) {
  writeFileSync(process.argv[jsonArg + 1], JSON.stringify(rows, null, 1));
  console.log(`\n  wrote ${process.argv[jsonArg + 1]} — all ${rows.length} districts`);
}
console.log('');
