/**
 * Publish the whole House roll-call corpus, not just the 67 the quiz asks about.
 *
 *   npm run data:bulk            # dry run, prints every check
 *   npm run data:bulk -- --write
 *
 * WHY THIS EXISTS
 *
 * quiz_89R.json ships 67 votes, selected by a published rule. Its provenance
 * block reports the corpus those 67 came out of (3,546 House record votes, 3,454
 * of them reconciled against the House Journal), and those are counts, not rows:
 * nothing downloadable held the other 3,479. Every outside offer the project has
 * made ended in "I will send the bulk inputs to anyone who asks", which is a
 * promise a link keeps better than an inbox.
 *
 * WHY IT DOES NOT USE export_quiz_data.ts
 *
 * That exporter takes the LegiScan CSVs as arguments and raw/ is empty on this
 * machine, so it cannot run at all. This reads data/tx_bills_89R.json, which is
 * the ingested corpus and is present. The cost of that choice is bill captions:
 * they live in the CSVs, not here, so this file carries billId and no title. A
 * consumer joins titles from LegiScan or Open States on billId. The votes are
 * the part that is hard to get, and they are all here.
 *
 * THE CHECKS THIS REFUSES TO WRITE WITHOUT
 *
 * The House filter and the party shares are reimplemented here, away from the
 * TypeScript that produced the shipped payload. A reimplementation that quietly
 * disagrees with the original would publish a corpus that contradicts the file
 * the site runs on, which is worse than publishing nothing. So before writing:
 *
 *   1. The House filter must reproduce provenance.houseItemsTotal (3,546),
 *      journalSourced (3,454) and uncategorizedExcluded (81) exactly.
 *   2. rYea, dYea and valence must reproduce the published values for all 67
 *      shipped items, to four decimal places.
 *
 * Both were failing when this was written. The first passed once the House
 * filter matched the original's rule (more than 60 voters who sit in the House,
 * rather than any test on the bill). The second passed once the party shares
 * excluded members with no recorded vote: counting a null as a non-yea deflated
 * every Republican share and broke 66 of the 67.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const BILLS = 'data/tx_bills_89R.json';
const ROSTER = 'data/tx_roster_89R.json';
const MEMBERS = 'public/data/members_89R.json';
const PAYLOAD = 'public/data/quiz_89R.json';
const OUT = 'public/data/votes_89R.json';
const write = process.argv.includes('--write');

const die = (msg) => { console.error(`\n  REFUSED: ${msg}\n`); process.exit(1); };
const say = (ok, label, detail) =>
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  ' + detail : ''}`);

const bills = JSON.parse(readFileSync(BILLS, 'utf8'));
const party = JSON.parse(readFileSync(ROSTER, 'utf8')).party;
const memberFile = JSON.parse(readFileSync(MEMBERS, 'utf8'));
const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));

const named = new Map(memberFile.members.map((m) => [m.id, m]));
const houseIds = new Set(named.keys());

console.log('');

// The original's rule, verbatim in intent: an item is a House item when more
// than 60 of the people who voted on it sit in the House. Not a test on the
// bill, because a Senate bill gets a House vote too.
const items = bills.filter(
  (it) => Object.keys(it.votes).filter((id) => houseIds.has(id)).length > 60,
);

const prov = payload.provenance;
const journal = items.filter((it) => it.voteSource === 'journal').length;
const uncategorised = items.filter((it) => !it.category).length;

say(items.length === prov.houseItemsTotal, 'House filter reproduces the payload',
  `${items.length} vs ${prov.houseItemsTotal}`);
say(journal === prov.journalSourced, 'journal-sourced count reproduces',
  `${journal} vs ${prov.journalSourced}`);
say(uncategorised === prov.uncategorizedExcluded, 'uncategorised count reproduces',
  `${uncategorised} vs ${prov.uncategorizedExcluded}`);

if (items.length !== prov.houseItemsTotal) die('the House filter does not match the shipped payload');
if (journal !== prov.journalSourced) die('the journal-sourced count does not match');
if (uncategorised !== prov.uncategorizedExcluded) die('the uncategorised count does not match');

/**
 * Yea share within a caucus, over members who actually cast a yea or a nay.
 * A null is an absence, not a no. Including nulls in the denominator is the bug
 * that broke 66 of 67 items the first time this ran.
 */
