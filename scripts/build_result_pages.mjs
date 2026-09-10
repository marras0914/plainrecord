/**
 * PlainRecord — the eleven shareable result pages and their cards
 *
 *   npm run build:cards                 # both locales
 *   node scripts/build_result_pages.mjs --locale es
 *
 * Emits, for each of the eleven positions on the strip and each locale:
 *
 *   public/og/r<bin>.png        the share card, 1200x630
 *   public/r/<bin>.html         the page a shared link points at
 *   public/es/r/<bin>.html      the same in Spanish
 *
 * WHY THIS EXISTS AT ALL. A result used to travel in the URL fragment, which is
 * never sent to a server. That made the link private and made it useless to
 * share: no crawler can see a fragment, so every shared link unfurled into the
 * same generic card and looked exactly like somebody pasting the homepage. The
 * two properties were the same property.
 *
 * So the result moved into the path. `rightnleft.com/r/8` is visible to a
 * crawler, which is the entire point, and the cost is stated honestly in
 * `share.linkNote` and `privacy.body`: one bucketed integer, one of eleven,
 * with no identifier attached, now appears in a request log the way every page
 * request already does. It is not an answer, not a score, and says nothing
 * about which votes were judged which way.
 *
 * WHY STATIC RATHER THAN A FUNCTION. There are eleven possible results. Eleven.
 * Generating them at build time means no runtime image rendering, no new
 * dependency, no cold start on the most-shared surface the project has, and a
 * CDN-cached PNG. A dynamic OG endpoint would have been the obvious build and
 * the wrong one.
 *
 * WHY THE REDIRECT IS JAVASCRIPT and not a meta refresh. Crawlers read the tags
 * and do not run scripts, so they see the card. A human is moved on to the real
 * page immediately. A meta refresh is followed by some crawlers, which would
 * lose the card for exactly the platforms this is for.
 */

import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const W = 1200;
const H = 630;
const BINS = 11;

/**
 * The axis inside the card's SVG, and the inset that keeps an end marker whole.
 *
 * INSET must exceed the marker's outermost radius or bin 0 and bin 10 get
 * clipped by the SVG edge. The halo is r=26 with a 3px stroke, so it reaches
 * 27.5px from centre. 14 was the first guess and cut the ring in half on the
 * one card most likely to be shared by somebody delighted with their result.
 * Asserted below rather than trusted.
 */
const AXIS_W = 1072;
const MARKER_REACH = 27.5;
const INSET = 32;

const argv = process.argv.slice(2);
const only = argv.includes('--locale') ? argv[argv.indexOf('--locale') + 1] : null;
const LOCALES = only ? [only] : ['en', 'es'];

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

