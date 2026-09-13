/**
 * How early in the full quiz does the reading stop moving?
 *
 * The full run is deterministic: buildQueue round-robins over sorted categories,
 * with no randomisation anywhere, so the first N questions are the SAME N
 * questions for every reader. That is what makes a partial reading meaningful
 * rather than a different quiz for each person, and it is also why the prefix is
 * a stratified sample across all 20 subjects instead of 20 questions about
 * schools.
 *
 * Respondents are simulated, because the tally deliberately stores no answer
 * vectors. The model is a latent ideology theta in [-1, 1] and, for an item of
 * valence v, P(agree) = sigmoid(SHARPNESS * theta * v), which makes a strong
 * partisan answer nearly every party-coded vote with their side and a moderate
 * split them. What is being measured is not the exact percentage: it is how
 * fast a weighted mean over a stratified prefix settles, and that is a property
 * of the item ordering and the valences, both of which are real.
 */
import { ALL_ITEMS, adapt, profileOf, describe } from '../src/quiz-data.js';
import type { AnswerMap } from '../src/quiz-data.js';
import { binOf } from '../bins.js';

/** buildQueue's full-mode ordering, copied so this measures what readers see. */
function fullQueue() {
  const byCat = new Map<string, typeof ALL_ITEMS>();
  for (const it of ALL_ITEMS) {
    const arr = byCat.get(it.category) ?? [];
    arr.push(it);
    byCat.set(it.category, arr);
  }
  const cats = [...byCat.keys()].sort();
  const out: typeof ALL_ITEMS = [];
  for (let i = 0; out.length < ALL_ITEMS.length; i++) {
    let added = false;
    for (const c of cats) {
      const a = byCat.get(c)!;
      if (i < a.length) { out.push(a[i]); added = true; }
    }
    if (!added) break;
  }
  return out;
}

const QUEUE = fullQueue();
const SHARPNESS = Number(process.argv[2] ?? 3);
const RESPONDENTS = 4000;

let seed = 20260912;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const adapted = adapt(ALL_ITEMS);

function readingFor(answers: AnswerMap) {
  const p = profileOf(adapted, answers);
  return { bin: binOf(p.netLean), verdict: describe(p).verdict, lean: p.netLean };
}

const STEPS = [5, 10, 15, 20, 25, 30, 40, 50, 67];
const stats = new Map(STEPS.map((n) => [n, {
  exact: 0, within1: 0, within2: 0, sameVerdict: 0, absLean: 0, n: 0,
  saidCross: 0, trueCross: 0,
}]));

for (let r = 0; r < RESPONDENTS; r++) {
  const theta = rnd() * 2 - 1;

  // One full answer vector, then read prefixes of it. The same respondent has
  // to be answering the same way at N=10 and N=67, or this measures noise
  // between two different people rather than the cost of stopping early.
  const full: AnswerMap = {};
  for (const it of QUEUE) {
    const v = it.valence ?? 0;
    const p = 1 / (1 + Math.exp(-SHARPNESS * theta * v));
    full[it.id] = rnd() < p ? 1 : -1;
  }

  const truth = readingFor(full);

  for (const n of STEPS) {
    const partial: AnswerMap = {};
    for (let i = 0; i < n; i++) partial[QUEUE[i].id] = full[QUEUE[i].id];
    const got = readingFor(partial);
    const s = stats.get(n)!;
    s.n++;
    const d = Math.abs(got.bin - truth.bin);
    if (d === 0) s.exact++;
    if (d <= 1) s.within1++;
    if (d <= 2) s.within2++;
    if (got.verdict === truth.verdict) s.sameVerdict++;
    if (got.verdict === 'crossover' || got.verdict === 'balanced') s.saidCross++;
    if (truth.verdict === 'crossover' || truth.verdict === 'balanced') s.trueCross++;
    s.absLean += Math.abs(got.lean - truth.lean);
  }
}

console.log(`\n  ${RESPONDENTS} simulated respondents, full set of ${QUEUE.length}\n`);
console.log('   after   same bin   within 1   within 2   same verdict   mean lean error');
for (const n of STEPS) {
  const s = stats.get(n)!;
  const pct = (x: number) => `${((100 * x) / s.n).toFixed(0)}%`.padStart(7);
  console.log(
    `   ${String(n).padStart(3)} q  ${pct(s.exact)}    ${pct(s.within1)}    ${pct(s.within2)}` +
    `       ${pct(s.sameVerdict)}           ${(s.absLean / s.n).toFixed(3)}`,
  );
}
console.log('');
console.log('   after   says crossover-or-balanced   truth says   ratio');
for (const n of STEPS) {
  const s = stats.get(n)!;
  const said = (100 * s.saidCross) / s.n;
  const real = (100 * s.trueCross) / s.n;
  console.log(
    `   ${String(n).padStart(3)} q            ${said.toFixed(1).padStart(5)}%` +
    `        ${real.toFixed(1).padStart(5)}%   ${(said / (real || 1)).toFixed(2)}x`,
  );
}
console.log('');
