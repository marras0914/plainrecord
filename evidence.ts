/**
 * PlainRecord — evidence tiers
 *
 * The three Democrats have roll-call records. Their three opponents do not:
 * Abbott never served in a legislature, and Patrick's and Paxton's last
 * legislative votes were in 2015, before any of the three Democrats took office.
 * The item overlap between the Democrats and their opponents is zero bills.
 *
 * So a single alignment number covering all six candidates cannot exist. What
 * exists is three DIFFERENT kinds of evidence, of decreasing strength, and the
 * only honest design is one that keeps them apart and says which is which.
 *
 *   TIER 1  vote    a recorded roll-call vote on a specific bill
 *   TIER 2  act     an official action on a specific bill (veto, priority
 *                   designation) — joins to the same bill, but one-sided
 *   TIER 3  stance  a stated campaign position — no bill, self-reported
 *
 * The rule this module enforces: tiers never mix inside one score, and tier 3
 * never produces a score at all. `OPEN_QUESTIONS.md` #2 warns that substituting
 * stated positions "quietly breaks the verifiable public records guarantee unless
 * the distinction is unmissable." Making it unmissable is this file's job.
 *
 * Deterministic: no Math.random(), no Date, no I/O.
 */

export type PersonId = string;

export type EvidenceTier = 'vote' | 'act' | 'stance';

export type EvidenceKind =
  // tier 1
  | 'roll_call'
  // tier 2 — an act aimed at one identified bill
  | 'veto'
  | 'line_item_veto'
  | 'priority_bill'
  | 'tie_breaking_vote'
  // tier 3 — no bill attached
  | 'campaign_platform'
  | 'public_statement';

export const TIER_OF: Record<EvidenceKind, EvidenceTier> = {
  roll_call: 'vote',
  veto: 'act',
  line_item_veto: 'act',
  priority_bill: 'act',
  tie_breaking_vote: 'act',
  campaign_platform: 'stance',
  public_statement: 'stance',
};

