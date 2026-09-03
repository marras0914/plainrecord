/**
 * PlainRecord — build the Open Graph share cards
 *
 *   npm run build:og                 # both locales
 *   node scripts/build_og.mjs --locale es
 *
 * Renders scripts/og.template.html to public/og.png (English) and
 * public/og.es.png (Spanish), which vite copies to dist/ and Vercel serves at
 * https://rightnleft.com/og.png and /og.es.png.
 *
 * WHY A BUILD STEP rather than a hand-made image. Every figure on the card is
 * read out of public/data/quiz_89R.json here and every word out of
 * i18n/copy.json, so the card cannot drift from the data or from the site's own
 * wording the way an exported-once PNG does. Re-run it after
 * `npm run data:export` and the numbers follow; re-run it after editing copy and
 * the words follow.
 *
 * Three things this script refuses to do quietly:
 *
 *   - Ship the wrong typeface. The card is IBM Plex, loaded from Google Fonts
 *     at render time. If the network is down, Chromium silently falls back to
 *     system-ui and the PNG looks close enough to miss in review but wrong
 *     everywhere it is seen. So the font is asserted, not hoped for.
 *   - Ship an off-spec size. Facebook and LinkedIn re-crop anything that is not
 *     1.91:1, and a card that is 1200x628 gets letterboxed.
 *   - Ship OVERLAPPING AXIS LABELS. This is the one Spanish introduced: the
 *     three labels are positioned at the two ends and the centre of a fixed
 *     1072px axis, and "COINCIDIÓ CON LOS REPUBLICANOS" is 30 characters where
 *     "AGREED WITH REPUBLICANS" is 23. Nothing about a longer translation is
 *     visible in the copy file, so the rendered boxes are measured.
 */

import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// The card spec. These must match og:image:width/height in the built pages.
const W = 1200;
const H = 630;

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

// ---------------------------------------------------------------------------
// The real numbers, and the real words
// ---------------------------------------------------------------------------

const payload = JSON.parse(
  await readFile(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'),
);
const copy = JSON.parse(await readFile(resolve(ROOT, 'i18n/copy.json'), 'utf8'));

const { provenance: prov, rulePartisanThreshold: threshold, items, session } = payload;

// One dot per answer the strip can actually place — the same rule the page
// states under the chart ("every answer with measurable partisan content").
// A vote both parties took together has no side to land on.
const measurable = items.filter((i) => Math.abs(i.valence) >= threshold).length;

/** A copy value with {placeholders} filled, by name. */
function t(key, locale, vars = {}) {
  const e = copy[key];
  if (!e) throw new Error(`build_og: no copy key "${key}"`);
  const template = e[locale] ?? e.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    (vars[name] === undefined ? whole : String(vars[name])));
}

const n = (x, locale) => x.toLocaleString(locale === 'es' ? 'es-MX' : 'en-US');

/**
 * "89R" as an ordinal, per locale: 89TH / 89.ª.
 *
 * Spanish ordinals are not a suffix swap — the feminine ordinal for
 * "Legislatura" is "89.ª", and writing "89TH" on a Spanish card is the kind of
 * detail that tells a reader the page was not really translated.
 */
function sessionLabel(locale) {
  const m = /^(\d+)R$/.exec(String(session));
  if (!m) return String(session).toUpperCase();
  return locale === 'es' ? `${m[1]}.ª` : `${m[1]}TH`;
}

// ---------------------------------------------------------------------------
// The dots
// ---------------------------------------------------------------------------

