/**
 * GET /api/tally — the aggregate counts, public.
 *
 * Public because the site's whole argument is that you can check its work, and
 * a number quoted in a pitch that nobody else can see is just an assertion. The
 * same reason /data/* carries an open licence and CORS.
 *
 * The shape is FIXED rather than "whatever keys exist": every region, every
 * verdict and all eleven bins are emitted with explicit zeros. A response that
 * omitted the empty ones would make a consumer's `?? 0` the thing that decides
 * whether a bin is absent or genuinely zero, and the reader (scripts/tally_report.ts)
 * would compute percentages against a denominator that changed shape with the
 * data.
 */

import {
  BINS,
  KEYS,
  MODES,
  REGIONS,
  DEPTH_BUCKETS,
  UNREADABLE_VERDICTS,
  VERDICTS,
  json,
  redis,
  handleNode,
  type Mode,
  type Region,
} from './_tally.js';
import type { ProfileVerdict } from '../valence.js';

export const config = { runtime: 'nodejs' };

type Counts = Record<string, unknown> | null;

const num = (h: Counts, field: string): number => Number(h?.[field] ?? 0) || 0;

/** Bins 0..10 as a dense array, so index === bin. */
function bins(h: Counts): number[] {
  return Array.from({ length: BINS }, (_, i) => num(h, String(i)));
}

/** Delta bins -10..10 as an object keyed by the signed integer. */
function deltas(h: Counts): Record<string, number> {
  const out: Record<string, number> = {};
  for (let d = -(BINS - 1); d <= BINS - 1; d++) out[String(d)] = num(h, String(d));
  return out;
}

export interface RegionTally {
  total: number;
  /** Where readers actually landed. Index is the bin. */
  lean: number[];
  /** Where readers predicted they would land, among those who predicted. */
  guess: number[];
  /** Actual bin minus predicted bin. Negative means left of the prediction. */
  delta: Record<string, number>;
  /** The site's own reading, already gated on partisan load. */
  verdict: Record<ProfileVerdict, number>;
}

export interface TallyResponse {
  total: number;
  /**
   * How many of `total` produced a reading that carries a position, i.e. not
   * `fewMarks` or `weakLoad`. This is the denominator for anything about where
   * people landed, and it equals the sum of any region's `lean` array by
   * construction — the endpoint only counts a bin for a reading that has one.
   */
  readable: number;
  /** How many of `total` made a prediction before answering. */
  guessed: number;
  /** How many made a prediction AND got a readable result. The denominator for
   *  prediction-versus-result, which is neither `total` nor `guessed`. */
  guessedReadable: number;
  mode: Record<Mode, number>;
  regions: Record<Region, RegionTally>;
  /**
   * The same per-region tallies, split by which quiz produced them.
   *
   * Present because the region-only numbers above cannot answer the question
   * the site exists to ask. The short set is six-sevenths party-line by
   * construction and so cannot produce a crossover reading at all; without this
   * split there is no way to tell a finding about Texans from a property of the
   * instrument. Counting began later than `regions`, so these sum to less than
   * the totals above and deliberately are not reconciled to them.
   */
  byMode: Record<Mode, Record<Region, RegionTally>>;
  /**
   * How far into the quiz each reading got, bucketed, per mode.
   *
   * A 25-question full-set reading and a 67-question one are both honest and
   * are not the same evidence. Without this the aggregate cannot tell them
   * apart, and the boundary at 25 is where a prefix reading starts being worth
   * pooling: see DEPTH_BUCKETS in _tally.ts for the measurement.
   */
  depth: Record<Mode, Record<string, number>>;
  questions: Record<string, { agree: number; disagree: number }>;
  /** Restated in the payload so a consumer cannot quote it as a poll by accident. */
  note: string;
}

