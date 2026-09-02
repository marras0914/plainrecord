/**
 * PlainRecord — backfill member votes from the House Journal
 *
 *   npx tsx scripts/backfill_journal.ts 89R <journal-text-dir> <people.csv> [--out dir]
 *
 * The Journal is authoritative (DATA_PIPELINE.md). Reconciliation established
 * that the scraped data is not *wrong* about members — zero cases where both
 * sources hold a position for a named person and disagree — but that it is
 * lossy: 5.27% of 89R person-votes carry no person id, one member's record is
 * absent entirely, and several surnames are truncated by a character. So the fix
 * is to take member positions from the Journal wherever a record vote can be
 * matched, and to say so on the item.
 *
 * RULES THIS SCRIPT KEEPS, because a backfill is the most dangerous thing in the
 * pipeline — it rewrites votes attributed to named people:
 *
 *  1. NEVER backfill an ambiguous match. A tally is not a unique key (26 of 1,778
 *     bills have two House items with identical counts), so where several items
 *     fit and none wins on member-level agreement, the item is left alone.
 *  2. NEVER drop a member the Journal could not resolve. If a journal surname
 *     does not map to a roster id, that member's scraped position is retained and
 *     the id is listed in `unreconciledMembers`. Replacing wholesale would delete
 *     real positions in the name of accuracy.
 *  3. NEVER apply a statement of vote. A member saying "I intended yes" does not
 *     change the recorded vote. Statements are attached, not applied.
 *  4. Tallies stay as the Journal printed them, and `journal.ts` already flags any
 *     item where the printed tally disagrees with the printed list length.
 *  5. Every item says where its votes came from via `voteSource`.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { VoteItem, VoteCast, LegislatorId } from '../scoring';
import { parseJournalDay, resolveJournalNames } from '../journal';
import type { JournalRecordVote } from '../journal';
import { loadTable, col } from './csv_util';
import { WORK_DIR } from './paths';

export interface BackfillStats {
  itemsTotal: number;
  houseItems: number;
  journalVotes: number;
  itemsBackfilled: number;
  itemsAmbiguous: number;
  itemsUnmatched: number;
  /** Member had no entry at all in the scrape. */
  positionsAdded: number;
  /** Scrape had an explicit "no position" (null); the Journal has a Yea/Nay. */
  positionsFilledFromNull: number;
  /** Scrape had a real Yea/Nay and the Journal disagrees. THE alarming one. */
  positionsFlipped: number;
  positionsRetainedFromScrape: number;
  statementsAttached: number;
  /** Every Yea<->Nay disagreement, for manual review. */
  flips: { billId: string; record: number | null; member: string; scrape: number; journal: number }[];
  unresolvedNames: Map<string, number>;
  perMemberAdded: Map<string, number>;
}

/** Journal side for one member on one record vote, or undefined if unmentioned. */
function journalSide(
  jv: JournalRecordVote,
  id: LegislatorId,
  resolved: Map<string, string>,
): VoteCast | undefined {
  const has = (names: string[]) => names.some((n) => resolved.get(n) === id);
  if (has(jv.members.yea)) return 1;
  if (has(jv.members.nay)) return -1;
  if (
    has(jv.members['present-not-voting']) ||
    has(jv.members['absent-excused']) ||
    has(jv.members.absent)
  ) {
    return null;
  }
  return undefined;
}

