/**
 * PlainRecord: the maps (17 Nov 2026)
 *
 * Every district page carries a locator (Texas with the district marked, and a
 * close-up with its neighbours numbered), and /charts carries the crossing map.
 * Both are drawn from boundaries_tx.topo.json by scripts/_charts.mjs.
 *
 * The bug this was written for: an island district (HD-55, wholly inside HD-54)
 * is one closed arc, and the simplifier measured every point against a
 * zero-length line, kept only the two ends, and dropped the ring. HD-55 was an
 * empty shape on the live /charts map, and eight more districts lost islands.
 */

import { readFileSync, existsSync } from 'node:fs';
// @ts-ignore: plain .mjs
import { loadTopo, locatorSvg } from './scripts/_charts.mjs';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`);
}

const at = (p: string) => new URL(p, import.meta.url);
const topo = loadTopo(at('./public/data/boundaries_tx.topo.json'));
const L = { stateAlt: 's', closeAlt: 'c', tip: (n: number) => `D${n}` };
const href = (n: number) => `/district/${n}`;

const emptyPath = /<path class="here" d=""/;
check('(the empty-shape check matches an empty path)', emptyPath.test('<path class="here" d=""/>'));

// Every district, drawn directly.
const empty: number[] = [], unlabelled: number[] = [], badLinks: number[] = [];
for (let d = 1; d <= 150; d++) {
  const { stateSvg, closeSvg } = locatorSvg(topo, d, L, href);
  if (emptyPath.test(stateSvg) || emptyPath.test(closeSvg)) empty.push(d);
  if (!new RegExp(`class="maplab herelab"[^>]*>${d}<`).test(closeSvg)) unlabelled.push(d);
  if (closeSvg.includes(`href="/district/${d}"`)) badLinks.push(d);
}
check('every district is drawn in both panels', empty.length === 0, empty.join(',') || '150');
check('every close-up numbers its own district', unlabelled.length === 0, unlabelled.join(',') || '150');
check('no close-up links a district to itself', badLinks.length === 0, badLinks.join(','));

// The island case, explicitly.
const hd55 = locatorSvg(topo, 55, L, href).closeSvg;
check('HD-55 (an island inside HD-54) is drawn', /class="here" d="M/.test(hd55));
check('HD-54 appears around it, linked', hd55.includes('href="/district/54"'));

// The shipped pages.
let missing = 0, sizes: number[] = [];
for (const dir of ['district', 'distrito']) {
  for (let d = 1; d <= 150; d++) {
    const p = at(`./public/${dir}/${d}/index.html`);
    if (!existsSync(p)) { missing++; continue; }
    const t = readFileSync(p, 'utf8');
    const i = t.indexOf('<figure class="chart loc"');
    if (i < 0 || emptyPath.test(t)) { missing++; continue; }
    sizes.push(t.indexOf('</figure>', i) - i);
  }
}
check('all 300 shipped district pages carry a drawn locator', missing === 0 && sizes.length === 300, `${missing} missing`);
const max = Math.max(...sizes);
check('no locator is over 40 KB', max < 40 * 1024, `${Math.round(max / 1024)} KB largest`);

const charts = readFileSync(at('./public/charts/index.html'), 'utf8');
check('/charts draws HD-55', /<path class="dist [^"]*" d="M[^"]+"><title>[^<]*District 55\b/.test(charts));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
