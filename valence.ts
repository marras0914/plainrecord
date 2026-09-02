/**
 * PlainRecord — partisan valence and the red/blue/purple profile
 *
 * `scoring.ts` answers "how much does this legislator vote with you." This module
 * answers a different question: "how partisan-coded are your own positions?"
 *
 * The distinction matters because the two use different weights:
 *
 *   - scoring.ts weights by 4p(1-p) — how much the CHAMBER divided. A 50/50
 *     urban/rural split or a chamber revolt scores 1.0 there.
 *   - this module weights by party difference — how much the PARTIES divided.
 *     A bill both caucuses split evenly on has high 4p(1-p) and zero valence.
 *
 * Coloring a question red or blue requires the second quantity, not the first.
 *
 * The headline output is deliberately NOT a single blended color. A blended
 * purple cannot distinguish a voter whose answers straddle both coalitions
 * (mixed) from a voter who only answered questions with no partisan content
 * (muted). Those are opposite facts and they average to the same swatch. So the
 * profile reports net lean, crossover share, and partisan load separately, and
 * the UI plots every answer as its own mark.
 *
 * Deterministic: no Math.random(), no Date, no I/O. Safe for SSG + unit tests.
 */

import type { VoteItem, Answer } from './scoring';
import { isEligible, discrimination, itemCorrelation, DEFAULT_OPTIONS } from './scoring';
import type { ScoringOptions } from './scoring';

// ---------------------------------------------------------------------------
// Party roster
// ---------------------------------------------------------------------------

/** 'O' covers independents and anyone not caucusing with either party. */
export type Party = 'D' | 'R' | 'O';

/**
 * Party AS HELD DURING THE SESSION BEING SCORED — not current party.
 * LegiScan person records reflect present status; a member who switched parties
 * or a seat filled mid-session will be wrong if joined live. See DATA_PIPELINE.md.
 * One roster per session, snapshotted at ingest.
 */
export type PartyRoster = Record<string, Party>;

export interface ValenceOptions {
  /**
   * Minimum members of EACH caucus who cast a Yea/Nay for the valence to be
   * trusted. Below this the share is noise, and the item is returned colorless
   * rather than given a confident hue off three votes.
   */
  minCaucusVoting: number;
}

export const DEFAULT_VALENCE_OPTIONS: ValenceOptions = {
  minCaucusVoting: 10,
};

// ---------------------------------------------------------------------------
// Item valence
// ---------------------------------------------------------------------------

export interface ItemValence {
  itemId: string;
  /**
   * (R Yea share) - (D Yea share), in [-1, 1].
   * +1  Yea is the fully Republican-coded side.
   * -1  Yea is the fully Democratic-coded side.
   *  0  both caucuses took the same side — no partisan content.
   * null when either caucus is too thin to judge.
   */
  valence: number | null;
  /** The receipt. Show these two numbers as the reason a question is colored. */
  rYeaShare: number | null;
  dYeaShare: number | null;
  rVoting: number;
  dVoting: number;
}

export function itemValence(
  item: VoteItem,
  roster: PartyRoster,
  opts: ValenceOptions = DEFAULT_VALENCE_OPTIONS,
): ItemValence {
  let rYea = 0;
  let rVoting = 0;
  let dYea = 0;
  let dVoting = 0;

  for (const [id, vote] of Object.entries(item.votes)) {
    if (vote === null) continue; // absent / NV — not a position
    const party = roster[id];
    if (party === 'R') {
      rVoting++;
      if (vote === 1) rYea++;
    } else if (party === 'D') {
      dVoting++;
      if (vote === 1) dYea++;
    }
    // 'O' and unrostered members are scored normally elsewhere but carry no
    // party signal, so they are excluded from the valence itself.
  }

  const thin = rVoting < opts.minCaucusVoting || dVoting < opts.minCaucusVoting;
  const rShare = rVoting > 0 ? rYea / rVoting : null;
  const dShare = dVoting > 0 ? dYea / dVoting : null;

  return {
    itemId: item.id,
    valence: thin || rShare === null || dShare === null ? null : rShare - dShare,
    rYeaShare: rShare,
    dYeaShare: dShare,
    rVoting,
    dVoting,
  };
}

/** Valence for every item, keyed by item id. Items with null valence are kept. */
export function computeValences(
  items: VoteItem[],
  roster: PartyRoster,
  opts: ValenceOptions = DEFAULT_VALENCE_OPTIONS,
): Map<string, ItemValence> {
  return new Map(items.map((it) => [it.id, itemValence(it, roster, opts)]));
}

// ---------------------------------------------------------------------------
// Weights for the profile
// ---------------------------------------------------------------------------

