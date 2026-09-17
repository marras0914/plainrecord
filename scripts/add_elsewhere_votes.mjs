/**
 * PlainRecord — mark the people who voted on a bill, just not on the roll call
 * the question asks about.
 *
 *   npm run data:elsewhere          # merge into public/data/quiz_89R.json
 *   npm run data:elsewhere -- --check   # report, write nothing
 *
 * WHY THIS EXISTS
 *
 * A reader checked SB 3 against the House Journal on 17 September 2026 and said
 * Goodwin's "no vote recorded" looked wrong. It was not wrong, and it was not
 * right either.
 *
 * SB 3 has three roll calls. The question uses record 3304, the vote that passed
 * the bill, 87-54. Goodwin is Absent on it and filed a statement of vote saying
 * her vote failed to register and she would have voted no. On the other two —
 * record 3192 at 95-44, and a scrape-sourced 86-53 — she is recorded NAY. So the
 * page showed nothing from her on the THC ban while the record held two of hers
 * on that bill, and a blank reads as "did not take a position".
 *
 * Across the payload that is 42 cases over the nine people shown, and only 2 of
 * them carry a Journal statement. The other 40 said nothing at all.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not change a single score, and it must not. Every member is scored on
 * the SAME roll call; letting a second-reading vote stand in for an absence at
 * passage would score different people on different events, which is the thing
 * `assertComparable()` exists to prevent. Second and third reading are genuinely
 * different votes — SB 3 moved from 95-44 to 87-54 between them, an eight-vote
 * swing, and eight people really did change their minds or their attendance.
 *
 * So this writes a DISPLAY-ONLY field. `elsewhere[memberId]` is 1 or -1, it is
 * never read by scoring.ts or valence.ts, and the string that renders it says on
 * screen that it is not counted.
 *
 * WHY IT IS A SEPARATE STAGE
 *
 * Same reason as add_gov_acts.mjs and add_plain.mjs: export_quiz_data.ts cannot
 * do it. The exporter takes the LegiScan CSVs and knows only the roll calls it
 * selected; the OTHER roll calls of a bill live in the published corpus, which
 * export_bulk_votes.mjs builds separately. Re-running the exporter to add a
 * field also silently drops everything the later stages merged in — it was
 * tried, and it rebuilt the payload without 60 of the 67 approved
 * plain-language summaries.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUIZ = resolve(ROOT, 'public/data/quiz_89R.json');
const CORPUS = resolve(ROOT, 'public/data/votes_89R.json');
const checkOnly = process.argv.includes('--check');

const quiz = JSON.parse(readFileSync(QUIZ, 'utf8'));
const corpus = JSON.parse(readFileSync(CORPUS, 'utf8'));

const index = new Map();
corpus.memberOrder.forEach((id, i) => index.set(id, i));

const byBill = new Map();
for (const v of corpus.items) {
  if (!byBill.has(v.billId)) byBill.set(v.billId, []);
  byBill.get(v.billId).push(v);
}

// Everyone the reveal shows a row for. The reader's own member is not here: the
// district panel reports a score and a coverage count, not a per-question mark,
// so there is no blank of this kind to explain there.
const shown = [
  ...quiz.candidates.map((c) => ({ id: c.id, name: c.name })),
  ...(quiz.comparators ?? []).map((c) => ({ id: c.id, name: c.name })),
];

const cast = (ch) => (ch === 'y' ? 1 : ch === 'n' ? -1 : null);

let found = 0, itemsTouched = 0;
const rows = [];
// Kept separately from item.elsewhere so --check reports the same numbers a
// write would produce, rather than reporting on a field it declined to set.
const computed = new Map();
for (const item of quiz.items) {
  const all = byBill.get(item.billId) ?? [];
  const selected = all.find((v) => v.id === item.id);
  if (!selected) {
    throw new Error(`${item.billId}: the question's roll call ${item.id} is not in the corpus`);
  }
  const others = all.filter((v) => v.id !== item.id);

  const elsewhere = {};
  for (const person of shown) {
    const i = index.get(person.id);
    if (i === undefined) continue;
    // Only a blank on the selected roll call can be explained by another one.
    if (cast(selected.v[i]) !== null) continue;

    const casts = others.map((v) => cast(v.v[i])).filter((c) => c !== null);
    if (!casts.length) continue;

    // A member who voted BOTH ways on different roll calls of one bill has no
    // single position to report, and reporting either would be a choice this
    // script is not entitled to make. It does not happen in 89R; if it ever
    // does, the right answer is new copy, not a silent pick.
    const distinct = new Set(casts);
    if (distinct.size > 1) {
      throw new Error(
        `${item.billId}: ${person.name} voted both ways on other roll calls ` +
        `(${casts.join(', ')}) — there is no single position to show`);
    }

    elsewhere[person.id] = casts[0];
    found++;
    rows.push(
      `    ${item.billId.padEnd(8)} ${person.name.padEnd(20)} ` +
      `${casts[0] === 1 ? 'Yea' : 'Nay'} on ${others.length === 1 ? 'the other roll call' : `${casts.length} of ${others.length} other roll calls`}`);
  }

  if (Object.keys(elsewhere).length) {
    itemsTouched++;
    computed.set(item, elsewhere);
    if (!checkOnly) item.elsewhere = elsewhere;
  } else if (!checkOnly) {
    delete item.elsewhere;
  }
}

console.log('');
console.log(`  ${found} case(s) across ${itemsTouched} item(s) where someone shown on the page`);
console.log('  cast no vote on the question\'s roll call and did vote on another for the same bill:');
console.log('');
console.log(rows.join('\n'));
console.log('');

// How many are already explained by a Journal statement, which is the measure of
// what this field adds over what the page already said.
let covered = 0;
for (const [item, elsewhere] of computed) {
  for (const id of Object.keys(elsewhere)) {
    const who = shown.find((p) => p.id === id);
    if ((item.statements ?? []).some((s) => s.member === who?.name)) covered++;
  }
}
console.log(`  ${covered} of ${found} already carried a Journal statement; ${found - covered} said nothing before this.`);

if (checkOnly) {
  console.log('\n  --check: nothing written\n');
} else {
  writeFileSync(QUIZ, JSON.stringify(quiz));
  console.log(`\n  wrote ${QUIZ}\n`);
}
