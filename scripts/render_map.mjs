/**
 * Rasterise an SVG through the browser that is already a dependency.
 *
 * The validator checks colour, not layout. This exists so the map gets looked
 * at — label collisions, dots off the coast, text running past the edge — before
 * it goes anywhere.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const src = process.argv[2];
const out = process.argv[3] ?? src.replace(/\.svg$/, '.png');
if (!src) throw new Error('usage: node scripts/render_map.mjs <in.svg> [out.png]');

const svg = readFileSync(src, 'utf8');
const w = Number(/width="(\d+)"/.exec(svg)?.[1]);
const h = Number(/height="(\d+)"/.exec(svg)?.[1]);
if (!w || !h) throw new Error(`${src}: no width/height on the root svg`);

// Wrapped in an HTML document rather than opened as an SVG document: a
// standalone SVG has no <head>, so there is nowhere to attach the font face the
// map asks for, and it would silently render in the Georgia fallback.
// The site's own vendored faces, inlined as data URIs.
//
// Not as file:// URLs: setContent gives the page no origin, so every such
// subresource is refused and the map renders in the fallback serif while
// looking almost right. The check below turns that into a hard failure, but
// embedding the bytes means it cannot happen in the first place. Only the faces
// the map actually asks for are read.
const FACES = /url\(\/fonts\/([^)]+)\)/g;
const fontCss = readFileSync('src/fonts.css', 'utf8').replace(FACES, (_, file) => {
  if (!/^newsreader-/.test(file)) return 'url(about:blank)';
  const b64 = readFileSync(resolve('public/fonts', file)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});
const html = `<!doctype html><meta charset="utf-8">
<style>${fontCss}</style>
<style>html,body{margin:0;padding:0;background:#faf7f1}svg{display:block}</style>
${svg}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(async () => { await document.fonts.ready; });
// A render in the fallback serif looks almost right, which is exactly why this
// refuses to write one rather than warning about it.
const loaded = await page.evaluate(() => document.fonts.check('600 58px Newsreader'));
if (!loaded) throw new Error('Newsreader did not load; the render would be in the fallback serif');
writeFileSync(out, await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } }));
await browser.close();
console.log(`  ${out}  ${w}x${h}`);
