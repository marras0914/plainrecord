/**
 * PlainRecord — alignment scoring
 *
 * Implements a chance-corrected, discrimination-weighted, redundancy-adjusted
 * agreement score (a weighted Cohen's-kappa variant) between a user's answers
 * and each legislator's recorded floor votes.
 *
 * Design notes live in ARCHITECTURE.md. Summary:
 *   - Items are weighted by how much the chamber actually divided on them.
 *   - Near-duplicate items (2nd/3rd reading, amendment chains) are de-weighted.
 *   - Agreement is measured against chance, not against zero.
 *   - Scores are shrunk toward zero when a legislator has few eligible votes.
 *
 * Deterministic: no Math.random(), no Date, no I/O. Safe for SSG + unit tests.
 */

// ---------------------------------------------------------------------------
// Types (mirror these into src/types/index.ts)
// ---------------------------------------------------------------------------

export type LegislatorId = string;

/** User's position on an item. 0 = skipped / no opinion. */
export type Answer = 1 | -1 | 0;

/** A legislator's cast vote. null = absent, present-not-voting, or not seated. */
export type VoteCast = 1 | -1 | null;

export interface VoteItem {
  /** LegiScan roll_call_id, stringified. */
  id: string;
  billId: string;
  /** e.g. "89R", "89-1" — never a year range; Texas is biennial. */
  session: string;
  category: string;
  voteType: 'final' | 'third_reading' | 'second_reading' | 'amendment' | 'procedural';
  /** False for motions to table, suspensions, local & consent, etc. */
  substantive: boolean;
  /** Chamber totals as recorded. */
  yeas: number;
  nays: number;
  /** Per-legislator votes. Absent members may be omitted or set to null. */
  votes: Record<LegislatorId, VoteCast>;

  // --- provenance. Optional and ignored by the estimator, but the UI must be
  // --- able to say where a vote came from, so it travels with the item.

  /**
   * Where the per-member positions in `votes` came from.
   *   'journal' — reconciled against the House/Senate Journal, the authority
   *   'scrape'  — third-party scrape only, NOT yet reconciled
   * Absent on items predating the provenance field.
   */
  voteSource?: 'journal' | 'scrape';
  /** Journal record-vote number ("RV#"), when this item was matched to one. */
  journalRecord?: number | null;
  /**
   * Members whose position could not be sourced from the Journal because their
   * journal name did not resolve to a roster id. Their `votes` entry, if any,
   * still comes from the scrape.
   */
  unreconciledMembers?: LegislatorId[];
  /**
   * Statements of vote filed against this record — a member asserting the
   * journal recorded them wrongly. These NEVER alter `votes`; the recorded vote
   * is the official act. They exist so the UI can show both.
   */
  voteStatements?: { memberId: LegislatorId | null; member: string; shownAs: VoteCast; claimed: VoteCast; text: string }[];
}

export interface ScoringOptions {
  /** Minimum share of the chamber on the losing side. Default 0.05. */
  minMinorityShare: number;
  /** Minimum absolute count on the losing side. Default 10. */
  minMinorityCount: number;
  /** Drop items flagged non-substantive. Default true. */
  substantiveOnly: boolean;
  /** Correlation above which two items are treated as duplicates. Default 0.9. */
  redundancyThreshold: number;
  /** Shrinkage constant k in N/(N+k). Default 5. */
  shrinkage: number;
  /** Bootstrap replicates for the interval. 0 disables. Default 400. */
  bootstrapReplicates: number;
  /** Seed for the bootstrap RNG. Default 1. */
  seed: number;
}

export const DEFAULT_OPTIONS: ScoringOptions = {
  minMinorityShare: 0.05,
  minMinorityCount: 10,
  substantiveOnly: true,
  redundancyThreshold: 0.9,
  shrinkage: 5,
  bootstrapReplicates: 400,
  seed: 1,
};

/** User's per-item importance multiplier, keyed by item id. Default 1. */
export type ImportanceMap = Record<string, number>;

export interface ItemContribution {
  itemId: string;
  category: string;
  userAnswer: Answer;
  legislatorVote: VoteCast;
  agreed: boolean;
  /** Discrimination weight after redundancy adjustment. */
  weight: number;
  /** Expected agreement by chance, given the chamber split and the user's side. */
  expected: number;
  /** Signed contribution to the numerator: weight * importance * (agreed - expected). */
  contribution: number;
}

