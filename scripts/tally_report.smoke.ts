/**
 * PlainRecord — smoke suite for the tally reader
 *
 *   npx tsx scripts/tally_report.smoke.ts
 *
 * These functions produce the sentences that get pasted into a reporter email,
 * so the checks that matter most are the ones about what they REFUSE to say and
 * which denominator they divide by. A percentage over the wrong denominator
 * still reads like a fact.
 *
 * Every tally here is built by `tally()` from explicit counts, and every gate
 * check asserts the opposite case too — a `withheld` assertion passes trivially
 * if the builder produces a tally that could never have been quotable for some
 * unrelated reason, so each threshold is tested from both sides.
 */

import {
  crossPressureLine,
  predictionLine,
  regionLine,
  splitFor,
  overall,
  guessResult,
  type Line,
} from './tally_report';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

interface RegionSpec {
  /** Bin -> count, for readable readings only. */
  lean?: Record<number, number>;
  /** Delta bins -> count. */
  delta?: Record<number, number>;
  /** Verdict -> count. */
  verdict?: Record<string, number>;
  total?: number;
}

function region(spec: RegionSpec = {}) {
  const lean = Array.from({ length: 11 }, (_, i) => spec.lean?.[i] ?? 0);
  const delta: Record<string, number> = {};
  for (let d = -10; d <= 10; d++) delta[String(d)] = spec.delta?.[d] ?? 0;
  const verdict = {
    fewMarks: 0, weakLoad: 0, balanced: 0, crossover: 0,
    consistent: 0, mildLean: 0, nearMiddle: 0,
    ...(spec.verdict ?? {}),
  };
  const readable = lean.reduce((a, b) => a + b, 0);
  return {
    total: spec.total ?? readable + verdict.fewMarks + verdict.weakLoad,
    lean,
    guess: Array.from({ length: 11 }, () => 0),
    delta,
    verdict,
  };
}

/**
 * A whole response. `readable`/`guessedReadable` default to what the region
 * counters imply, so a test that wants them to DISAGREE has to say so — which
 * is what the skew checks below do.
 */
function tally(spec: {
  regions?: Record<string, ReturnType<typeof region>>;
  total?: number;
  readable?: number;
  guessed?: number;
  guessedReadable?: number;
} = {}) {
  const regions = spec.regions ?? { tx: region(), 'us-other': region(), intl: region() };
  for (const r of ['tx', 'us-other', 'intl']) regions[r] ??= region();
  const impliedReadable = Object.values(regions).reduce(
    (a, r) => a + r.lean.reduce((x: number, y: number) => x + y, 0), 0);
  const impliedDelta = Object.values(regions).reduce(
    (a, r) => a + Object.values(r.delta).reduce((x: number, y) => x + (y as number), 0), 0);
  const impliedTotal = Object.values(regions).reduce((a, r) => a + r.total, 0);
  return {
    total: spec.total ?? impliedTotal,
    readable: spec.readable ?? impliedReadable,
    guessed: spec.guessed ?? impliedDelta,
    guessedReadable: spec.guessedReadable ?? impliedDelta,
    mode: { short: 0, full: 0 },
    regions,
    questions: {},
    note: 'test',
  };
}

const said = (l: Line): string => (l.ok ? l.text : `WITHHELD: ${l.why}`);

// ---------------------------------------------------------------------------
// The count gate, from both sides
// ---------------------------------------------------------------------------

const thin = tally({ regions: { tx: region({ lean: { 2: 40, 8: 30 }, verdict: { consistent: 70 } }) } });
check('overall readable is what the histogram says', overall(thin).readable === 70, String(overall(thin).readable));
check('withholds the lead below 100 readable', !crossPressureLine(thin).ok, said(crossPressureLine(thin)));

const fat = tally({
  regions: {
    tx: region({ lean: { 2: 100, 5: 20, 8: 80 }, verdict: { consistent: 120, crossover: 80 } }),
  },
});
check('the fat tally really is over the floor', overall(fat).readable === 200, String(overall(fat).readable));
check('quotes the lead at 200 readable', crossPressureLine(fat).ok, said(crossPressureLine(fat)));
check('the lead quotes the readable count, not the shared count',
  said(crossPressureLine(fat)).includes('200'), said(crossPressureLine(fat)));

// ---------------------------------------------------------------------------
// THE GATE THAT MATTERS: readable, not total.
//
// A tally with thousands of sharers whose answers could not be placed must not
// produce a positional sentence. This is the flattering-purple failure in
// aggregate, and the old reader's `total >= 100` would have sailed through it.
// ---------------------------------------------------------------------------

const mostlyUnreadable = tally({
  regions: {
    tx: region({
      lean: { 4: 10, 6: 10 },
      verdict: { weakLoad: 4_000, fewMarks: 500, consistent: 20 },
      total: 4_520,
    }),
  },
});
check('the unreadable tally has a big shared count', mostlyUnreadable.total >= 4_500, String(mostlyUnreadable.total));
check('and only 20 readable', overall(mostlyUnreadable).readable === 20, String(overall(mostlyUnreadable).readable));
check('withholds despite 4,520 sharers, because only 20 could be placed',
  !crossPressureLine(mostlyUnreadable).ok, said(crossPressureLine(mostlyUnreadable)));
check('and says how many could not be placed',
  said(crossPressureLine(mostlyUnreadable)).includes('4500') ||
  said(crossPressureLine(mostlyUnreadable)).includes('4,500'),
  said(crossPressureLine(mostlyUnreadable)));