/**
 * A seeded generator, so the same data produces byte-identical output. With
 * Math.random the PNG would change on every build and show up as noise in every
 * diff, which trains you to stop reading the diff. The seed is fixed across
 * locales too, so the two cards carry the same scatter and read as one design.
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
    const t2 = (i + 0.5) / count;
    const x = t2 * 1072 + (rand() - 0.5) * 9;
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

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch();

for (const locale of LOCALES) {
  const FIGURES = {
    eyebrow: t('og.eyebrow', locale, { session: sessionLabel(locale) }),
    title: t('intro.h1', locale).replace(/ /g, '&nbsp;'),
    deck: t('og.deck', locale, { n: n(items.length, locale) }),
    axisD: t('og.axisD', locale),
    axisMid: t('og.axisMid', locale),
    axisR: t('og.axisR', locale),
    prov: t('og.prov', locale, {
      rollcalls: n(prov.houseItemsTotal, locale),
      eligible: n(prov.eligibleTotal, locale),
      asked: n(items.length, locale),
    }),
  };

  const setText = (html, id, value) =>
    html.replace(
      new RegExp(`(<(\\w+)[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</\\2>)`),
      (_w, open, _tag, _body, close) => `${open}${value}${close}`,
    );

  let html = template
    .replace('<g id="dots"></g>', `<g id="dots">\n      ${dots(measurable)}\n      </g>`);
  html = setText(html, 'eyebrow', FIGURES.eyebrow);
  html = setText(html, 'title', FIGURES.title);
  html = setText(html, 'deck', FIGURES.deck);
  html = setText(html, 'axis-d', FIGURES.axisD);
  html = setText(html, 'axis-mid', FIGURES.axisMid);
  html = setText(html, 'axis-r', FIGURES.axisR);
  html = setText(html, 'prov', FIGURES.prov);
  html = html.replace('<html lang="en">', `<html lang="${locale}">`);

  const OUT = resolve(ROOT, locale === 'es' ? 'public/og.es.png' : 'public/og.png');
  const STAGED = resolve(ROOT, `scripts/.og.staged.${locale}.html`);

  const page = await (
    await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  ).newPage();

  try {
    // A data: URL would break the Google Fonts fetch (opaque origin), so the
    // injected copy is written beside the template and served from disk.
    await writeFile(STAGED, html, 'utf8');
    await page.goto(pathToFileURL(STAGED).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    console.log(`\n  ${locale} — ${measurable} placeable answers\n`);

    const fonts = await page.evaluate(() => ({
      sans: document.fonts.check('600 94px "IBM Plex Sans"'),
      mono: document.fonts.check('500 19px "IBM Plex Mono"'),
    }));
    check(fonts.sans, `${locale}: IBM Plex Sans loaded`, fonts.sans ? '' : 'fell back to system-ui');
    check(fonts.mono, `${locale}: IBM Plex Mono loaded`, fonts.mono ? '' : 'fell back to monospace');

    const seen = await page.evaluate(() => ({
      eyebrow: document.getElementById('eyebrow').textContent.trim(),
      prov: document.getElementById('prov').textContent.trim(),
      title: document.getElementById('title').textContent.trim(),
      dots: document.querySelectorAll('#dots circle').length,
    }));
    check(seen.eyebrow === FIGURES.eyebrow, `${locale}: session injected`, seen.eyebrow);
    check(seen.prov === FIGURES.prov, `${locale}: provenance injected`, seen.prov);
    check(seen.dots === measurable, `${locale}: one dot per placeable answer`, `${seen.dots} dots`);
    check(seen.title.length > 0, `${locale}: title injected`, seen.title);

    // The axis labels must not touch. Spanish is 30% longer here and the three
    // boxes are pinned to fixed x positions, so this is measured rather than
    // eyeballed once and assumed.
    const boxes = await page.evaluate(() =>
      ['axis-d', 'axis-mid', 'axis-r'].map((id) => {
        const b = document.getElementById(id).getBoundingClientRect();
        return { id, left: Math.round(b.left), right: Math.round(b.right) };
      }));
    const gapDM = boxes[1].left - boxes[0].right;
    const gapMR = boxes[2].left - boxes[1].right;
    check(gapDM > 8 && gapMR > 8, `${locale}: axis labels do not collide`,
      `gaps ${gapDM}px / ${gapMR}px`);

    const overflow = await page.evaluate(
      ({ w, h }) => ({
        x: document.documentElement.scrollWidth - w,
        y: document.documentElement.scrollHeight - h,
      }),
      { w: W, h: H },
    );
    check(overflow.x <= 0 && overflow.y <= 0, `${locale}: content fits ${W}x${H}`,
      overflow.x > 0 || overflow.y > 0 ? `overflows by ${overflow.x}x${overflow.y}px` : '');

    await page.screenshot({ path: OUT, type: 'png' });

    const { size } = await stat(OUT);
    const kb = (size / 1024).toFixed(0);
    check(size < 5 * 1024 * 1024, `${locale}: under the 5 MB card limit`, `${kb} KB`);
    console.log(`  wrote public/${locale === 'es' ? 'og.es.png' : 'og.png'} — ${W}x${H}, ${kb} KB`);
  } finally {
    await page.close();
    await unlink(STAGED).catch(() => {});
  }
}

await browser.close();
console.log(failures === 0 ? '\n  share cards built\n' : `\n  ${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
