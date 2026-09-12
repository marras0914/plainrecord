/**
 * PlainRecord — smoke suite for the opt-in tally
 *
 *   npx tsx api/tally.smoke.ts
 *
 * Covers the two halves that can be tested without a store: what `validate`
 * refuses, and whether `derive` reproduces the reading the page would have
 * shown. Nothing here touches Redis; the endpoints' storage behaviour is
 * exercised against a real store by `npm run tally:probe`.
 *
 * EVERY REJECTION CHECK ASSERTS ITS OWN PRECONDITION FIRST. A test that feeds
 * `validate` a body it believes is malformed, and asserts null, passes just as
 * happily when the body was malformed for a reason the test did not intend —
 * a typo'd field name makes every such check vacuous at once. So each one
 * starts from a body that is asserted to VALIDATE, then breaks exactly one
 * thing. If the base body ever stops validating, every rejection check below
 * it fails loudly rather than going quietly green.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { HEADLINE_ITEMS, ALL_ITEMS } from '../src/quiz-data.js';
import { validate, derive, binOf, deltaBins, itemsFor, regionOf, originAllowed, KEYS, MODES, REGIONS } from './_tally.js';
import type { SharePayload } from './_tally.js';

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
// The base body. Asserted valid before anything is broken.
// ---------------------------------------------------------------------------

const shortIds = HEADLINE_ITEMS.map((i) => i.id);
const base = (): Record<string, unknown> => ({
  mode: 'short',
  guess: 0.2,
  answers: shortIds.map((qid, i) => ({ qid, agree: i % 2 === 0 })),
});

check('the base body validates', validate(base()) !== null, `${shortIds.length} answers`);

// The check that would have caught the Cloudflare draft's fatal qid pattern.
// Asserted against EVERY exported id, not a sample, and against a pattern taken
// from the module rather than restated here — a copy of the regex in the test
// would pass while the endpoint rejected everything.
const singly = ALL_ITEMS.map((i) => validate({ mode: 'full', guess: null, answers: [{ qid: i.id, agree: true }] }));
check('every exported item id survives validation on its own',
  singly.every((v) => v !== null),
  `${singly.filter((v) => v !== null).length}/${ALL_ITEMS.length} accepted`);
check('item ids are the long slashed form this had to be widened for',
  ALL_ITEMS.every((i) => i.id.includes('/')) && ALL_ITEMS.some((i) => i.id.length > 32),
  `e.g. ${ALL_ITEMS[0].id} (${ALL_ITEMS[0].id.length} chars)`);

/** Break one field of a body that is known to validate. */
function broken(name: string, mutate: (b: Record<string, unknown>) => void): void {
  const b = base();
  mutate(b);
  check(`rejects ${name}`, validate(b) === null);
}

broken('a missing mode', (b) => delete b.mode);
broken('an unknown mode', (b) => (b.mode = 'medium'));
broken('an empty answer list', (b) => (b.answers = []));
broken('answers that are not an array', (b) => (b.answers = { a: 1 }));
broken('a duplicate qid', (b) => {
  b.answers = [
    { qid: shortIds[0], agree: true },
    { qid: shortIds[0], agree: false },
  ];
});
broken('a qid the quiz never asked', (b) => {
  b.answers = [{ qid: 'not-a-real-item', agree: true }];
});
broken('a qid from the full run posted as short', (b) => {
  const onlyFull = ALL_ITEMS.find((i) => !i.headline);
  b.answers = [{ qid: onlyFull!.id, agree: true }];
});
broken('a non-boolean agree', (b) => (b.answers = [{ qid: shortIds[0], agree: 'yes' }]));
broken('a guess above 1', (b) => (b.guess = 1.5));
broken('a guess below -1', (b) => (b.guess = -2));
broken('a non-numeric guess', (b) => (b.guess = 'left'));
broken('a NaN guess', (b) => (b.guess = Number.NaN));
broken('more answers than the mode has items', (b) => {
  b.answers = Array.from({ length: HEADLINE_ITEMS.length + 1 }, (_, i) => ({
    qid: shortIds[i % shortIds.length],
    agree: true,
  }));
});