export function backfill(
  items: VoteItem[],
  journalTexts: { day: number; text: string }[],
  roster: { id: string; name: string; chamber?: string; votedInSession?: boolean }[],
): { items: VoteItem[]; stats: BackfillStats } {
  // House membership comes from the ROSTER, not from roll sizes. Inferring it
  // from who appears in the items cannot see a member whose votes the scrape
  // never attributed to anyone: Ana-Maria Rodriguez Ramos cast votes in 89R,
  // all 3,518 of them unresolved, so she appears in zero items. Backfilling her
  // record requires knowing she is a House member independently of the votes.
  const hasChamber = roster.some((p) => p.chamber);
  const houseIds = new Set<string>(
    hasChamber
      ? roster.filter((p) => p.chamber === 'lower').map((p) => p.id)
      : [],
  );
  if (!hasChamber) {
    for (const it of items) {
      const ids = Object.keys(it.votes);
      if (ids.length > 60) for (const id of ids) houseIds.add(id);
    }
  }
  const nameOf = new Map(roster.map((p) => [p.id, p.name]));
  // Members the scrape observed voting: used only to break ambiguous surnames.
  const preferIds = new Set(roster.filter((p) => p.votedInSession).map((p) => p.id));

  const byBill = new Map<string, VoteItem[]>();
  for (const it of items) {
    if (Object.keys(it.votes).length <= 60) continue;
    const arr = byBill.get(it.billId) ?? [];
    arr.push(it);
    byBill.set(it.billId, arr);
  }

  const stats: BackfillStats = {
    itemsTotal: items.length,
    houseItems: [...byBill.values()].reduce((s, a) => s + a.length, 0),
    journalVotes: 0,
    itemsBackfilled: 0,
    itemsAmbiguous: 0,
    itemsUnmatched: 0,
    positionsAdded: 0,
    positionsFilledFromNull: 0,
    positionsFlipped: 0,
    positionsRetainedFromScrape: 0,
    statementsAttached: 0,
    flips: [],
    unresolvedNames: new Map(),
    perMemberAdded: new Map(),
  };

  // itemId -> the journal data chosen for it. One journal record per item.
  const chosen = new Map<string, { jv: JournalRecordVote; resolved: Map<string, string> }>();
  const claimedItems = new Set<string>();
  const statementsByRecord = new Map<number, { member: string; shownAs: VoteCast; claimed: VoteCast; text: string }[]>();
  const seenStatement = new Set<string>();

  for (const { day, text } of journalTexts) {
    const parsed = parseJournalDay(text, day);

    for (const st of parsed.statements) {
      const key = `${st.recordNumber}|${st.member}|${st.text.slice(0, 60)}`;
      if (seenStatement.has(key)) continue;
      seenStatement.add(key);
      const arr = statementsByRecord.get(st.recordNumber) ?? [];
      arr.push({
        member: st.member,
        shownAs: st.shownAs as VoteCast,
        claimed: st.claimed as VoteCast,
        text: st.text,
      });
      statementsByRecord.set(st.recordNumber, arr);
    }

    const allNames = [...new Set(parsed.votes.flatMap((v) => Object.values(v.members).flat()))];
    const { resolved, unresolved } = resolveJournalNames(allNames, roster, { eligibleIds: houseIds, preferIds });
    for (const u of unresolved) {
      if (/presiding officer/.test(u.reason)) continue;
      stats.unresolvedNames.set(u.journalName, (stats.unresolvedNames.get(u.journalName) ?? 0) + 1);
    }

    for (const jv of parsed.votes) {
      if (!jv.billId) continue;
      stats.journalVotes++;

      const candidates = (byBill.get(jv.billId) ?? []).filter((c) => !claimedItems.has(c.id));
      const tallyMatches = candidates.filter(
        (c) => c.yeas === jv.tally.yeas && c.nays === jv.tally.nays,
      );
      if (tallyMatches.length === 0) { stats.itemsUnmatched++; continue; }

      let target = tallyMatches[0];
      if (tallyMatches.length > 1) {
        const scored = tallyMatches
          .map((c) => {
            let agree = 0;
            for (const id of Object.keys(c.votes)) {
              const js = journalSide(jv, id, resolved);
              if (js !== undefined && c.votes[id] === js) agree++;
            }
            return { c, agree };
          })
          .sort((a, b) => b.agree - a.agree);
        // Rule 1: no clear winner means no backfill.
        if (scored[0].agree === scored[1].agree) { stats.itemsAmbiguous++; continue; }
        target = scored[0].c;
      }

      claimedItems.add(target.id);
      chosen.set(target.id, { jv, resolved });
    }
  }

  const out = items.map((item) => {
    const pick = chosen.get(item.id);
    if (!pick) {
      // Untouched. Mark provenance so an unreconciled item is never mistaken for
      // a reconciled one.
      return { ...item, voteSource: 'scrape' as const, journalRecord: null };
    }
    const { jv, resolved } = pick;

    const votes: Record<LegislatorId, VoteCast> = {};
    for (const id of houseIds) {
      const js = journalSide(jv, id, resolved);
      if (js !== undefined) {
        const before = item.votes[id];
        votes[id] = js;
        if (before === undefined) {
          stats.positionsAdded++;
          const nm = nameOf.get(id) ?? id;
          stats.perMemberAdded.set(nm, (stats.perMemberAdded.get(nm) ?? 0) + 1);
        } else if (before !== js) {
          // Distinguish recovery from correction. A null -> Yea/Nay fill is the
          // scrape having no position where the Journal has one; a real flip
          // means the two sources disagree about a named person's vote, which
          // reconciliation found ZERO of. Lumping them together as "changed"
          // made a clean result look alarming.
          if (before === null) stats.positionsFilledFromNull++;
          else {
            stats.positionsFlipped++;
            stats.flips.push({
              billId: item.billId,
              record: jv.recordNumber,
              member: nameOf.get(id) ?? id,
              scrape: before as number,
              journal: js as number,
            });
          }
        }
      }
    }
    // Rule 2: keep scraped positions for members the Journal could not resolve.
    const unreconciled: LegislatorId[] = [];
    for (const [id, v] of Object.entries(item.votes)) {
      if (!(id in votes)) {
        votes[id] = v;
        unreconciled.push(id);
        stats.positionsRetainedFromScrape++;
      }
    }

    const sts = statementsByRecord.get(jv.recordNumber) ?? [];
    if (sts.length) stats.statementsAttached += sts.length;

    stats.itemsBackfilled++;
    return {
      ...item,
      votes,
      voteSource: 'journal' as const,
      journalRecord: jv.recordNumber,
      ...(unreconciled.length ? { unreconciledMembers: unreconciled } : {}),
      ...(sts.length
        ? {
            voteStatements: sts.map((s) => ({
              // Journal statements are signed by surname; resolving them to an id
              // is best-effort and null when it cannot be done safely.
              memberId: resolved.get(s.member) ?? null,
              member: s.member,
              shownAs: s.shownAs,
              claimed: s.claimed,
              text: s.text,
            })),
          }
        : {}),
    };
  });

  return { items: out, stats };
}

// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--'));
  const [session, journalDir, peopleCsv] = positional;
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : WORK_DIR;

  if (!session || !journalDir || !peopleCsv) {
    console.error('usage: backfill_journal.ts <session> <journal-text-dir> <people.csv> [--out dir]');
    process.exit(1);
  }

  const itemsPath = join(outDir, `tx_bills_${session}.json`);
  if (!existsSync(itemsPath)) throw new Error(`missing ${itemsPath}`);
  const items: VoteItem[] = JSON.parse(readFileSync(itemsPath, 'utf8'));

  const pT = loadTable(peopleCsv);
  const idc = col(pT, ['id', 'person_id']);
  const namec = col(pT, ['name']);
  const chc = (() => { try { return col(pT, ['chamber']); } catch { return ''; } })();
  const vic = (() => { try { return col(pT, ['voted_in_session']); } catch { return ''; } })();
  const roster = pT.rows.map((r) => ({
    id: r[idc],
    name: r[namec],
    ...(chc ? { chamber: r[chc] } : {}),
    ...(vic ? { votedInSession: /^(t|true|1)$/i.test(r[vic]) } : {}),
  }));

  const texts = readdirSync(journalDir)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .map((f) => ({ f, day: parseInt(/(\d+)/.exec(basename(f))?.[1] ?? '0', 10) }))
    .sort((a, b) => a.day - b.day)
    .map(({ f, day }) => ({ day, text: readFileSync(join(journalDir, f), 'utf8') }));

  const { items: filled, stats } = backfill(items, texts, roster);

  console.log(`\n=== Journal backfill: ${session} ===`);
  console.log(`  journal days              ${texts.length}`);
  console.log(`  journal record votes      ${stats.journalVotes}`);
  console.log(`  items total / House       ${stats.itemsTotal} / ${stats.houseItems}`);
  console.log(`  items backfilled          ${stats.itemsBackfilled}`);
  console.log(`  items left as scrape      ${stats.itemsTotal - stats.itemsBackfilled}`);
  console.log(`    of which ambiguous      ${stats.itemsAmbiguous}   (refused, rule 1)`);
  console.log(`    journal vote unmatched  ${stats.itemsUnmatched}`);
  console.log(`  positions ADDED (no entry) ${stats.positionsAdded}`);
  console.log(`  positions filled from null ${stats.positionsFilledFromNull}`);
  console.log(`  positions FLIPPED          ${stats.positionsFlipped}  <- disagreement`);
  console.log(`  positions kept from scrape ${stats.positionsRetainedFromScrape}  (rule 2)`);
  console.log(`  statements attached       ${stats.statementsAttached}  (never applied, rule 3)`);

  if (stats.perMemberAdded.size) {
    console.log('\n  positions recovered per member (top 15):');
    for (const [n, c] of [...stats.perMemberAdded.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`    ${n.padEnd(28)} +${c}`);
    }
  }
  if (stats.unresolvedNames.size) {
    console.log('\n  journal names still unresolved (need a roster entry):');
    for (const [n, c] of [...stats.unresolvedNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    ${n.padEnd(28)} on ${c} day(s)`);
    }
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(itemsPath, JSON.stringify(filled, null, 0));
  if (stats.flips.length) {
    const fp = join(outDir, `tx_flips_${session}.json`);
    writeFileSync(fp, JSON.stringify(stats.flips, null, 2));
    console.log(`  -> ${fp}   (${stats.flips.length} Yea/Nay disagreement(s), MANUAL REVIEW)`);
  }
  console.log(`\n  -> ${itemsPath}  (rewritten with provenance)`);

  const journalPct = (100 * stats.itemsBackfilled) / Math.max(1, stats.houseItems);
  console.log(`\n  ${journalPct.toFixed(1)}% of House items now carry Journal-sourced member votes.`);
  if (stats.positionsFlipped > 0) {
    console.log(
      `  WARNING: ${stats.positionsFlipped} position(s) FLIPPED between a real Yea and a real Nay.\n` +
        '  Reconciliation found zero such cases across the whole session, so any\n' +
        '  non-zero count here needs investigating before this data is published.',
    );
  } else {
    console.log('  No Yea/Nay flips: the Journal never contradicted a scraped position.');
  }
  console.log('');
}

if (process.argv[1] && /^backfill_journal\.(ts|js|mjs|cjs)$/.test(basename(process.argv[1]))) main();
