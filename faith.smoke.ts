/**
 * PlainRecord: smoke suite for the faith module's curation rules
 *
 *   npx tsx faith.smoke.ts
 *
 * The excerpts are checked against their sources by `npm run data:faith:quotes`.
 * This checks the rules in faith_positions.ts that need no download.
 */

import { readFileSync } from 'node:fs';
import { ISSUES, TRADITIONS, STATEMENTS, PLANKS, FILLED_ISSUES, KNOWN_GAPS, EARLIER, NO_STATEMENT, NO_PLANK, TO_READ, sbcOnIssue, isJewish, JEWISH_RESOLUTIONS, ISSUE_TITLE_TERMS, SIDE_POINTS, NO_SIDE_POINT } from './faith_positions';
import type { SidePoint, SideQuote } from './faith_positions';
import { buildFaithPayload, PLATFORMS } from './scripts/export_faith';
import { findRefs, statementKey } from './scripts/extract_faith_verses';
import { parsePage, parseSineDie, buildPositions, wordsOf } from './scripts/extract_tccb_positions';
import { parseHistory, housePassage } from './scripts/fetch_house_passage';
// @ts-expect-error: a plain .mjs module, shared with the page builder
import { KEY } from './scripts/_faith_copy.mjs';

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
    && !KNOWN_GAPS.some((g) => g.issueId === issue && g.who === t.id)
    && !NO_STATEMENT.some((g) => g.issueId === issue && g.traditionId === t.id));
  check(`${issue}: every tradition has a statement, a listed gap or "no official statement"`, missingT.length === 0, missingT.map((t) => t.id).join(', ') || `${TRADITIONS.length} traditions`);
  const missingP = (['D', 'R'] as const).flatMap((party) => (['texas', 'national'] as const)
    .filter((level) => !PLANKS.some((p) => p.issueId === issue && p.party === party && p.level === level)
      && !NO_PLANK.some((n) => n.issueId === issue && n.party === party && n.level === level))
    .map((level) => `${party}-${level}`));
  check(`${issue}: both parties have a plank or a recorded silence at both levels`, missingP.length === 0, missingP.join(', ') || '4 platforms');
}
check('every filled issue is on the fixed list', FILLED_ISSUES.every((i) => ISSUES.some((x) => x.id === i)));
check('nothing is filed under an issue that is not finished', all.every((e) => FILLED_ISSUES.includes(e.issueId)));

// --- which side each church takes (decided 15 Nov 2026) ---------------------

const pointIssues = SIDE_POINTS.map((p) => p.issueId);
const noPointIssues = NO_SIDE_POINT.map((p) => p.issueId);
check('sides: every issue has a point or a stated reason it has none, never both',
  FILLED_ISSUES.every((i) => pointIssues.includes(i) !== noPointIssues.includes(i)) && new Set(pointIssues).size === pointIssues.length,
  `${pointIssues.length} points, ${noPointIssues.length} without`);

/** Rule 1: a level is compared exactly when both platforms there take opposite sides. */
const levelProblems = (pt: SidePoint) => (['texas', 'national'] as const).flatMap((level) => {
  const d = pt.platforms[`D-${level}`];
  const r = pt.platforms[`R-${level}`];
  const opposite = !!d && !!r && d.side !== r.side;
  return opposite === pt.levels.includes(level) ? [] : [`${pt.issueId} ${level}`];
});
const badLevels = SIDE_POINTS.flatMap(levelProblems);
check('sides: a level is compared exactly where the D and R platforms take opposite sides', badLevels.length === 0, badLevels.join(', ') || 'all levels');
check('(the level check catches a level where both platforms take the same side)',
  levelProblems({ ...SIDE_POINTS[0], platforms: { ...SIDE_POINTS[0].platforms, 'R-texas': { ...SIDE_POINTS[0].platforms['D-texas']!, url: 'x' } } }).length === 1);

const platformUrl = (k: string) => PLATFORMS[k as keyof typeof PLATFORMS].url;
check('sides: every platform quote is from that platform',
  SIDE_POINTS.every((pt) => Object.entries(pt.platforms).every(([k, q]) => q!.url === platformUrl(k))));

