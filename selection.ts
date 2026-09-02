/**
 * PlainRecord — mechanical item selection
 *
 * DATA_PIPELINE.md: "Selection is where bias actually lives — not in summary
 * adjectives. Curating 30 bills authors the result no matter how neutral the
 * prose is. Use a mechanical, published inclusion rule... Then the rule is the
 * auditable artifact, and anyone who objects has to argue with the rule rather
 * than with your motives."
 *
 * This is that rule. Two things follow from taking it seriously:
 *
 * 1. THE RULE IS DATA, NOT CODE PATHS. `SelectionRule` is a versioned literal.
 *    Changing selection means bumping the version and publishing the diff, not
 *    quietly editing a threshold.
 *
 * 2. THE RULE DECIDES WHETHER "PURPLE" IS EVEN POSSIBLE. This is the part that
 *    is easy to miss. If selection ranks purely by how much the chamber divided,
 *    it will pick almost entirely party-line votes — because those are the most
 *    divisive ones — and then every answer a user gives lands at |coordinate|
 *    near 1. Everyone reads as strongly red or strongly blue, and the only way
 *    to be purple is to split your answers between two hard poles. A voter with
 *    genuinely mixed, low-salience views cannot show up as purple, because no
 *    low-valence item was ever on the quiz.
 *
 *    So `crossCuttingReserve` holds back a share of every category's slots for
 *    items where the chamber divided but the PARTIES DID NOT. Without that
 *    reserve the red/blue plot is predetermined by the item set, and the honest
 *    claim shrinks to "here is your party." See OPEN_QUESTIONS #1.
 *
 * 3. WHEN THE RESERVE CANNOT BE FILLED, THAT IS A FINDING, NOT A FALLBACK.
 *    If the 89th produced almost no cross-cutting record votes, the shortfall is
 *    reported and belongs on the results screen. Silently backfilling with more
 *    party-line votes would hide exactly the thing a reader needs to know.
 *
 * Deterministic: no Math.random(), no Date, no I/O.
 */

import type { VoteItem } from './scoring';
import { isEligible, discrimination, DEFAULT_OPTIONS } from './scoring';
import type { ScoringOptions } from './scoring';
import type { ItemValence } from './valence';

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

export interface SelectionRule {
  /** Bump on every change. The version is cited next to published item sets. */
  version: string;
  /** Minimum share of the chamber on the losing side. */
  minMinorityShare: number;
  /** Minimum absolute count on the losing side. */
  minMinorityCount: number;
  /** Exclude items flagged non-substantive at ingest. */
  substantiveOnly: boolean;
  /** Hard cap on items taken from any one category. */
  maxPerCategory: number;
  /**
   * Share of each category's slots held for items whose |valence| is BELOW
   * `partisanValenceThreshold` — chamber divided, parties not. 0 makes the quiz
   * a party detector by construction.
   */
  crossCuttingReserve: number;
  /** |valence| at or above which an item is treated as partisan. */
  partisanValenceThreshold: number;
}

/**
 * Defaults. Every number here is a judgement call and is published as such;
 * none of them is derived from data yet, and all should be re-tuned once a real
 * session is loaded (the same caveat that applies to the 0.9 redundancy
 * threshold in SCORING.md).
 */
export const DEFAULT_RULE: SelectionRule = {
  version: 'sel-2026-09-01.a',
  minMinorityShare: 0.05,
  minMinorityCount: 10,
  substantiveOnly: true,
  maxPerCategory: 6,
  crossCuttingReserve: 1 / 3,
  partisanValenceThreshold: 0.4,
};

/** A deliberate hand edit. A reason is mandatory — that is the point. */
export interface Override {
  itemId: string;
  action: 'include' | 'exclude';
  /** Why. Non-empty, and it gets published in the audit log. */
  reason: string;
}

export type ExclusionReason =
  | 'non-substantive'
  | 'no-votes-recorded'
  | 'minority-too-small'
  | 'minority-share-too-low'
  | 'category-full'
  | 'manual-override';

export interface CategoryReport {
  category: string;
  considered: number;
  selected: number;
  /** Items taken from the partisan pool (|valence| >= threshold). */
  partisan: number;
  /** Items taken from the cross-cutting pool (|valence| < threshold). */
  crossCutting: number;
  /** Items whose valence could not be computed (thin caucus). */
  uncolorable: number;
  /** Slots the reserve wanted vs what the pool could supply. */
  reserveWanted: number;
  reserveShortfall: number;
}

