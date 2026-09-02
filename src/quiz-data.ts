/**
 * PlainRecord — the bridge between the exported payload and the real estimator
 *
 * WHY THIS FILE EXISTS. The prototype carried a hand-ported copy of
 * `valence.ts` and `scoring.ts` inside a <script> tag. Two implementations of
 * the same arithmetic, only one of them covered by the 176 checks in the test
 * suites — so the page could quietly disagree with the module it was supposed
 * to be demonstrating, and nothing would catch it.
 *
 * This module adapts the compact quiz payload back into the shapes the real
 * functions expect, so `buildProfile`, `describeProfile`, `scoreLegislator` and
 * `describeScore` are imported rather than re-written. There is now exactly one
 * implementation of the estimator, and it is the tested one.
 *
 * The adaptation is the only reason any glue is needed at all: the payload is
 * 53 KB because it carries three candidates' votes and precomputed chamber
 * statistics instead of all 150 members' votes on 3,546 items (35 MB).
 */

import type { VoteItem, Answer, LegislatorId, VoteCast } from '../scoring';
import { scoreLegislator, describeScore } from '../scoring';
import { buildProfile, describeProfile } from '../valence';
import type { ItemValence, PartisanProfile } from '../valence';
import payload from '../public/data/quiz_89R.json';

// ---------------------------------------------------------------------------
// Payload types (mirror scripts/export_quiz_data.ts)
// ---------------------------------------------------------------------------

export interface QuizItem {
  id: string;
  billId: string;
  category: string;
  caption: string;
  yeas: number;
  nays: number;
  /** Yea share among voting members. */
  p: number;
  valence: number | null;
  rYea: number | null;
  dYea: number | null;
  /** Profile weight (valence.profileWeights). */
  w: number;
  /** Scoring weight (scoring.computeWeights). */
  sw: number;
  src: 'journal' | 'scrape';
  rec: number | null;
  votes: Record<string, VoteCast>;
  headline?: boolean;
  label?: string;
  why?: string;
  statements?: {
    member: string;
    shownAs: VoteCast;
    claimed: VoteCast;
    text: string;
  }[];
}

export interface QuizCandidate {
  id: string;
  name: string;
  office: string;
  running: string;
  voted: number;
}

export interface QuizOutcome {
  category: string;
  label: string;
  value: string;
  comparison: string;
  rank: string | null;
  standing: 'bottom' | 'middle' | 'top' | 'neutral';
  sourceName: string;
  sourceUrl: string;
  year: string;
  caveat: string;
}

export interface QuizPayload {
  session: string;
  ruleVersion: string;
  rulePerCategory: number;
  ruleReserve: number;
  rulePartisanThreshold: number;
  partisanByConstruction: boolean;
  crossCuttingShare: number;
  headlineCount: number;
  provenance: {
    houseItemsTotal: number;
    uncategorizedExcluded: number;
    sameBillCollapsed: number;
    journalSourced: number;
    selectedJournalSourced: number;
    eligibleTotal: number;
  };
  outcomes: QuizOutcome[];
  incumbents: { name: string; office: string; since: string; sessions: string; acts: string[] }[];
  causalNote: string;
  omissions: { category: string; why: string }[];
  candidates: QuizCandidate[];
  items: QuizItem[];
}

export const DATA = payload as unknown as QuizPayload;
export const ALL_ITEMS: QuizItem[] = DATA.items;
export const HEADLINE_ITEMS: QuizItem[] = ALL_ITEMS.filter((i) => i.headline);
export const CANDIDATES: QuizCandidate[] = DATA.candidates;

// ---------------------------------------------------------------------------
// Adaptation
// ---------------------------------------------------------------------------

/**
 * A QuizItem carries everything the estimator reads off a VoteItem — id,
 * category, yeas, nays and the per-member votes it needs — but not the fields
 * only the ingest uses (session, voteType, substantive). They are filled with
 * the values the export guarantees so the object is a genuine VoteItem rather
 * than a cast that happens to work.
 */
function toVoteItem(q: QuizItem, session: string): VoteItem {
  return {
    id: q.id,
    billId: q.billId,
    session,
    category: q.category,
    // Every exported item passed the eligibility floor, which requires
    // substantive === true, and the export only emits floor votes.
    voteType: 'final',
    substantive: true,
    yeas: q.yeas,
    nays: q.nays,
    votes: q.votes,
  };
}

export interface Adapted {
  items: VoteItem[];
  /** valence.ts consumes ItemValence objects, not bare numbers. */
  valences: Map<string, ItemValence>;
  /** profileWeights output, precomputed at export time. */
  profileWeights: Map<string, number>;
  /** computeWeights output, precomputed at export time. */
  scoringWeights: Map<string, number>;
}

export function adapt(quizItems: QuizItem[], session = DATA.session): Adapted {
  const items: VoteItem[] = [];
  const valences = new Map<string, ItemValence>();
  const profileW = new Map<string, number>();
  const scoringW = new Map<string, number>();

  for (const q of quizItems) {
    items.push(toVoteItem(q, session));
    valences.set(q.id, {
      itemId: q.id,
      valence: q.valence,
      rYeaShare: q.rYea,
      dYeaShare: q.dYea,
      // Caucus sizes are not carried in the payload; valence was computed at
      // export time against the full session roster and is not recomputed here.
      rVoting: 0,
      dVoting: 0,
    });
    profileW.set(q.id, q.w);
    scoringW.set(q.id, q.sw);
  }
  return { items, valences, profileWeights: profileW, scoringWeights: scoringW };
}

// ---------------------------------------------------------------------------
// The estimator, called through the real modules
// ---------------------------------------------------------------------------

export type AnswerMap = Record<string, Answer>;

export function profileOf(a: Adapted, answers: AnswerMap): PartisanProfile {
  return buildProfile(a.items, answers, a.valences, a.profileWeights);
}

export const describe = describeProfile;

export interface CandidateResult {
  score: number;
  adjusted: number;
  n: number;
  phrase: string;
}

export function scoreOf(a: Adapted, candidateId: LegislatorId, answers: AnswerMap): CandidateResult {
  const r = scoreLegislator(candidateId, a.items, answers, a.scoringWeights);
  return {
    score: r.score,
    adjusted: r.adjustedScore,
    n: r.n,
    phrase: describeScore(r.adjustedScore),
  };
}

/**
 * Where a candidate's own record sits on the same axis as the user's answers,
 * over the items the user actually answered. Mirrors the profile's own
 * weighting so the two marks are comparable.
 */
export function candidateLean(
  quizItems: QuizItem[],
  candidateId: string,
  answers: AnswerMap,
): { lean: number; n: number } {
  let wSum = 0;
  let num = 0;
  let n = 0;
  for (const q of quizItems) {
    const ans = answers[q.id];
    if (ans === undefined || ans === 0) continue;
    if (q.valence === null || !q.w) continue;
    const v = q.votes[candidateId];
    if (v === null || v === undefined) continue;
    wSum += q.w;
    num += q.w * v * q.valence;
    n++;
  }
  return { lean: wSum > 1e-9 ? num / wSum : 0, n };
}

export function outcomesFor(category: string): QuizOutcome[] {
  return DATA.outcomes.filter((o) => o.category === category);
}