/**
 * Reliability weights for the red/blue profile. Use these, NOT
 * scoring.computeWeights(), when building a PartisanProfile.
 *
 * Why they differ. scoring.ts divides each item's weight by the size of its
 * correlation cluster, which is right for its purpose: two readings of one bill
 * are one position and must not count twice. But party-line votes genuinely
 * correlate above the 0.9 threshold WITH EACH OTHER — they are all the same
 * latent axis — so single-link clustering merges the entire partisan dimension
 * into one cluster and divides every one of its members by that cluster's size.
 * Measured on a synthetic 150-member chamber: 10 party-line items merged, each
 * falling from a discrimination of 0.97 to a weight of 0.097, while an
 * uncorrelated cross-cutting item kept 0.998. A single off-axis vote outweighed
 * a party-line vote 10 to 1.
 *
 * For an alignment score that dilution is arguably defensible. For THIS module
 * it is fatal: it suppresses precisely the answers that carry partisan signal,
 * pushing netLean toward zero and partisanLoad below its own weak-signal gate.
 * Every profile would come out flatteringly, falsely purple.
 *
 * So the redundancy correction here is narrowed to its original intent —
 * near-duplicate roll calls ON THE SAME BILL — and cross-bill correlation is
 * left alone. Dimensional structure is the signal, not redundancy.
 */
export function profileWeights(
  items: VoteItem[],
  opts: ScoringOptions = DEFAULT_OPTIONS,
): Map<string, number> {
  const eligible = items.filter((it) => isEligible(it, opts));

  // Union-find, but only same-bill pairs are ever candidates for merging.
  const parent = eligible.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  const sameBillThreshold = opts.redundancyThreshold * 0.8;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      if (eligible[i].billId !== eligible[j].billId) continue;
      if (Math.abs(itemCorrelation(eligible[i], eligible[j])) < sameBillThreshold) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[rj] = ri;
    }
  }

  const sizes = new Map<number, number>();
  eligible.forEach((_, i) => {
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  });

  const weights = new Map<string, number>();
  eligible.forEach((item, i) => {
    weights.set(item.id, discrimination(item) / (sizes.get(find(i)) ?? 1));
  });
  return weights;
}

// ---------------------------------------------------------------------------
// The user's profile
// ---------------------------------------------------------------------------

export interface AnswerMark {
  itemId: string;
  category: string;
  /** +1 Yea, -1 Nay. Skips never become marks. */
  answer: 1 | -1;
  /** The item's partisan valence, R-coded positive. */
  valence: number;
  /**
   * answer x valence, in [-1, 1]. This is the mark's position on the blue-red
   * axis: +1 the user took the fully Republican-coded side, -1 the fully
   * Democratic-coded side, ~0 the question had no partisan content.
   */
  coordinate: number;
  /** Reliability weight, normally the redundancy-adjusted weight from scoring.ts. */
  weight: number;
}

export interface PartisanProfile {
  /** One per answered item with a computable valence. Plot these. */
  marks: AnswerMark[];
  n: number;
  /**
   * Weighted mean coordinate, in [-1, 1]. The hue. Negative = leans blue.
   * On its own this is the number that cannot tell mixed from muted.
   */
  netLean: number;
  /**
   * Share of partisan mass sitting on the opposite side from `netLean`.
   * THIS is the purple number. Mass is weight x |coordinate|, so answering a
   * pile of low-valence questions cannot inflate it — muted questions carry
   * almost no mass on either side of the ratio.
   */
  crossoverShare: number;
  /**
   * Weighted mean |valence| across answered items, in [0, 1]. How partisan-coded
   * the questions actually were. When this is low the reading is weak regardless
   * of what the other two numbers say, and the results screen must say so.
   */
  partisanLoad: number;
  /** Answers whose valence could not be computed — excluded from the stats above. */
  colorlessCount: number;
}

/**
 * Build the accumulating profile. Safe to call after every answer — it is pure
 * and cheap, so the plot can be recomputed on each answer rather than
 * maintained incrementally.
 *
 * `weights` is the map from scoring.computeWeights(). Items absent from it are
 * ineligible and are skipped, so the plot and the scores rest on the same item set.
 */
