/**
 * Put the denominator of `crossCuttingShare` back into the shipped payload.
 *
 *   npm run data:denominator            # dry run
 *   npm run data:denominator -- --write
 *
 * WHY THIS EXISTS
 *
 * The payload ships `crossCuttingShare: 0.31666…` and nothing else. It is a
 * share OF the votes the RULE selected, before the seven hand-picked headline
 * bills were appended — so it is not over the 67 items in the file, and a
 * reader who assumes it is gets 21.2 items and concludes the file is wrong.
 * export_quiz_data.ts learned to ship `crossCuttingOf` alongside it, and to
 * throw if the two drift apart. That fix never reached this file: the payload
 * has only been edited in place since, and a full re-export needs the LegiScan
 * CSVs, which are not on this machine (raw/ is empty).
 *
 * So the field is added here instead. That is only defensible because the value
 * is not a guess.
 *
 * WHY 60 IS THE ONLY ANSWER
 *
 * Two independent derivations, and this script checks the second before it
 * writes anything:
 *
 *   1. At export the 67 items sat in exactly 13 categories of three and 7 of
 *      four. The rule caps a category at three, and the seven headline bills
 *      are appended afterwards, one landing in each of seven categories. So
 *      20 x 3 = 60 selected by rule, plus 7 by hand, is 67.
 *
 *   2. 0.31666… is 19/60 exactly, and 19/60 is in lowest terms. A share of a
 *      whole count over a whole denominator can only be a multiple of 60, and
 *      the denominator cannot exceed the 67 items that ship. 60 is the only
 *      candidate left. Not "most likely" — the only one.
 *
 * The second is the one that can be re-run against the file as it stands today,
 * so it is the one enforced below. If a future payload makes it fail, the value
 * is wrong and this script must not write.
 *
 * WHAT THIS DOES NOT FIX
 *
 * The rule ran on the categories as they were, and six of those labels were
 * corrected afterwards by fix_categories.mjs — which patches the payload, not
 * the corpus the rule read. So the realised distribution no longer reconstructs
 * the stated rule: under the corrected labels the counts imply 70 items, not
 * 67. That is documented in that script's header, and the method section on the
 * page now says it to the reader as well. Only a re-export fixes it, and a
 * re-export would likely change WHICH items ship.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const PAYLOAD = 'public/data/quiz_89R.json';
const write = process.argv.includes('--write');

const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
const share = payload.crossCuttingShare;
const items = payload.items.length;

const die = (msg) => { console.error(`\n  REFUSED — ${msg}\n`); process.exit(1); };

if (typeof share !== 'number') die('the payload has no crossCuttingShare to describe');
if (payload.crossCuttingOf !== undefined) {
  console.log(`\n  crossCuttingOf is already ${payload.crossCuttingOf} — nothing to do.\n`);
  process.exit(0);
}

// Every denominator that could produce this share as a whole count of items.
// Floating point cannot be compared exactly, so a candidate passes when
// share x d lands within half a millionth of an integer — far tighter than the
// gap between neighbouring counts, and the same tolerance export_quiz_data.ts
// uses on its own guard.
const whole = (x) => Math.abs(x - Math.round(x)) < 1e-6;
const candidates = [];
for (let d = 1; d <= items; d++) if (whole(share * d)) candidates.push(d);

console.log(`\n  crossCuttingShare  ${share}`);
console.log(`  items shipped      ${items}`);
console.log(`  denominators <= ${items} giving a whole count: ${candidates.join(', ') || 'none'}`);

if (candidates.length === 0) die('no denominator at or below the item count fits the share');
if (candidates.length > 1) {
  die(`the denominator is not determined — ${candidates.join(', ')} all fit, so it cannot be inferred`);
}

const of = candidates[0];
const count = Math.round(share * of);
console.log(`  => crossCuttingOf ${of}, i.e. ${count} of ${of} rule-selected votes were cross-cutting`);
console.log(`     (the other ${items - of} items are the hand-picked headline bills)`);

// The two guards export_quiz_data.ts applies at write time, applied here to the
// same numbers. If either fails, the exporter would have refused to ship this.
if (of > items) die(`crossCuttingOf (${of}) exceeds items (${items})`);
if (!whole(share * of)) die(`share x ${of} is not a whole count`);

if (!write) {
  console.log('\n  dry run — nothing written. Add --write to apply.\n');
  process.exit(0);
}

// Insert next to the share rather than at the end, so the two read together in
// the raw file — the reader this field exists for is looking at the JSON.
const rebuilt = {};
for (const [k, v] of Object.entries(payload)) {
  rebuilt[k] = v;
  if (k === 'crossCuttingShare') rebuilt.crossCuttingOf = of;
}

if (existsSync(PAYLOAD)) copyFileSync(PAYLOAD, PAYLOAD + '.bak');
writeFileSync(PAYLOAD, JSON.stringify(rebuilt), 'utf8');
console.log(`\n  wrote ${PAYLOAD}  (previous kept as .bak)\n`);
