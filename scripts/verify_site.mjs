/**
 * PlainRecord — rendered-page verification
 *
 *   node scripts/verify_site.mjs                 # against `npm run preview` on :4173
 *   node scripts/verify_site.mjs --with-headers  # against dist/ + the real vercel.json headers
 *   node scripts/verify_site.mjs --url http://localhost:5173
 *
 * `npm test` proves the data pipeline and the scoring modules are right. It says
 * nothing about the page, because the page is where two whole classes of bug live:
 *
 *   1. The port to the real modules changed behaviour. The prototype computed
 *      profiles in inline JS; src/quiz-data.ts adapts the shipped payload back
 *      into the shapes valence.ts and scoring.ts expect. A wrong adapter still
 *      renders — it just renders wrong numbers.
 *   2. Production headers break the page. A CSP that blocks your own script looks
 *      perfect under `vite preview` (which sets no CSP) and is broken only once
 *      deployed. --with-headers serves dist/ through the actual vercel.json rules
 *      so a violation shows up here instead of on rightnleft.com.
 *
 * Assertions test PROPERTIES, not digits captured from a previous run. The item
 * count legitimately moves when a headline bill is force-added, and pinning an
 * exact lean once turned a correct build red. Where a value IS the claim —
 * `consistent` producing 0% crossover, `muted` producing a near-zero partisan
 * load — it stays exact, because that is the thing the preset exists to show.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname, sep } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const withHeaders = argv.includes('--with-headers');
const urlArg = argv[argv.indexOf('--url') + 1];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    '\n  playwright is not installed. It is a devDependency of this repo:\n' +
      '    npm install\n' +
      '    npx playwright install chromium\n',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Optionally serve dist/ through the production headers
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
};

let server = null;
let URL_UNDER_TEST = urlArg ?? 'http://localhost:4173/';

if (withHeaders) {
  const dist = join(ROOT, 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    console.error('\n  dist/index.html not found — run `npm run build` first.\n');
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  // vercel.json `source` is a path pattern, not a regex. Only `(.*)` is used here.
  const toRe = (src) => new RegExp('^' + src.replace(/\(\.\*\)/g, '.*') + '$');
  const rules = cfg.headers.map((r) => ({ re: toRe(r.source), headers: r.headers }));

  server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    let file = join(dist, path);
    // Static-host behaviour: unknown paths fall through to the SPA entry point.
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    const served = '/' + file.slice(dist.length + 1).split(sep).join('/');
    for (const r of rules) {
      if (r.re.test(served)) for (const h of r.headers) res.setHeader(h.key, h.value);
    }
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise((ok, bad) => {
    server.once('error', (e) =>
      bad(
        e.code === 'EADDRINUSE'
          ? new Error('port 4174 is already in use — close whatever is on it and re-run')
          : e,
      ),
    );
    server.listen(4174, ok);
  }).catch((e) => {
    console.error(['', '  ' + e.message, ''].join('\n'));
    process.exit(1);
  });
  URL_UNDER_TEST = 'http://localhost:4174/';
  console.log(`\n  serving dist/ with vercel.json headers on ${URL_UNDER_TEST}`);
}

// ---------------------------------------------------------------------------
// What each preset is supposed to demonstrate
// ---------------------------------------------------------------------------

const num = (v) => Number(String(v).replace('−', '-').trim());

const EXPECT = {
  mixed: {
    lean: { want: 'balanced by construction (|lean| <= 0.05)', ok: (v) => Math.abs(num(v)) <= 0.05 },
    cross: { want: 'exactly 50%', ok: (v) => v === '50%' },
    load: { want: 'high partisan load (>= 0.5)', ok: (v) => num(v) >= 0.5 },
    head: /split right down the middle|cross over a lot/i,
  },
  muted: {
    lean: { want: 'near zero (|lean| <= 0.10)', ok: (v) => Math.abs(num(v)) <= 0.10 },
    cross: { want: 'some crossover (not 0%)', ok: (v) => v !== '0%' },
    // The whole point: on these votes the parties did not divide, so no lean
    // reading is meaningful and the headline must decline to give one.
    load: { want: 'low partisan load (< 0.20)', ok: (v) => num(v) < 0.20 },
    head: /can't really place you/i,
  },
  consistent: {
    lean: { want: 'strongly Democratic (<= -0.60)', ok: (v) => num(v) <= -0.60 },
    cross: { want: 'exactly 0%', ok: (v) => v === '0%' },
    load: { want: 'high partisan load (>= 0.5)', ok: (v) => num(v) >= 0.5 },
    head: /line up with Democrats/i,
  },
};

// ---------------------------------------------------------------------------

let fails = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1180, height: 1000 } })).newPage();

// A CSP violation reaches us as a console error, which is why the no-errors
// check at the end is load-bearing rather than cosmetic.
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push('CONSOLE ' + m.text());
});

try {
  await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  console.log('');
  const meta = await page.$eval('.q-meta .eyebrow', (e) => e.textContent.trim());
  check('boots in 7-issue mode', /^1 of 7 /.test(meta), meta);
  check('question 1 is SB 2, school vouchers', /SB 2 · School vouchers/.test(meta), meta);
  check('the reason for the pick is shown',
    /marquee fight/i.test(await page.$eval('.headline-why', (e) => e.textContent.trim())));

  // Showing a state ranking before the vote would steer the answer, which is the
  // one thing a blind quiz cannot do.
  check('outcomes hidden before any answer', await page.$eval('#outcome-card', (e) => e.hidden));

  for (const [name, want] of Object.entries(EXPECT)) {
    await page.click(`[data-preset="${name}"]`);
    await page.waitForTimeout(300);
    const got = await page.evaluate(() => ({
      stats: [...document.querySelectorAll('.stat-val')].map((x) => x.textContent.trim()),
      head: document.querySelector('.readout-head').textContent.trim(),
      cands: [...document.querySelectorAll('.cand-score')].map((x) => x.textContent.trim()),
    }));
    const [lean, cross, load] = got.stats;
    check(`${name}: lean — ${want.lean.want}`, want.lean.ok(lean), `got ${lean}`);
    check(`${name}: crossover — ${want.cross.want}`, want.cross.ok(cross), `got ${cross}`);
    check(`${name}: load — ${want.load.want}`, want.load.ok(load), `got ${load}`);
    check(`${name}: headline`, want.head.test(got.head), got.head);
    if (name === 'consistent') {
      check('consistent: all three candidates converge above +0.80',
        got.cands.length === 3 && got.cands.every((c) => num(c) >= 0.80), got.cands.join(' '));
    }
  }

  await page.click('[data-preset="reset"]');
  await page.waitForTimeout(200);
  await page.click('#mode-full');
  await page.waitForTimeout(400);
  const fullMeta = await page.$eval('.q-meta .eyebrow', (e) => e.textContent.trim());
  const total = /^1 of (\d+) /.exec(fullMeta)?.[1];
  check('full mode offers the whole item set', Number(total) > 7, fullMeta);
  // Read the headline value and its caption separately: the caption carries the
  // rule version now that the value says "a written rule" in plain language.
  const prov = await page.$$eval('.prov dd', (ds) =>
    ds.map((d) => ({
      value: d.childNodes[0].textContent.trim(),
      caption: d.querySelector('small')?.textContent.trim() ?? '',
    })),
  );
  const provText = prov.map((p) => `${p.value} (${p.caption})`).join(' | ');
  check('provenance rescopes to the full set', prov[0].value === total, `${provText} vs ${total} items`);
  // Format-agnostic: assert that a journal count out of the total is reported at
  // all, not the exact punctuation between the two numbers.
  check('provenance reports journal-sourced coverage',
    /^\d+\D+\d+$/.test(prov[1].value) && prov[1].value.includes(total), prov[1].value);
  // The version must appear SOMEWHERE in that tile — value or caption. Pinning it
  // to the value broke the moment the value became plain English, even though the
  // page was still naming the rule.
  check('provenance names the selection rule version',
    /sel-\d{4}-\d{2}-\d{2}/.test(prov[3].value + ' ' + prov[3].caption),
    `${prov[3].value} / ${prov[3].caption}`);

  for (let i = 0; i < 6; i++) {
    await page.click('[data-answer="1"]');
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(300);
  check('outcomes appear after answering', !(await page.$eval('#outcome-card', (e) => e.hidden)));
  const rows = await page.$$eval('.outc-row', (ds) => ds.length);
  check('at least one sourced indicator shown', rows > 0, `${rows} rows`);
  const src = await page.$eval('.outc-src a', (e) => e.getAttribute('href'));
  check('every indicator links to its source', /^https?:\/\//.test(src), src);

  await page.click('#table-toggle');
  await page.waitForTimeout(250);
  const cols = await page.$$eval('#table thead th', (ts) => ts.map((t) => t.textContent));
  check('table view exposes the receipts',
    ['R Yea', 'D Yea', 'Valence', 'Source'].every((c) => cols.includes(c)), cols.join(','));

  check('no console errors', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close();
  if (server) await new Promise((r) => server.close(r));
}

console.log(
  fails === 0
    ? `\n  === the rendered site is correct${withHeaders ? ' under the production headers' : ''} ===\n`
    : `\n  === ${fails} MISMATCH(ES) ===\n`,
);
process.exit(fails === 0 ? 0 : 1);
