/**
 * PlainRecord — generate src/copy.gen.ts from i18n/copy.json
 *
 *   npm run i18n:gen
 *
 * WHY GENERATE rather than import the JSON straight into the page. copy.json
 * carries the reviewer's apparatus — `where`, `note`, `status`, the register
 * essay — which is 29 KB of material a voter never sees. Importing it would
 * ship all of that to every phone on a page that is otherwise 154 KB. This
 * emits only the strings, in both locales, and nothing else.
 *
 * The second reason is the type. The generated file exports a `CopyKey` union,
 * so `t('bias.p9')` is a compile error rather than a blank space on the page —
 * and `npm run build` already runs `tsc --noEmit` first, so a typo cannot ship.
 *
 * Run this after editing i18n/copy.json. `npm run i18n:check` fails if the
 * generated file is stale, so the two cannot drift apart unnoticed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = resolve(ROOT, 'i18n/copy.json');
const OUT = resolve(ROOT, 'src/copy.gen.ts');

const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const entries = Object.entries(raw).filter(([k]) => k !== '_meta');

const q = (s) => JSON.stringify(s);

const body = `/**
 * GENERATED FILE — do not edit.
 *
 * Source: i18n/copy.json
 * Regenerate: npm run i18n:gen
 *
 * Edits here are lost on the next run, and \`npm run i18n:check\` fails while
 * this file disagrees with copy.json.
 */

/** Every copy key on the site. A typo is a compile error, not a blank space. */
export type CopyKey =
${entries.map(([k]) => `  | ${q(k)}`).join('\n')};

export type Locale = 'en' | 'es';

export const COPY: Record<Locale, Record<CopyKey, string>> = {
  en: {
${entries.map(([k, e]) => `    ${q(k)}: ${q(e.en)},`).join('\n')}
  },
  es: {
${entries.map(([k, e]) => `    ${q(k)}: ${q(e.es)},`).join('\n')}
  },
};

/**
 * Which strings a reviewer has signed off, by locale.
 *
 * Spanish rows still marked \`draft\` in copy.json are listed here so the page
 * can be honest about it: a build that ships unapproved Spanish should say so
 * rather than presenting a machine draft as a translation.
 */
export const ES_UNAPPROVED: readonly CopyKey[] = [
${entries.filter(([, e]) => e.status !== 'ok').map(([k]) => `  ${q(k)},`).join('\n')}
];
`;

const prev = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return null; } })();
const unapproved = entries.filter(([, e]) => e.status !== 'ok').length;

// --check does not write. It exists so a stale generated file fails the build
// instead of shipping yesterday's copy: edit copy.json, forget to regenerate,
// and without this the page keeps rendering the previous wording with no sign
// anything is wrong.
if (process.argv.includes('--check')) {
  if (prev === body) {
    console.log(`\n  src/copy.gen.ts is current — ${entries.length} keys\n`);
    process.exit(0);
  }
  console.error(
    `\n  src/copy.gen.ts is STALE${prev === null ? ' (missing)' : ''}.` +
      `  i18n/copy.json has changed since it was generated.\n` +
      `  Run:  npm run i18n:gen\n`,
  );
  process.exit(1);
}

writeFileSync(OUT, body, 'utf8');
console.log(
  `\n  ${prev === body ? 'src/copy.gen.ts already current' : 'wrote src/copy.gen.ts'}` +
    ` — ${entries.length} keys, 2 locales, ${unapproved} Spanish still unapproved\n`,
);