// Rule 3: a church is placed only from a statement shown in full, and every
// tradition with one is placed or marked "doesn't say".
// Every tradition, the Jewish movements included (16 Nov 2026).
const churchProblemsOf = (points: SidePoint[]) => points.flatMap((pt) => TRADITIONS.flatMap((t) => {
  const has = STATEMENTS.filter((s) => s.traditionId === t.id && s.issueId === pt.issueId);
  const placed = t.id in pt.churches;
  if (!has.length) return placed ? [`${pt.issueId} ${t.id} placed with no statement`] : [];
  if (!placed) return [`${pt.issueId} ${t.id} missing`];
  const q = pt.churches[t.id];
  return q && !has.some((s) => s.sourceUrl === q.url) ? [`${pt.issueId} ${t.id} quotes a statement not shown`] : [];
}));
const churchProblems = churchProblemsOf(SIDE_POINTS);
check('sides: every church with a statement is placed or "doesn\'t say", from a statement shown in full', churchProblems.length === 0, churchProblems.join(', ') || 'all');
const imm = SIDE_POINTS.find((p) => p.issueId === 'immigration')!;
check('(the placement check catches a quote from a statement not shown, and a church left out)',
  churchProblemsOf([{ ...imm, churches: { ...imm.churches, sbc: { side: 'b', quote: 'x', url: 'https://example.org/' }, umc: undefined } }]).length === 1
  && churchProblemsOf([{ ...imm, churches: Object.fromEntries(Object.entries(imm.churches).filter(([k]) => k !== 'umc')) }]).length === 1);

const sideQuotes = SIDE_POINTS.flatMap((pt) => [...Object.values(pt.platforms), ...Object.values(pt.churches)]).filter(Boolean) as SideQuote[];
const longSide = sideQuotes.filter((q) => words(q.quote) >= 15);
check('sides: every quote is under 15 words', longSide.length === 0, longSide.map((q) => q.quote.slice(0, 40)).join(' | ') || `${sideQuotes.length} quotes`);

// Rule 5: no count across issues. The shipped points carry no number at all,
// so nothing on a page can total them without computing it in the builder,
// which verify_site.mjs checks.
const numbers = JSON.stringify(SIDE_POINTS).match(/:\s*\d/g);
check('sides: the shipped points carry no number', numbers === null, numbers?.join(' ') ?? 'none');

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

// --- the shipped file and its Spanish -----------------------------------------

// The pages read only public/data/faith.json. If faith_positions.ts changes and
// nobody re-runs npm run data:faith, the pages would quietly show the old text.
const shipped = JSON.parse(readFileSync(new URL('./public/data/faith.json', import.meta.url), 'utf8'));
check('public/data/faith.json is what npm run data:faith writes today',
  JSON.stringify(shipped) === JSON.stringify(buildFaithPayload()), 're-run npm run data:faith if this fails');

// Every sentence the pages show from the record has its Spanish, translated
// from the English as it stands now. The builder refuses the same things; this
// catches them in npm test, before a build.
const COPY = JSON.parse(readFileSync(new URL('./i18n/faith.json', import.meta.url), 'utf8'));
const recordKeys: [string, string][] = [
  ...ISSUES.flatMap((i) => [[KEY.issueName(i), i.name], [KEY.issueDesc(i), i.description]] as [string, string][]),
  ...TRADITIONS.flatMap((t) => [[KEY.tradName(t), t.name], [KEY.tradFamily(t), t.family], [KEY.tradOfficial(t), t.official]] as [string, string][]),
  ...Object.entries(PLATFORMS).map(([k, p]) => [KEY.platform(k), p.name] as [string, string]),
  ...STATEMENTS.flatMap((s) => [[KEY.body(s), s.body], [KEY.statement(s), s.summary]] as [string, string][]),
  ...NO_STATEMENT.map((n) => [KEY.noStatement(n), n.note] as [string, string]),
  ...PLANKS.map((p) => [KEY.plank(p), p.summary] as [string, string]),
  ...NO_PLANK.map((n) => [KEY.noPlank(n), n.note] as [string, string]),
  ...TO_READ.map((r, i) => [KEY.toRead(r, i), r.what] as [string, string]),
  ...SIDE_POINTS.flatMap((pt) => [[KEY.sideQ(pt), pt.question], [KEY.sideA(pt), pt.a], [KEY.sideB(pt), pt.b]] as [string, string][]),
  ...NO_SIDE_POINT.map((n) => [KEY.noSide(n), n.note] as [string, string]),
  ...Object.entries(shipped.verses.books as Record<string, string>).map(([code, en]) => [KEY.book(code), en] as [string, string]),
];
const untranslated = recordKeys.filter(([k]) => typeof COPY[k]?.es !== 'string').map(([k]) => k);
const staleOf = (pairs: [string, string][]) => pairs.filter(([k, en]) => typeof COPY[k]?.es === 'string' && COPY[k].en !== en).map(([k]) => k);
const stale = staleOf(recordKeys);
check('every sentence the faith pages show has a Spanish translation', untranslated.length === 0, untranslated.slice(0, 3).join(', ') || `${recordKeys.length} sentences`);
check('no Spanish translates an English sentence that has since changed', stale.length === 0, stale.slice(0, 3).join(', ') || 'none');
check('(the staleness check catches an edited summary)',
  staleOf([[KEY.plank(PLANKS[0]), `${PLANKS[0].summary} Edited.`]]).length === 1);