// ---------------------------------------------------------------------------
// The prediction denominator: guessedReadable, never total and never guessed.
// ---------------------------------------------------------------------------

const predicted = tally({
  regions: {
    tx: region({
      lean: { 2: 300, 8: 200 },
      delta: { [-3]: 120, [-1]: 60, 0: 20, 2: 50 },
      verdict: { consistent: 500 },
      total: 5_000,
    }),
  },
  total: 5_000,
  guessed: 4_000,
  guessedReadable: 250,
});
const pl = predictionLine(predicted);
check('the prediction line is quotable at 250', pl.ok, said(pl));
check('it divides by guessedReadable (250)', said(pl).includes('250'), said(pl));
check('it does NOT quote the shared total (5,000)', !said(pl).includes('5,000'), said(pl));
check('it does NOT quote everyone who predicted (4,000)', !said(pl).includes('4,000'), said(pl));

const g = guessResult(predicted);
check('the delta buckets are consistent with guessedReadable', g.skew === 0, `skew ${g.skew}`);
check('most landed left of their guess in this fixture',
  g.leftOfGuess === 180 && g.rightOfGuess === 50, `${g.leftOfGuess} / ${g.rightOfGuess}`);
check('the sentence names the majority direction', said(pl).includes('left of their own guess'), said(pl));
check('92% missed their guess', g.pctMissed === 92, String(g.pctMissed));
// Misses are |delta|: 0 x20, 1 x60, 2 x50, 3 x120. Cumulative 20, 80, 130, 250,
// so the halfway point (125) lands in bucket 2 — not 3, even though 3 is the
// single most common miss. Asserted against the arithmetic rather than against
// the eye-catching number, which is the mistake this check exists to prevent.
check('the median miss is the median, not the mode', g.medianMiss === 2, String(g.medianMiss));

const predictedThin = tally({
  regions: { tx: region({ lean: { 2: 300 }, delta: { [-2]: 99 }, verdict: { consistent: 300 }, total: 5_000 }) },
  total: 5_000,
  guessed: 4_000,
  guessedReadable: 99,
});
check('withholds the prediction line at 99', !predictionLine(predictedThin).ok, said(predictionLine(predictedThin)));
check('and warns against quoting the shared total instead',
  said(predictionLine(predictedThin)).includes('skippable'), said(predictionLine(predictedThin)));

// ---------------------------------------------------------------------------
// Consistency. If the store disagrees with itself, nothing is quotable.
// ---------------------------------------------------------------------------

const inconsistent = tally({
  regions: {
    // 200 in the histogram, but the verdicts only account for 120 readable.
    tx: region({ lean: { 2: 100, 8: 100 }, verdict: { consistent: 120 }, total: 200 }),
  },
});
check('the fixture really is inconsistent', splitFor(inconsistent, 'tx').skew === 80,
  String(splitFor(inconsistent, 'tx').skew));
check('the lead refuses on skew', !crossPressureLine(inconsistent).ok, said(crossPressureLine(inconsistent)));
check('the prediction line refuses on skew', !predictionLine(inconsistent).ok);
check('the region line refuses on skew', !regionLine(inconsistent, 'tx').ok);
check('the refusal names the disagreement',
  said(crossPressureLine(inconsistent)).includes('disagrees with itself'),
  said(crossPressureLine(inconsistent)));

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

const leansLeft = tally({
  regions: { tx: region({ lean: { 1: 150, 3: 50, 9: 20 }, verdict: { consistent: 220 }, total: 220 }) },
});
const rl = regionLine(leansLeft, 'tx');
check('a left-heavy histogram reads left', rl.ok && rl.text.includes('landed left of centre'), said(rl));
check('the left percentage is right', splitFor(leansLeft, 'tx').pctLeft === 91,
  String(splitFor(leansLeft, 'tx').pctLeft));
check('the region line still calls itself not a poll',
  said(rl).includes('not a poll of Texas'), said(rl));

const leansRight = tally({
  regions: { tx: region({ lean: { 9: 150, 7: 50, 1: 20 }, verdict: { consistent: 220 }, total: 220 }) },
});
check('a right-heavy histogram reads right',
  regionLine(leansRight, 'tx').ok && said(regionLine(leansRight, 'tx')).includes('landed right of centre'),
  said(regionLine(leansRight, 'tx')));

check('the two directions really differ',
  said(rl) !== said(regionLine(leansRight, 'tx')));

// Centre bin belongs to neither side.
const centred = tally({
  regions: { tx: region({ lean: { 5: 200 }, verdict: { nearMiddle: 200 }, total: 200 }) },
});
const cs = splitFor(centred, 'tx');
check('the centre bin is not counted left or right',
  cs.left === 0 && cs.right === 0 && cs.center === 200, `${cs.left}/${cs.center}/${cs.right}`);
check('and readable still includes it', cs.readable === 200, String(cs.readable));

// ---------------------------------------------------------------------------
// An empty store must refuse everything without throwing.
// ---------------------------------------------------------------------------

const empty = tally();
check('empty: lead withheld', !crossPressureLine(empty).ok);
check('empty: prediction withheld', !predictionLine(empty).ok);
check('empty: region withheld', !regionLine(empty, 'tx').ok);
check('empty: no division by zero', overall(empty).pctLeft === 0 && overall(empty).pctCrossed === 0);
check('empty: a region that does not exist is blank, not a crash',
  splitFor(empty, 'nowhere').readable === 0);

// ---------------------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
