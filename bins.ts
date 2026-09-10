/**
 * PlainRecord — the eleven positions on the strip
 *
 * WHY THIS IS ITS OWN FILE. The bin arithmetic was written inside
 * `api/_tally.ts`, which imports the Redis client, so the browser could not
 * touch it. The share link needs the same arithmetic: a link that encodes bin 8
 * has to mean what the tally means by bin 8, or the dot a recipient sees sits
 * somewhere the sender never was.
 *
 * Copying eleven lines into `src/` would have been quicker and is exactly the
 * mistake `src/quiz-data.ts` exists to document: a hand-ported second copy of
 * shared arithmetic drifted from the tested one and nothing caught it. So it
 * moves here, dependency-free, and both sides import it.
 *
 * No I/O, no DOM, no Node built-ins. That is what lets it be imported by a
 * browser bundle, a Vercel Function and a test runner alike.
 */

/** Bins run 0 (leftmost) .. 10 (rightmost). 5 is dead centre. */
export const BINS = 11;
export const CENTER_BIN = 5;

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** A lean in [-1, 1] to a bin in [0, 10]. */
export function binOf(lean: number): number {
  const b = Math.round(((clamp(lean, -1, 1) + 1) / 2) * (BINS - 1));
  return clamp(b, 0, BINS - 1);
}

/** True for an integer that is a real bin. Used to reject a tampered URL. */
export function isBin(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= BINS - 1;
}

/**
 * How far a result sat from a prediction, as a whole number of bins in
 * [-10, 10]. Negative means the reader landed left of their guess.
 *
 * Deliberately a difference of two BINS rather than of the two underlying
 * floats: a bin difference is exactly reproducible, needs no second bucketing
 * decision, and is the unit the reader was shown.
 */
export function deltaBins(actualLean: number, guessLean: number): number {
  return binOf(actualLean) - binOf(guessLean);
}
