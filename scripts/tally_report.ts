/**
 * PlainRecord — the tally, as sentences you can paste
 *
 *   npm run tally                      # production
 *   npm run tally -- --json            # the raw response
 *   npm run tally -- http://localhost:3000
 *
 * Replaces the `tally-reader.ts` draft. That one turned the response into a
 * single sentence — "Of N people, XX% landed left of centre on the actual
 * votes" — behind one gate, `total >= 100`.
 *
 * TWO THINGS WERE WRONG WITH THAT, AND THEY ARE WHY THIS FILE IS LONGER THAN IT
 * LOOKS LIKE IT SHOULD BE.
 *
 * First, a count gate is not a signal gate. `valence.ts` will not give ONE
 * reader a directional reading when `partisanLoad` is below 0.25, because a
 * pile of near-zero-valence answers splits evenly for reasons that have nothing
 * to do with the reader — "the ratio alone cannot tell mixed from muted". Ten
 * thousand such readers do not fix that; they make the same unreadable split
 * look authoritative. So every percentage here sits over the READABLE count,
 * and the unreadable ones are reported as their own number rather than dropped.
 *
 * Second, "landed left of their guess" needs the right denominator, and it is
 * neither `total` nor `guessed`. The guess is skippable, so `total` includes
 * people who never predicted; and a reader whose result carried no position had
 * nothing to miss their prediction by. `guessedReadable` is carried for exactly
 * this and is the only denominator that sentence may use.
 *
 * Every function that can refuse returns its reason. A silent `null` is how a
 * number that should never have been quoted ends up in an email anyway.
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

interface RegionTally {
  total: number;
  lean: number[];
  guess: number[];
  delta: Record<string, number>;
  verdict: Record<string, number>;
}

interface TallyResponse {
  total: number;
  readable: number;
  guessed: number;
  guessedReadable: number;
  mode: Record<string, number>;
  regions: Record<string, RegionTally>;
  questions: Record<string, { agree: number; disagree: number }>;
  note: string;
}

/** Below this, nothing gets a sentence. Self-selected data at n<100 is anecdote. */
const MIN_N = 100;

const REGIONS = ['tx', 'us-other', 'intl'] as const;

/**
 * Readings that carry no position, and must never be inside a percentage about
 * where people landed. `fewMarks` answered too little to read; `weakLoad`
 * answered questions that never split the parties.
 */
const UNREADABLE = ['fewMarks', 'weakLoad'] as const;

/** Readings that mean real partisan weight on BOTH sides. The finding. */
const CROSSED = ['crossover', 'balanced'] as const;

/** Readings that point somewhere. Their sum with CROSSED is the readable count. */
const DIRECTIONAL = ['consistent', 'mildLean', 'nearMiddle'] as const;

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);
const pct = (n: number, of: number): number => (of ? Math.round((n / of) * 100) : 0);

// ---------------------------------------------------------------------------
// One region
// ---------------------------------------------------------------------------

export interface Split {
  /** Everyone who shared, readable or not. */
  total: number;
  /** Readings that carry a position. The denominator for every pct below. */
  readable: number;
  unreadable: number;
  left: number;
  right: number;
  center: number;
  crossed: number;
  pctLeft: number;
  pctRight: number;
  pctCrossed: number;
  /**
   * The readable count by the histogram minus the readable count by the
   * verdicts. Two independent routes to one number, so anything but zero means
   * the store is internally inconsistent and every percentage here is suspect.
   * Reported rather than swallowed.
   */
  skew: number;
}

function blankSplit(): Split {
  return {
    total: 0, readable: 0, unreadable: 0, left: 0, right: 0, center: 0,
    crossed: 0, pctLeft: 0, pctRight: 0, pctCrossed: 0, skew: 0,
  };
}

export function splitFor(t: TallyResponse, region: string): Split {
  const r = t.regions?.[region];
  if (!r) return blankSplit();

  const v = (k: string) => r.verdict?.[k] ?? 0;

  // The lean histogram counts ONLY readings that carry a position, because
  // /api/share gates that counter on exactly that. Its own total is therefore
  // the honest denominator and nothing here rescales anything.
  const left = sum((r.lean ?? []).slice(0, 5));
  const right = sum((r.lean ?? []).slice(6));
  const center = r.lean?.[5] ?? 0;
  const readable = left + right + center;

  const crossed = sum(CROSSED.map(v));
  const directional = sum(DIRECTIONAL.map(v));

  return {
    total: r.total ?? 0,
    readable,
    unreadable: sum(UNREADABLE.map(v)),
    left,
    right,
    center,
    crossed,
    pctLeft: pct(left, readable),
    pctRight: pct(right, readable),
    pctCrossed: pct(crossed, readable),
    skew: readable - (directional + crossed),
  };
}

