/**
 * PlainRecord — render the share cards and chart downloads
 *
 *   npm run build:cards
 *
 * Writes, and records in public/share/manifest.json:
 *   public/share/bill-<slug>-<en|es>.png   1200x630 link-preview card per bill page
 *   public/share/charts-<en|es>.png        1200x630 card for /charts and /graficas
 *   public/charts/img/<chart>-<en|es>.png  each chart with its heading, caption
 *                                          and a source line, for download
 *
 * THE CARDS ARE LIFTED FROM THE BUILT PAGES, not drawn a second time. Each one
 * opens the real page in Chromium and moves the page's own heading, figures and
 * chart into a 1200x630 frame, so a card cannot say anything its page does not.
 * That is why this runs the page builders first.
 *
 * Local only, because the Vercel build has no Chromium; the output is committed,
 * like og.png from build_og.mjs. _share_cards.mjs holds the hash that tells the
 * page builders whether these images still match the data. When they do not,
 * the pages quietly fall back to og.png rather than serve a stale chart.
 */

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { inputsHash, MANIFEST } from './_share_cards.mjs';
import { HEADLINE_BILLS, billSlug } from './_site_nav.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');

// Pages first, from the current inputs, so the cards are lifted from exactly
// what will ship. They are built again at the end to point at the new images.
const buildPages = () => {
  for (const s of ['build_bill_pages.mjs', 'build_charts.mjs']) {
    execFileSync(process.execPath, [join(ROOT, 'scripts', s)], { stdio: 'inherit' });
  }
};
buildPages();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  let p = join(PUB, decodeURIComponent(q.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[extname(p)] ?? 'application/octet-stream' });
  r.end(readFileSync(p));
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch();
const written = [];

// The frame every card shares. Tokens only, so it is the site's own palette.
const CARD_CSS = `
.card-og{position:fixed;inset:0;width:1200px;height:630px;box-sizing:border-box;padding:44px 60px 34px;
  display:flex;flex-direction:column;background:var(--page);color:var(--ink);z-index:9999}
.card-og h1{font-family:"Newsreader",Georgia,serif;font-weight:500;font-size:46px;line-height:1.08;margin:0 0 10px;letter-spacing:-.01em}
.card-og .sub{font-size:23px;color:var(--ink-2);margin:0 0 18px}
.card-og .plot{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
.card-og .plot svg{width:100%;height:100%;display:block;overflow:visible}
.card-og .foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px;font-size:19px;color:var(--muted)}
.card-og .foot .legend{margin:0;font-size:19px}
.card-og .foot .url{color:var(--ink-2);font-weight:600}
`;

async function openPage(path) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light' });
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Fail loudly if a face did not load: a card in a fallback font looks close
  // enough to pass review and wrong everywhere it is seen (build_og.mjs's rule).
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
  for (const need of ['Lexend', 'Newsreader']) {
    if (!fonts.includes(need)) throw new Error(`${path}: ${need} did not load, refusing to render a card in a fallback face`);
  }
  return page;
}

async function card(path, out, compose) {
  const page = await openPage(path);
  await page.evaluate(compose.fn, { ...compose.args, css: CARD_CSS });
  await page.waitForTimeout(100);
  await page.locator('.card-og').screenshot({ path: out });
  await page.close();
  written.push(out);
}

// A bill page: its h1, its label and tally, its seat chart and legend.
const composeBill = (url) => ({
  args: { url },
  fn: ({ url, css }) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const h1 = document.querySelector('h1').textContent;
    const label = document.querySelector('.lede b').textContent.replace(/\.$/, '');
    const tallyP = [...document.querySelectorAll('main > p')].find((p) => /House voted|Cámara votó/.test(p.textContent));
    const tally = tallyP.textContent.split('.')[0] + '.';
    const svg = document.querySelector('figure.chart svg').outerHTML;
    const legend = document.querySelector('ul.legend').outerHTML;
    const c = document.createElement('div');
    c.className = 'card-og';
    c.innerHTML = `<h1>${h1}</h1><p class="sub">${label} · ${tally}</p>`
      + `<div class="plot chart">${svg}</div><div class="foot">${legend}<span class="url">${url}</span></div>`;
    document.body.appendChild(c);
  },
});

