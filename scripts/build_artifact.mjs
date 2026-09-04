/**
 * PlainRecord — single-file share build
 *
 *   npm run build && node scripts/build_artifact.mjs
 *   -> share/artifact.html
 *
 * The deployed site is HTML + a fingerprinted CSS file + a fingerprinted JS
 * bundle. A Claude Artifact is ONE file with no head/body wrapper of its own, so
 * this flattens the build: the stylesheet becomes a <style>, the module becomes an
 * inline <script type="module">, and the doctype/html/head/body scaffolding is
 * dropped (the artifact host supplies it).
 *
 * This exists so the shareable page and the real site cannot drift. Both come from
 * the same `vite build` output — the share build is a transform of dist/, never a
 * separately maintained copy. Hand-editing a prototype copy is exactly how the
 * plain-language headline rewrite ended up landing in one and not the other.
 *
 * Two rewrites are deliberate, and both are reported on stdout:
 *
 *   - the payload link is relative on the site (`/data/...`) and absolute here,
 *     because a single file served from claude.ai has no /data/ beside it;
 *   - the `— PlainRecord` title suffix is dropped, because an artifact is
 *     identified by its name and a changed title reads as a different page.
 *
 * Everything else is byte-identical to what ships. Output goes to share/, never
 * dist/ — see the note by the write.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const CANONICAL_ORIGIN = 'https://rightnleft.com';
const CANONICAL_PAYLOAD = `${CANONICAL_ORIGIN}/data/quiz_89R.json`;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('\n  dist/index.html not found — run `npm run build` first.\n');
  process.exit(1);
}

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

/** Pull an asset referenced by dist/index.html off disk. */
const readAsset = (href) => {
  const file = join(DIST, href.replace(/^\//, ''));
  if (!existsSync(file)) throw new Error(`dist/index.html references ${href}, which is not in dist/`);
  return readFileSync(file, 'utf8');
};

// --- inline the local stylesheet, leave the Google Fonts <link> alone ---------
let cssCount = 0;
html = html.replace(
  /<link[^>]*rel=["']stylesheet["'][^>]*href=["'](\/assets\/[^"']+\.css)["'][^>]*>/gi,
  (_m, href) => {
    cssCount++;
    return `<style>\n${readAsset(href)}\n</style>`;
  },
);

// --- inline the module bundle ------------------------------------------------
let jsCount = 0;
html = html.replace(
  /<script[^>]*src=["'](\/assets\/[^"']+\.js)["'][^>]*><\/script>/gi,
  (_m, src) => {
    jsCount++;
    return `<script type="module">\n${readAsset(src)}\n</script>`;
  },
);

if (!cssCount || !jsCount) {
  // Silently shipping a page with no styles or no behaviour is worse than failing.
  console.error(
    `\n  refusing to write: inlined ${cssCount} stylesheet(s) and ${jsCount} script(s).\n` +
      '  dist/index.html did not look the way this script expects — check the Vite\n' +
      '  output filenames before trusting artifact.html.\n',
  );
  process.exit(1);
}

// --- the artifact's name must not drift -------------------------------------
// The browser-tab title carries the project name for search results; the artifact
// is identified in a gallery by its own name, and a changed title reads as a
// different page. Strip the suffix so republishing never renames it.
html = html.replace(
  /<title>([^<]*?)\s+—\s+PlainRecord<\/title>/i,
  (_m, name) => `<title>${name}</title>`,
);

// --- every /data/ link has to be absolute here -------------------------------
//
// Was a per-file replace for quiz_89R.json alone, which silently broke when the
// district lookup added members_89R.json and then zips_89R.json: the artifact
// has no /data/ directory beside it, so those fetches 404 and the panel does
// nothing at all. Rewriting by pattern means a future data file is covered
// without anyone remembering to come back here, and the assertion below fails
// the build rather than shipping a dead lookup.
const before = html;
const DATA_LINK = /"\/data\/([A-Za-z0-9_.-]+\.json)"/g;
html = html.replace(DATA_LINK, (_m, f) => `"${CANONICAL_ORIGIN}/data/${f}"`);
const payloadRewritten = html !== before;

const stillRelative = [...html.matchAll(/"\/data\/[^"]+"/g)].map((m) => m[0]);
if (stillRelative.length) {
  throw new Error(
    'relative /data/ links left in the artifact, which cannot resolve there: ' +
    stillRelative.join(', '),
  );
}

// --- strip the wrapper the artifact host provides ---------------------------
// Keep <title> and everything else from <head>; only the scaffolding tags go.
html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*$/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body[^>]*>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  // The host already sets these two.
  .replace(/<meta charset=["'][^"']*["']>\s*/i, '')
  .replace(/<meta name=["']viewport["'][^>]*>\s*/i, '')
  // Canonical/og tags describe the deployed site, not the artifact.
  .replace(/<link[^>]*rel=["']canonical["'][^>]*>\s*/gi, '')
  .replace(/<meta[^>]*property=["']og:url["'][^>]*>\s*/gi, '')
  .trim();

// Deliberately OUTSIDE dist/. Everything in dist/ deploys, and a flattened copy
// of the whole site sitting at /artifact.html is a crawlable duplicate of the real
// page — same content, a second URL, and robots.txt allowing both.
const outDir = join(ROOT, 'share');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'artifact.html');
writeFileSync(out, html + '\n');

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(
  `\n  inlined ${cssCount} stylesheet, ${jsCount} script` +
    `${payloadRewritten ? ', payload link -> ' + CANONICAL_PAYLOAD : ''}\n` +
    `  -> ${out}  (${kb(Buffer.byteLength(html))})\n`,
);
