/**
 * PlainRecord: how each party voted on the bills a tradition's own advocacy
 * office took a side on (faith_advocacy.ts).
 *
 * Decided by Marco, 17 Nov 2026:
 * - Shown as lines under each entry on /faith/congress only; no total, and
 *   nothing marks a party as voting "with" or "against" a tradition.
 * - Which votes count: each chamber's final vote on the named bill (passage,
 *   or the House vote to accept the Senate's changes). Where a chamber never
 *   voted on passage, the vote that stopped the bill is shown instead, labeled
 *   (only the Senate's Born-Alive vote to begin debate). Motions to recommit,
 *   amendments and cloture votes followed by passage are not shown. A vote on
 *   another bill carrying a similar provision does not count.
 *
 * Of every recorded floor vote of the 119th Congress through 17 Nov 2026 (685
 * House, 923 Senate, on 519 measures), only the three bills below are ones a
 * tradition named. scripts/fetch_floor_votes.ts re-derives that from the
 * official lists and refuses to write if a named bill turns up that is not
 * here. The tallies come from the House Clerk's and the Senate's own roll-call
 * XML, into data/faith/floor_votes.json (committed).
 */

import { readFileSync } from 'node:fs';
import type { AdvocacyItem } from './faith_advocacy';

export type Chamber = 'house' | 'senate';
export type VoteKind = 'passage' | 'concur' | 'cloture-proceed';

export interface FloorVoteRef {
  chamber: Chamber;
  /** House: calendar year and roll number. Senate: session and vote number. */
  year?: number;
  roll?: number;
  session?: 1 | 2;
  vote?: number;
}

export interface FloorBill {
  id: string;
  /** Bill numbers as the advocacy entries write them. */
  numbers: string[];
  /** Names as the advocacy entries write them (checked against the sources). */
  names: string[];
  votes: FloorVoteRef[];
}

export const FLOOR_BILLS: FloorBill[] = [
  {
    id: 'hr1', numbers: ['H.R. 1'],
    names: ['One Big Beautiful Bill Act', 'One Big Beautiful Bill', 'Big Beautiful Bill'],
    votes: [
      { chamber: 'house', year: 2025, roll: 145 },
      { chamber: 'senate', session: 1, vote: 372 },
      { chamber: 'house', year: 2025, roll: 190 },
    ],
  },
  {
    id: 'laken-riley', numbers: ['S. 5', 'H.R. 29'], names: ['Laken Riley Act'],
    votes: [
      { chamber: 'house', year: 2025, roll: 6 },
      { chamber: 'senate', session: 1, vote: 7 },
      { chamber: 'house', year: 2025, roll: 23 },
    ],
  },
  {
    id: 'born-alive', numbers: ['S. 6', 'H.R. 21'],
    // The ERLC's list spells it without the hyphen and the plural.
    names: ['Born-Alive Abortion Survivors Protection Act', 'Born Alive Abortion Survivor Protection Act'],
    votes: [
      { chamber: 'house', year: 2025, roll: 27 },
      // The Senate never voted on passage; this is the vote that stopped it.
      { chamber: 'senate', session: 1, vote: 11 },
    ],
  },
];

/** [yes, no] by party; a party with no member voting yes or no is left out. */
export type Split = [number, number];

export interface FloorVote {
  billId: string;
  chamber: Chamber;
  kind: VoteKind;
  /** The measure voted on, e.g. "H.R. 29" or "S. 5". */
  measure: string;
  date: string;
  result: 'passed' | 'failed';
  /** The Vice President broke a tie. */
  tieBroken?: boolean;
  parties: { R: Split; D: Split; I?: Split };
  /** The official roll-call page. */
  url: string;
}

export const FLOOR_VOTES_FILE = new URL('./data/faith/floor_votes.json', import.meta.url);

export interface FloorVotesData {
  _meta: string;
  fetched: string;
  houseRollCalls: number;
  senateRollCalls: number;
  measuresWithRollCall: number;
  votes: FloorVote[];
}

export const loadFloorVotes = (): FloorVotesData => JSON.parse(readFileSync(FLOOR_VOTES_FILE, 'utf8'));

/** Bill numbers in an entry's `numbers` ("S. 6 / H.R. 21; H.R. 1564 / S. 726"). */
export const numberTokens = (s?: string) => (s ?? '').split(/[;/]/).map((x) => x.trim()).filter(Boolean);

/** The floor bills an advocacy entry names, by number or by name. */
export const floorBillsFor = (a: Pick<AdvocacyItem, 'numbers' | 'named'>) => FLOOR_BILLS.filter((b) =>
  numberTokens(a.numbers).some((n) => b.numbers.includes(n)) || a.named.some((n) => b.names.includes(n)));