const payload = JSON.parse(await readFile(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
const copy = JSON.parse(await readFile(resolve(ROOT, 'i18n/copy.json'), 'utf8'));
const template = await readFile(resolve(ROOT, 'scripts/og.template.html'), 'utf8');

function t(key, locale, vars = {}) {
  const e = copy[key];
  if (!e) throw new Error(`build_result_pages: no copy key "${key}"`);
  const s = e[locale] ?? e.en;
  return s.replace(/\{(\w+)\}/g, (whole, name) =>
    (vars[name] === undefined ? whole : String(vars[name])));
}

function sessionLabel(locale) {
  const m = /^(\d+)R$/.exec(String(payload.session));
  if (!m) return String(payload.session).toUpperCase();
  return locale === 'es' ? `${m[1]}.ª` : `${m[1]}TH`;
}

/**
 * The five position words, matching the guess slider exactly.
 *
 * Same thresholds as `leanLabel` in src/main.ts. A card that described bin 3
 * differently from the way the site describes bin 3 would be the two surfaces
 * disagreeing about the same reader.
 */
function labelKey(bin) {
  const lean = (bin / 5) - 1;
  if (lean <= -0.6) return 'guess.label.farD';
  if (lean <= -0.2) return 'guess.label.nearD';
  if (lean < 0.2) return 'guess.label.middle';
  if (lean < 0.6) return 'guess.label.nearR';
  return 'guess.label.farR';
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One prominent marker where the reader landed, replacing the scatter. */
function marker(bin) {
  const x = INSET + (bin / (BINS - 1)) * (AXIS_W - INSET * 2);
  return [
    `<line x1="${x.toFixed(1)}" y1="30" x2="${x.toFixed(1)}" y2="104" stroke="#7d5ba6" stroke-width="3"/>`,
    `<circle cx="${x.toFixed(1)}" cy="30" r="17" fill="#7d5ba6"/>`,
    `<circle cx="${x.toFixed(1)}" cy="30" r="26" fill="none" stroke="#7d5ba6" stroke-opacity="0.32" stroke-width="3"/>`,
  ].join('\n      ');
}

const setText = (html, id, value) =>
  html.replace(
    new RegExp(`(<(\\w+)[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</\\2>)`),
    (_w, open, _tag, _body, close) => `${open}${value}${close}`,
  );

let fails = 0;
const say = (ok, label, detail = '') => {
  if (!ok) fails++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch();
await mkdir(resolve(ROOT, 'public/og'), { recursive: true });

for (const locale of LOCALES) {
  const dir = locale === 'es' ? 'public/es/r' : 'public/r';
  await mkdir(resolve(ROOT, dir), { recursive: true });

  const base = locale === 'es' ? 'https://rightnleft.com/es' : 'https://rightnleft.com';
  const home = locale === 'es' ? '/es/' : '/';
  let bytes = 0;

  for (let bin = 0; bin < BINS; bin++) {
    const label = t(labelKey(bin), locale);
    const deck = t('shared.intro', locale, { label });

    // ---- the card -----------------------------------------------------------
    let html = template.replace('<g id="dots"></g>', `<g id="dots">\n      ${marker(bin)}\n      </g>`);
    html = setText(html, 'eyebrow', esc(t('og.eyebrow', locale, { session: sessionLabel(locale) })));
    html = setText(html, 'title', esc(t('intro.h1', locale)).replace(/ /g, '&nbsp;'));
    html = setText(html, 'deck', esc(deck));
    html = setText(html, 'axis-d', esc(t('og.axisD', locale)));
    html = setText(html, 'axis-mid', esc(t('og.axisMid', locale)));
    html = setText(html, 'axis-r', esc(t('og.axisR', locale)));
    html = setText(html, 'prov', esc(t('og.prov', locale, {
      rollcalls: payload.provenance.houseItemsTotal.toLocaleString(locale === 'es' ? 'es-MX' : 'en-US'),
      eligible: payload.provenance.eligibleTotal.toLocaleString(locale === 'es' ? 'es-MX' : 'en-US'),
      asked: payload.items.length.toLocaleString(locale === 'es' ? 'es-MX' : 'en-US'),
    })));
    html = html.replace('<html lang="en">', `<html lang="${locale}">`);

    const suffix = locale === 'es' ? `.es` : '';
    const OUT = resolve(ROOT, `public/og/r${bin}${suffix}.png`);
    const STAGED = resolve(ROOT, `scripts/.card.${locale}.${bin}.html`);

    const page = await (
      await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
    ).newPage();
    try {
      await writeFile(STAGED, html, 'utf8');
      await page.goto(pathToFileURL(STAGED).href, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);

      // The typeface must be the real one. Chromium falls back to system-ui in
      // silence when the font fetch fails, and the result looks close enough to
      // pass review and wrong everywhere it is seen.
      const usedFont = await page.evaluate(() =>
        getComputedStyle(document.querySelector('h1')).fontFamily);
      if (bin === 0 && !/Lexend/i.test(usedFont)) {
        say(false, `${locale}: card font is Lexend`, usedFont);
      }

      // The marker must be entirely inside the artboard. Measured from the
      // rendered SVG rather than computed from the constants, so a change to
      // the halo's radius is caught by the thing it would actually break.
      const box = await page.evaluate(() => {
        const g = document.querySelector('#dots');
        const b = g.getBBox();
        const svg = document.querySelector('#strip');
        const vb = svg.viewBox.baseVal;
        return { left: b.x, right: b.x + b.width, w: vb.width };
      });
      if (box.left < -0.5 || box.right > box.w + 0.5) {
        say(false, `${locale}: bin ${bin} marker is clipped`,
          `x ${box.left.toFixed(1)}..${box.right.toFixed(1)} in 0..${box.w}`);
      }

      // The state mark and the result marker must not collide. They live in
      // different coordinate systems (one is page CSS pixels, the other is
      // inside the strip's SVG), so this is measured in page space where they
      // actually meet. The right-hand bins are the ones at risk, and they are
      // also the ones somebody pleased with their result is most likely to
      // post.
      const overlap = await page.evaluate(() => {
        const tx = document.querySelector('#texas');
        const dot = document.querySelector('#dots circle:last-of-type');
        if (!tx || !dot) return null;
        const a = tx.getBoundingClientRect();
        const b = dot.getBoundingClientRect();
        const hit = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
        return { hit, gap: Math.round(b.top - a.bottom) };
      });
      if (overlap && overlap.hit) {
        say(false, `${locale}: bin ${bin} marker overlaps the state mark`, `gap ${overlap.gap}px`);
      }

      await page.screenshot({ path: OUT, type: 'png' });
    } finally {
      await page.close();
      await unlink(STAGED).catch(() => {});
    }

    bytes += (await stat(OUT)).size;

    // ---- the page a shared link points at ------------------------------------
    const cardUrl = `https://rightnleft.com/og/r${bin}${suffix}.png`;
    const target = `${home}#r=${bin}`; // the visible fallback link only
    const page_html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('intro.h1', locale))}</title>
<meta name="description" content="${esc(deck)}">
<link rel="canonical" href="${base}/r/${bin}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="rightnleft.com">
<meta property="og:url" content="${base}/r/${bin}">
<meta property="og:title" content="${esc(t('intro.h1', locale))}">
<meta property="og:description" content="${esc(deck)}">
<meta property="og:image" content="${cardUrl}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="${W}">
<meta property="og:image:height" content="${H}">
<meta property="og:image:alt" content="${esc(deck)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t('intro.h1', locale))}">
<meta name="twitter:description" content="${esc(deck)}">
<meta name="twitter:image" content="${cardUrl}">
<meta name="robots" content="noindex,follow">
<!--
  A JavaScript redirect, deliberately. Crawlers read the tags above and do not
  run scripts, so the card survives; a person is moved to the real page at once.
  A meta refresh is followed by some crawlers, which would lose the card for
  exactly the platforms this page exists for.

  EXTERNAL rather than inline, because the site's CSP is script-src 'self' with
  no unsafe-inline. An inline redirect here is silently blocked and the shared
  link dead-ends on this page.

  noindex because eleven near-identical pages are not what should rank for this
  site; "follow" so the link through to the real page still counts.
-->
<script src="/r/go.js"></script>
</head>
<body>
<p><a href="${target}">${esc(t('intro.h1', locale))}</a></p>
</body>
</html>
`;
    await writeFile(resolve(ROOT, dir, `${bin}.html`), page_html, 'utf8');
  }

  say(INSET > MARKER_REACH, `${locale}: inset clears the marker halo`,
    `inset ${INSET} vs reach ${MARKER_REACH}`);
  say(true, `${locale}: ${BINS} cards and ${BINS} pages`,
    `${(bytes / 1024).toFixed(0)} KB of PNG`);
}

await browser.close();

console.log(fails === 0
  ? '\n  result pages built\n'
  : `\n  ${fails} check(s) failed\n`);
process.exit(fails === 0 ? 0 : 1);
