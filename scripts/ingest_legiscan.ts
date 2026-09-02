/**
 * PlainRecord — LegiScan bulk archive ingest
 *
 * Reads ONE extracted LegiScan session archive and emits the two files the app
 * needs: the roll-call items and the party roster for that session.
 *
 *   npx tsx scripts/ingest_legiscan.ts <extracted-archive-dir> <session> [outDir]
 *   npx tsx scripts/ingest_legiscan.ts ./raw/TX_2025-2026_89th 89R data
 *
 * Why a local directory instead of the API: DATA_PIPELINE.md already prefers bulk
 * archives over the pull interface for a static build, and a full session's roll
 * calls pulled one at a time burns the monthly query budget for no benefit.
 * Download the session archive from legiscan.com while logged in, unzip it, and
 * point this at the folder. No API key, no network, no dependencies.
 *
 * Why the roster comes from the archive's own people.csv: that file is scoped to
 * the session, so party and district are as held AT THE TIME OF THE VOTES.
 * DATA_PIPELINE.md requires exactly this — joining live person records would
 * silently apply a member's present party to a vote from three sessions ago.
 *
 * Column names are mapped defensively. LegiScan's CSV headers are not documented
 * anywhere I could verify, so every lookup tries several plausible spellings and
 * fails loudly with the headers it actually found rather than silently producing
 * a column of undefined.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { WORK_DIR } from './paths';
import type { VoteItem, VoteCast } from '../scoring';
import type { Party, PartyRoster } from '../valence';
import { loadTable, col, optionalCol, findCsv, findCsvOptional } from './csv_util';

// Re-exported so existing callers and tests keep working.
export { parseCsv } from './csv_util';
export type { Table } from './csv_util';

// ---------------------------------------------------------------------------
// Vote codes
// ---------------------------------------------------------------------------

/**
 * LegiScan CSV vote encoding, per DATA_PIPELINE.md:
 *   1 = Yea, 2 = Nay, 3 = NV/Abstain, 4 = Absent/Excused
 *
 * 3 and 4 both map to null. Do NOT conflate NV with Nay — a member who did not
 * vote took no position, and scoring.ts drops the item for that member only.
 */
export function decodeVote(raw: string): VoteCast {
  const t = raw.trim().toLowerCase();
  if (t === '1' || t === 'yea' || t === 'yes' || t === 'aye') return 1;
  if (t === '2' || t === 'nay' || t === 'no') return -1;
  if (t === '3' || t === '4' || t === 'nv' || t === 'absent' || t === 'excused' || t === '') {
    return null;
  }
  throw new Error(`unrecognized vote code: ${JSON.stringify(raw)}`);
}

export function decodeParty(raw: string): Party {
  const t = raw.trim().toUpperCase();
  if (t === 'D' || t === 'DEM' || t === 'DEMOCRAT') return 'D';
  if (t === 'R' || t === 'REP' || t === 'REPUBLICAN') return 'R';
  return 'O';
}

// ---------------------------------------------------------------------------
// Roll-call classification
// ---------------------------------------------------------------------------

export type VoteType = VoteItem['voteType'];

/**
 * Classify a roll call from its description. DATA_PIPELINE.md is explicit that
 * voteType and substantive must be assigned AT INGEST, because the scoring
 * module trusts them and will not re-derive them.
 */
/**
 * True only when the text EXPLICITLY names a procedural motion — never merely
 * because the text is unrecognized. Exported so the Open States adapter can
 * apply it before trusting that source's controlled vocabulary, which is coarser
 * than the prose and gets this wrong: Texas rule-suspension motions arrive
 * classified `{passage, reading-3}` while their motion text plainly reads
 * "...Constitutional Rule requiring bills to be read on three several days be
 * suspended...". The specific prose has to win over the scraper's guess.
 */
export function isExplicitlyProcedural(desc: string): boolean {
  const d = desc.toLowerCase();
  return (
    /motion to table|table the motion/.test(d) ||
    /suspend|suspension of the rules?/.test(d) ||
    /three several days/.test(d) ||
    /local (and|&) consent|consent calendar/.test(d) ||
    /postpone|recommit|refer back|adjourn|recess/.test(d) ||
    /motion to reconsider|reconsideration/.test(d)
  );
}

export function classify(desc: string): { voteType: VoteType; substantive: boolean } {
  const d = desc.toLowerCase();

  // Procedural noise, listed in DATA_PIPELINE.md as poisoning the signal.
  if (isExplicitlyProcedural(desc)) return { voteType: 'procedural', substantive: false };

  if (/amendment|amend/.test(d)) return { voteType: 'amendment', substantive: true };
  if (/third reading|3rd reading|final passage|finally passed/.test(d)) {
    return { voteType: 'third_reading', substantive: true };
  }
  if (/second reading|2nd reading/.test(d)) return { voteType: 'second_reading', substantive: true };
  if (/conference committee report|adopt.*report/.test(d)) {
    return { voteType: 'final', substantive: true };
  }
  if (/passage|passed/.test(d)) return { voteType: 'final', substantive: true };

  // Unknown descriptions are NOT assumed substantive. Silence beats a guess that
  // the scoring module will then trust.
  return { voteType: 'procedural', substantive: false };
}