export interface SelectionResult {
  rule: SelectionRule;
  selected: VoteItem[];
  excluded: { itemId: string; category: string; reason: ExclusionReason; note?: string }[];
  byCategory: CategoryReport[];
  /** Share of the selected set that is cross-cutting, across all categories. */
  crossCuttingShare: number;
  /**
   * True when the item set cannot support a genuinely mixed reading: too few
   * cross-cutting items survived, so the blue/red plot will be bimodal whatever
   * the user answers. Must reach the results screen, not just this object.
   */
  partisanByConstruction: boolean;
  /** Human-readable decision record. Publish this alongside the item set. */
  auditLog: string[];
}

export const PARTISAN_BY_CONSTRUCTION_THRESHOLD = 0.15;

// ---------------------------------------------------------------------------

/** FNV-1a, matching scoring.ts, for deterministic tie-breaking. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Rank within a pool: most-divisive first, ties broken by a stable hash of the
 * item id. The hash matters — without it, two items with identical
 * discrimination would be ordered by whatever the input array happened to be,
 * so the published item set could change between builds without the rule
 * changing. That would make the audit log a lie.
 */
function rankItems(items: VoteItem[]): VoteItem[] {
  return [...items].sort((a, b) => {
    const d = discrimination(b) - discrimination(a);
    if (Math.abs(d) > 1e-12) return d;
    return hashString(a.id) - hashString(b.id);
  });
}

function eligibilityFailure(
  item: VoteItem,
  rule: SelectionRule,
): ExclusionReason | null {
  if (rule.substantiveOnly && !item.substantive) return 'non-substantive';
  const total = item.yeas + item.nays;
  if (total === 0) return 'no-votes-recorded';
  const minority = Math.min(item.yeas, item.nays);
  if (minority < rule.minMinorityCount) return 'minority-too-small';
  if (minority / total < rule.minMinorityShare) return 'minority-share-too-low';
  return null;
}

