/**
 * PlainRecord: session.json is the one session setting (17 Nov 2026)
 *
 * Build scripts read it through scripts/session.mjs, and the browser takes the
 * session from the payload it imports. Two browser imports must stay literal
 * (bundlers need a fixed path), so this holds them, the payload's own session,
 * and every shipped session file to session.json.
 */

import { readFileSync, existsSync } from 'node:fs';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const S: string = JSON.parse(read('./session.json')).session;
check('session.json names a session', /^\d{2,3}(R|-\d)$/.test(S), S);

const literal = (file: string, re: RegExp) => (read(file).match(re) ?? [])[1];
const quizImport = literal('./src/quiz-data.ts', /from '\.\.\/public\/data\/quiz_([^.']+)\.json'/);
const esImport = literal('./src/payload-i18n.ts', /from '\.\.\/public\/data\/quiz_([^.']+)\.es\.json'/);
check('src/quiz-data.ts imports this session\'s payload', quizImport === S, `${quizImport} vs ${S}`);
check('src/payload-i18n.ts imports this session\'s Spanish sidecar', esImport === S, `${esImport} vs ${S}`);

const payload = JSON.parse(read(`./public/data/quiz_${S}.json`));
check('the payload says it is this session (the browser builds its URLs from it)', payload.session === S, payload.session);

const shipped = ['quiz', 'members', 'votes', 'zips'].map((n) => `./public/data/${n}_${S}.json`);
const missing = shipped.filter((p) => !existsSync(new URL(p, import.meta.url)));
check('every session file the site loads exists for this session', missing.length === 0, missing.join(', ') || shipped.length + ' files');
check('the members file says it is this session', JSON.parse(read(`./public/data/members_${S}.json`)).session === S);

// No build script should name a session file by a literal session again.
const leftovers: string[] = [];
const { readdirSync } = await import('node:fs');
for (const f of readdirSync(new URL('./scripts/', import.meta.url))) {
  if (!f.endsWith('.mjs') || f === 'session.mjs') continue;
  const lines = read(`./scripts/${f}`).split('\n');
  lines.forEach((l, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
    if (/(quiz|members|votes|zips)_\d{2,3}R\b/.test(l)) leftovers.push(`${f}:${i + 1}`);
  });
}
check('no build script hard-codes a session file name', leftovers.length === 0, leftovers.slice(0, 5).join(', ') || 'none');
check('(the leftover check matches a literal session file name)', /(quiz|members|votes|zips)_\d{2,3}R\b/.test("read('public/data/quiz_89R.json')"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