/**
 * DATA_PIPELINE.md: drop second reading where third reading also exists on the
 * same bill. Redundancy clustering would halve their weight anyway, but the
 * duplicate second reading carries no information the third reading lacks.
 */
export function dropSupersededSecondReadings(items: VoteItem[]): VoteItem[] {
  const hasThird = new Set(
    items.filter((i) => i.voteType === 'third_reading' || i.voteType === 'final').map((i) => i.billId),
  );
  return items.filter((i) => !(i.voteType === 'second_reading' && hasThird.has(i.billId)));
}

/**
 * Flag bills where the author voted against their own bill on final passage —
 * in Texas this usually preserves the right to move reconsideration and is NOT a
 * policy position. DATA_PIPELINE.md says this is undetectable from vote data
 * alone, so these are flagged for manual review rather than scored.
 */
export function flagAuthorAgainstOwnBill(
  items: VoteItem[],
  sponsorsByBill: Map<string, string[]>,
): { itemId: string; billId: string; personId: string }[] {
  const flags: { itemId: string; billId: string; personId: string }[] = [];
  for (const item of items) {
    if (item.voteType !== 'final' && item.voteType !== 'third_reading') continue;
    for (const personId of sponsorsByBill.get(item.billId) ?? []) {
      if (item.votes[personId] === -1) flags.push({ itemId: item.id, billId: item.billId, personId });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

export interface IngestResult {
  items: VoteItem[];
  roster: PartyRoster;
  people: Record<string, { name: string; party: Party; district: string; chamber: string }>;
  reviewFlags: { itemId: string; billId: string; personId: string }[];
  stats: Record<string, number>;
}

export function ingest(dir: string, session: string): IngestResult {
  // ---- people (session-scoped party/district) ----
  const peopleT = loadTable(findCsv(dir, ['people', 'legislators', 'person']));
  const pId = col(peopleT, ['people_id', 'person_id', 'id']);
  const pName = col(peopleT, ['name', 'full_name', 'person_name']);
  const pParty = col(peopleT, ['party', 'party_id', 'party_abbr']);
  const pDistrict = optionalCol(peopleT, ['district']);
  const pChamber = optionalCol(peopleT, ['role', 'chamber', 'body']);

  const roster: PartyRoster = {};
  const people: IngestResult['people'] = {};
  for (const r of peopleT.rows) {
    const id = r[pId];
    if (!id) continue;
    const party = decodeParty(r[pParty]);
    roster[id] = party;
    people[id] = {
      name: r[pName],
      party,
      district: pDistrict ? r[pDistrict] : '',
      chamber: pChamber ? r[pChamber] : '',
    };
  }

  // ---- bills (for billId labels like "HB 2") ----
  const billsT = loadTable(findCsv(dir, ['bills', 'bill']));
  const bId = col(billsT, ['bill_id']);
  const bNum = col(billsT, ['bill_number', 'number']);
  const billNumber = new Map<string, string>();
  for (const r of billsT.rows) billNumber.set(r[bId], r[bNum] || r[bId]);

  // ---- roll calls ----
  const rcT = loadTable(findCsv(dir, ['rollcalls', 'roll_calls', 'rollcall', 'votes_summary']));
  const rId = col(rcT, ['roll_call_id', 'rollcall_id', 'id']);
  const rBill = col(rcT, ['bill_id']);
  const rDesc = col(rcT, ['description', 'desc', 'motion']);
  const rYea = col(rcT, ['yea', 'yeas', 'yes']);
  const rNay = col(rcT, ['nay', 'nays', 'no']);
  const rDate = optionalCol(rcT, ['date']);
  void rDate; // available for a future VoteBreakdown link; not used in the item schema

  // ---- individual votes ----
  const vT = loadTable(findCsv(dir, ['votes', 'rollcall_votes', 'vote']));
  const vRoll = col(vT, ['roll_call_id', 'rollcall_id']);
  const vPerson = col(vT, ['people_id', 'person_id']);
  const vVote = col(vT, ['vote', 'vote_id', 'vote_text']);

  const votesByRoll = new Map<string, Record<string, VoteCast>>();
  for (const r of vT.rows) {
    const rc = r[vRoll];
    if (!rc) continue;
    let bucket = votesByRoll.get(rc);
    if (!bucket) { bucket = {}; votesByRoll.set(rc, bucket); }
    bucket[r[vPerson]] = decodeVote(r[vVote]);
  }

  // ---- assemble ----
  let procedural = 0;
  const all: VoteItem[] = [];
  for (const r of rcT.rows) {
    const id = r[rId];
    const votes = votesByRoll.get(id);
    if (!votes) continue; // roll call with no recorded individual votes
    const { voteType, substantive } = classify(r[rDesc] ?? '');
    if (!substantive) procedural++;
    all.push({
      id,
      billId: billNumber.get(r[rBill]) ?? r[rBill],
      session,
      category: '', // assigned by a separate categorization pass — see OPEN_QUESTIONS #6
      voteType,
      substantive,
      yeas: parseInt(r[rYea] || '0', 10),
      nays: parseInt(r[rNay] || '0', 10),
      votes,
    });
  }

  // Procedural roll calls are dropped here rather than carried with
  // substantive=false. DATA_PIPELINE.md lists them as poisoning the signal, and
  // carrying them means a single flip of `substantiveOnly` to false silently
  // poisons every score — plus they bloat a payload a static site ships to the
  // browser. The flag stays in the schema for scoring.ts's contract.
  const substantive = all.filter((i) => i.substantive);
  const items = dropSupersededSecondReadings(substantive);

  // ---- sponsors, for the author-against-own-bill flag ----
  const sponsorsByBill = new Map<string, string[]>();
  const sponsorsPath = findCsvOptional(dir, ['sponsors', 'bill_sponsors', 'sponsor']);
  if (sponsorsPath) {
    const sT = loadTable(sponsorsPath);
    const sBill = col(sT, ['bill_id']);
    const sPerson = col(sT, ['people_id', 'person_id']);
    const sPrimary = optionalCol(sT, ['position', 'sponsor_order', 'sponsor_type_id']);
    for (const r of sT.rows) {
      // Primary author only where the archive distinguishes; otherwise all sponsors.
      if (sPrimary && r[sPrimary] && r[sPrimary] !== '1') continue;
      const bill = billNumber.get(r[sBill]) ?? r[sBill];
      const arr = sponsorsByBill.get(bill) ?? [];
      arr.push(r[sPerson]);
      sponsorsByBill.set(bill, arr);
    }
  } else {
    console.warn('  (no sponsors table found; skipping author-against-own-bill flags)');
  }

  const reviewFlags = flagAuthorAgainstOwnBill(items, sponsorsByBill);

  return {
    items,
    roster,
    people,
    reviewFlags,
    stats: {
      people: Object.keys(roster).length,
      rollCallsInArchive: rcT.rows.length,
      rollCallsWithVotes: all.length,
      proceduralDropped: procedural,
      secondReadingsSuperseded: substantive.length - items.length,
      itemsEmitted: items.length,
      reviewFlags: reviewFlags.length,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const [dir, session, outDir = WORK_DIR] = process.argv.slice(2);
  if (!dir || !session) {
    console.error(
      'usage: ingest_legiscan.ts <extracted-archive-dir> <session> [outDir]\n' +
        '  e.g. ingest_legiscan.ts ./raw/TX_2025-2026_89th 89R data\n\n' +
        '  <session> must be a session label, never a year range — Texas is biennial\n' +
        '  and a special session makes "2025_2026" wrong (DATA_PIPELINE.md).',
    );
    process.exit(1);
  }
  if (/\d{4}[_-]\d{4}/.test(session)) {
    console.error(`refusing session label "${session}": use "89R" or "89-1", not a year range.`);
    process.exit(1);
  }

  const res = ingest(dir, session);
  mkdirSync(outDir, { recursive: true });

  const itemsPath = join(outDir, `tx_bills_${session}.json`);
  const rosterPath = join(outDir, `tx_roster_${session}.json`);
  writeFileSync(itemsPath, JSON.stringify(res.items, null, 0));
  writeFileSync(rosterPath, JSON.stringify(res.roster, null, 2));

  console.log(`\nsession ${session}`);
  for (const [k, v] of Object.entries(res.stats)) {
    console.log(`  ${k.padEnd(26)} ${v}`);
  }
  console.log(`\n  -> ${itemsPath}`);
  console.log(`  -> ${rosterPath}`);

  if (res.reviewFlags.length) {
    const flagsPath = join(outDir, `tx_review_${session}.json`);
    writeFileSync(flagsPath, JSON.stringify(res.reviewFlags, null, 2));
    console.log(`  -> ${flagsPath}   (${res.reviewFlags.length} author-against-own-bill, MANUAL REVIEW)`);
  }

  console.log(
    '\nNOT DONE YET, and the build should fail until they are:\n' +
      '  1. categories are empty — every item needs one for subscores and stratified selection\n' +
      '  2. no Journal reconciliation — DATA_PIPELINE.md requires diffing every roll call\n' +
      '     against the House/Senate Journal before publishing. Shipping a wrong vote\n' +
      '     attributed to a named person is the worst failure mode this project has.\n',
  );
}

// Exact match, not startsWith — `ingest_legiscan.smoke.ts` imports this module and
// must not trigger the CLI.
if (process.argv[1] && /^ingest_legiscan\.(ts|js|mjs|cjs)$/.test(basename(process.argv[1]))) {
  main();
}