check('accepts a null guess (the reader skipped it)', validate({ ...base(), guess: null }) !== null);
check('accepts an omitted guess', (() => {
  const b = base();
  delete b.guess;
  return validate(b) !== null;
})());

// ---------------------------------------------------------------------------
// The cap. This is the bug the Cloudflare draft shipped: MAX_ANSWERS = 20,
// against a quiz that offers 67. A full run must be accepted.
// ---------------------------------------------------------------------------

const fullBody = {
  mode: 'full',
  guess: null,
  answers: ALL_ITEMS.map((i) => ({ qid: i.id, agree: true })),
};
check(
  'accepts a complete full run',
  validate(fullBody) !== null,
  `${ALL_ITEMS.length} answers, well past the old cap of 20`,
);
check('the full run is longer than 20', ALL_ITEMS.length > 20, `${ALL_ITEMS.length}`);
check('short and full are different lengths',
  itemsFor('short').length !== itemsFor('full').length,
  `${itemsFor('short').length} vs ${itemsFor('full').length}`);

// ---------------------------------------------------------------------------
// Bins
// ---------------------------------------------------------------------------

check('binOf(-1) is the leftmost bin', binOf(-1) === 0);
check('binOf(1) is the rightmost bin', binOf(1) === 10);
check('binOf(0) is dead centre', binOf(0) === 5);
check('binOf clamps below -1', binOf(-99) === 0);
check('binOf clamps above 1', binOf(99) === 10);
check('binOf is monotonic', (() => {
  let prev = -1;
  for (let x = -1; x <= 1.0001; x += 0.05) {
    const b = binOf(x);
    if (b < prev) return false;
    prev = b;
  }
  return prev === 10;
})());

check('deltaBins is negative when the reader landed left of their guess',
  deltaBins(-0.6, 0.6) < 0, String(deltaBins(-0.6, 0.6)));
check('deltaBins is positive when they landed right of it',
  deltaBins(0.6, -0.6) > 0, String(deltaBins(0.6, -0.6)));
check('deltaBins is zero when the guess was right', deltaBins(0.3, 0.3) === 0);
check('deltaBins spans at most the bin range',
  Math.abs(deltaBins(-1, 1)) === 10, String(deltaBins(-1, 1)));

// ---------------------------------------------------------------------------
// derive — the reading must come out of the real estimator, and the three
// canned profiles must produce DIFFERENT verdicts. If they all produced the
// same one, every check above about the reading would be vacuous.
// ---------------------------------------------------------------------------

/** Answer every item the way a consistent partisan of `side` would. */
function consistent(side: 1 | -1): SharePayload {
  return {
    mode: 'full',
    guess: null,
    // valence > 0 is Republican-coded. Agreeing with it moves the reader right.
    answers: ALL_ITEMS.filter((i) => i.valence !== null && i.w > 0).map((i) => ({
      qid: i.id,
      agree: (i.valence as number) * side > 0,
    })),
  };
}

const right = derive(consistent(1));
const left = derive(consistent(-1));

check('a consistent partisan reads as consistent', right.verdict === 'consistent', right.verdict);
check('the mirror image also reads as consistent', left.verdict === 'consistent', left.verdict);
check('agreeing with Republican-coded votes leans right', right.netLean > 0, right.netLean.toFixed(3));
check('the mirror leans left', left.netLean < 0, left.netLean.toFixed(3));
check('the two are near mirror images',
  Math.abs(right.netLean + left.netLean) < 0.05,
  `${right.netLean.toFixed(3)} vs ${left.netLean.toFixed(3)}`);
check('a consistent partisan has low crossover',
  right.crossoverShare < 0.35, right.crossoverShare.toFixed(3));
check('the bin follows the lean', right.bin > 5 && left.bin < 5, `${right.bin} / ${left.bin}`);

// Only the lowest-valence items: the muted case. This must NOT read as balanced.
const mutedItems = [...ALL_ITEMS]
  .filter((i) => i.valence !== null)
  .sort((a, b) => Math.abs(a.valence as number) - Math.abs(b.valence as number))
  .slice(0, 12);
