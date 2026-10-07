/**
 * PlainRecord — smoke suite for the short quiz
 *
 *   npx tsx src/quiz-data.smoke.ts
 *
 * Since 7 October 2026 the short quiz is not a hand-kept list. SHORT_ITEMS is
 * computed from the payload by a rule (quiz-data.ts), so a data change can move
 * it without anyone touching the code. That is the point of a rule, and it is
 * also how the seven could change underneath every #d= link and every tally
 * counter without a word. So two things are checked here.
 *
 * The SET is pinned by bill. If the payload moves it, this fails, and whoever
 * re-exported decides on purpose whether that is a new instrument (a new
 * SHORT_SET_ID, a new fragment key) rather than finding out from a reader.
 *
 * The RULE is re-derived independently of the code that applies it, from what
 * the method text promises, and that checker is shown to reject a set that
 * breaks the rule before it is trusted to accept the real one.
 */

import {
  ALL_ITEMS,
  HEADLINE_ITEMS,
  SHORT_ITEMS,
  SHORT_SET_ID,
  INSTRUMENT,
  RULE_VERSION,
  DATA,
  type QuizItem,
} from './quiz-data.js';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`); }
};

const T = DATA.rulePartisanThreshold;
const rBacked = (i: QuizItem) => i.valence !== null && i.valence >= T;
const dBacked = (i: QuizItem) => i.valence !== null && i.valence <= -T;
const bills = (items: readonly QuizItem[]) => items.map((i) => i.billId);

// ---------------------------------------------------------------------------
// The pinned set.
// ---------------------------------------------------------------------------

const PINNED = ['SB 2', 'SB 8', 'SB 10', 'SB 3', 'SB 14', 'HB 871', 'HB 2060'];

check('the threshold is a real number, so the lean tests below mean something',
  typeof T === 'number' && T > 0 && T < 1, String(T));
check('the short quiz is seven items', SHORT_ITEMS.length === 7, String(SHORT_ITEMS.length));
check('they are the pinned seven bills, in order',
  JSON.stringify(bills(SHORT_ITEMS)) === JSON.stringify(PINNED), bills(SHORT_ITEMS).join(', '));
check('no bill appears twice', new Set(SHORT_ITEMS.map((i) => i.id)).size === SHORT_ITEMS.length);
check('every one is a real item in the full quiz',
  SHORT_ITEMS.every((s) => ALL_ITEMS.includes(s)));

// ---------------------------------------------------------------------------
// The rule, re-derived from the method text rather than from the code.
// Returns why a set breaks it, or null.
// ---------------------------------------------------------------------------

function breaksRule(set: readonly QuizItem[]): string | null {
  // 1. Every Republican-backed headline bill, and only those, from the headlines.
  const famous = HEADLINE_ITEMS.filter(rBacked);
  const fromHeadline = set.filter((i) => HEADLINE_ITEMS.includes(i));
  if (fromHeadline.length !== famous.length || !famous.every((f) => set.includes(f))) {
    return `headline part is ${bills(fromHeadline).join(', ')}, rule says ${bills(famous).join(', ')}`;
  }
  // 2. Exactly two more, both Democratic-backed.
  const added = set.filter((i) => !HEADLINE_ITEMS.includes(i));
  if (added.length !== 2) return `${added.length} added items, rule says 2`;
  if (!added.every(dBacked)) return `an added item is not Democratic-backed: ${bills(added).join(', ')}`;
  // Each from a subject the set did not already cover.
  const famousCats = new Set(famous.map((i) => i.category));
  if (added.some((i) => famousCats.has(i.category))) return 'an added item repeats a headline subject';
  if (added[0].category === added[1].category) return 'the two added items share a subject';
  // And no eligible item with a closer vote was passed over. An item closer to
  // an even split may only be skipped if its subject was already taken by the
  // time it came up, which is the tie-break the method text describes.
  const dist = (i: QuizItem) => Math.abs(i.p - 0.5);
  const worst = Math.max(...added.map(dist));
  const taken = new Set(famousCats);
  const passedOver = ALL_ITEMS
    .filter((i) => dBacked(i) && !added.includes(i) && dist(i) < worst)
    .sort((a, b) => dist(a) - dist(b));
  for (const i of passedOver) {
    const pickedBefore = added.filter((a) => dist(a) <= dist(i)).map((a) => a.category);
    if (!taken.has(i.category) && !pickedBefore.includes(i.category)) {
      return `${i.billId} split closer (${i.p.toFixed(3)}) on an untaken subject and was skipped`;
    }
  }
  return null;
}

// The checker must be able to fail before its pass means anything.
const famous = HEADLINE_ITEMS.filter(rBacked);
const crossParty = HEADLINE_ITEMS.find((i) => !rBacked(i));
const farthest = ALL_ITEMS
  .filter((i) => dBacked(i) && !SHORT_ITEMS.includes(i))
  .sort((a, b) => Math.abs(b.p - 0.5) - Math.abs(a.p - 0.5))
  .find((i) => !famous.some((f) => f.category === i.category)
    && !SHORT_ITEMS.slice(-2).some((s) => s.category === i.category));

check('precondition: there is a cross-party headline bill to swap in', !!crossParty, crossParty?.billId ?? '');
check('precondition: there is a lopsided Democratic-backed vote to swap in', !!farthest,
  farthest ? `${farthest.billId} at ${farthest.p.toFixed(3)}` : '');
if (crossParty) {
  const bad = [...SHORT_ITEMS.slice(0, 4), crossParty, ...SHORT_ITEMS.slice(5)];
  check('the checker rejects a cross-party headline in place of a famous one',
    breaksRule(bad) !== null, breaksRule(bad) ?? 'accepted');
}
if (farthest) {
  const bad = [...SHORT_ITEMS.slice(0, 6), farthest];
  check('the checker rejects a further-from-even pick over a closer one',
    breaksRule(bad) !== null, breaksRule(bad) ?? 'accepted');
}
check('the checker rejects the original seven',
  breaksRule(HEADLINE_ITEMS) !== null, breaksRule(HEADLINE_ITEMS) ?? 'accepted');

check('and SHORT_ITEMS follows the rule', breaksRule(SHORT_ITEMS) === null, breaksRule(SHORT_ITEMS) ?? '');

// ---------------------------------------------------------------------------
// What the page says about it. The tilt copy interpolates these counts, so
// check the claim the copy is built on.
// ---------------------------------------------------------------------------

const r = SHORT_ITEMS.filter(rBacked).length;
const d = SHORT_ITEMS.filter(dBacked).length;
check('the short quiz leans five to two, as the method text says', r === 5 && d === 2, `${r} R, ${d} D`);
check('none of the seven is cross-party, so "all seven split along party lines" is true',
  r + d === SHORT_ITEMS.length);
check('the cross-party headline bills (SB 5, SB 6) left the short quiz but not the full one',
  ['SB 5', 'SB 6'].every((b) => !bills(SHORT_ITEMS).includes(b) && bills(ALL_ITEMS).includes(b)));

// ---------------------------------------------------------------------------
// The tally namespace.
// ---------------------------------------------------------------------------

check('the instrument names both the selection rule and the short set',
  INSTRUMENT === `${RULE_VERSION}+${SHORT_SET_ID}`, INSTRUMENT);
check('and differs from the rule version alone, so old counters stay frozen',
  INSTRUMENT !== RULE_VERSION);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
