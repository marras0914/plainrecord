/**
 * PlainRecord: smoke suite for the faith module's curation rules
 *
 *   npx tsx faith.smoke.ts
 *
 * The excerpts are checked against their sources by `npm run data:faith:quotes`.
 * This checks the rules in faith_positions.ts that need no download.
 */

import { ISSUES, TRADITIONS, STATEMENTS, PLANKS, FILLED_ISSUES, KNOWN_GAPS, EARLIER, sbcOnIssue } from './faith_positions';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? '  — ' + detail : ''}`);
}

const words = (s: string) => s.trim().split(/\s+/).length;
const all = [...STATEMENTS, ...PLANKS];

// --- rule 5: excerpts short, summaries plain ---------------------------------

const long = all.filter((e) => words(e.excerpt) >= 15);
check('every excerpt is under 15 words', long.length === 0, long.map((e) => e.excerpt.slice(0, 40)).join(' | ') || `${all.length} excerpts`);

// Words that characterize rather than describe. A summary that needs one is
// the site taking a side; the source's own words belong in the excerpt.
const LOADED = /\b(radical|extreme|extremist|draconian|cruel|harsh|hateful|sensible|common[- ]sense|reasonable|dangerous|bold|failed|so-called)\b/i;
const loaded = all.filter((e) => LOADED.test(e.summary));
check('no summary uses a loaded adjective', loaded.length === 0, loaded.map((e) => e.summary.match(LOADED)![0]).join(', ') || 'none');
check('(the loaded-word check catches a planted one)', LOADED.test('Calls for draconian enforcement.'));

// Both parties' planks are introduced with the same verb, so neither reads as
// more or less reasonable from the first word.
const verbs = new Set(PLANKS.map((p) => p.summary.split(' ').slice(0, 2).join(' ')));
check('every plank summary opens with the same verb', verbs.size === 1, [...verbs].join(' / '));

// A thin summary for one party reads as dismissive even when it is accurate.
// The RNC immigration plank had one clause against four or five for the
// others until 12 Nov 2026, and this check would have caught it.
const parity = (planks: { summary: string }[]) => {
  const n = planks.map((p) => words(p.summary));
  return Math.min(...n) / Math.max(...n);
};
for (const issue of FILLED_ISSUES) {
  const r = parity(PLANKS.filter((p) => p.issueId === issue));
  check(`${issue}: no plank summary is under half the length of the longest`, r >= 0.5, `ratio ${r.toFixed(2)}`);
}
check('(the parity check catches a one-clause summary)',
  parity([{ summary: 'Calls for securing the border, deporting people in the country illegally, and reversing the previous administration\'s border policies.' },
    ...PLANKS.filter((p) => p.issueId === 'immigration' && p.party === 'D')]) < 0.5);

// --- rule 1: sourced and dated ---------------------------------------------

check('every entry has a public https source', all.every((e) => /^https:\/\//.test(e.sourceUrl)));
check('every statement has a date (YYYY, YYYY-MM or YYYY-MM-DD)', STATEMENTS.every((s) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s.sourceDate)));
check('every statement names the body that adopted it', STATEMENTS.every((s) => s.body.length > 5));

// --- rule 2: both sides on every finished issue -----------------------------

for (const issue of FILLED_ISSUES) {
  const missingT = TRADITIONS.filter((t) => !STATEMENTS.some((s) => s.issueId === issue && s.traditionId === t.id)
    && !KNOWN_GAPS.some((g) => g.issueId === issue && g.who === t.id));
  check(`${issue}: every tradition has a statement or a listed gap`, missingT.length === 0, missingT.map((t) => t.id).join(', ') || `${TRADITIONS.length} traditions`);
  const missingP = (['D', 'R'] as const).flatMap((party) => (['texas', 'national'] as const)
    .filter((level) => !PLANKS.some((p) => p.issueId === issue && p.party === party && p.level === level))
    .map((level) => `${party}-${level}`));
  check(`${issue}: both parties have a plank at both levels`, missingP.length === 0, missingP.join(', ') || '4 planks');
}
check('every filled issue is on the fixed list', FILLED_ISSUES.every((i) => ISSUES.some((x) => x.id === i)));
check('nothing is filed under an issue that is not finished', all.every((e) => FILLED_ISSUES.includes(e.issueId)));

// --- current in full, earlier listed (decided 13 Nov 2026) ------------------

for (const issue of FILLED_ISSUES) {
  const full = STATEMENTS.filter((s) => s.traditionId === 'sbc' && s.issueId === issue);
  const newest = sbcOnIssue(issue)[0];
  check(`${issue}: the SBC statement in full is its newest resolution on the issue`,
    full.length === 1 && newest !== undefined && full[0].sourceUrl === newest.url,
    `${full.map((s) => s.title).join(', ')} vs newest ${newest?.title ?? 'none'}`);
}
const fullUrls = new Set(STATEMENTS.map((s) => s.sourceUrl));
check('nothing is both in full and in the earlier list', EARLIER.every((e) => !fullUrls.has(e.url)));
check('every earlier entry has a link and a date', EARLIER.every((e) => /^https:\/\//.test(e.url) && /^\d{4}/.test(e.date)));
const sbcImm = EARLIER.filter((e) => e.traditionId === 'sbc' && e.issueId === 'immigration').map((e) => e.date.slice(0, 4));
check('immigration: the SBC\'s earlier resolutions are listed, newest first',
  sbcImm.join(',') === '2023,2018,2011,2006,1979', sbcImm.join(','));

// --- not yet reviewed -------------------------------------------------------

// Shipping before review was decided on 12 Nov 2026. This records the state
// rather than gating on it, so the pages' "not yet reviewed" notice can be
// checked against the data once they exist.
const reviewed = all.filter((e) => e.review.length > 0).length;
console.log(`[ -- ] ${reviewed} of ${all.length} entries reviewed by a member of the tradition or party described`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