export interface AlignmentResult {
  legislatorId: LegislatorId;
  /** Chance-corrected score in [-1, 1]. 0 = no better than an average member. */
  score: number;
  /** Score after small-sample shrinkage. Display this one. */
  adjustedScore: number;
  /** Uncorrected weighted agreement rate in [0, 1]. Diagnostic only — do not surface as "% match". */
  rawAgreement: number;
  /** Count of items the legislator actually voted on and the user answered. */
  n: number;
  /** Percentile interval on `score`, or null if bootstrapping is disabled. */
  interval: { low: number; high: number } | null;
  categoryScores: Record<string, { score: number; n: number }>;
  contributions: ItemContribution[];
}

// ---------------------------------------------------------------------------
// Item weighting
// ---------------------------------------------------------------------------

/** Share of *voting* members who voted Yea. */
export function yeaShare(item: VoteItem): number {
  const total = item.yeas + item.nays;
  return total === 0 ? 0.5 : item.yeas / total;
}

/**
 * Discrimination weight: 4p(1-p). Zero at unanimity, 1 at a 50/50 split.
 * Deliberately harsher than entropy at lopsided splits (0.36 vs 0.47 at 90/10).
 */
export function discrimination(item: VoteItem): number {
  const p = yeaShare(item);
  return 4 * p * (1 - p);
}

/** Hard floor: items too lopsided to carry signal even after weighting. */
export function isEligible(item: VoteItem, opts: ScoringOptions): boolean {
  if (opts.substantiveOnly && !item.substantive) return false;
  const total = item.yeas + item.nays;
  if (total === 0) return false;
  const minority = Math.min(item.yeas, item.nays);
  if (minority < opts.minMinorityCount) return false;
  if (minority / total < opts.minMinorityShare) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Redundancy clustering
// ---------------------------------------------------------------------------

/**
 * Pearson correlation between two items' chamber vote vectors, computed over
 * members who voted on both. Returns 0 when the overlap is too thin to judge.
 */
export function itemCorrelation(a: VoteItem, b: VoteItem): number {
  const ids = Object.keys(a.votes);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const id of ids) {
    const va = a.votes[id];
    const vb = b.votes[id];
    if (va == null || vb == null) continue;
    xs.push(va);
    ys.push(vb);
  }
  const n = xs.length;
  if (n < 20) return 0;

  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a0 = xs[i] - mx;
    const b0 = ys[i] - my;
    num += a0 * b0;
    dx += a0 * a0;
    dy += b0 * b0;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

/**
 * Greedy single-link clustering on |correlation|. Items that move together —
 * second and third reading on the same bill, an amendment and its parent —
 * land in one cluster so a single policy position isn't counted three times.
 */
export function clusterItems(items: VoteItem[], threshold: number): Map<string, number> {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      // Same bill is prima facie evidence of redundancy; still require the
      // votes to actually move together before merging.
      const sameBill = items[i].billId === items[j].billId;
      const r = Math.abs(itemCorrelation(items[i], items[j]));
      if (r >= threshold || (sameBill && r >= threshold * 0.8)) union(i, j);
    }
  }

  const out = new Map<string, number>();
  items.forEach((item, i) => out.set(item.id, find(i)));
  return out;
}