async function tally(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const db = redis();

  const [meta, regionCounts, modeCounts, questionCounts, ...perRegion] = await Promise.all([
    db.hgetall(KEYS.meta()) as Promise<Counts>,
    db.hgetall(KEYS.region()) as Promise<Counts>,
    db.hgetall(KEYS.mode()) as Promise<Counts>,
    db.hgetall(KEYS.questions()) as Promise<Counts>,
    ...REGIONS.flatMap((r) => [
      db.hgetall(KEYS.verdict(r)) as Promise<Counts>,
      db.hgetall(KEYS.lean(r)) as Promise<Counts>,
      db.hgetall(KEYS.guess(r)) as Promise<Counts>,
      db.hgetall(KEYS.delta(r)) as Promise<Counts>,
    ]),
    ...MODES.flatMap((m) => REGIONS.flatMap((r) => [
      db.hgetall(KEYS.verdictMode(r, m)) as Promise<Counts>,
      db.hgetall(KEYS.leanMode(r, m)) as Promise<Counts>,
      db.hgetall(KEYS.guessMode(r, m)) as Promise<Counts>,
      db.hgetall(KEYS.deltaMode(r, m)) as Promise<Counts>,
    ])),
    ...MODES.map((m) => db.hgetall(KEYS.depth(m)) as Promise<Counts>),
  ]);
  // One round trip for all of it. Everything after the region block is the
  // per-mode block in the order MODES x REGIONS was flattened, then one depth
  // hash per mode. Splicing from the end keeps those offsets in one place.
  const depthHashes = perRegion.splice(REGIONS.length * 4 + MODES.length * REGIONS.length * 4);
  const perMode = perRegion.splice(REGIONS.length * 4);

  const regions = {} as Record<Region, RegionTally>;
  REGIONS.forEach((r, i) => {
    const [verdictH, leanH, guessH, deltaH] = perRegion.slice(i * 4, i * 4 + 4);
    const verdict = {} as Record<ProfileVerdict, number>;
    for (const v of VERDICTS) verdict[v] = num(verdictH ?? null, v);
    regions[r] = {
      total: num(regionCounts, r),
      lean: bins(leanH ?? null),
      guess: bins(guessH ?? null),
      delta: deltas(deltaH ?? null),
      verdict,
    };
  });

  const mode = {} as Record<Mode, number>;
  for (const m of MODES) mode[m] = num(modeCounts, m);

  // Same fixed-shape rule as everything else here: every mode, every bucket,
  // explicit zeros, so absent and zero are never the consumer's problem.
  const depth = {} as Record<Mode, Record<string, number>>;
  MODES.forEach((m, i) => {
    const h = depthHashes[i] ?? null;
    const forMode: Record<string, number> = {};
    for (const b2 of DEPTH_BUCKETS) forMode[b2] = num(h, b2);
    depth[m] = forMode;
  });

  // Every mode, every region, every bin, with explicit zeros, for the same
  // reason as `regions` above.
  const byMode = {} as Record<Mode, Record<Region, RegionTally>>;
  MODES.forEach((m, mi) => {
    const forMode = {} as Record<Region, RegionTally>;
    REGIONS.forEach((r, ri) => {
      const at = (mi * REGIONS.length + ri) * 4;
      const [vH, lH, gH, dH] = perMode.slice(at, at + 4);
      const verdict = {} as Record<ProfileVerdict, number>;
      for (const v of VERDICTS) verdict[v] = num(vH ?? null, v);
      const lean = bins(lH ?? null);
      forMode[r] = {
        // The lean histogram only counts readings that carry a position, so its
        // sum IS the readable count for this mode and region. There is no
        // separate per-mode total to keep in step with it.
        total: lean.reduce((n, x) => n + x, 0)
          + UNREADABLE_VERDICTS.reduce((n, v) => n + verdict[v], 0),
        lean,
        guess: bins(gH ?? null),
        delta: deltas(dH ?? null),
        verdict,
      };
    });
    byMode[m] = forMode;
  });

  // The per-question hash is one flat key/count map with `<qid>:agree` fields,
  // so it is split back apart here rather than stored as two keys per question.
  const questions: Record<string, { agree: number; disagree: number }> = {};
  for (const [field, count] of Object.entries(questionCounts ?? {})) {
    const at = field.lastIndexOf(':');
    if (at < 1) continue;
    const qid = field.slice(0, at);
    const side = field.slice(at + 1);
    if (side !== 'agree' && side !== 'disagree') continue;
    (questions[qid] ??= { agree: 0, disagree: 0 })[side] = Number(count ?? 0) || 0;
  }

  const body: TallyResponse = {
    total: num(meta, 'total'),
    readable: num(meta, 'readable'),
    guessed: num(meta, 'guessed'),
    guessedReadable: num(meta, 'guessedReadable'),
    mode,
    regions,
    byMode,
    depth,
    questions,
    note:
      'Self-selected: these are the people who chose to add their result, not a sample of anyone. ' +
      'Regions come from coarse edge geolocation, so "tx" is not "registered Texas voter". Not a poll. ' +
      'Percentages about where people landed belong over `readable`, not `total`: the difference is readers ' +
      'whose answers carried too little partisan signal to place, which is a result rather than a gap.',
  };

  return json(body, 200, {
    // Short enough that a number quoted in a conversation is current, long
    // enough that a link doing the rounds does not bill a command per reader.
    'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
    'access-control-allow-origin': '*',
  });
}

// See handleNode in ./_tally: the Node (req, res) signature is the one every
// Vercel runtime version accepts, and the Web shape above is built from it.
export default handleNode(tally);
