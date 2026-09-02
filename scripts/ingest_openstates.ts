/**
 * PlainRecord — Open States ingest
 *
 *   npx tsx scripts/ingest_openstates.ts <extracted-dir> <session> [options]
 *   npx tsx scripts/ingest_openstates.ts ./raw/tx_89_csv 89R --people ./raw/tx_people.csv
 *
 * Options:
 *   --out <dir>              output directory (default data/)
 *   --people <path>          CSV of legislators, for the party roster
 *   --allow-current-party    proceed with a roster that is not session-scoped
 *
 * The second route alongside the LegiScan adapter. Reasons to prefer it:
 * legiscan.com sits behind Cloudflare bot protection (a plain fetch and a full
 * headless browser both get HTTP 403), so nothing there can ever be automated,
 * whereas Open States serves a fully public monthly Postgres dump and per-session
 * CSV exports behind a free account.
 *
 * ---------------------------------------------------------------------------
 * THE PARTY PROBLEM — read this before trusting the output
 * ---------------------------------------------------------------------------
 * Open States session CSV exports contain NO party information. `vote_people.csv`
 * carries `voter_id` and `voter_name` but not party, and `organizations.csv`
 * describes chambers and committees, not caucus membership.
 *
 * valence.ts cannot compute an item's partisan valence without a party roster,
 * and DATA_PIPELINE.md requires that roster be scoped to the session — a member
 * who switched parties, or a seat filled mid-term, is silently wrong otherwise.
 *
 * So this adapter will NOT invent one. Either:
 *   (a) pass `--people` a session-scoped roster (see openstates_extract.sql,
 *       which builds one from the Postgres dump's membership dates), or
 *   (b) pass `--people` the current-members CSV
 *       (data.openstates.org/people/current/tx.csv) AND `--allow-current-party`,
 *       which stamps `rosterIsCurrentParty: true` into the output so downstream
 *       code and reviewers can see the compromise, or
 *   (c) pass neither, and get items with no roster file — valence stays unavailable.
 *
 * Option (b) is defensible for the most recent session and wrong for older ones.
 * The flag exists so that choice is deliberate and recorded, not accidental.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { VoteItem, VoteCast } from '../scoring';
import type { Party, PartyRoster } from '../valence';
import { loadTable, col, optionalCol, findCsv, findCsvOptional } from './csv_util';
import { WORK_DIR } from './paths';
import {
  classify,
  isExplicitlyProcedural,
  dropSupersededSecondReadings,
  flagAuthorAgainstOwnBill,
} from './ingest_legiscan';
import { categorizeBills, CATEGORY_MAP_VERSION } from '../categorize';
import type { CategoryAssignment } from '../categorize';

// ---------------------------------------------------------------------------
// Vote options
// ---------------------------------------------------------------------------

/**
 * Open States VOTE_OPTION_CHOICES, from openstates-core/openstates/data/common.py:
 *   yes, no, absent, abstain, not voting, paired, excused, other
 *
 * Everything that is not an explicit yes/no maps to null. In particular `paired`
 * is null: a pair is an agreement between two members to offset each other, not
 * a recorded position on the merits. `abstain` and `not voting` are null for the
 * same reason NV is null in the LegiScan adapter — no position was taken.
 */
export function decodeOption(raw: string): VoteCast {
  const t = raw.trim().toLowerCase();
  if (t === 'yes' || t === 'yea' || t === 'aye') return 1;
  if (t === 'no' || t === 'nay') return -1;
  if (
    t === 'absent' || t === 'abstain' || t === 'not voting' || t === 'excused' ||
    t === 'paired' || t === 'other' || t === ''
  ) {
    return null;
  }
  throw new Error(
    `unrecognized Open States vote option: ${JSON.stringify(raw)} — ` +
      `expected one of yes/no/absent/abstain/not voting/paired/excused/other`,
  );
}