const esVerbs = new Set(PLANKS.map((p) => COPY[KEY.plank(p)]?.es?.split(' ')[0]));
check('every Spanish plank summary opens with the same verb', esVerbs.size === 1, [...esVerbs].join(' / '));

// --- Bible passages -----------------------------------------------------------

// The parser, on the forms the sources actually print. Each line here was a
// real miss or a real mis-read while building it.
const refs = (t: string) => findRefs(t).map((r) => `${r.code} ${r.chapter}${r.ranges.length ? ':' + r.ranges.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(',') : ''}`).join(' | ');
const PARSE: [string, string][] = [
  ['(Deuteronomy 10: 18-19)', 'DEU 10:18-19'],                       // AME, space after the colon
  ['commenting on Exodus 21:22,23: “The fetus', 'EXO 21:22,23'],    // AG, a colon that is punctuation
  ['(Matthew 4:23; 9:35–38; 14:14–21)', 'MAT 4:23 | MAT 9:35-38 | MAT 14:14-21'], // SBC, one book, three chapters
  ['(See Mt 10:40-42, 20:25; Mk 10:42-45)', 'MAT 10:40-42 | MAT 20:25 | MAR 10:42-45'], // USCCB
  ['(Genesis 1:4, 10, 12, 18, 21, 32)', 'GEN 1:4,10,12,18,21,32'],
  ['the temptation of Jesus (Luke 4).', 'LUK 4'],                     // a whole chapter
  ['a Job 2 offer, Acts 3 of the law, and Mark 5 times', ''],         // ordinary words, not scripture
];
for (const [text, want] of PARSE) check(`verses: "${text.slice(0, 40)}" reads as ${want || 'nothing'}`, refs(text) === want, refs(text) || 'nothing');

const VJ = JSON.parse(readFileSync(new URL('./data/faith/verses.json', import.meta.url), 'utf8'));
const christian = STATEMENTS.filter((s) => !isJewish(s.traditionId));
const noRecord = christian.filter((s) => !VJ.citations.some((c: { statement: string }) => c.statement === statementKey(s)));
check('every Christian statement shown in full has a verse record (re-run npm run data:faith:verses if not)', noRecord.length === 0, noRecord.map(statementKey).join(', ') || `${christian.length} statements`);

// The Jewish statements: citations listed, never verse text (15 Nov 2026).
const JC = JSON.parse(readFileSync(new URL('./data/faith/jewish_citations.json', import.meta.url), 'utf8'));
const jewish = STATEMENTS.filter((s) => isJewish(s.traditionId));
check('there are Jewish statements to check', jewish.length >= 15, `${jewish.length}`);
const noCites = jewish.filter((s) => !JC.byStatement[statementKey(s)]);
check('every Jewish statement shown in full has a citation record (re-run npm run data:faith:citations if not)', noCites.length === 0, noCites.map(statementKey).join(', ') || `${jewish.length} statements`);
const versed = jewish.filter((s) => VJ.citations.some((c: { statement: string }) => c.statement === statementKey(s)));
check('no Jewish statement has verse text from a Christian translation', versed.length === 0, versed.map(statementKey).join(', ') || 'none');
const cites = Object.values(JC.byStatement as Record<string, { citations: { written: string; ref: string; url: string; kind: string }[] }>).flatMap((b) => b.citations);
const badCite = cites.filter((c) => !/^https:\/\/www\.sefaria\.org\/[^\s]+$/.test(c.url) || !c.written || !KEY.citeKind(c.kind));
check('every citation is written out and links to Sefaria', cites.length > 0 && badCite.length === 0, badCite.map((c) => c.written).join(', ') || `${cites.length} citations`);
const kindKeys = [...new Set(cites.map((c) => KEY.citeKind(c.kind)))];
const unlabeled = kindKeys.filter((k) => !COPY[k]?.en || !COPY[k]?.es);
check('every kind of source cited has a label in both languages', unlabeled.length === 0, unlabeled.join(', ') || kindKeys.join(', '));

// The libraries the Jewish earlier lists are drawn from.
const onSomeIssue = (title: string) => Object.values(ISSUE_TITLE_TERMS).some((re) => re.test(title));
const libSize = (b: string) => JEWISH_RESOLUTIONS.filter((r) => r.body === b).length;
check('the Jewish libraries are all there (URJ, CCAR, RA)', libSize('urj') > 400 && libSize('ccar') > 700 && libSize('ra') > 200,
  ['urj', 'ccar', 'ra'].map((b) => `${b} ${libSize(b)}`).join(', '));
