/**
 * PlainRecord: every page has the light/dark switch (25 Nov 2026)
 *
 * Only the quiz built a switch, in main.ts, so when the front page stopped being
 * the quiz on 14 Nov the site lost its switch on the front door and nobody
 * noticed for eleven days. Static pages honoured the saved choice but offered no
 * way to make it. This checks every committed static page and the built front
 * pages carry one, and that /js/theme.js really toggles it.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`);
}

const root = new URL('.', import.meta.url);
// The fact sheets are paper: black on white always, no dark mode to switch to.
const PRINT = new Set(['public/fact-sheet/index.html', 'public/hoja/index.html']);
const files = execFileSync('git', ['ls-files', 'public/**/index.html'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter((f) => !PRINT.has(f));
const count = (html: string) => (html.match(/class="themetoggle"/g) ?? []).length;

const missing = files.filter((f) => count(readFileSync(new URL(f, root), 'utf8')) !== 1);
check('every committed static page has exactly one switch', missing.length === 0, missing.slice(0, 5).join(', ') || `${files.length} pages`);
const noScript = files.filter((f) => !readFileSync(new URL(f, root), 'utf8').includes('<script src="/js/theme.js"></script>'));
check('every one loads /js/theme.js', noScript.length === 0, noScript.slice(0, 5).join(', '));
const es = readFileSync(new URL('public/fe/index.html', root), 'utf8');
check('the Spanish pages say Oscuro and Claro', es.includes('>Oscuro<') && es.includes('>Claro<'));

// The front pages are written over vite's output by build_locales.mjs, so they
// exist only in dist/. The quiz builds its own switch in main.ts.
for (const [p, label] of [['dist/index.html', '/'], ['dist/es/index.html', '/es']]) {
  const u = new URL(p, root);
  if (existsSync(u)) check(`the front page ${label} has the switch`, count(readFileSync(u, 'utf8')) === 1);
  else console.log(`[SKIP] the front page ${label}: no dist/ (run npm run build)`);
}

// theme.js against a stand-in document: a saved choice applies before paint,
// the click flips the theme and remembers it, and aria-pressed follows.
const attrs: Record<string, string> = {};
const store: Record<string, string> = { theme: 'dark' };
const btnAttrs: Record<string, string> = {};
let onClick: () => void = () => {};
const btn = { setAttribute: (k: string, v: string) => { btnAttrs[k] = v; }, addEventListener: (_: string, f: () => void) => { onClick = f; } };
const ctx = {
  localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
  document: {
    readyState: 'complete',
    documentElement: { getAttribute: (k: string) => attrs[k] ?? null, setAttribute: (k: string, v: string) => { attrs[k] = v; } },
    querySelectorAll: () => [btn],
    addEventListener: () => {},
  },
};
vm.runInNewContext(readFileSync(new URL('public/js/theme.js', root), 'utf8'), ctx);
check('a saved dark choice is applied, and the switch says so', attrs['data-theme'] === 'dark' && btnAttrs['aria-pressed'] === 'true');
onClick();
check('a click turns it light, remembers it, and updates the switch', attrs['data-theme'] === 'light' && store.theme === 'light' && btnAttrs['aria-pressed'] === 'false');
onClick();
check('a second click turns it dark again', attrs['data-theme'] === 'dark' && store.theme === 'dark');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
