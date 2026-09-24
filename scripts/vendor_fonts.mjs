/**
 * PlainRecord — pull the three webfonts local, so no visitor request reaches Google.
 *
 *   npm run fonts:vendor          # download + write public/fonts/ and src/fonts.css
 *   npm run fonts:vendor -- --check   # verify what is on disk still matches
 *
 * WHY
 *
 * The page used to load its fonts from fonts.googleapis.com and fonts.gstatic.com.
 * That is two third-party requests on every page load, before any interaction,
 * and it hands Google the visitor's IP address. On a site whose whole claim is
 * that it asks nothing of the reader, that is a real leak and not a theoretical
 * one — and it sat directly underneath a privacy paragraph that did not mention
 * it.
 *
 * HOW, AND WHY NOT BY HAND
 *
 * Google's CSS is not one @font-face per family. It is one per unicode subset,
 * each with a `unicode-range` that lets the browser skip downloading Cyrillic or
 * Vietnamese for an English reader. Hand-copying the latin block only would
 * silently break any character outside it, and the Spanish page is full of
 * characters a careless subset drops.
 *
 * So this fetches the real stylesheet with a modern browser's user agent — send
 * anything else and Google serves ttf instead of woff2 — keeps every @font-face
 * block and every unicode-range exactly as served, and rewrites only the url()
 * to point at the local copy. The result renders identically and downloads the
 * same subsets, from our own origin.
 *
 * CACHED AS IMMUTABLE. vercel.json serves /fonts/* with max-age one year and
 * immutable, so a browser that has a file never asks for it again. If a face is
 * ever re-vendored with different bytes, it must get a NEW FILENAME, or every
 * returning reader keeps the old one for a year.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/fonts');
const OUT_CSS = resolve(ROOT, 'src/fonts.css');
const checkOnly = process.argv.includes('--check');

// Exactly the families, weights and axes src/index.html used to request. Change
// this and the page changes; it is the one line worth reviewing.
// NOTE the Newsreader axis. index.html asked for three discrete weights,
// `400;6..72,500;6..72,600`, and Google answers that with three separate static
// instances: 132 KB each for latin, 396 KB for one alphabet. Asking for the
// RANGE `400..600` returns one variable face covering all three continuously,
// renders identically at every weight the stylesheet uses, and costs a third of
// the bytes. Lexend was already a range.
const HREF =
  'https://fonts.googleapis.com/css2?family=Lexend:wght@300..700' +
  '&family=Newsreader:opsz,wght@6..72,400..600' +
  '&family=IBM+Plex+Mono:wght@400;500&display=swap';

// Chrome's UA, because the CSS Google returns depends on it. An old or absent
// UA gets ttf, which is roughly twice the bytes and defeats the point.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/130.0.0.0 Safari/537.36';

const log = (s) => console.log(s);

const css = await (await fetch(HREF, { headers: { 'User-Agent': UA } })).text();
if (!css.includes('@font-face')) throw new Error('Google returned no @font-face blocks');
if (!css.includes('woff2')) throw new Error('Google returned no woff2 — check the User-Agent');

// One entry per @font-face: which family, which subset comment precedes it, and
// the remote url to fetch.
const blocks = [...css.matchAll(/\/\*\s*([\w-\[\]]+)\s*\*\/\s*@font-face\s*\{[^}]*\}/g)];
if (!blocks.length) throw new Error('could not parse the stylesheet into @font-face blocks');

mkdirSync(OUT_DIR, { recursive: true });

let out = `/* Vendored from Google Fonts by scripts/vendor_fonts.mjs. Do not edit by hand.
   Source: ${HREF}
   Every @font-face and unicode-range below is exactly as Google served it; only
   the url() is rewritten to this origin. Re-run the script to refresh. */\n\n`;

let downloaded = 0, reused = 0, bytes = 0;
const seen = new Set();

for (const [block, subset] of blocks) {
  const famMatch = block.match(/font-family:\s*'([^']+)'/);
  const urlMatch = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  const styleMatch = block.match(/font-style:\s*([\w]+)/);
  // Variable fonts give a range here ("300 700"); static ones give one number.
  // IBM Plex Mono is static and requested at two weights, so without this the
  // 400 and 500 faces of a subset collide on one filename.
  const weightMatch = block.match(/font-weight:\s*([\d\s]+?);/);
  if (!famMatch || !urlMatch) continue;

  const family = famMatch[1];
  const style = styleMatch ? styleMatch[1] : 'normal';
  const weight = (weightMatch ? weightMatch[1] : '400').trim().replace(/\s+/g, '-');
  const slug = `${family.toLowerCase().replace(/\s+/g, '-')}-${subset}-${weight}${
    style === 'italic' ? '-italic' : ''}.woff2`;
  const dest = resolve(OUT_DIR, slug);

  if (seen.has(slug)) throw new Error(`two @font-face blocks want the same file: ${slug}`);
  seen.add(slug);

  if (!existsSync(dest)) {
    const buf = Buffer.from(await (await fetch(urlMatch[1], { headers: { 'User-Agent': UA } })).arrayBuffer());
    if (buf.length < 1000) throw new Error(`${slug} came back at ${buf.length} bytes`);
    if (checkOnly) { log(`  MISSING  ${slug}`); }
    else { writeFileSync(dest, buf); downloaded++; }
    bytes += buf.length;
  } else {
    reused++;
    bytes += statSync(dest).size;
  }

  out += block.replace(urlMatch[1], `/fonts/${slug}`) + '\n\n';
}

if (checkOnly) {
  const current = existsSync(OUT_CSS) ? readFileSync(OUT_CSS, 'utf8') : '';
  const same = createHash('sha256').update(current).digest('hex')
    === createHash('sha256').update(out).digest('hex');
  log(`\n  ${seen.size} face(s), ${(bytes / 1024).toFixed(0)} KB on disk`);
  log(same ? '  src/fonts.css matches what Google serves today\n'
           : '  src/fonts.css DIFFERS from what Google serves today — re-run without --check\n');
  process.exitCode = same ? 0 : 1;
} else {
  writeFileSync(OUT_CSS, out);
  log(`\n  ${seen.size} face(s): ${downloaded} downloaded, ${reused} already present`);
  log(`  ${(bytes / 1024).toFixed(0)} KB in public/fonts/`);
  log(`  wrote src/fonts.css\n`);
}