export function buildProfile(
  items: VoteItem[],
  answers: Record<string, Answer>,
  valences: Map<string, ItemValence>,
  weights?: Map<string, number>,
): PartisanProfile {
  const marks: AnswerMark[] = [];
  let colorlessCount = 0;

  for (const item of items) {
    const answer = answers[item.id];
    if (answer === undefined || answer === 0) continue; // a skip is not a position

    const weight = weights ? weights.get(item.id) : 1;
    if (weight === undefined) continue; // ineligible under the scoring item set

    const v = valences.get(item.id);
    if (!v || v.valence === null) {
      colorlessCount++;
      continue;
    }

    marks.push({
      itemId: item.id,
      category: item.category,
      answer,
      valence: v.valence,
      coordinate: answer * v.valence,
      weight,
    });
  }

  let wSum = 0;
  let leanNum = 0;
  let loadNum = 0;
  for (const m of marks) {
    wSum += m.weight;
    leanNum += m.weight * m.coordinate;
    loadNum += m.weight * Math.abs(m.valence);
  }
  const netLean = wSum > 1e-9 ? leanNum / wSum : 0;
  const partisanLoad = wSum > 1e-9 ? loadNum / wSum : 0;

  // Crossover: partisan mass against the user's own overall lean.
  const leanSign = netLean === 0 ? 0 : Math.sign(netLean);
  let massTotal = 0;
  let massAgainst = 0;
  for (const m of marks) {
    const mass = m.weight * Math.abs(m.coordinate);
    massTotal += mass;
    if (leanSign !== 0 && Math.sign(m.coordinate) === -leanSign) massAgainst += mass;
  }
  const crossoverShare = massTotal > 1e-9 ? massAgainst / massTotal : 0;

  return { marks, n: marks.length, netLean, crossoverShare, partisanLoad, colorlessCount };
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * Thresholds below are PROVISIONAL — the same caveat that applies to the 0.9
 * redundancy threshold applies here. Tune against the observed distribution of
 * real profiles, not intuition, and record what changed.
 */
export const PROFILE_BANDS = {
  minMarks: 5,
  weakLoad: 0.25,
  highCrossover: 0.35,
  strongLean: 0.45,
  mildLean: 0.15,
};

export interface ProfileDescription {
  headline: string;
  /** Non-null when the reading should not be trusted at face value. Render it. */
  caveat: string | null;
}

/**
 * Plain-English account of a profile. Note that the mixed and muted cases get
 * DIFFERENT text off the same netLean — which is the entire reason the profile
 * carries three numbers instead of one color.
 */
export function describeProfile(p: PartisanProfile): ProfileDescription {
  if (p.n < PROFILE_BANDS.minMarks) {
    return {
      headline: 'Answer a few more and we can tell you something',
      caveat:
        `So far you have answered ${p.n} vote${p.n === 1 ? '' : 's'}. ` +
        `We need at least ${PROFILE_BANDS.minMarks}.`,
    };
  }

  // The load gate comes FIRST, and it is not optional.
  //
  // crossoverShare is a ratio of partisan mass, so it is scale-invariant: a
  // voter whose answers are all near-zero valence but evenly split still scores
  // ~0.5, identical to a voter straddling two party-line blocs. The ratio alone
  // therefore cannot tell mixed from muted — only partisanLoad can. Reporting a
  // split before checking load is exactly the flattering-purple failure.
  if (p.partisanLoad < PROFILE_BANDS.weakLoad) {
    return {
      headline: "These votes can't really place you",
      caveat:
        'On the ones you answered, Republicans and Democrats mostly voted the same way. ' +
        'So your answers do not say much about which party you are closer to — whichever ' +
        'way they fell.',
    };
  }

  const lean = Math.abs(p.netLean);
  const side = p.netLean < 0 ? 'Democratic' : 'Republican';
  const party = p.netLean < 0 ? 'Democrats' : 'Republicans';
  const other = p.netLean < 0 ? 'Republicans' : 'Democrats';

  // Past the gate, real mass on both sides is a real finding: a cross-pressured
  // voter, not an absence of measurement.
  if (p.crossoverShare >= PROFILE_BANDS.highCrossover) {
    return {
      headline:
        lean < PROFILE_BANDS.mildLean
          ? 'You are split right down the middle'
          : `You lean ${side}, but you cross over a lot`,
      caveat:
        lean < PROFILE_BANDS.mildLean
          ? 'About as many of your answers matched Republicans as matched Democrats. ' +
            'This is the purple result.'
          : `Most of your answers matched ${party}, but a big share matched ${other} instead.`,
    };
  }

  if (lean >= PROFILE_BANDS.strongLean) {
    return {
      headline: `You line up with ${party} nearly every time`,
      caveat: 'Almost all of your answers matched the same party.',
    };
  }
  if (lean >= PROFILE_BANDS.mildLean) {
    return {
      headline: `You lean ${side}`,
      caveat: 'More of your answers matched that party than the other one.',
    };
  }
  return {
    headline: 'You sit near the middle',
    caveat:
      'Not because you split between the parties — the votes you answered mostly ' +
      'fell close to the line between them anyway.',
  };
}