export interface Evidence {
  personId: PersonId;
  kind: EvidenceKind;
  /** +1 = supported the bill / holds the position. -1 = opposed. */
  position: 1 | -1;
  /**
   * The bill this is a position on. REQUIRED for tiers 'vote' and 'act' — that
   * is what makes them joinable to the same item the legislators voted on.
   * Always null for tier 'stance'.
   */
  billId: string | null;
  /** e.g. "89R". Null for stances, which are not session-scoped. */
  session: string | null;
  /** ISO date of the act, where the source gives one. */
  date: string | null;
  /** Public URL for the record. Every tier needs one; no unsourced evidence. */
  sourceUrl: string;
  /** For stances: the topic label. For acts: the official's stated reason, if given. */
  topic?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class EvidenceError extends Error {}

/** Structural rules that must hold before anything is scored or displayed. */
export function validateEvidence(e: Evidence): void {
  const tier = TIER_OF[e.kind];
  if (!tier) throw new EvidenceError(`unknown evidence kind: ${e.kind}`);
  if (!e.sourceUrl) {
    throw new EvidenceError(`${e.personId}/${e.kind}: every record needs a public sourceUrl`);
  }
  if (tier === 'stance') {
    if (e.billId !== null) {
      throw new EvidenceError(
        `${e.personId}/${e.kind}: a stance must not claim a billId — if it really is a ` +
          `position on an identified bill, it is tier 'act', not tier 'stance'`,
      );
    }
  } else if (!e.billId) {
    throw new EvidenceError(
      `${e.personId}/${e.kind}: tier '${tier}' requires a billId; without one it cannot ` +
        `join to the item legislators voted on, which is the only thing that makes it comparable`,
    );
  }
}

/**
 * Refuses to let two pieces of evidence be compared across tiers. Call this
 * anywhere a comparison is about to be made; the throw is the point.
 */
export function assertComparable(a: Evidence, b: Evidence): void {
  const ta = TIER_OF[a.kind];
  const tb = TIER_OF[b.kind];
  if (ta !== tb) {
    throw new EvidenceError(
      `refusing to compare tier '${ta}' (${a.kind}) with tier '${tb}' (${b.kind}). ` +
        `A veto and a roll call are not the same kind of fact, and neither is a campaign promise.`,
    );
  }
  if (ta === 'stance') {
    throw new EvidenceError(
      `refusing to score tier 'stance'. Stated positions have no roll call behind them; ` +
        `display them as text beside the record, never as a number next to one.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Coverage — the asymmetry, made explicit
// ---------------------------------------------------------------------------

export interface Coverage {
  personId: PersonId;
  byTier: Record<EvidenceTier, number>;
  /** Distinct bills this person has a tier-1 or tier-2 position on. */
  billsCovered: number;
  /**
   * Share of scoreable (tier 1 + 2) positions that fall on ONE side, in [0.5, 1].
   *
   * 0.5 is balanced. 1.0 means every recorded position points the same way,
   * which is what a veto list or a priority list looks like: a governor only
   * vetoes bills he opposes, and only designates priorities he supports. A
   * chance-corrected score over a one-sided sample is not measuring agreement,
   * it is measuring which list the bill landed on.
   */
  sidedness: number;
  /** True when the record is too one-sided to carry an alignment score. */
  oneSided: boolean;
  /** Sign of the majority of scoreable positions: -1 opposed, +1 supported, 0 mixed. */
  actDirection: -1 | 0 | 1;
  /**
   * True when this person is KNOWN to have a legislative voting record but none
   * has been loaded. This is a build error, not a display state: rendering
   * "no legislative voting record" for a sitting legislator is a false statement
   * about a named person, which DATA_PIPELINE.md calls the worst failure mode
   * this project has. Fail the build on it rather than displaying it.
   */
  dataIncomplete: boolean;
}

export const ONE_SIDED_THRESHOLD = 0.9;

/**
 * @param expectsVotes true if this person held legislative office during the
 *   sessions being scored. Pass it from the candidate registry — it is what lets
 *   "record not loaded" be told apart from "never served".
 */
export function coverageFor(
  personId: PersonId,
  evidence: Evidence[],
  expectsVotes = false,
): Coverage {
  const mine = evidence.filter((e) => e.personId === personId);
  const byTier: Record<EvidenceTier, number> = { vote: 0, act: 0, stance: 0 };
  const bills = new Set<string>();
  let pos = 0;
  let neg = 0;

  for (const e of mine) {
    const tier = TIER_OF[e.kind];
    byTier[tier]++;
    if (tier === 'stance') continue;
    if (e.billId) bills.add(e.session ? `${e.session}:${e.billId}` : e.billId);
    if (e.position === 1) pos++;
    else neg++;
  }

  const scoreable = pos + neg;
  const sidedness = scoreable === 0 ? 1 : Math.max(pos, neg) / scoreable;

  return {
    personId,
    byTier,
    billsCovered: bills.size,
    sidedness,
    oneSided: scoreable === 0 || sidedness >= ONE_SIDED_THRESHOLD,
    actDirection: pos === neg ? 0 : pos > neg ? 1 : -1,
    dataIncomplete: expectsVotes && byTier.vote === 0,
  };
}

/**
 * One line of plain English per person, for the results screen. This is the copy
 * that keeps the comparison honest, so it is generated from the data rather than
 * written by hand per candidate.
 */
export function describeCoverage(c: Coverage): string {
  // Never let a missing ingest masquerade as a fact about a person.
  if (c.dataIncomplete) {
    throw new EvidenceError(
      `${c.personId}: expected a legislative voting record but none is loaded. ` +
        `Refusing to render a coverage line — it would read as "no voting record", ` +
        `which is false about a sitting legislator. Run the LegiScan ingest first.`,
    );
  }
  if (c.byTier.vote > 0 && !c.oneSided) {
    return `${c.byTier.vote} recorded votes on bills you answered about.`;
  }
  if (c.byTier.vote > 0 && c.oneSided) {
    return (
      `${c.byTier.vote} recorded votes, but ${Math.round(c.sidedness * 100)}% fall on one ` +
      `side — too one-sided to read as agreement.`
    );
  }
  if (c.byTier.act > 0) {
    if (c.sidedness < ONE_SIDED_THRESHOLD) {
      return (
        `No legislative voting record. ${c.byTier.act} official actions on ` +
        `${c.billsCovered} bill${c.billsCovered === 1 ? '' : 's'} you answered about.`
      );
    }
    const dir = c.actDirection === -1 ? 'blocked' : 'championed';
    return (
      `No legislative voting record. ${c.byTier.act} official actions, all on one side — ` +
      `they show which bills this candidate ${dir}, not how often they would agree with you.`
    );
  }
  if (c.byTier.stance > 0) {
    return (
      `No legislative voting record and no official actions on these bills. ` +
      `${c.byTier.stance} stated campaign position${c.byTier.stance === 1 ? '' : 's'}, ` +
      `shown as text — not scored.`
    );
  }
  return 'No public record of positions on these bills.';
}

/**
 * Bills where two people took OPPOSITE tier-1/tier-2 positions on the same item.
 *
 * This is the highest-value thing the evidence model can compute, because a
 * collision is a disagreement on an identical bill — no interpretation, no
 * summary, no cross-tier comparison. Collisions between two members of the SAME
 * party are especially useful: they are the intra-party splits a blind quiz can
 * tell a voter something with, where a party label tells them nothing
 * (OPEN_QUESTIONS #1).
 *
 * Worked example from real data: SB 3 (89R), the THC ban, was Dan Patrick's
 * third-ranked priority bill and Greg Abbott vetoed it. Same bill, opposite
 * positions, both Republican.
 *
 * Line-item vetoes are excluded — striking a funding line is not a position on
 * the bill, so it is not a real disagreement with someone who voted for it.
 */
export interface Collision {
  billId: string;
  session: string | null;
  supporters: { personId: PersonId; kind: EvidenceKind; sourceUrl: string }[];
  opponents: { personId: PersonId; kind: EvidenceKind; sourceUrl: string }[];
}

export function findCollisions(evidence: Evidence[]): Collision[] {
  const byBill = new Map<string, Evidence[]>();
  for (const e of evidence) {
    if (TIER_OF[e.kind] === 'stance') continue;
    if (e.kind === 'line_item_veto') continue;
    if (!e.billId) continue;
    const key = `${e.session ?? ''}::${e.billId}`;
    const arr = byBill.get(key) ?? [];
    arr.push(e);
    byBill.set(key, arr);
  }

  const out: Collision[] = [];
  for (const [, group] of byBill) {
    const pos = group.filter((e) => e.position === 1);
    const neg = group.filter((e) => e.position === -1);
    if (pos.length === 0 || neg.length === 0) continue;
    const pick = (e: Evidence) => ({
      personId: e.personId,
      kind: e.kind,
      sourceUrl: e.sourceUrl,
    });
    out.push({
      billId: group[0].billId!,
      session: group[0].session,
      supporters: pos.map(pick),
      opponents: neg.map(pick),
    });
  }
  return out.sort((a, b) => a.billId.localeCompare(b.billId));
}

/**
 * Filter to what may legitimately enter an alignment score: tier 1 and 2 only,
 * bill-attached, and only from people whose record is not hopelessly one-sided.
 */
export function scoreableEvidence(evidence: Evidence[]): Evidence[] {
  const people = new Set(evidence.map((e) => e.personId));
  const blocked = new Set(
    [...people].filter((p) => coverageFor(p, evidence).oneSided),
  );
  return evidence.filter(
    (e) =>
      TIER_OF[e.kind] !== 'stance' &&
      // Striking one funding line from an appropriations bill is not a position
      // on that bill. Excluded by kind, not merely by the one-sided rule above —
      // otherwise relaxing that rule would quietly let these into a score.
      e.kind !== 'line_item_veto' &&
      e.billId !== null &&
      !blocked.has(e.personId),
  );
}
