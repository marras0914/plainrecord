/**
 * PlainRecord — Journal reconciliation
 *
 *   npx tsx scripts/reconcile.ts 89R <journal-text-dir> <people.csv> [--max-days N]
 *
 * DATA_PIPELINE.md: "Reconciliation is not optional. Diff every roll call against
 * the Journal before publishing, and fail the build on unexplained mismatches.
 * Shipping a wrong vote attributed to a named person is the single worst failure
 * mode this project has."
 *
 * This is that diff. It treats the House Journal as authoritative and the scraped
 * data as the thing under test — which turns out to be the right way round.
 *
 * WHAT THE FIRST RUN FOUND, and why this script is not a formality:
 *
 *   - 5.27% of all 89R person-votes in Open States have NO person attached
 *     (voter_id NULL), across 176 distinct unresolved name forms versus 175
 *     resolved people.
 *   - The scraper truncates surnames by one character: "Talaric" (248 votes),
 *     "Virdel", "Simmon", "Smithe", "Wall", "Goodwi", "Hinojos". James Talarico
 *     is one of the three candidates this project covers.
 *   - "Rodríguez Ramos" (3,518 votes) resolves to nobody at all, so a sitting
 *     member's entire record is absent.
 *   - Chair markers are left glued on: "Harris(C", "Vasut(C", "Landgraf(C".
 *   - The list labels themselves are ingested as voters: "Present", "Absent",
 *     "Excused", "Speaker".
 *
 * So the Journal is not a second opinion here; it is the repair. Exit code is
 * non-zero on any unexplained mismatch, so a build can gate on it.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { VoteItem, VoteCast } from '../scoring';
import { parseJournalDay, resolveJournalNames } from '../journal';
import type { JournalRecordVote, JournalStatement } from '../journal';
import { loadTable, col } from './csv_util';
import { WORK_DIR } from './paths';

export interface Discrepancy {
  kind:
    | 'missing-in-scrape'      // journal has the vote, the ingest has no such item
    | 'tally-differs'          // same bill, different Yea/Nay totals
    | 'member-vote-differs'    // a named person is recorded differently
    | 'member-missing'         // journal records a position, ingest has none
    | 'ambiguous-match'        // several ingested items fit; refusing to guess
    | 'unresolved-journal-name';
  recordNumber: number;
  billId: string | null;
  detail: string;
}

export interface ReconcileReport {
  daysParsed: number;
  journalVotes: number;
  matchedItems: number;
  statements: JournalStatement[];
  discrepancies: Discrepancy[];
  /** Per-member counts of positions the journal has and the ingest lacks. */
  memberGaps: Map<string, number>;
}

const sideOf = (v: JournalRecordVote, id: string, resolved: Map<string, string>): VoteCast | undefined => {
  const has = (names: string[]) => names.some((n) => resolved.get(n) === id);
  if (has(v.members.yea)) return 1;
  if (has(v.members.nay)) return -1;
  if (
    has(v.members['present-not-voting']) ||
    has(v.members['absent-excused']) ||
    has(v.members.absent)
  ) {
    return null;
  }
  return undefined; // the journal does not mention this member at all
};