const shares = (it) => {
  let ry = 0, rn = 0, dy = 0, dn = 0;
  for (const [id, v] of Object.entries(it.votes)) {
    if (v !== 1 && v !== -1) continue;
    const p = party[id];
    if (p === 'R') { if (v === 1) ry++; else rn++; }
    else if (p === 'D') { if (v === 1) dy++; else dn++; }
  }
  const rTot = ry + rn, dTot = dy + dn;
  const rYea = rTot ? ry / rTot : 0;
  const dYea = dTot ? dy / dTot : 0;
  return { rYea, dYea, valence: rYea - dYea };
};

const r4 = (n) => Math.round(n * 1e4) / 1e4;
const byId = new Map(items.map((it) => [it.id, it]));
let compared = 0, wrong = 0;
for (const p of payload.items) {
  const it = byId.get(p.id);
  if (!it) { wrong++; continue; }
  compared++;
  const s = shares(it);
  if (Math.abs(r4(s.rYea) - p.rYea) > 2e-4) wrong++;
  else if (Math.abs(r4(s.dYea) - p.dYea) > 2e-4) wrong++;
  else if (Math.abs(r4(s.valence) - r4(p.valence)) > 2e-4) wrong++;
}
say(wrong === 0 && compared === payload.items.length,
  'party shares reproduce every published item',
  `${compared} compared, ${wrong} wrong`);
if (wrong !== 0) die(`${wrong} of the published items disagree on rYea, dYea or valence`);

// Eligibility, from scoring.ts isEligible with the shipped options. Computable
// per item, so it ships as a flag rather than as a filter: a bulk file should
// hand over everything and let the consumer choose.
const MIN_COUNT = 10, MIN_SHARE = 0.05;
const eligible = (it) => {
  if (!it.substantive) return false;
  const total = it.yeas + it.nays;
  if (total === 0) return false;
  const minority = Math.min(it.yeas, it.nays);
  return minority >= MIN_COUNT && minority / total >= MIN_SHARE;
};

// Every id that cast a vote on a House item, including anyone who has since
// left and is therefore absent from the current roster. Dropping them would
// lose real votes, and one of them cast a full session's worth.
const voterIds = new Set();
for (const it of items) for (const id of Object.keys(it.votes)) voterIds.add(id);
const memberOrder = [...voterIds].sort();
const unnamed = memberOrder.filter((id) => !named.has(id));

const members = {};
for (const id of memberOrder) {
  const m = named.get(id);
  members[id] = m
    ? { n: m.n, d: m.d, p: m.p }
    : { n: null, d: null, p: party[id] ?? null };
}

const CH = { 1: 'y', '-1': 'n' };
const out = items.map((it) => {
  const s = shares(it);
  const v = memberOrder.map((id) => CH[String(it.votes[id])] ?? '.').join('');
  const yy = (v.match(/y/g) ?? []).length;
  const nn = (v.match(/n/g) ?? []).length;
  return {
    id: it.id,
    billId: it.billId,
    category: it.category ?? null,
    voteType: it.voteType,
    substantive: it.substantive,
    yeas: it.yeas,
    nays: it.nays,
    src: it.voteSource,
    journalRecord: it.journalRecord ?? null,
    rYea: r4(s.rYea),
    dYea: r4(s.dYea),
    valence: r4(s.valence),
    eligible: eligible(it),
    v,
    // The official totals and the positions this file can name are not always
    // the same number, so both ship. vYeas and vNays are what `v` actually
    // holds; yeas and nays are what the chamber recorded. Where they differ the
    // record is short, never over: Open States truncates surnames by a
    // character and those votes cannot be attributed to a person. Every one of
    // the scrape-sourced items is affected and almost none of the reconciled
    // ones, which is the case for doing the Journal work.
    vYeas: yy,
    vNays: nn,
  };
});

const castVotes = items.reduce(
  (n, it) => n + Object.values(it.votes).filter((v) => v === 1 || v === -1).length, 0);
const eligibleCount = out.filter((i) => i.eligible).length;
const short = out.filter((i) => i.vYeas !== i.yeas || i.vNays !== i.nays);
const shortScrape = short.filter((i) => i.src === 'scrape').length;

console.log('');
console.log(`  items            ${out.length}`);
console.log(`  members          ${memberOrder.length} (${unnamed.length} no longer on the roster)`);
console.log(`  votes cast       ${castVotes}`);
console.log(`  eligible         ${eligibleCount}`);
console.log(`  journal-sourced  ${journal}`);
console.log(`  short records    ${short.length} (${shortScrape} of them scrape-sourced, ` +
  `${short.length - shortScrape} of ${journal} reconciled)`);