export function decodeParty(raw: string): Party {
  const t = raw.trim().toLowerCase();
  if (t.startsWith('democrat')) return 'D';
  if (t.startsWith('republican')) return 'R';
  if (t === 'd') return 'D';
  if (t === 'r') return 'R';
  return 'O';
}

/**
 * `motion_classification` is a Django ArrayField, serialized into CSV as a
 * Python list literal: `['passage']`. Unwrap it to a plain string for classify().
 */
export function unwrapClassification(raw: string): string {
  const t = raw.trim();
  if (!t || t === '[]') return '';
  return t
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .join(' ');
}

/**
 * Open States gives a motion's classification as a controlled vocabulary
 * (VOTE_CLASSIFICATION_CHOICES) as well as free text. Prefer the vocabulary when
 * present — it is more reliable than regexing prose — and fall back to the shared
 * text classifier from the LegiScan adapter so both routes agree.
 */
export function classifyOpenStates(
  motionText: string,
  classification: string,
): { voteType: VoteItem['voteType']; substantive: boolean } {
  // The prose veto comes FIRST, before the controlled vocabulary. Verified
  // against real 89R data: all 1,069 Texas rule-suspension motions arrive
  // classified `{passage, reading-3}` even though their motion_text reads
  // "Senate Rule 7.18 and the Constitutional Rule requiring bills to be read on
  // three several days be suspended...". Trusting the vocabulary first labelled
  // every one of them a substantive third reading.
  //
  // They all happen to fail the eligibility floor (a suspension needs a 4/5
  // supermajority, so the average minority share is 4.4%) — but leaning on the
  // floor to absorb a misclassification is luck, not correctness, and one
  // contested suspension vote would sail through as a final-passage item.
  if (isExplicitlyProcedural(motionText)) {
    return { voteType: 'procedural', substantive: false };
  }

  const c = unwrapClassification(classification).toLowerCase();

  if (c.includes('committee-passage')) return { voteType: 'procedural', substantive: false };
  if (c.includes('reading-1')) return { voteType: 'procedural', substantive: false };
  if (c.includes('amendment')) return { voteType: 'amendment', substantive: true };
  if (c.includes('reading-3')) return { voteType: 'third_reading', substantive: true };
  if (c.includes('veto-override') || c.includes('veto')) {
    return { voteType: 'final', substantive: true };
  }
  if (c.includes('passage')) return { voteType: 'final', substantive: true };

  // No usable classification — fall back to the shared prose classifier, which
  // also defaults unknown descriptions to procedural rather than guessing.
  return classify(motionText);
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

export interface OpenStatesIngest {
  items: VoteItem[];
  roster: PartyRoster;
  rosterIsCurrentParty: boolean;
  reviewFlags: { itemId: string; billId: string; personId: string }[];
  categories: CategoryAssignment | null;
  stats: Record<string, number>;
}

export interface OpenStatesOptions {
  peopleCsv?: string;
  allowCurrentParty?: boolean;
}

export function ingestOpenStates(
  dir: string,
  session: string,
  opts: OpenStatesOptions = {},
): OpenStatesIngest {
  // ---- bills: id -> "HB 1" ----
  const billsT = loadTable(findCsv(dir, ['bills']));
  const bId = col(billsT, ['id']);
  const bIdent = col(billsT, ['identifier']);
  const bSubject = optionalCol(billsT, ['subject']);
  const billIdentifier = new Map<string, string>();
  for (const r of billsT.rows) billIdentifier.set(r[bId], r[bIdent]);

  // Categories from the Texas subject index. See categorize.ts — the taxonomy is
  // derived from a published scheme rather than invented, and any subject root
  // the map does not cover is reported instead of silently bucketed.
  const categories: CategoryAssignment | null = bSubject
    ? categorizeBills(billsT.rows.map((r) => ({ billId: r[bIdent], subject: r[bSubject] })))
    : null;

  // ---- vote events ----
  const votesT = loadTable(findCsv(dir, ['votes']));
  const vId = col(votesT, ['id']);
  const vBill = col(votesT, ['bill_id']);
  const vMotion = col(votesT, ['motion_text']);
  const vClass = optionalCol(votesT, ['motion_classification']);
  const vOrg = optionalCol(votesT, ['organization_id']);

  // ---- per-person votes ----
  const pvT = loadTable(findCsv(dir, ['vote_people']));
  const pvEvent = col(pvT, ['vote_event_id']);
  const pvOption = col(pvT, ['option']);
  const pvVoterId = optionalCol(pvT, ['voter_id']);
  // voter_name is deliberately NOT used as a key: see the unresolved-voter note below.

  let unresolved = 0;
  const votesByEvent = new Map<string, Record<string, VoteCast>>();
  for (const r of pvT.rows) {
    const ev = r[pvEvent];
    if (!ev) continue;
    // voter_id is null when Open States could not resolve the name to a person.
    // Falling back to voter_name would create a second identity for the same
    // member and split their record, so those rows are dropped and counted.
    const who = pvVoterId ? r[pvVoterId] : '';
    if (!who) { unresolved++; continue; }
    let bucket = votesByEvent.get(ev);
    if (!bucket) { bucket = {}; votesByEvent.set(ev, bucket); }
    bucket[who] = decodeOption(r[pvOption]);
  }

  // ---- tallies: VoteCount rows are (option, value) pairs, not columns ----
  const countsPath = findCsvOptional(dir, ['vote_counts']);
  const tallies = new Map<string, { yeas: number; nays: number }>();
  if (countsPath) {
    const cT = loadTable(countsPath);
    const cEvent = col(cT, ['vote_event_id']);
    const cOption = col(cT, ['option']);
    const cValue = col(cT, ['value']);
    for (const r of cT.rows) {
      const ev = r[cEvent];
      const t = tallies.get(ev) ?? { yeas: 0, nays: 0 };
      const opt = r[cOption].trim().toLowerCase();
      const n = parseInt(r[cValue] || '0', 10);
      if (opt === 'yes') t.yeas += n;
      else if (opt === 'no') t.nays += n;
      tallies.set(ev, t);
    }
  }

  // ---- assemble ----
  let procedural = 0;
  let noVotes = 0;
  const all: VoteItem[] = [];
  for (const r of votesT.rows) {
    const id = r[vId];
    const votes = votesByEvent.get(id);
    if (!votes || Object.keys(votes).length === 0) { noVotes++; continue; }

    const { voteType, substantive } = classifyOpenStates(
      r[vMotion] ?? '',
      vClass ? r[vClass] : '',
    );
    if (!substantive) procedural++;

    // Prefer the published tally; fall back to counting the individual votes.
    let { yeas, nays } = tallies.get(id) ?? { yeas: 0, nays: 0 };
    if (yeas + nays === 0) {
      for (const v of Object.values(votes)) {
        if (v === 1) yeas++;
        else if (v === -1) nays++;
      }
    }

    const billRef = r[vBill];
    all.push({
      id,
      billId: billIdentifier.get(billRef) ?? billRef,
      session,
      category: categories?.byBill.get(billIdentifier.get(billRef) ?? billRef) ?? '',
      voteType,
      substantive,
      yeas,
      nays,
      votes,
    });
  }
  void vOrg;

  const substantiveItems = all.filter((i) => i.substantive);
  const items = dropSupersededSecondReadings(substantiveItems);

  // ---- roster ----
  let roster: PartyRoster = {};
  let rosterIsCurrentParty = false;
  if (opts.peopleCsv) {
    if (!existsSync(opts.peopleCsv)) throw new Error(`--people not found: ${opts.peopleCsv}`);
    const pT = loadTable(opts.peopleCsv);
    const idCol = col(pT, ['id', 'person_id', 'ocd_person_id']);
    // A session-scoped roster (from openstates_extract.sql) has a `party` column
    // plus the session it was computed for. The public current-members CSV has
    // `current_party` — the tell that it is not session-scoped.
    const sessionParty = optionalCol(pT, ['party', 'session_party']);
    const currentParty = optionalCol(pT, ['current_party']);

    if (!sessionParty && !currentParty) {
      throw new Error(
        `${basename(opts.peopleCsv)}: no party column found (looked for party, ` +
          `session_party, current_party). headers: ${pT.headers.join(', ')}`,
      );
    }
    rosterIsCurrentParty = !sessionParty;
    if (rosterIsCurrentParty && !opts.allowCurrentParty) {
      throw new Error(
        `${basename(opts.peopleCsv)} carries "current_party", which is the member's party ` +
          `TODAY, not during ${session}. DATA_PIPELINE.md requires a session snapshot: a ` +
          `party switch or a mid-term replacement makes this silently wrong.\n\n` +
          `  Either build a session-scoped roster with scripts/openstates_extract.sql,\n` +
          `  or pass --allow-current-party to accept the compromise deliberately (it is\n` +
          `  recorded in the output as rosterIsCurrentParty).`,
      );
    }
    const partyCol = sessionParty || currentParty;
    for (const r of pT.rows) {
      if (!r[idCol]) continue;
      roster[r[idCol]] = decodeParty(r[partyCol]);
    }
  }

  // ---- sponsorships, for the author-against-own-bill flag ----
  const sponsorsByBill = new Map<string, string[]>();
  const spPath = findCsvOptional(dir, ['bill_sponsorships', 'sponsorships']);
  if (spPath) {
    const sT = loadTable(spPath);
    const sBill = col(sT, ['bill_id']);
    const sPerson = optionalCol(sT, ['person_id']);
    const sPrimary = optionalCol(sT, ['primary']);
    if (sPerson) {
      for (const r of sT.rows) {
        // `primary` is a Python bool serialized as True/False.
        if (sPrimary && !/^true$/i.test(r[sPrimary])) continue;
        if (!r[sPerson]) continue;
        const bill = billIdentifier.get(r[sBill]) ?? r[sBill];
        const arr = sponsorsByBill.get(bill) ?? [];
        arr.push(r[sPerson]);
        sponsorsByBill.set(bill, arr);
      }
    }
  }
  const reviewFlags = flagAuthorAgainstOwnBill(items, sponsorsByBill);

  const rostered = Object.keys(roster).length;
  const voters = new Set(items.flatMap((i) => Object.keys(i.votes)));
  let matched = 0;
  for (const v of voters) if (roster[v]) matched++;

  return {
    items,
    roster,
    rosterIsCurrentParty,
    reviewFlags,
    categories,
    stats: {
      billsInExport: billsT.rows.length,
      voteEventsInExport: votesT.rows.length,
      eventsWithNoRecordedVotes: noVotes,
      unresolvedVoterRows: unresolved,
      proceduralDropped: procedural,
      secondReadingsSuperseded: substantiveItems.length - items.length,
      itemsEmitted: items.length,
      categorized: items.filter((i) => i.category !== '').length,
      uncategorized: items.filter((i) => i.category === '').length,
      rosterEntries: rostered,
      distinctVoters: voters.size,
      votersMatchedToParty: matched,
      reviewFlags: reviewFlags.length,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  const [dir, session] = positional;
  const outDir = flag('--out') ?? WORK_DIR;

  if (!dir || !session) {
    console.error(
      'usage: ingest_openstates.ts <extracted-dir> <session> [--out <dir>]\n' +
        '                            [--people <csv>] [--allow-current-party]\n\n' +
        '  <session> is the PlainRecord label ("89R"), not the Open States\n' +
        '  session identifier — the two differ and the label is what the app keys on.',
    );
    process.exit(1);
  }
  if (/\d{4}[_-]\d{4}/.test(session)) {
    console.error(`refusing session label "${session}": use "89R" or "89-1", not a year range.`);
    process.exit(1);
  }

  const res = ingestOpenStates(dir, session, {
    peopleCsv: flag('--people'),
    allowCurrentParty: argv.includes('--allow-current-party'),
  });

  mkdirSync(outDir, { recursive: true });
  const itemsPath = join(outDir, `tx_bills_${session}.json`);
  writeFileSync(itemsPath, JSON.stringify(res.items, null, 0));

  console.log(`\nsession ${session}  (source: Open States, categories ${CATEGORY_MAP_VERSION})`);
  for (const [k, v] of Object.entries(res.stats)) console.log(`  ${k.padEnd(26)} ${v}`);

  if (res.categories) {
    const c = res.categories;
    console.log('\n  category distribution (bills):');
    for (const [cat, n] of [...c.counts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat.padEnd(28)}${String(n).padStart(6)}`);
    }
    console.log(`    ${'(ceremonial, excluded)'.padEnd(28)}${String(c.nonPolicyBills.length).padStart(6)}`);
    console.log(`    ${'(no I-coded subject)'.padEnd(28)}${String(c.uncategorizable.length).padStart(6)}`);
    if (c.unmappedRoots.size) {
      const total = [...c.unmappedRoots.values()].reduce((s, n) => s + n, 0);
      console.log(
        `\n  UNMAPPED subject roots: ${c.unmappedRoots.size} distinct, ${total} occurrences.\n` +
          '  Add them to SUBJECT_ROOT_MAP deliberately — until then those bills fall\n' +
          '  back to another of their subjects, or go uncategorized:',
      );
      for (const [root, n] of [...c.unmappedRoots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
        console.log(`    ${String(n).padStart(5)}  ${root}`);
      }
    }
  }
  console.log(`\n  -> ${itemsPath}`);

  if (Object.keys(res.roster).length) {
    const rosterPath = join(outDir, `tx_roster_${session}.json`);
    writeFileSync(
      rosterPath,
      JSON.stringify(
        { session, rosterIsCurrentParty: res.rosterIsCurrentParty, party: res.roster },
        null,
        2,
      ),
    );
    console.log(`  -> ${rosterPath}`);
    if (res.rosterIsCurrentParty) {
      console.log(
        '\n  WARNING: roster is CURRENT party, not a snapshot of ' + session + '.\n' +
          '  Valence numbers built on it are wrong for any member who switched parties\n' +
          '  or replaced someone mid-term. Recorded as rosterIsCurrentParty in the file.',
      );
    }
  } else {
    console.log(
      '\n  No roster written (no --people given). valence.ts cannot compute a\n' +
        '  blue/red scale without one; scoring.ts works fine without it.',
    );
  }

  if (res.reviewFlags.length) {
    const flagsPath = join(outDir, `tx_review_${session}.json`);
    writeFileSync(flagsPath, JSON.stringify(res.reviewFlags, null, 2));
    console.log(`  -> ${flagsPath}   (${res.reviewFlags.length} author-against-own-bill, MANUAL REVIEW)`);
  }

  const unmatched = res.stats.distinctVoters - res.stats.votersMatchedToParty;
  if (Object.keys(res.roster).length && unmatched > 0) {
    console.log(
      `\n  ${unmatched} of ${res.stats.distinctVoters} voters have no party in the roster.\n` +
        '  They are excluded from valence (which needs both caucuses) but still scored.',
    );
  }

  const todo: string[] = [];
  if (res.stats.uncategorized > 0) {
    todo.push(
      `${res.stats.uncategorized} items have no category. Stratified selection and\n` +
        '     subscores skip them (OPEN_QUESTIONS #6).',
    );
  }
  todo.push(
    'no Journal reconciliation — diff every roll call against the House/Senate\n' +
      '     Journal (DATA_PIPELINE.md). Open States is a scraper; it is a second\n' +
      '     opinion, not the authority.',
  );
  console.log('\nStill required before publishing:');
  todo.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log('');
}

if (process.argv[1] && /^ingest_openstates\.(ts|js|mjs|cjs)$/.test(basename(process.argv[1]))) {
  main();
}