export function selectItems(
  items: VoteItem[],
  valences: Map<string, ItemValence>,
  rule: SelectionRule = DEFAULT_RULE,
  overrides: Override[] = [],
): SelectionResult {
  for (const o of overrides) {
    if (!o.reason || !o.reason.trim()) {
      throw new Error(
        `override for ${o.itemId} has no reason. DATA_PIPELINE.md requires hand ` +
          `curation to be logged with which items and why — an unexplained override ` +
          `is the thing the mechanical rule exists to prevent.`,
      );
    }
  }
  const forcedIn = new Map(overrides.filter((o) => o.action === 'include').map((o) => [o.itemId, o]));
  const forcedOut = new Map(overrides.filter((o) => o.action === 'exclude').map((o) => [o.itemId, o]));

  const auditLog: string[] = [
    `rule ${rule.version}`,
    `  eligibility: substantiveOnly=${rule.substantiveOnly} ` +
      `minMinorityCount=${rule.minMinorityCount} minMinorityShare=${rule.minMinorityShare}`,
    `  per category: max ${rule.maxPerCategory}, ` +
      `${Math.round(rule.crossCuttingReserve * 100)}% reserved for |valence| < ` +
      `${rule.partisanValenceThreshold}`,
    `  candidates considered: ${items.length}`,
  ];

  const excluded: SelectionResult['excluded'] = [];
  const selected: VoteItem[] = [];
  const byCategory: CategoryReport[] = [];

  // Group by category. An empty category label means the categorization pass has
  // not run; that is a build error, not a bucket.
  const missingCategory = items.filter((i) => !i.category).length;
  if (missingCategory > 0) {
    auditLog.push(
      `  WARNING: ${missingCategory} items have no category. Stratification is ` +
        `meaningless without one (OPEN_QUESTIONS #6) — they are pooled under "".`,
    );
  }
  const groups = new Map<string, VoteItem[]>();
  for (const item of items) {
    const g = groups.get(item.category) ?? [];
    g.push(item);
    groups.set(item.category, g);
  }

  for (const [category, groupItems] of [...groups.entries()].sort()) {
    // 1. eligibility floor + explicit exclusions
    const eligible: VoteItem[] = [];
    for (const item of groupItems) {
      const forced = forcedOut.get(item.id);
      if (forced) {
        excluded.push({ itemId: item.id, category, reason: 'manual-override', note: forced.reason });
        auditLog.push(`  - ${item.id} (${item.billId}) EXCLUDED by hand: ${forced.reason}`);
        continue;
      }
      const fail = eligibilityFailure(item, rule);
      if (fail && !forcedIn.has(item.id)) {
        excluded.push({ itemId: item.id, category, reason: fail });
        continue;
      }
      if (fail && forcedIn.has(item.id)) {
        auditLog.push(
          `  + ${item.id} (${item.billId}) INCLUDED by hand despite ${fail}: ` +
            `${forcedIn.get(item.id)!.reason}`,
        );
      }
      eligible.push(item);
    }

    // 2. split by partisan valence
    const partisanPool: VoteItem[] = [];
    const crossPool: VoteItem[] = [];
    const uncolorable: VoteItem[] = [];
    for (const item of eligible) {
      const v = valences.get(item.id);
      if (!v || v.valence === null) {
        uncolorable.push(item);
      } else if (Math.abs(v.valence) >= rule.partisanValenceThreshold) {
        partisanPool.push(item);
      } else {
        crossPool.push(item);
      }
    }

    // 3. fill slots, honouring the reserve
    const slots = Math.min(rule.maxPerCategory, eligible.length);
    const reserveWanted = Math.round(slots * rule.crossCuttingReserve);
    const takeCross = rankItems(crossPool).slice(0, reserveWanted);
    const reserveShortfall = reserveWanted - takeCross.length;
    const takePartisan = rankItems(partisanPool).slice(0, slots - takeCross.length);

    // Only if both pools are exhausted do uncolorable items fill the remainder.
    // They are scoreable but cannot be placed on the blue/red axis, so they are
    // last in line rather than silently mixed in.
    const remaining = slots - takeCross.length - takePartisan.length;
    const takeUncolorable = remaining > 0 ? rankItems(uncolorable).slice(0, remaining) : [];

    const taken = [...takePartisan, ...takeCross, ...takeUncolorable];
    const takenIds = new Set(taken.map((t) => t.id));
    selected.push(...taken);
    for (const item of eligible) {
      if (!takenIds.has(item.id)) {
        excluded.push({ itemId: item.id, category, reason: 'category-full' });
      }
    }

    byCategory.push({
      category,
      considered: groupItems.length,
      selected: taken.length,
      partisan: takePartisan.length,
      crossCutting: takeCross.length,
      uncolorable: takeUncolorable.length,
      reserveWanted,
      reserveShortfall,
    });

    auditLog.push(
      `  [${category || '(uncategorized)'}] considered ${groupItems.length}, ` +
        `eligible ${eligible.length}, selected ${taken.length} ` +
        `(${takePartisan.length} partisan / ${takeCross.length} cross-cutting` +
        (takeUncolorable.length ? ` / ${takeUncolorable.length} uncolorable` : '') + ')' +
        (reserveShortfall > 0
          ? `  RESERVE SHORT BY ${reserveShortfall}: only ${crossPool.length} ` +
            `cross-cutting items exist in this category`
          : ''),
    );
  }

  const crossTotal = byCategory.reduce((s, c) => s + c.crossCutting, 0);
  const crossCuttingShare = selected.length === 0 ? 0 : crossTotal / selected.length;
  const partisanByConstruction = crossCuttingShare < PARTISAN_BY_CONSTRUCTION_THRESHOLD;

  auditLog.push(
    `  TOTAL selected ${selected.length}, cross-cutting share ` +
      `${(crossCuttingShare * 100).toFixed(1)}%`,
  );
  if (partisanByConstruction) {
    auditLog.push(
      `  FINDING: below ${PARTISAN_BY_CONSTRUCTION_THRESHOLD * 100}% cross-cutting. ` +
        `Almost every item divides the parties, so the blue/red plot will be ` +
        `bimodal regardless of how anyone answers. The results screen must say ` +
        `that the quiz is measuring the party axis, not claim to find a middle.`,
    );
  }

  return {
    rule,
    selected,
    excluded,
    byCategory,
    crossCuttingShare,
    partisanByConstruction,
    auditLog,
  };
}

/**
 * Convenience: the eligibility floor in `SelectionRule` duplicates the one in
 * `ScoringOptions`, and they must not drift. This asserts they agree, so a change
 * to one that is not mirrored in the other fails loudly.
 */
export function assertFloorsAgree(
  rule: SelectionRule = DEFAULT_RULE,
  opts: ScoringOptions = DEFAULT_OPTIONS,
): void {
  const mismatch: string[] = [];
  if (rule.minMinorityShare !== opts.minMinorityShare) {
    mismatch.push(`minMinorityShare ${rule.minMinorityShare} vs ${opts.minMinorityShare}`);
  }
  if (rule.minMinorityCount !== opts.minMinorityCount) {
    mismatch.push(`minMinorityCount ${rule.minMinorityCount} vs ${opts.minMinorityCount}`);
  }
  if (rule.substantiveOnly !== opts.substantiveOnly) {
    mismatch.push(`substantiveOnly ${rule.substantiveOnly} vs ${opts.substantiveOnly}`);
  }
  if (mismatch.length) {
    throw new Error(
      `selection rule and scoring options disagree on the eligibility floor: ` +
        `${mismatch.join('; ')}. An item selected for the quiz but dropped by the ` +
        `scorer is asked and then not counted, which silently shrinks every score.`,
    );
  }
  // Sanity: selection must never admit something scoring would reject.
  void isEligible;
}
