/**
 * PlainRecord: every page's description fits in a search result (25 Nov 2026)
 *
 * Search results show about 160 characters of a meta description and cut the
 * rest. On 25 Nov 2026, 56 of 373 pages ran past it, the longest to 306, so the
 * line a searcher reads ended mid-sentence. document_() in _page_shell.mjs now
 * refuses a long one at build time; this also covers the pages built outside
 * it (the quiz and the fact sheets) and the front pages, which exist in dist/.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// @ts-ignore: plain .mjs
import { DESC_MAX } from './scripts/_page_shell.mjs';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`);
}

const root = new URL('.', import.meta.url);
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const descOf = (html: string) => {
  const m = html.match(/<meta name="description"[^>]*content="([^"]*)"/);
  return m ? unesc(m[1]) : null;
};

const files = execFileSync('git', ['ls-files', 'public/**/index.html'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
const built = ['dist/index.html', 'dist/es/index.html', 'dist/quiz/index.html', 'dist/es/cuestionario/index.html'].filter((f) => existsSync(new URL(f, root)));
if (built.length < 4) console.log('[SKIP] the front pages and the quiz: no dist/ (run npm run build)');

const long: string[] = [], none: string[] = [];
for (const f of [...files, ...built]) {
  const d = descOf(readFileSync(new URL(f, root), 'utf8'));
  if (d === null) none.push(f);
  else if ([...d].length > DESC_MAX) long.push(`${f} (${[...d].length})`);
}
check(`every page has a description`, none.length === 0, none.slice(0, 5).join(', ') || `${files.length + built.length} pages`);
check(`every description is ${DESC_MAX} characters or fewer`, long.length === 0, long.slice(0, 5).join(', '));
check('(the length check counts characters, not bytes: "Cámara" is 6)', [...'Cámara'].length === 6);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