/** The same numbers over every region at once. */
export function overall(t: TallyResponse): Split {
  const parts = REGIONS.map((r) => splitFor(t, r));
  const add = (k: 'total' | 'readable' | 'unreadable' | 'left' | 'right' | 'center' | 'crossed' | 'skew') =>
    sum(parts.map((p) => p[k]));
  const readable = add('readable');
  return {
    total: add('total'),
    readable,
    unreadable: add('unreadable'),
    left: add('left'),
    right: add('right'),
    center: add('center'),
    crossed: add('crossed'),
    pctLeft: pct(add('left'), readable),
    pctRight: pct(add('right'), readable),
    pctCrossed: pct(add('crossed'), readable),
    skew: add('skew'),
  };
}

// ---------------------------------------------------------------------------
// Prediction against result
// ---------------------------------------------------------------------------

export interface GuessResult {
  /** Predicted AND got a readable result. The only valid denominator here. */
  guessedReadable: number;
  /** Predicted at all, readable or not. Reported for context, never divided by. */
  guessed: number;
  missed: number;
  leftOfGuess: number;
  rightOfGuess: number;
  exact: number;
  medianMiss: number;
  pctMissed: number;
  /** Delta buckets summed, minus `guessedReadable`. Should be zero. */
  skew: number;
}

export function guessResult(t: TallyResponse): GuessResult {
  const deltas: Record<string, number> = {};
  for (const r of Object.values(t.regions ?? {})) {
    for (const [d, n] of Object.entries(r.delta ?? {})) {
      deltas[d] = (deltas[d] ?? 0) + n;
    }
  }

  let leftOfGuess = 0;
  let rightOfGuess = 0;
  let exact = 0;
  const misses: [number, number][] = [];
  for (const [dStr, n] of Object.entries(deltas)) {
    if (!n) continue;
    const d = Number(dStr);
    if (d < 0) leftOfGuess += n;
    else if (d > 0) rightOfGuess += n;
    else exact += n;
    misses.push([Math.abs(d), n]);
  }

  const counted = leftOfGuess + rightOfGuess + exact;
  const guessedReadable = t.guessedReadable ?? counted;

  return {
    guessedReadable,
    guessed: t.guessed ?? 0,
    missed: leftOfGuess + rightOfGuess,
    leftOfGuess,
    rightOfGuess,
    exact,
    medianMiss: weightedMedian(misses),
    pctMissed: pct(leftOfGuess + rightOfGuess, guessedReadable),
    skew: counted - guessedReadable,
  };
}

