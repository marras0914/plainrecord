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
  ]);

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