const muted = derive({
  mode: 'full',
  guess: null,
  answers: mutedItems.map((i, k) => ({ qid: i.id, agree: k % 2 === 0 })),
});
check('a low-signal answer set reads as weakLoad, not as balanced',
  muted.verdict === 'weakLoad',
  `${muted.verdict}, load ${muted.partisanLoad.toFixed(3)}`);
check('the muted case really is low load', muted.partisanLoad < 0.25, muted.partisanLoad.toFixed(3));
check('the three canned profiles are not all the same verdict',
  new Set([right.verdict, left.verdict, muted.verdict]).size > 1,
  [right.verdict, left.verdict, muted.verdict].join(', '));

// Too few answers to read at all.
const thin = derive({
  mode: 'full',
  guess: null,
  answers: ALL_ITEMS.slice(0, 2).map((i) => ({ qid: i.id, agree: true })),
});
check('two answers read as fewMarks', thin.verdict === 'fewMarks', thin.verdict);

// The property the whole design rests on: the server's reading is derived, so
// a client cannot assert a position. Posting extra fields must change nothing.
const withLies = validate({
  ...base(),
  netLean: 0.99,
  crossoverShare: 0.99,
  partisanLoad: 0.99,
  verdict: 'consistent',
  bin: 10,
});
check('a body carrying its own position still validates', withLies !== null);
check('and the asserted position is ignored',
  JSON.stringify(derive(withLies!)) === JSON.stringify(derive(validate(base())!)),
  'derive() output identical with and without the extra fields');

// ---------------------------------------------------------------------------
// Region and origin
// ---------------------------------------------------------------------------

const hdr = (o: Record<string, string>) => new Headers(o);
check('Texas headers read as tx',
  regionOf(hdr({ 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'TX' })) === 'tx');
check('another US state reads as us-other',
  regionOf(hdr({ 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'CA' })) === 'us-other');
check('a non-US country reads as intl',
  regionOf(hdr({ 'x-vercel-ip-country': 'MX' })) === 'intl');
check('missing geo headers fall back to intl', regionOf(hdr({})) === 'intl');
check('a US country with no region is not counted as Texas',
  regionOf(hdr({ 'x-vercel-ip-country': 'US' })) === 'us-other');

check('the live origin is allowed', originAllowed('https://rightnleft.com'));
check('a preview origin is allowed', originAllowed('https://rightnleft-abc123.vercel.app'));
check('no origin is allowed (a non-browser caller)', originAllowed(null));
check('another site is refused', !originAllowed('https://example.com'));
check('a lookalike host is refused', !originAllowed('https://rightnleft.com.evil.test'));

// ---------------------------------------------------------------------------
// The deployed module graph
//
// Vercel's Node builder TRANSPILES each api/*.ts file in place rather than
// bundling it, and it does not rewrite import specifiers. The output is ESM,
// because package.json says "type": "module" and is copied into the function
// verbatim. Node's ESM resolver requires a file extension, so an extensionless
// relative import anywhere in the traced chain kills the function at cold start
// with ERR_MODULE_NOT_FOUND, and a JSON import needs `with { type: 'json' }`.
//
// NOTHING ELSE CATCHES THIS. `tsc` resolves extensionless specifiers, vite
// resolves them, this suite under tsx resolves them, and `vercel dev` resolves
// them. It fails only on the deployed runtime, which is the one place where
// finding out costs a deploy. It did, once.
//
// So the graph is walked from both handlers and every relative specifier is
// asserted to carry an extension. A walk rather than a hardcoded file list,
// because the failure mode is somebody adding an import, and a list would not
// know about it.
// ---------------------------------------------------------------------------

