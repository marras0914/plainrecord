/**
 * PlainRecord: one visual on each space's front page (Marco, 17 Nov 2026)
 *
 *   /policy   the vote-gap histogram from /charts, in its approved words
 *   /faith    who has spoken on what: a dot per tradition and issue, NO side
 *             and NO count (the D/R grid stays on /faith/sides)
 *   /economy  a blank example card: no number at all, so the blind round
 *             gives nothing away before it starts
 */

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`);
}
const page = (p: string) => readFileSync(new URL(`./public/${p}/index.html`, import.meta.url), 'utf8');
const faith = JSON.parse(readFileSync(new URL('./public/data/faith.json', import.meta.url), 'utf8'));

// Policy
for (const [p, charts] of [['policy', 'charts'], ['politica', 'graficas']]) {
  const t = page(p);
  check(`/${p} carries the vote-gap histogram`, /<svg [^>]*aria-labelledby="hist-t"/.test(t) && (t.match(/class="bar"/g) ?? []).length === 10);
  check(`/${p} links to the chart on /${charts}`, t.includes(`/${charts}#agree"`));
}

// Religion
const statements = new Set(faith.statements.map((s: any) => `${s.traditionId}|${s.issueId}`)).size;
const cells = faith.traditions.length * faith.issues.length;
for (const p of ['faith', 'fe']) {
  const t = page(p);
  const i = t.indexOf('<table class="cov">');
  const grid = i < 0 ? '' : t.slice(i, t.indexOf('</table>', i));
  const on = (grid.match(/class="dot on"/g) ?? []).length;
  const off = (grid.match(/class="dot off"/g) ?? []).length;
  check(`/${p} has the coverage grid, one dot per tradition and issue`, on + off === cells, `${on + off} of ${cells}`);
  check(`/${p}: a filled dot for every tradition-issue pair with a statement`, on === statements, `${on} vs ${statements}`);
  check(`/${p}: the grid shows no side (no D/R mark)`, grid.length > 0 && !/class="mk /.test(grid));
  check(`/${p}: the grid shows no count`, grid.length > 0 && !/\b\d+\b/.test(grid.replace(/<[^>]*>/g, '')));
}
check('(the count check catches a number)', /\b\d+\b/.test('Catholic 8'));

// Economics
for (const p of ['economy', 'economia']) {
  const t = page(p);
  const i = t.indexOf('<figure id="econ-example"');
  const ex = i < 0 ? '' : t.slice(i, t.indexOf('</figure>', i));
  const blanks = (ex.match(/<span class="blank">\?<\/span>/g) ?? []).length;
  check(`/${p} has the example card, every value blank`, blanks === 14, `${blanks} of 14`);
  // Only the 1-to-5 scale and the income measure's "1984" may be digits.
  const digits = ex.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]*>/g, ' ')
    .replace(/1984/g, '').replace(/\b[1-5]\b/g, '').match(/\d/g) ?? [];
  check(`/${p}: the example card shows no figure`, ex.length > 0 && digits.length === 0, digits.join(''));
  check(`/${p}: the example card names no year, president or party`, ex.length > 0 && !/Democrat|Republican|demócrat|republican|Truman|Eisenhower|Biden|Trump/i.test(ex));
}
const js = readFileSync(new URL('./public/js/econ-blind.js', import.meta.url), 'utf8');
check('the round hides the example once a real card is on screen', /getElementById\('econ-example'\)[\s\S]{0,80}hidden = true/.test(js));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