check('every Jewish library entry is dated', JEWISH_RESOLUTIONS.filter((r) => onSomeIssue(r.title)).every((r) => /^\d{4}/.test(r.date)));
// Orthodox is the Orthodox Union alone (Marco, 15 Nov 2026).
const orthodoxUrls = [...STATEMENTS, ...EARLIER].filter((s) => s.traditionId === 'orthodox').map((s) => ('sourceUrl' in s ? s.sourceUrl : s.url));
check('every Orthodox entry is an Orthodox Union document', orthodoxUrls.length > 0 && orthodoxUrls.every((u) => /^https:\/\/(www\.|advocacy\.)?ou\.org\//.test(u)), orthodoxUrls.join(', '));
const allRefs = VJ.citations.flatMap((c: { refs: { verseKeys: string[]; verseCount: number; ranges: unknown[] }[] }) => c.refs);
const textless = allRefs.filter((r: { verseKeys: string[]; verseCount: number; ranges: unknown[] }) => !r.verseKeys.length && r.ranges.length && r.verseCount <= VJ.maxVersesWithText);
check('a passage is printed unless it is a whole chapter or longer than the limit', textless.length === 0, `${allRefs.length} references`);
const blank = Object.entries(VJ.verses as Record<string, { web: string; rv1909: string }>).filter(([, v]) => !v.web || !v.rv1909).map(([k]) => k);
check('every printed verse has its English and its Spanish text', blank.length === 0, blank.join(', ') || `${Object.keys(VJ.verses).length} verses`);
const platformRefs = Object.values(VJ.platformReferenceCounts as Record<string, number>);
check('the platforms were searched, all four', platformRefs.length === 4, platformRefs.join(', '));

// --- the Texas House on the bishops' bills ----------------------------------

// The parsers, on fixtures shaped like the bishops' pages and TLO's history.
const ENTRY = (icon: string, inner: string) => `<p><img class="x" src="https://txcatholic.org/wp-content/uploads/2016/11/${icon}.png" alt="" /> ${inner}</p>`;
const LINK = (href: string, text: string) => `<a href="http://www.capitol.state.tx.us/BillLookup/History.aspx?LegSess=89R&amp;Bill=${href}">${text}</a>`;
const fx = parsePage([
  ENTRY('approve-e1', `${LINK('HB00037', 'HB 37')} Plesa | ${LINK('sB02058', 'SB 2058')}Plesa — This bill creates a grant. The TCCB supports this bill to help.`),
  ENTRY('reject-e1', `${LINK('HB00000', 'HB 2237')} Dutton — This bill repeals. The TCCB opposes this bill.`),
  ENTRY('approve-e1', `${LINK('HB00004', 'HB 2816')} X — This bill. The TCCB prohibits this bill which infringes.`),
].join('\n'), 'byNumber');
check('TCCB pages: companions share the entry\'s position, lowercase links included', JSON.stringify(fx[0].bills) === '["HB 37","SB 2058"]' && fx[0].icon === 'supports');
check('TCCB pages: a broken "HB 0" link is read by the number the bishops wrote', fx[1].bills[0] === 'HB 2237' && fx[1].icon === 'opposes');
const fxPos = buildPositions(fx);
check('TCCB pages: a link to a different bill, or words against the icon, make a conflict rather than a position',
  fxPos.conflicts.some((c) => c.bill === 'HB 2816' && c.kind === 'link') && !fxPos.positions.some((p) => p.bill === 'HB 2816'));
check('TCCB pages: "The TCCB prohibits this bill" is not read as support', wordsOf('The TCCB prohibits this bill which') === 'prohibits');
const sd = parseSineDie(`Life and Family Life\n\n   Win: HB 37 (HB 2058): This bill creates a grant. This bill was passed.\n\n   Loss: SB 8: This bill mandates. We opposed this bill, and it passed.\n\n   Win: HB 965: This bill adds. We opposed this bill which died in committee.\n\n   Loss: HB 1: This bill was reported from committee.\n`);
check('Sine Die Report: stances follow the report\'s own Win/Loss definitions, and an unclear entry yields none',
  sd.length === 3 && sd[0].icon === 'supports' && sd[0].bills.length === 2 && sd[1].icon === 'opposes' && sd[2].icon === 'opposes' && sd[0].area === 'Life and Family Life');
const ROW = (c: string, d: string, k: string, dt: string, pg: string) => `<tr><td>${c}</td><td>${d}</td><td>${k}</td><td>${dt}</td><td></td><td>${pg}</td></tr>`;
const hist = parseHistory(`<table>${[
  ROW('H', 'Record vote', 'RV#300', '04/17/2025', '1667'), ROW('H', 'Passed', '', '04/17/2025', '1667'), ROW('H', 'Read 3rd time', '', '04/17/2025', '1660'),
  ROW('H', 'Record vote', 'RV#286', '04/17/2025', '1604'), ROW('H', 'Passed to 3rd reading as amended', '', '04/17/2025', '1604'),
].join('')}</table>`);
const hp = housePassage(hist);
check('TLO history: the passage vote is the record vote beside "Passed", not the second-reading one', hp.status === 'record' && hp.rv === 300);
check('TLO history: a bill the House never passed has no vote', housePassage(hist.slice(3)).status === 'not-passed');

const HV = buildFaithPayload().houseVotes[0];
// The bishops' entries run to 150 words; the record links to them instead.
const hvJson = JSON.stringify(HV) + readFileSync('data/faith/tccb_89_positions.json', 'utf8');
const leaked = ['The TCCB supports this', 'The TCCB opposes this', 'Win: ', 'Loss: ', 'This bill '].filter((s) => hvJson.includes(s));
check('House votes: none of the bishops\' entry text is committed or shipped, only links', leaked.length === 0, leaked.join(', ') || 'none');
check('(the leak check catches an entry\'s text)', ['The TCCB supports this'].some((s) => 'x The TCCB supports this bill y'.includes(s)));
check('House votes: every counted bill has its official caption', HV.bills.every((b) => /^(Relating to|Proposing a constitutional amendment) /.test(b.caption)), HV.bills.filter((b) => !/^(Relating to|Proposing a constitutional amendment) /.test(b.caption)).map((b) => `${b.bill}: ${b.caption.slice(0, 30)}`).join(', ') || `${HV.bills.length} bills`);
const TC = JSON.parse(readFileSync('data/faith/tccb_89_positions.json', 'utf8'));
const conflictBills = new Set(TC.conflicts.map((c: { bill: string }) => c.bill));
check('House votes: no bill the bishops\' documents disagree about is counted', HV.bills.every((b) => !conflictBills.has(b.bill)), `${conflictBills.size} left out`);
const accounted = HV.bills.length + Object.values(HV.notVoted).reduce((s, l) => s + l.length, 0);
check('House votes: every bill with a position is either counted or listed as not voted on', accounted === TC.positions.length, `${accounted} of ${TC.positions.length}`);
// Against the member-level counts: the official totals also hold votes the
// source could not attribute to a person (votes_89R.json _meta.shortRecords).
const offBy = (b: (typeof HV.bills)[number]) => (b.house.yeas - b.house.R.yea - b.house.D.yea) + (b.house.nays - b.house.R.nay - b.house.D.nay);
check('House votes: each party\'s tally adds up to the member-by-member yeas and nays', HV.bills.every((b) => b.house.R.yea + b.house.D.yea === b.house.memberYeas && b.house.R.nay + b.house.D.nay === b.house.memberNays),
  HV.bills.filter((b) => b.house.R.yea + b.house.D.yea !== b.house.memberYeas || b.house.R.nay + b.house.D.nay !== b.house.memberNays).map((b) => b.bill).join(', ') || `${HV.bills.length} bills`);
check('House votes: the official totals differ from the parties\' by at most one unattributed vote', HV.bills.every((b) => offBy(b) === 0 || offBy(b) === 1),
  `${HV.bills.filter((b) => offBy(b) === 1).map((b) => b.bill).join(', ') || 'none'} off by one`);
check('House votes: every counted vote passed', HV.bills.every((b) => b.house.yeas > b.house.nays));
// An unattributed vote could belong to either party; it must not be able to
// change which way a party's majority went.
const fragile = HV.bills.filter((b) => offBy(b) > 0 && (['R', 'D'] as const).some((p) => Math.abs(b.house[p].yea - b.house[p].nay) <= offBy(b)));
check('House votes: no party\'s result could flip on an unattributed vote', fragile.length === 0, fragile.map((b) => b.bill).join(', ') || 'none');

// --- not yet reviewed -------------------------------------------------------

// Shipping before review was decided on 12 Nov 2026. This records the state
// rather than gating on it, so the pages' "not yet reviewed" notice can be
// checked against the data once they exist.
const reviewed = all.filter((e) => e.review.length > 0).length;
console.log(`[ -- ] ${reviewed} of ${all.length} entries reviewed by a member of the tradition or party described`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