/** Median of a value/count histogram. */
function weightedMedian(pairs: [number, number][]): number {
  const total = sum(pairs.map(([, n]) => n));
  if (!total) return 0;
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  let seen = 0;
  for (const [value, n] of sorted) {
    seen += n;
    if (seen >= total / 2) return value;
  }
  return sorted[sorted.length - 1]?.[0] ?? 0;
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

export type Line = { ok: true; text: string } | { ok: false; why: string };

/** Refuse for the one reason that invalidates every sentence at once. */
function consistencyProblem(t: TallyResponse): string | null {
  const o = overall(t);
  const g = guessResult(t);
  if (o.skew !== 0) {
    return `the store disagrees with itself: ${o.readable} readable by the lean histogram, ` +
      `${o.readable - o.skew} by the verdicts. Quote nothing until that is explained.`;
  }
  if (g.skew !== 0) {
    return `the delta buckets total ${g.guessedReadable + g.skew} but guessedReadable is ` +
      `${g.guessedReadable}. Quote nothing until that is explained.`;
  }
  return null;
}

/**
 * The lead the playbook asks for: the party-label finding, not a Texas
 * percentage. True regardless of who took it, so it does not rest on the sample
 * being Texan or representative — which is the whole reason it leads.
 */
export function crossPressureLine(t: TallyResponse): Line {
  const bad = consistencyProblem(t);
  if (bad) return { ok: false, why: bad };

  const o = overall(t);
  if (o.readable < MIN_N) {
    return {
      ok: false,
      why: `${o.readable} readable readings, need ${MIN_N}. ` +
        `${o.total} shared in total; the gap is ${o.unreadable} whose answers carried too little partisan signal to place.`,
    };
  }
  return {
    ok: true,
    text:
      `Of ${o.readable.toLocaleString()} people whose answers carried enough partisan signal to place, ` +
      `${o.pctCrossed}% came out cross-pressured: real weight on both sides, not a lean with a couple of exceptions.`,
  };
}

/**
 * Prediction against result. This is the sentence reporter email B was built on
 * and the one the old pipeline could not produce at all, because nothing in it
 * captured what anyone expected.
 */
export function predictionLine(t: TallyResponse): Line {
  const bad = consistencyProblem(t);
  if (bad) return { ok: false, why: bad };

  const g = guessResult(t);
  if (g.guessedReadable < MIN_N) {
    return {
      ok: false,
      why: `${g.guessedReadable} readers predicted and got a readable result, need ${MIN_N}. ` +
        `${g.guessed} predicted at all and ${t.total} shared — the guess is skippable, so this figure ` +
        `is never ${t.total}, and quoting it as such would be the easiest mistake in this whole pipeline.`,
    };
  }

  const dir = g.leftOfGuess >= g.rightOfGuess ? 'left' : 'right';
  const n = Math.max(g.leftOfGuess, g.rightOfGuess);
  return {
    ok: true,
    text:
      `Of ${g.guessedReadable.toLocaleString()} people who predicted where they would land before answering, ` +
      `${g.pctMissed}% landed somewhere else — ${pct(n, g.guessedReadable)}% of them ${dir} of their own guess. ` +
      `Median miss: ${g.medianMiss} of the 11 positions on the strip.`,
  };
}

/** A regional figure. Last, because it is the weakest claim in the file. */
export function regionLine(t: TallyResponse, region = 'tx'): Line {
  const bad = consistencyProblem(t);
  if (bad) return { ok: false, why: bad };

  const s = splitFor(t, region);
  if (s.readable < MIN_N) {
    return { ok: false, why: `${region}: ${s.readable} readable of ${s.total} shared, need ${MIN_N}` };
  }
  const lean = s.pctLeft >= s.pctRight ? 'left' : 'right';
  return {
    ok: true,
    text:
      `Among ${s.readable.toLocaleString()} readable results geolocated to ${region}, ` +
      `${Math.max(s.pctLeft, s.pctRight)}% landed ${lean} of centre on the actual votes. ` +
      `Geolocation is coarse and the sample is self-selected, so this is not a poll of Texas and must not be called one.`,
  };
}

// ---------------------------------------------------------------------------

export async function fetchTally(endpoint: string): Promise<TallyResponse> {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/tally`);
  if (!res.ok) throw new Error(`tally ${res.status} ${res.statusText}`);
  return res.json() as Promise<TallyResponse>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const endpoint = args.find((a) => a.startsWith('http')) ?? 'https://rightnleft.com';
  const t = await fetchTally(endpoint);

  if (args.includes('--json')) {
    console.log(JSON.stringify(t, null, 2));
    return;
  }

  const o = overall(t);
  console.log(`${endpoint}`);
  console.log(
    `  ${t.total.toLocaleString()} shared · ${o.readable.toLocaleString()} readable · ` +
    `${o.unreadable.toLocaleString()} unreadable · ${t.guessed.toLocaleString()} predicted ` +
    `(${t.guessedReadable.toLocaleString()} of those readable)`,
  );
  console.log(`  modes: ${Object.entries(t.mode ?? {}).map(([m, n]) => `${m} ${n}`).join(', ') || 'none yet'}`);
  console.log('');
  for (const r of REGIONS) {
    const s = splitFor(t, r);
    console.log(
      `  ${r.padEnd(9)}${String(s.total).padStart(6)} shared${String(s.readable).padStart(8)} readable` +
      `${String(s.unreadable).padStart(8)} unreadable   L${String(s.pctLeft).padStart(3)}%  R${String(s.pctRight).padStart(3)}%`,
    );
  }
  if (o.skew !== 0) console.log(`\n  !! histogram/verdict skew ${o.skew} — see consistencyProblem()`);

  const say = (label: string, line: Line): void => {
    console.log(`\n${label}`);
    console.log(line.ok ? `  ${line.text}` : `  WITHHELD — ${line.why}`);
  };

  say('LEAD (the party-label finding — use this one):', crossPressureLine(t));
  say('PREDICTION (reporter email B):', predictionLine(t));
  say('TEXAS (weakest claim here; read the caveat out loud):', regionLine(t, 'tx'));

  console.log(`\n${t.note}`);
}

// Only run the CLI when invoked directly, so the functions above stay importable
// by the smoke suite without it firing a network request on import.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