// /charts: the page's h1 and the first chart, the one with no partisan slant.
const composeCharts = (url) => ({
  args: { url },
  fn: ({ url, css }) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const h1 = document.querySelector('h1').textContent;
    const sub = document.querySelector('#agree').textContent;
    const fig = document.querySelector('figure.chart');
    const svg = fig.querySelector('svg').outerHTML;
    const axis = fig.querySelector('figcaption')?.textContent ?? '';
    const c = document.createElement('div');
    c.className = 'card-og';
    c.innerHTML = `<h1>${h1}</h1><p class="sub">${sub}</p><div class="plot chart">${svg}</div>`
      + `<div class="foot"><span>${axis}</span><span class="url">${url}</span></div>`;
    document.body.appendChild(c);
  },
});

mkdirSync(join(PUB, 'share'), { recursive: true });
mkdirSync(join(PUB, 'charts', 'img'), { recursive: true });

for (const lang of ['en', 'es']) {
  for (const b of HEADLINE_BILLS) {
    const slug = billSlug(b.billId);
    const path = `/${lang === 'es' ? 'proyecto' : 'bill'}/${slug}/`;
    await card(path, join(PUB, 'share', `bill-${slug}-${lang}.png`), composeBill(`rightnleft.com${path.replace(/\/$/, '')}`));
  }
  const cpath = lang === 'es' ? '/graficas/' : '/charts/';
  await card(cpath, join(PUB, 'share', `charts-${lang}.png`), composeCharts(`rightnleft.com${cpath.replace(/\/$/, '')}`));
}

// The downloads: each chart section from its heading to its end marker, with a
// source line so the image carries its own attribution once it leaves the site.
const SOURCE = {
  en: (u) => `Source: Texas House Journal and Open States, 89th Legislature (2025). ${u}`,
  es: (u) => `Fuente: Diario de la Cámara de Texas y Open States, 89.ª Legislatura (2025). ${u}`,
};
for (const lang of ['en', 'es']) {
  const cpath = lang === 'es' ? '/graficas/' : '/charts/';
  for (const id of ['agree', 'ranks', 'map']) {
    const page = await browser.newPage({ viewport: { width: 760, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light' });
    await page.goto(BASE + cpath, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(({ id, text }) => {
      // The share links under each chart are for the page, not the picture.
      document.querySelectorAll('.chart-share').forEach((e) => e.remove());
      const s = document.createElement('p'); s.className = 'small'; s.id = 'srcline'; s.textContent = text;
      document.getElementById(`${id}-end`).after(s);
    }, { id, text: SOURCE[lang](`rightnleft.com${cpath.replace(/\/$/, '')}#${id}`) });
    const a = await page.locator(`#${id}`).boundingBox();
    const z = await page.locator('#srcline').boundingBox();
    const out = join(PUB, 'charts', 'img', `${id}-${lang}.png`);
    await page.screenshot({ path: out, fullPage: true, clip: { x: a.x - 20, y: a.y - 16, width: 640, height: z.y + z.height - a.y + 32 } });
    await page.close();
    written.push(out);
  }
}

await browser.close();
srv.close();

// The hash is taken AFTER the renders, from the same inputs they were drawn
// from, and the pages are rebuilt so they now point at these images.
writeFileSync(join(ROOT, MANIFEST), JSON.stringify({
  _meta: 'Written by scripts/build_share_cards.mjs. inputsHash covers every file in CARD_INPUTS (scripts/_share_cards.mjs); when it no longer matches, the pages stop using these images.',
  generated: new Date().toISOString().slice(0, 10),
  inputsHash: inputsHash(),
  files: written.map((p) => p.slice(PUB.length).replace(/\\/g, '/')),
}, null, 2) + '\n');
buildPages();
console.log(`\n  ${written.length} images written, manifest recorded\n`);
