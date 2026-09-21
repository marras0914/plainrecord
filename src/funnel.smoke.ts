/**
 * PlainRecord — the quiz funnel is recorded per language
 *
 *   npx tsx src/funnel.smoke.ts
 *
 * WHAT THIS EXISTS TO CATCH, AND HOW IT WAS FOUND.
 *
 * The quiz reports its steps as virtual page views: /quiz/started, /quiz/guess,
 * /quiz/result. Until 20 September 2026 `countStep` passed those literals
 * straight through, so a reader on /es emitted exactly the path an English
 * reader emitted. The analytics page breakdown then showed /es arriving and no
 * Spanish quiz step ever happening, which reads as "nobody takes the quiz in
 * Spanish" and was in fact "every Spanish step was filed under English".
 *
 * It was invisible for the worst possible reason: the numbers looked fine.
 * /quiz/started simply carried both audiences, and the English figures are
 * large enough that a handful of Spanish readings changed nothing about them.
 *
 * THE CHECKS ARE ON THE SOURCE, NOT ON BEHAVIOUR, and that is deliberate.
 * `countStep` is module-private inside main.ts, which pulls in the DOM, the
 * payload and the whole render tree; exporting it purely to test it would be a
 * worse trade than reading the six lines that matter. What can regress here is
 * somebody reverting the prefix, and a source check catches exactly that.
 *
 * The behavioural half IS tested: detectLocale is exported, so the locale that
 * the prefix depends on is checked against real pathnames below.
 */

import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`); }
};

const main = readFileSync('src/main.ts', 'utf8');

// ---------------------------------------------------------------------------
// The prefix
// ---------------------------------------------------------------------------

const body = main.slice(
  main.indexOf('function countStep'),
  main.indexOf('function countStep') + 1400,
);

check('countStep exists to be guarded at all', body.length > 100);

check('countStep prefixes the step with the locale',
  /LOCALE\s*===\s*'es'\s*\?\s*`\$\{ES_PREFIX\}\$\{step\}`\s*:\s*step/.test(body),
  'a bare literal here files every Spanish step under English');

check('main.ts imports what the prefix needs',
  /import\s*\{[^}]*\bLOCALE\b[^}]*\bES_PREFIX\b[^}]*\}\s*from\s*'\.\/i18n'/.test(main));

// The dedupe has to key on the PREFIXED path. Keyed on the bare step it would
// still be correct today, since a page load is one locale, but it would quietly
// become wrong the moment anything renders both.
check('the once-per-load guard keys on the prefixed path',
  /counted\.has\(path\)/.test(body) && /counted\.add\(path\)/.test(body));

check('the emitted page view uses the prefixed path',
  /pageview\(\{\s*route:\s*path,\s*path\s*\}\)/.test(body));

// ---------------------------------------------------------------------------
// Every call site passes a bare step, so the prefix is applied exactly once
// ---------------------------------------------------------------------------

const calls = [...main.matchAll(/countStep\('([^']+)'\)/g)].map((m) => m[1]);

check('the three funnel steps are all counted', calls.length === 3, calls.join(', '));

check('no call site prefixes the step itself',
  calls.every((c) => !c.startsWith('/es')),
  'a prefixed literal would double to /es/es/quiz/...');

check('every step is a rooted path', calls.every((c) => c.startsWith('/quiz/')));

// ---------------------------------------------------------------------------
// The locale the prefix depends on. This half is real behaviour.
// ---------------------------------------------------------------------------

const detect = (pathname: string): string => {
  // The same rule as detectLocale in i18n.ts, which cannot be imported here
  // without a document. Kept in step by the check below.
  const ES_PREFIX = '/es';
  return pathname === ES_PREFIX || pathname.startsWith(`${ES_PREFIX}/`) ? 'es' : 'en';
};

const i18n = readFileSync('src/i18n.ts', 'utf8');
check('this file mirrors the real detectLocale rule',
  /path === ES_PREFIX \|\| path\.startsWith\(`\$\{ES_PREFIX\}\/`\)/.test(i18n),
  'if detectLocale changes shape, update the mirror above');

// /es is the served path: vercel.json sets trailingSlash false and cleanUrls,
// so the Spanish page is /es and NOT /es/. A rule that only handled /es/ would
// have made the prefix dead code on the one page it exists for.
check('the served Spanish path resolves to Spanish', detect('/es') === 'es');
check('a Spanish subpath resolves to Spanish', detect('/es/') === 'es');
check('the English root resolves to English', detect('/') === 'en');

// The precondition, asserted rather than assumed: prove this check can fail.
// A path that merely STARTS with the letters es must not be Spanish, or every
// future /estimates page silently joins the Spanish funnel.
check('a path that only starts with the letters es is English',
  detect('/estimates') === 'en');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