/** Final per-item weight: discrimination, divided by cluster size. */
export function computeWeights(items: VoteItem[], opts: ScoringOptions): Map<string, number> {
  const eligible = items.filter((it) => isEligible(it, opts));
  const clusters = clusterItems(eligible, opts.redundancyThreshold);

  const sizes = new Map<number, number>();
  for (const c of clusters.values()) sizes.set(c, (sizes.get(c) ?? 0) + 1);

  const weights = new Map<string, number>();
  for (const item of eligible) {
    const c = clusters.get(item.id)!;
    weights.set(item.id, discrimination(item) / (sizes.get(c) ?? 1));
  }
  return weights;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Expected agreement by chance: if the user answered Yea, an arbitrary member
 * agrees with probability p (the Yea share); if Nay, with probability 1 - p.
 * This is what stops a reflexive Yea-voter from scoring well against everyone.
 */
function expectedAgreement(item: VoteItem, answer: Answer): number {
  const p = yeaShare(item);
  return answer === 1 ? p : 1 - p;
}

function kappaFromContributions(contributions: ItemContribution[]): {
  score: number;
  rawAgreement: number;
} {
  let num = 0;
  let den = 0;
  let agreeW = 0;
  let totalW = 0;

  for (const c of contributions) {
    num += c.contribution;
    den += c.weight * (1 - c.expected);
    totalW += c.weight;
    if (c.agreed) agreeW += c.weight;
  }

  return {
    score: den <= 1e-9 ? 0 : clamp(num / den, -1, 1),
    rawAgreement: totalW <= 1e-9 ? 0 : agreeW / totalW,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Deterministic PRNG (mulberry32) so bootstrap intervals are reproducible. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

export function scoreLegislator(
  legislatorId: LegislatorId,
  items: VoteItem[],
  answers: Record<string, Answer>,
  weights: Map<string, number>,
  importance: ImportanceMap = {},
  opts: ScoringOptions = DEFAULT_OPTIONS,
): AlignmentResult {
  const contributions: ItemContribution[] = [];

  for (const item of items) {
    const weight = weights.get(item.id);
    if (weight === undefined) continue; // ineligible item

    const answer = answers[item.id];
    // A skip removes the item from BOTH sides of the ratio — it does not count
    // as a disagreement, and it does not silently shrink the denominator only.
    if (answer === undefined || answer === 0) continue;

    const vote = item.votes[legislatorId] ?? null;
    if (vote === null) continue; // absent / not seated: item drops for this member only

    const m = importance[item.id] ?? 1;
    const expected = expectedAgreement(item, answer);
    const agreed = vote === answer;
    const w = weight * m;

    contributions.push({
      itemId: item.id,
      category: item.category,
      userAnswer: answer,
      legislatorVote: vote,
      agreed,
      weight: w,
      expected,
      contribution: w * ((agreed ? 1 : 0) - expected),
    });
  }

  const { score, rawAgreement } = kappaFromContributions(contributions);
  const n = contributions.length;
  const adjustedScore = score * (n / (n + opts.shrinkage));

  // Category subscores reuse the same estimator on a subset. Small n bites
  // hardest here, so shrink these too and surface the count alongside.
  const byCategory: Record<string, ItemContribution[]> = {};
  for (const c of contributions) {
    (byCategory[c.category] ??= []).push(c);
  }
  const categoryScores: Record<string, { score: number; n: number }> = {};
  for (const [cat, cs] of Object.entries(byCategory)) {
    const { score: s } = kappaFromContributions(cs);
    categoryScores[cat] = { score: s * (cs.length / (cs.length + opts.shrinkage)), n: cs.length };
  }

  // Bootstrap over items: resample the user's answered items with replacement
  // to show how much the score depends on which bills happened to be included.
  let interval: { low: number; high: number } | null = null;
  if (opts.bootstrapReplicates > 0 && n >= 5) {
    const rng = makeRng(opts.seed + hashString(legislatorId));
    const draws: number[] = [];
    for (let r = 0; r < opts.bootstrapReplicates; r++) {
      const sample: ItemContribution[] = [];
      for (let i = 0; i < n; i++) sample.push(contributions[Math.floor(rng() * n)]);
      draws.push(kappaFromContributions(sample).score);
    }
    draws.sort((a, b) => a - b);
    interval = { low: percentile(draws, 0.025), high: percentile(draws, 0.975) };
  }

  return {
    legislatorId,
    score,
    adjustedScore,
    rawAgreement,
    n,
    interval,
    categoryScores,
    contributions,
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Score every legislator appearing in the item set, best-aligned first. */
export function scoreAll(
  items: VoteItem[],
  answers: Record<string, Answer>,
  importance: ImportanceMap = {},
  opts: Partial<ScoringOptions> = {},
): AlignmentResult[] {
  const merged = { ...DEFAULT_OPTIONS, ...opts };
  const weights = computeWeights(items, merged);

  const ids = new Set<LegislatorId>();
  for (const item of items) {
    if (!weights.has(item.id)) continue;
    for (const [id, v] of Object.entries(item.votes)) if (v !== null) ids.add(id);
  }

  return [...ids]
    .map((id) => scoreLegislator(id, items, answers, weights, importance, merged))
    .sort((a, b) => b.adjustedScore - a.adjustedScore);
}

/**
 * Display helper. The score is NOT a percentage — 0 means "agreed with you no
 * more than an average member would," and negative values are real. Label it
 * accordingly in ResultsSummary or users will read 0 as "never agreed."
 */
/**
 * The six bands an alignment score falls into.
 *
 * `chance` is the load-bearing one: it means "we cannot tell", not "moderate".
 * A reader who takes it as centrism has been misled, so it is named for the
 * absence of evidence rather than for a position.
 */
export type ScoreBand =
  | 'almostAlways'
  | 'moreOften'
  | 'leansToward'
  | 'chance'
  | 'leansAgainst'
  | 'againstAlways';

/**
 * Which band a score falls into. Returns a band, not a sentence.
 *
 * This replaced `describeScore`, which returned English prose from inside the
 * scoring module. The wording is in i18n/copy.json and is applied by
 * src/verdict.ts; see the note on ProfileDescription in valence.ts for why.
 */
export function scoreBand(score: number): ScoreBand {
  if (score >= 0.75) return 'almostAlways';
  if (score >= 0.4) return 'moreOften';
  if (score >= 0.15) return 'leansToward';
  if (score > -0.15) return 'chance';
  if (score > -0.5) return 'leansAgainst';
  return 'againstAlways';
}