export function reconcile(
  items: VoteItem[],
  journalTexts: { day: number; text: string }[],
  roster: { id: string; name: string; chamber?: string; votedInSession?: boolean }[],
): ReconcileReport {
  // The House Journal must resolve against House members only: Texas has both a
  // Rep. Gina Hinojosa and a Sen. Adam Hinojosa, and both a Rep. Ward Johnson and
  // a Sen. Nathan Johnson. Chamber is inferred from roll size — a House roll has
  // ~150 voters, a Senate roll 31.
  const hasChamber = roster.some((p) => p.chamber);
  const houseIds = new Set<string>(
    hasChamber ? roster.filter((p) => p.chamber === 'lower').map((p) => p.id) : [],
  );
  if (!hasChamber) {
    for (const it of items) {
      const ids = Object.keys(it.votes);
      if (ids.length > 60) for (const id of ids) houseIds.add(id);
    }
  }

  // Index ingested items by bill, restricted to House rolls.
  const byBill = new Map<string, VoteItem[]>();
  for (const it of items) {
    if (Object.keys(it.votes).length <= 60) continue;
    const arr = byBill.get(it.billId) ?? [];
    arr.push(it);
    byBill.set(it.billId, arr);
  }

  const discrepancies: Discrepancy[] = [];
  const statements: JournalStatement[] = [];
  const statementKeys = new Set<string>();
  const memberGaps = new Map<string, number>();
  const nameOf = new Map(roster.map((p) => [p.id, p.name]));
  // Members the scrape observed voting: used only to break ambiguous surnames.
  const preferIds = new Set(roster.filter((p) => p.votedInSession).map((p) => p.id));
  let journalVotes = 0;
  let matchedItems = 0;

  for (const { day, text } of journalTexts) {
    const parsed = parseJournalDay(text, day);
    // The same statement is printed more than once (body and daily addendum), so
    // 16 days first yielded 2,831 "statements" against ~15 real ones per day.
    // Key on record + member + the opening words.
    for (const st of parsed.statements) {
      const key = `${st.recordNumber}|${st.member}|${st.text.slice(0, 60)}`;
      if (statementKeys.has(key)) continue;
      statementKeys.add(key);
      statements.push(st);
    }

    const allNames = [...new Set(parsed.votes.flatMap((v) => Object.values(v.members).flat()))];
    const { resolved, unresolved } = resolveJournalNames(allNames, roster, {
      eligibleIds: houseIds,
      preferIds,
    });
    for (const u of unresolved) {
      // The presiding officer does not cast a district vote; that is expected.
      if (/presiding officer/.test(u.reason)) continue;
      discrepancies.push({
        kind: 'unresolved-journal-name',
        recordNumber: -1,
        billId: null,
        detail: `day ${day}: "${u.journalName}" — ${u.reason}${
          u.candidates.length ? ` [${u.candidates.join(' | ')}]` : ''
        }`,
      });
    }

    for (const jv of parsed.votes) {
      if (!jv.billId) continue; // not a vote on a bill
      journalVotes++;

      const candidates = byBill.get(jv.billId) ?? [];
      // Match on the printed tally. Without an RV number in the scraped data
      // (Open States carries none for Texas: 0 of 6,471 events have an
      // identifier or bill_action_id) the tally is the only join key available.
      const tallyMatches = candidates.filter(
        (c) => c.yeas === jv.tally.yeas && c.nays === jv.tally.nays,
      );

      // A tally is NOT a unique key. 26 of 1,778 bills in 89R have two or more
      // House items with identical Yea/Nay counts — SB 14 has two at 97Y/51N,
      // being second and third reading. Taking the first match produced five
      // bogus "member-vote-differs" on one record, which looked exactly like the
      // worst-case finding (a wrong vote attributed to a named person) but was
      // purely a join artifact. So: disambiguate by member-level agreement, and
      // refuse to diff at all if no candidate clearly wins.
      let match = tallyMatches[0];
      if (tallyMatches.length > 1) {
        const scored = tallyMatches.map((c) => {
          let agree = 0;
          for (const id of Object.keys(c.votes)) {
            const js = sideOf(jv, id, resolved);
            if (js !== undefined && c.votes[id] === js) agree++;
          }
          return { c, agree };
        });
        scored.sort((a, b) => b.agree - a.agree);
        if (scored.length > 1 && scored[0].agree === scored[1].agree) {
          discrepancies.push({
            kind: 'ambiguous-match',
            recordNumber: jv.recordNumber,
            billId: jv.billId,
            detail:
              `${tallyMatches.length} ingested items on ${jv.billId} share the tally ` +
              `${jv.tally.yeas}Y/${jv.tally.nays}N and agree with the journal equally ` +
              `(${scored[0].agree} members each) — refusing to diff rather than risk ` +
              `attributing a vote to the wrong roll call`,
          });
          continue;
        }
        match = scored[0].c;
      }

      if (!match) {
        discrepancies.push({
          kind: 'missing-in-scrape',
          recordNumber: jv.recordNumber,
          billId: jv.billId,
          detail:
            `journal has ${jv.tally.yeas}Y/${jv.tally.nays}N on ${jv.billId} ` +
            `(${jv.action}); ingest has ` +
            (candidates.length
              ? `${candidates.length} item(s) with tallies ${candidates
                  .map((c) => `${c.yeas}Y/${c.nays}N`)
                  .join(', ')}`
              : 'no item for this bill'),
        });
        continue;
      }
      matchedItems++;

      // Member-level diff. This is the check that matters: a wrong vote
      // attributed to a named person is the failure mode the doc calls worst.
      for (const id of houseIds) {
        const journalSide = sideOf(jv, id, resolved);
        if (journalSide === undefined) continue; // journal silent on this member
        const scraped = match.votes[id];

        if (scraped === undefined || (scraped === null && journalSide !== null)) {
          memberGaps.set(nameOf.get(id) ?? id, (memberGaps.get(nameOf.get(id) ?? id) ?? 0) + 1);
          if (journalSide !== null) {
            discrepancies.push({
              kind: 'member-missing',
              recordNumber: jv.recordNumber,
              billId: jv.billId,
              detail: `${nameOf.get(id) ?? id}: journal ${
                journalSide === 1 ? 'Yea' : 'Nay'
              }, ingest has ${scraped === undefined ? 'no record' : 'no position'}`,
            });
          }
          continue;
        }
        if (scraped !== journalSide) {
          discrepancies.push({
            kind: 'member-vote-differs',
            recordNumber: jv.recordNumber,
            billId: jv.billId,
            detail: `${nameOf.get(id) ?? id}: journal ${
              journalSide === 1 ? 'Yea' : journalSide === -1 ? 'Nay' : 'no position'
            }, ingest ${scraped === 1 ? 'Yea' : scraped === -1 ? 'Nay' : 'no position'}`,
          });
        }
      }
    }
  }

  return {
    daysParsed: journalTexts.length,
    journalVotes,
    matchedItems,
    statements,
    discrepancies,
    memberGaps,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const [session, journalDir, peopleCsv] = argv.filter((a) => !a.startsWith('--'));
  const maxIdx = argv.indexOf('--max-days');
  const maxDays = maxIdx >= 0 ? parseInt(argv[maxIdx + 1], 10) : Infinity;

  if (!session || !journalDir || !peopleCsv) {
    console.error(
      'usage: reconcile.ts <session> <journal-text-dir> <people.csv> [--max-days N]\n\n' +
        '  Journal text files are produced by:\n' +
        '    pdftotext -layout -enc UTF-8 89RDAY43FINAL.PDF day43.txt\n' +
        '  WITHOUT -enc UTF-8 every accented surname is mangled and will not resolve.',
    );
    process.exit(1);
  }

  const itemsPath = join(WORK_DIR, `tx_bills_${session}.json`);
  if (!existsSync(itemsPath)) throw new Error(`missing ${itemsPath} — run an ingest first`);
  const items: VoteItem[] = JSON.parse(readFileSync(itemsPath, 'utf8'));

  const pT = loadTable(peopleCsv);
  const idc = col(pT, ['id', 'person_id']);
  const namec = col(pT, ['name']);
  const chc = (() => { try { return col(pT, ['chamber']); } catch { return ''; } })();
  const vic = (() => { try { return col(pT, ['voted_in_session']); } catch { return ''; } })();
  const roster = pT.rows.map((r) => ({
    id: r[idc], name: r[namec],
    ...(chc ? { chamber: r[chc] } : {}),
    ...(vic ? { votedInSession: /^(t|true|1)$/i.test(r[vic]) } : {}),
  }));

  const files = readdirSync(journalDir)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .map((f) => ({ f, day: parseInt(/(\d+)/.exec(basename(f))?.[1] ?? '0', 10) }))
    .sort((a, b) => a.day - b.day)
    .slice(0, maxDays === Infinity ? undefined : maxDays);

  const texts = files.map(({ f, day }) => ({
    day,
    text: readFileSync(join(journalDir, f), 'utf8'),
  }));

  const rep = reconcile(items, texts, roster);

  console.log(`\n=== Journal reconciliation: ${session} ===`);
  console.log(`  journal days parsed        ${rep.daysParsed}`);
  console.log(`  journal record votes       ${rep.journalVotes}`);
  console.log(`  matched to ingested items  ${rep.matchedItems}`);
  console.log(`  statements of vote found   ${rep.statements.length}`);

  const byKind = new Map<string, number>();
  for (const d of rep.discrepancies) byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1);
  console.log('\n  discrepancies by kind:');
  for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(24)} ${n}`);
  }

  if (rep.memberGaps.size) {
    console.log('\n  members whose journal positions are missing from the ingest:');
    for (const [name, n] of [...rep.memberGaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`    ${name.padEnd(28)} ${n}`);
    }
  }

  if (rep.statements.length) {
    console.log('\n  STATEMENTS OF VOTE — a member says the record is wrong.');
    console.log('  These never rewrite a vote; the recorded vote stands and the');
    console.log('  statement is shown beside it.');
    for (const s of rep.statements.slice(0, 20)) {
      const shown = s.shownAs === 1 ? 'Yea' : s.shownAs === -1 ? 'Nay' : '?';
      const want = s.claimed === 1 ? 'Yea' : s.claimed === -1 ? 'Nay' : '?';
      console.log(`    Record ${String(s.recordNumber).padEnd(5)} ${s.member.padEnd(18)} shown ${shown.padEnd(4)} intended ${want}`);
    }
  }

  const sample = rep.discrepancies
    .filter((d) => d.kind === 'member-vote-differs')
    .slice(0, 12);
  if (sample.length) {
    console.log('\n  sample discrepancies:');
    for (const d of sample) {
      console.log(`    [${d.kind}] Record ${d.recordNumber} ${d.billId ?? ''}: ${d.detail}`);
    }
  }

  mkdirSync(WORK_DIR, { recursive: true });
  const out = join(WORK_DIR, `tx_reconcile_${session}.json`);
  writeFileSync(
    out,
    JSON.stringify(
      {
        session,
        daysParsed: rep.daysParsed,
        journalVotes: rep.journalVotes,
        matchedItems: rep.matchedItems,
        statements: rep.statements,
        discrepancies: rep.discrepancies,
        memberGaps: Object.fromEntries(rep.memberGaps),
      },
      null,
      2,
    ),
  );
  console.log(`\n  -> ${out}`);

  const unexplained = rep.discrepancies.filter(
    (d) => d.kind !== 'unresolved-journal-name' && d.kind !== 'ambiguous-match',
  ).length;
  if (unexplained > 0) {
    console.log(
      `\nFAIL: ${unexplained} unexplained mismatch(es). DATA_PIPELINE.md requires the\n` +
        'build to stop here rather than publish a vote it cannot stand behind.\n',
    );
    process.exit(1);
  }
  console.log('\nOK: no unexplained member-level mismatches.\n');
}

if (process.argv[1] && /^reconcile\.(ts|js|mjs|cjs)$/.test(basename(process.argv[1]))) main();