const doc = {
  _meta: {
    purpose:
      'Every recorded vote of the Texas House, 89th Legislature (2025), with each ' +
      'member position. The quiz at rightnleft.com asks about 67 of these, selected ' +
      'by a published rule; this is the corpus they were selected from.',
    encoding:
      "items[].v is one character per entry of memberOrder, in that order: y = yea, " +
      "n = nay, . = no vote recorded. A dot is an absence, not a neutral position.",
    valence:
      'rYea and dYea are each caucus’s yea share among its members who cast a yea ' +
      'or a nay; members with no recorded vote are excluded from the denominator. ' +
      'valence is rYea minus dYea, so +1 is a party-line Republican yea and -1 a ' +
      'party-line Democratic yea. Measured, not judged.',
    eligible:
      'The scoring filter used by the site, from scoring.ts isEligible: substantive, ' +
      'at least one yea and one nay, a minority bloc of at least 10 members, and a ' +
      'minority share of at least 5%. Shipped as a flag rather than applied, because ' +
      'a bulk file should hand over everything. Note this is NOT the 992 reported in ' +
      "quiz_89R.json's provenance: that number is reached after also dropping " +
      'uncategorised items and collapsing repeat votes on the same bill, neither of ' +
      'which this file does.',
    noCaptions:
      'Bill captions are deliberately absent. They live in the LegiScan CSVs rather ' +
      'than in the ingested corpus this was built from, and the project will not ' +
      'paraphrase the record. Join titles on billId from LegiScan or Open States.',
    counts:
      'A separate principal-components run over an Open States Postgres extract ' +
      'reported 587,927 individual votes and 2,259 eligible items. Those figures are ' +
      'not comparable with this file: different extract, and no House filter or ' +
      'same-bill collapsing in common. Use the numbers in this file for this file.',
    unnamed:
      unnamed.length +
      ' member(s) here cast votes but hold no current district, so their name and ' +
      'district are null. data.openstates.org publishes no retired roster for Texas ' +
      '(403), and the project will not guess a name. Their votes are kept because ' +
      'dropping them would silently shrink the record.',
    shortRecords:
      short.length + ' items have fewer named positions than the chamber recorded, ' +
      'always short and never over. ' + shortScrape + ' of them are scrape-sourced, ' +
      'which is every scrape-sourced item in the file, against ' +
      (short.length - shortScrape) + ' of the ' + journal + ' reconciled against the ' +
      'Journal. Compare vYeas and vNays against yeas and nays per item to see the gap. ' +
      'The cause is Open States truncating surnames by one character, so a vote is ' +
      'recorded but cannot be attributed to a person. Use yeas and nays for what the ' +
      'chamber did, and v for who did it.',
    provenance:
      'Open States roll calls, reconciled against the official Texas House Journal. ' +
      'items[].src says which source a given vote came from: journal or scrape. ' +
      'Open States loses 5.27% of 89R votes to surnames truncated by one character, ' +
      'which is what the reconciliation exists to repair. See DATA_PIPELINE.md.',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    licenseNote:
      'Roll-call votes and chamber totals are public record. CC0 covers this ' +
      'compilation and the derived fields.',
    builtBy: 'scripts/export_bulk_votes.mjs',
  },
  session: payload.session,
  generated: new Date().toISOString().slice(0, 10),
  counts: {
    items: out.length,
    members: memberOrder.length,
    membersOffRoster: unnamed.length,
    votesCast: castVotes,
    journalSourced: journal,
    scrapeSourced: out.length - journal,
    uncategorised,
    eligible: eligibleCount,
    shortRecords: short.length,
    shortRecordsScrapeSourced: shortScrape,
  },
  memberOrder,
  members,
  items: out,
};

if (!write) {
  const bytes = Buffer.byteLength(JSON.stringify(doc));
  console.log(`\n  would write ${OUT}  (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log('  dry run, nothing written. Add --write to apply.\n');
  process.exit(0);
}

if (existsSync(OUT)) copyFileSync(OUT, OUT + '.bak');
writeFileSync(OUT, JSON.stringify(doc), 'utf8');
const bytes = readFileSync(OUT).length;
console.log(`\n  wrote ${OUT}  (${(bytes / 1024 / 1024).toFixed(2)} MB)\n`);
