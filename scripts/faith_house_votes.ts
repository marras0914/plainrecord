/**
 * PlainRecord: how each party in the Texas House voted on the bills a church
 * took a side on
 *
 * Joins three committed files, so faith.smoke.ts can rebuild it without the
 * network:
 *   data/faith/tccb_89_positions.json  the bishops' positions (extract_tccb_positions.ts)
 *   data/faith/house_passage_89R.json  which record vote passed each bill (fetch_house_passage.ts)
 *   public/data/votes_89R.json         every House record vote, member by member
 *
 * DECIDED 13 Nov 2026 (Marco): compare a party's votes with a church only on
 * bills the church itself took a side on; Texas Catholic Conference of Bishops
 * positions count as Catholic, labeled TCCB; the House's final-passage vote on
 * each bill; a per-bill list plus a count per party. Never combined across
 * churches, never one number for "Christian values".
 *
 * "Voted the bishops' way" means the party's MAJORITY of members who voted yea
 * or nay did what the bishops asked: yea on a bill they supported, nay on one
 * they opposed. An exact tie is "split", and counts as neither.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHIP_DIR } from './paths';
import { TCCB_FILE, TCCB_AREAS } from './extract_tccb_positions';
import { PASSAGE_FILE } from './fetch_house_passage';

type Way = 'with' | 'against' | 'split';
type Party = 'R' | 'D';
type Tally = { yea: number; nay: number };

export interface CountedBill {
  bill: string;
  position: 'supports' | 'opposes';
  areas: string[];
  /** The bill's official caption, from its history on Texas Legislature Online. */
  caption: string;
  with: string[];
  source: string;
  house: {
    rv: number; date: string; journalPage: string; history: string; voteId: string;
    yeas: number; nays: number; memberYeas: number; memberNays: number;
    R: Tally; D: Tally; rWay: Way; dWay: Way;
  };
}

export function buildHouseVotes() {
  const tccb = JSON.parse(readFileSync(TCCB_FILE, 'utf8'));
  const passage = JSON.parse(readFileSync(PASSAGE_FILE, 'utf8'));
  const corpus = JSON.parse(readFileSync(join(SHIP_DIR, 'votes_89R.json'), 'utf8'));
  const party: Party[] = corpus.memberOrder.map((id: string) => {
    const p = corpus.members[id]?.p;
    if (p !== 'R' && p !== 'D') throw new Error(`faith_house_votes: member ${id} has no R/D party`);
    return p;
  });

  const bills: CountedBill[] = [];
  const notVoted: Record<string, string[]> = { notPassed: [], noRecordVote: [], noSuchBill: [], voteNotInFile: [] };
  for (const pos of tccb.positions) {
    const pass = passage.bills[pos.bill];
    if (!pass) throw new Error(`faith_house_votes: ${pos.bill} has no passage record; run npm run data:faith:passage`);
    if (pass.status === 'not-passed') { notVoted.notPassed.push(pos.bill); continue; }
    if (pass.status === 'no-record-vote') { notVoted.noRecordVote.push(pos.bill); continue; }
    if (pass.status === 'no-such-bill') { notVoted.noSuchBill.push(pos.bill); continue; }

    const vote = corpus.items.find((v: { billId: string; journalRecord: number | null }) => v.billId === pos.bill && v.journalRecord === pass.rv);
    if (!vote) {
      // Six bills (13 Nov 2026) passed on a record vote that took up several
      // bills at once (RV#552: HB 140 and HB 2735), and the corpus has no
      // member-level record of those votes. Listed, not counted, not guessed.
      if (corpus.items.some((v: { journalRecord: number | null }) => v.journalRecord === pass.rv)) {
        throw new Error(`faith_house_votes: RV#${pass.rv} is in votes_89R.json but not under ${pos.bill}; look before listing it as missing`);
      }
      notVoted.voteNotInFile.push(`${pos.bill} (RV#${pass.rv})`);
      continue;
    }
    if (vote.yeas + vote.nays <= 60) throw new Error(`faith_house_votes: ${pos.bill} RV#${pass.rv} has ${vote.yeas + vote.nays} votes; that is not a House roll call`);

    const tally = { R: { yea: 0, nay: 0 }, D: { yea: 0, nay: 0 } };
    [...vote.v].forEach((c: string, i: number) => {
      if (c === 'y') tally[party[i]].yea++;
      else if (c === 'n') tally[party[i]].nay++;
    });
    const way = (p: Party): Way => {
      const { yea, nay } = tally[p];
      if (yea === nay) return 'split';
      const yeaWon = yea > nay;
      return (pos.position === 'supports') === yeaWon ? 'with' : 'against';
    };
    bills.push({
      bill: pos.bill,
      position: pos.position,
      areas: pos.areas,
      caption: pass.caption,
      with: pos.with,
      source: pos.source,
      house: {
        rv: pass.rv, date: pass.date, journalPage: pass.journalPage, history: pass.url, voteId: vote.id,
        // The official totals; memberYeas/memberNays are the member-by-member
        // ones, short where Open States truncated a surname so a vote could not
        // be attributed (votes_89R.json _meta.shortRecords).
        yeas: vote.yeas, nays: vote.nays, memberYeas: vote.vYeas, memberNays: vote.vNays,
        R: tally.R, D: tally.D, rWay: way('R'), dWay: way('D'),
      },
    });
  }

  const tallyOf = (list: typeof bills) => ({
    bills: list.length,
    R: { with: list.filter((b) => b.house.rWay === 'with').length, against: list.filter((b) => b.house.rWay === 'against').length, split: list.filter((b) => b.house.rWay === 'split').length },
    D: { with: list.filter((b) => b.house.dWay === 'with').length, against: list.filter((b) => b.house.dWay === 'against').length, split: list.filter((b) => b.house.dWay === 'split').length },
    /** Where the two parties' majorities went different ways. */
    partiesDiffer: list.filter((b) => b.house.rWay !== b.house.dWay).length,
  });

  return {
    traditionId: 'catholic',
    body: 'Texas Catholic Conference of Bishops',
    session: '89th Texas Legislature, regular session (2025)',
    saved: tccb.saved,
    pages: tccb.pages,
    caveat: tccb.caveat,
    positionCounts: tccb.counts,
    passageRule: passage.rule,
    bills,
    notVoted,
    conflicts: tccb.conflicts,
    total: tallyOf(bills),
    /** A bill in two areas counts in each; the total counts it once. */
    byArea: [...TCCB_AREAS, null].map((a) => ({ area: a, ...tallyOf(bills.filter((b) => (a === null ? b.areas.length === 0 : b.areas.includes(a)))) })).filter((x) => x.bills > 0),
  };
}

export type HouseVotes = ReturnType<typeof buildHouseVotes>;
