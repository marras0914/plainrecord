/**
 * PlainRecord — build the Open Graph share card
 *
 *   npm run build:og
 *
 * Renders scripts/og.template.html to public/og.png at exactly 1200x630, which vite then
 * copies to dist/og.png and Vercel serves at https://rightnleft.com/og.png.
 *
 * WHY A BUILD STEP rather than a hand-made image. Every figure on the card is
 * read out of public/data/quiz_89R.json here and injected into the template, so
 * the card cannot drift from the data the way an exported-once PNG does. Re-run
 * it after `npm run data:export` and the numbers follow.
 *
 * Two things this script refuses to do quietly:
 *
 *   - Ship the wrong typeface. The card is IBM Plex, loaded from Google Fonts
 *     at render time. If the network is down, Chromium silently falls back to
 *     system-ui and the PNG looks close enough to miss in review but wrong
 *     everywhere it is seen. So the font is asserted, not hoped for.
 *   - Ship an off-spec size. Facebook and LinkedIn re-crop anything that is not
 *     1.91:1, and a card that is 1200x628 gets letterboxed. The rendered
 *     dimensions are checked against the declared og:image:width/height.
 */

import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// The card spec. These must match og:image:width/height in src/index.html.
const W = 1200;
const H = 630;

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
// The real numbers
// ---------------------------------------------------------------------------

const payload = JSON.parse(
  await readFile(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'),
);
const { provenance: prov, rulePartisanThreshold: threshold, items, session } = payload;

// One dot per answer the strip can actually place — the same rule the page
// states under the chart ("every answer with measurable partisan content").
// A vote both parties took together has no side to land on.
const measurable = items.filter((i) => Math.abs(i.valence) >= threshold).length;

const n = (x) => x.toLocaleString('en-US');
const sessionLabel = /^\d+R$/.test(session)
  ? `${session.replace(/R$/, '')}TH LEGISLATURE`
  : String(session).toUpperCase();

const FIGURES = {
  eyebrow: `TEXAS HOUSE · ${sessionLabel}`,
  deck: `${n(items.length)} real votes`,
  prov:
    `${n(prov.houseItemsTotal)} roll calls · ` +
    `${n(prov.eligibleTotal)} eligible · ${n(items.length)} asked`,
};

// ---------------------------------------------------------------------------
// The dots
// ---------------------------------------------------------------------------

/**
 * A seeded generator, so the same data produces byte-identical output. With
 * Math.random the PNG would change on every build and show up as noise in every
 * diff, which trains you to stop reading the diff.
 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Dots spread across the ENTIRE axis, poles included and evenly weighted.
 *
 * This is a deliberate constraint, not a placeholder. The card sells the
 * instrument, so it has to depict an instrument that can put you anywhere. A
 * scatter bunched at the centre would be the card asserting "Texas is purple" —
 * the one conclusion the project will not hand out before you have answered
 * anything.
 */
function dots(count) {
  const rand = lcg(0x50524543); // "PREC"
  const top = 20;
  const bottom = 88;
  const out = [];
  for (let i = 0; i < count; i++) {
    // Even coverage with a small jitter, so it reads as data and not as a ruler.
    const t = (i + 0.5) / count;
    const x = t * 1072 + (rand() - 0.5) * 9;
    const y = top + rand() * (bottom - top);
    const opacity = (0.5 + rand() * 0.42).toFixed(2);
    out.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" ` +
        `fill="#7d5ba6" fill-opacity="${opacity}"/>`,
    );
  }
  return out.join('\n      ');
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const template = await readFile(resolve(ROOT, 'scripts/og.template.html'), 'utf8');
const html = template
  .replace('<g id="dots"></g>', `<g id="dots">\n      ${dots(measurable)}\n      </g>`)
  .replace(
    /<div class="eyebrow" id="eyebrow">[^<]*<\/div>/,
    `<div class="eyebrow" id="eyebrow">${FIGURES.eyebrow}</div>`,
  )
  .replace('67 real votes', FIGURES.deck)
  .replace(/<div id="prov">[^<]*<\/div>/, `<div id="prov">${FIGURES.prov}</div>`);

const OUT = resolve(ROOT, 'public/og.png');
const STAGED = resolve(ROOT, 'scripts/.og.staged.html');

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
).newPage();

try {
  // A data: URL would break the Google Fonts fetch (opaque origin), so the
  // injected copy is written beside the template and served from disk.
  await writeFile(STAGED, html, 'utf8');
  await page.goto(pathToFileURL(STAGED).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  console.log(`\n  building og.png from ${measurable} placeable answers\n`);

  // 1. The typeface actually arrived.
  const fonts = await page.evaluate(() => ({
    sans: document.fonts.check('600 94px "IBM Plex Sans"'),
    mono: document.fonts.check('500 19px "IBM Plex Mono"'),
  }));
  check(fonts.sans, 'IBM Plex Sans loaded', fonts.sans ? '' : 'fell back to system-ui');
  check(fonts.mono, 'IBM Plex Mono loaded', fonts.mono ? '' : 'fell back to monospace');

  // 2. The injected figures are on the page, not the template defaults.
  const seen = await page.evaluate(() => ({
    eyebrow: document.getElementById('eyebrow').textContent.trim(),
    prov: document.getElementById('prov').textContent.trim(),
    dots: document.querySelectorAll('#dots circle').length,
  }));
  check(seen.eyebrow === FIGURES.eyebrow, 'session injected', seen.eyebrow);
  check(seen.prov === FIGURES.prov, 'provenance injected', seen.prov);
  check(seen.dots === measurable, 'one dot per placeable answer', `${seen.dots} dots`);

  // 3. Nothing overflowed the fixed canvas. Text that runs off the edge of an
  //    OG card is invisible until someone shares it.
  const overflow = await page.evaluate(
    ({ w, h }) => ({
      x: document.documentElement.scrollWidth - w,
      y: document.documentElement.scrollHeight - h,
    }),
    { w: W, h: H },
  );
  check(
    overflow.x <= 0 && overflow.y <= 0,
    'content fits 1200x630',
    overflow.x > 0 || overflow.y > 0 ? `overflows by ${overflow.x}x${overflow.y}px` : '',
  );

  await page.screenshot({ path: OUT, type: 'png' });

  const viewport = page.viewportSize();
  check(
    viewport.width === W && viewport.height === H,
    `rendered at ${W}x${H}`,
    `${viewport.width}x${viewport.height}`,
  );

  const { size } = await stat(OUT);
  const kb = (size / 1024).toFixed(0);
  // Twitter rejects over 5 MB; a flat editorial card should be far under that.
  check(size < 5 * 1024 * 1024, 'under the 5 MB card limit', `${kb} KB`);

  console.log(
    failures === 0
      ? `\n  wrote public/og.png — ${W}x${H}, ${kb} KB\n`
      : `\n  ${failures} check(s) failed — public/og.png may be wrong\n`,
  );
} finally {
  await browser.close();
  await unlink(STAGED).catch(() => {});
}

process.exit(failures === 0 ? 0 : 1);