{
  const seen = new Set<string>();
  const offenders: string[] = [];
  const jsonImports: string[] = [];
  let files = 0;

  const walk = (file: string): void => {
    const abs = resolve(file);
    if (seen.has(abs)) return;
    seen.add(abs);
    if (!existsSync(abs)) return;
    files++;

    const src = readFileSync(abs, 'utf8');
    // `from '<relative>'` plus whatever follows it on the same line, so an
    // import attribute can be inspected too.
    const re = /from\s+'(\.\.?\/[^']+)'([^;\n]*)/g;
    for (const m of src.matchAll(re)) {
      const spec = m[1];
      const trailing = m[2] ?? '';
      const where = relative('.', abs).replace(/\\/g, '/');

      if (spec.endsWith('.json')) {
        jsonImports.push(`${where} -> ${spec}`);
        if (!/with\s*\{\s*type:\s*'json'\s*\}/.test(trailing)) {
          offenders.push(`${where}: ${spec} has no { type: 'json' } attribute`);
        }
        continue;
      }

      if (!spec.endsWith('.js')) {
        offenders.push(`${where}: ${spec} has no extension`);
        continue;
      }

      // '.js' in the source means the '.ts' sitting beside it.
      const target = resolve(dirname(abs), spec.replace(/\.js$/, '.ts'));
      if (!existsSync(target)) {
        offenders.push(`${where}: ${spec} resolves to nothing`);
        continue;
      }
      walk(target);
    }
  };

  walk('api/share.ts');
  walk('api/tally.ts');

  // Precondition. A walk that visited two files found no imports to follow, and
  // every assertion below it would then be vacuously true.
  check('the module walk reached the whole chain', files >= 7, `${files} files visited`);
  check('it reached the estimator',
    seen.has(resolve('valence.ts')) && seen.has(resolve('scoring.ts')));
  check('it reached the payload adapter', seen.has(resolve('src/quiz-data.ts')));

  check('every relative import in the deployed chain carries an extension',
    offenders.length === 0, offenders.join(' | ') || `${files} files clean`);
  check('the payload is imported with a JSON type attribute',
    jsonImports.length === 1, jsonImports.join(' | ') || 'none found');
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Counter keys
//
// The per-mode counters were added alongside the region-only ones rather than
// replacing them, so the one way this can go wrong is a key that collides with
// something already holding data. A collision would not throw: it would
// silently add short-quiz readings into a hash being read as something else,
// and the first sign would be a published number that was wrong.
// ---------------------------------------------------------------------------

{
  const all = new Map<string, string>();
  let collision = '';
  const add = (name: string, key: string) => {
    if (all.has(key)) collision ||= `${name} collides with ${all.get(key)} at ${key}`;
    all.set(key, name);
  };

  add('meta', KEYS.meta());
  add('region', KEYS.region());
  add('mode', KEYS.mode());
  add('questions', KEYS.questions());
  for (const r of REGIONS) {
    add(`verdict:${r}`, KEYS.verdict(r));
    add(`lean:${r}`, KEYS.lean(r));
    add(`guess:${r}`, KEYS.guess(r));
    add(`delta:${r}`, KEYS.delta(r));
    for (const m of MODES) {
      add(`verdict:${r}:${m}`, KEYS.verdictMode(r, m));
      add(`lean:${r}:${m}`, KEYS.leanMode(r, m));
      add(`guess:${r}:${m}`, KEYS.guessMode(r, m));
      add(`delta:${r}:${m}`, KEYS.deltaMode(r, m));
    }
  }

  const expected = 4 + REGIONS.length * 4 * (1 + MODES.length);
  check('every counter key is distinct', collision === '', collision || `${all.size} keys`);
  check('the key set is the size it should be', all.size === expected,
    `${all.size} of ${expected}`);

  // The per-mode key must EXTEND its region key rather than shadow it, so the
  // two can never be read as each other.
  const r0 = REGIONS[0];
  const m0 = MODES[0];
  check('a per-mode key extends the region key it splits',
    KEYS.leanMode(r0, m0).startsWith(KEYS.lean(r0) + ':')
    && KEYS.leanMode(r0, m0) !== KEYS.lean(r0),
    `${KEYS.lean(r0)} -> ${KEYS.leanMode(r0, m0)}`);

  // Namespacing by deployment environment is what stops a preview writing into
  // the number a reporter gets quoted. It has to survive on the new keys too.
  check('the per-mode keys are namespaced like the rest',
    MODES.every((m) => REGIONS.every((r) => KEYS.leanMode(r, m).startsWith('t:'))),
    KEYS.leanMode(r0, m0));
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
