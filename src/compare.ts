/**
 * PlainRecord — the blind two-person compare
 *
 * A reader shares a link carrying their answers to the seven headline votes.
 * Whoever opens it answers those same seven BLIND, and only then sees both
 * results side by side. They can then send their own link back, or onward.
 *
 * THE PREVIEW MUST NOT SPOIL IT, and that is why the answers live in the URL
 * fragment rather than the path. A fragment is never sent to a server, so no
 * crawler and no link preview can read it: an invite can only ever unfurl into
 * the site's own neutral card. The privacy property and the blind property are
 * the same property here, and it enforces the rule for free rather than relying
 * on anyone remembering it.
 *
 * An earlier build put a result in the path (`/r/8`) so it could carry a
 * per-result preview card. That solved a different problem and broke this one:
 * the card showed the sender's position before the recipient had answered
 * anything. It was removed. If a public "post my result" action is ever wanted,
 * it belongs beside this as a separate and clearly-labelled thing, never in
 * place of it. The generated cards are in git history at b94f33b.
 *
 * WHAT IS ENCODED, and the two decisions that matter.
 *
 * The seven are in CANONICAL ORDER, sorted by item id, not in the order the
 * payload happens to list them. Those differ today. Encoding by payload
 * position would mean a future `npm run data:export` that reordered items
 * silently remapped every link already in circulation: the recipient would see
 * the sender's answers attached to the wrong votes, computing a wrong position
 * with nothing anywhere reporting an error.
 *
 * An ANSWERED MASK travels with the answers, so seven bits become fourteen.
 * A reader can reach the result screen having answered fewer than seven, and
 * seven bare bits would have to invent a value for the rest. Inventing an
 * answer and then comparing somebody against it is the one thing this file
 * must not do, and fourteen bits is still two or three characters.
 */

import { HEADLINE_ITEMS, type AnswerMap } from './quiz-data.js';
import { LOCALE, ES_PREFIX } from './i18n.js';

/** How many votes a compare covers. The seven everybody is asked. */
export const COMPARE_N = 7;

/**
 * The seven ids, sorted, so position 0 means the same vote forever.
 *
 * Derived rather than written down: a hardcoded list would drift from the
 * payload silently, and `compare.smoke.ts` asserts this is the sorted set of
 * the headline items rather than the payload's own ordering.
 */
export const COMPARE_IDS: readonly string[] = HEADLINE_ITEMS.map((i) => i.id).slice().sort();

const MASK_SHIFT = COMPARE_N;
const MAX_CODE = (1 << (COMPARE_N * 2)) - 1; // 14 bits

export interface Shared {
  /** true agree, false disagree, null not answered. Indexed by COMPARE_IDS. */
  answers: (boolean | null)[];
  answered: number;
}

/** Pack the reader's answers to the seven into a short code. */
export function encodeCompare(answers: AnswerMap): string {
  let bits = 0;
  COMPARE_IDS.forEach((id, i) => {
    const a = answers[id];
    if (a !== 1 && a !== -1) return;
    bits |= 1 << (MASK_SHIFT + i);
    if (a === 1) bits |= 1 << i;
  });
  return bits.toString(36);
}

/**
 * Unpack a code, or null if it is not one.
 *
 * Refused rather than repaired. A fragment is trivially editable and a code
 * that decoded "as best it could" would produce a confident comparison against
 * a person who never existed.
 */
export function decodeCompare(code: string): Shared | null {
  if (!/^[0-9a-z]{1,4}$/i.test(code)) return null;
  const bits = parseInt(code, 36);
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_CODE) return null;

  const answers: (boolean | null)[] = [];
  let answered = 0;
  for (let i = 0; i < COMPARE_N; i++) {
    const was = (bits & (1 << (MASK_SHIFT + i))) !== 0;
    if (!was) {
      answers.push(null);
      continue;
    }
    answered++;
    answers.push((bits & (1 << i)) !== 0);
  }
  // A code claiming an answer for a question it did not mark as answered is
  // malformed, not merely odd: it is the shape a hand-edited fragment takes.
  for (let i = 0; i < COMPARE_N; i++) {
    if (answers[i] === null && (bits & (1 << i)) !== 0) return null;
  }
  if (answered === 0) return null;
  return { answers, answered };
}

/** Where an invite should point, honouring the language being read. */
export function inviteUrl(answers: AnswerMap, origin: string, locale: string = LOCALE): string {
  const base = origin.replace(/\/$/, '');
  const home = locale === 'es' ? `${base}${ES_PREFIX}/` : `${base}/`;
  return `${home}#c=${encodeCompare(answers)}`;
}

/** Read an incoming invite out of a fragment. Takes the hash so it is testable. */
export function incomingFrom(hash: string): Shared | null {
  const m = /(?:^|[#&])c=([0-9a-z]{1,4})(?:&|$)/i.exec(hash);
  return m ? decodeCompare(m[1]) : null;
}

export function incoming(): Shared | null {
  if (typeof document === 'undefined') return null;
  return incomingFrom(location.hash);
}

/** Drop the invite fragment without a reload or a history entry. */
export function clearIncoming(): void {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  if (!/(?:^|[#&])c=/.test(location.hash)) return;
  history.replaceState(null, '', location.pathname + location.search);
}

export interface Agreement {
  /** Votes both people answered. The only ones a comparison can speak about. */
  both: number;
  agreed: number;
  differed: number;
}

/**
 * How two people compared, over the votes they BOTH answered.
 *
 * Anything either of them skipped is excluded rather than counted as a
 * disagreement. Treating an absence as a difference is the same mistake the
 * rest of this project refuses to make about a legislator who cast no vote.
 */
export function agreementWith(theirs: Shared, mine: AnswerMap): Agreement {
  let both = 0;
  let agreed = 0;
  COMPARE_IDS.forEach((id, i) => {
    const t = theirs.answers[i];
    const m = mine[id];
    if (t === null || (m !== 1 && m !== -1)) return;
    both++;
    if ((m === 1) === t) agreed++;
  });
  return { both, agreed, differed: both - agreed };
}

/** Their answers as an AnswerMap, so the real estimator can place them. */
export function toAnswerMap(theirs: Shared): AnswerMap {
  const out: AnswerMap = {};
  COMPARE_IDS.forEach((id, i) => {
    const t = theirs.answers[i];
    if (t === null) return;
    out[id] = t ? 1 : -1;
  });
  return out;
}
