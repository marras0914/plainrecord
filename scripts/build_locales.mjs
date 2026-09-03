/**
 * PlainRecord — emit the localised pages
 *
 *   npm run build:locales        # after `npm run build`
 *
 * Rewrites dist/index.html for English and writes dist/es/index.html for
 * Spanish, filling every `data-i18n` slot from i18n/copy.json and fixing up the
 * head: lang, title, description, canonical, og:url, og:locale, and the
 * hreflang pair.
 *
 * WHY A BUILD STEP AND NOT t() IN THE PAGE. The header explainer and the
 * authorship card are static HTML on purpose — the authorship card is the one
 * section a skeptic reads first, and rendering it from JS would make the
 * project's central disclosure the only part of the page that needs a working
 * script to exist. Substituting at build time keeps both properties: one source
 * of copy, and a disclosure that is in the HTML a crawler downloads.
 *
 * The locale is chosen by PATH, and src/i18n.ts reads the same path at runtime,
 * so the static text and the rendered text always agree about which language
 * this document is.
 *
 * Two things this refuses to do quietly:
 *
 *   - Fill a slot whose key does not exist. A typo in a data-i18n attribute
 *     would otherwise blank an element, and the blanked one would probably be a
 *     paragraph nobody notices is missing.
 *   - Emit a Spanish page while any string is still unapproved, or while the
 *     payload prose sidecar is absent. Half-translated is worse than English:
 *     Spanish headings over English sentences reads as machine output, on a page
 *     whose whole argument is that it is careful.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = resolve(ROOT, 'dist');

const SITE = 'https://rightnleft.com';
const ES_PREFIX = '/es';

const argv = process.argv.slice(2);
const force = argv.includes('--force');

const copy = JSON.parse(await readFile(resolve(ROOT, 'i18n/copy.json'), 'utf8'));
const entries = Object.fromEntries(Object.entries(copy).filter(([k]) => k !== '_meta'));

let failures = 0;
const say = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

console.log('');

// ---------------------------------------------------------------------------
// Gates on the Spanish page
// ---------------------------------------------------------------------------

const unapproved = Object.entries(entries).filter(([, e]) => e.status !== 'ok').map(([k]) => k);
say(unapproved.length === 0, 'every string approved by a reviewer',
  unapproved.length ? `${unapproved.length} still draft: ${unapproved.slice(0, 3).join(', ')}…` : `${Object.keys(entries).length} keys`);

// The payload carries prose of its own — comparatorRule, candidateProvenance,
// the outcome caveats, the 67 official captions. None of it is in copy.json,
// because it is keyed by item id and belongs in a sidecar. Without that sidecar
// the Spanish page renders Spanish headings above English payload sentences.
// Reported, NOT a failure. A missing sidecar blocks the Spanish page; it does
// not make the English build wrong, and failing here would break `npm run
// build` for everyone until the sidecar lands.
const SIDECAR = resolve(ROOT, 'public/data/quiz_89R.es.json');
const haveSidecar = await exists(SIDECAR);
console.log(`  [${haveSidecar ? 'PASS' : ' -- '}] payload prose sidecar` +
  `  — ${haveSidecar ? 'public/data/quiz_89R.es.json' : 'absent, so es/ is held back'}`);

const emitSpanish = unapproved.length === 0 && (haveSidecar || force);

// ---------------------------------------------------------------------------
// Substitution
// ---------------------------------------------------------------------------

const missingKeys = new Set();

/**
 * Values shared by every substituted string.
 *
 * Only two keys need them — the share-card alt text quotes the question count
 * and the dot count — but passing the set unconditionally means a copy edit that
 * introduces {n} into a slot that did not have it needs no change here.
 */
const payload = JSON.parse(
  await readFile(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'),
);
const VARS = {
  n: payload.items.length,
  dots: payload.items.filter(
    (i) => Math.abs(i.valence) >= payload.rulePartisanThreshold,
  ).length,
};

/** The copy value for `key` in `locale`, or null with the key recorded. */
function value(key, locale) {
  const e = entries[key];
  if (!e) { missingKeys.add(key); return null; }
  const template = e[locale] ?? e.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    (VARS[name] === undefined ? whole : String(VARS[name])));
}

/**
 * Replace the content of every element carrying data-i18n, and the content
 * attribute of every element carrying data-i18n-content.
 *
 * Deliberately a regex over the built HTML rather than a DOM parse: the input is
 * one file this repo generates, the attribute is unique, and a parser would
 * reformat the rest of the document — which makes the diff between the English
 * page and the Spanish one unreadable, and that diff is the only way to eyeball
 * whether this step did the right thing.
 */
function localise(html, locale) {
  let out = html;

  // <tag ... data-i18n="key" ...>anything</tag>
  out = out.replace(
    /(<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    (whole, open, _tag, key, _body, close) => {
      const v = value(key, locale);
      return v === null ? whole : `${open}${v}${close}`;
    },
  );

  // <meta ... data-i18n-content="key" ... content="...">
  //
  // `\scontent=` and NOT `\bcontent=`. \b matches at the hyphen boundary inside
  // `data-i18n-content="`, so the naive version rewrote the KEY attribute and
  // left the real content untouched — invisibly on the English page, where the
  // value it wrote happened to be the English text anyway. Requiring whitespace
  // makes it match only a standalone attribute.
  out = out.replace(
    /(<meta\b[^>]*\bdata-i18n-content="([^"]+)"[^>]*>)/g,
    (whole, tag, key) => {
      const v = value(key, locale);
      if (v === null) return whole;
      return tag.replace(/\scontent="[^"]*"/, ` content="${v.replace(/"/g, '&quot;')}"`);
    },
  );

  return out;
}

/** Head fixups that are per-locale but not copy: lang, urls, hreflang. */
function head(html, locale) {
  // No trailing slash on /es, because vercel.json sets `trailingSlash: false`
  // and /es/ therefore 308s to /es. A canonical or an hreflang that points at a
  // redirect is a canonical pointing at the wrong URL. The root is exempt: "/"
  // is the canonical form of itself and redirects nowhere.
  const selfUrl = locale === 'es' ? `${SITE}${ES_PREFIX}` : `${SITE}/`;
  const altUrl = locale === 'es' ? `${SITE}/` : `${SITE}${ES_PREFIX}`;

  let out = html
    .replace(/<html lang="[^"]*">/, `<html lang="${locale}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${selfUrl}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${selfUrl}">`);

  // The share card is a rendered image, so it has one per locale rather than one
  // with a translated caption. Without this the Spanish page's og:title reads
  // "La Franja Morada" over a picture that says "The Purple Strip", which is
  // the specific kind of half-translation this whole build is set up to refuse.
  if (locale === 'es') {
    const card = `${SITE}/og.es.png`;
    out = out
      .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${card}">`)
      .replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${card}">`);
  }

  // hreflang, both directions plus x-default. Search engines need each page to
  // point at every version INCLUDING itself, or the pair is ignored.
  const alternates =
    `  <link rel="alternate" hreflang="en" href="${SITE}/">\n` +
    `  <link rel="alternate" hreflang="es" href="${SITE}${ES_PREFIX}">\n` +
    `  <link rel="alternate" hreflang="x-default" href="${SITE}/">\n` +
    `  <meta property="og:locale" content="${locale === 'es' ? 'es_US' : 'en_US'}">\n`;
  out = out.replace(/(\s*<link rel="canonical")/, `\n${alternates}$1`);

  // The stylesheet is emitted by vite as an absolute /assets/ path, so the
  // Spanish page at /es/ loads the same CSS and the same bundle. Asserted below
  // rather than assumed, because a relative href would 404 one directory down
  // and the page would render unstyled.
  return { out, selfUrl, altUrl };
}

/** The language switch, injected as the first thing in the header. */
function langSwitch(locale) {
  // Same reason as the canonical: `${ES_PREFIX}/` would send every reader who
  // clicks the switch through a redirect.
  const href = locale === 'es' ? '/' : ES_PREFIX;
  // Look up the CURRENT locale, not the other one. page.langSwitch is already
  // stored reversed — its `en` value is the Spanish words "En español", because
  // the reader who needs the link cannot read the page they are on. Fetching the
  // other locale's value flips it back and shows each page its own language,
  // which is the one label that is no use to anybody.
  const label = value('page.langSwitch', locale);
  const other = locale === 'es' ? 'en' : 'es';
  return (
    `<div class="langswitch">` +
    `<a href="${href}" lang="${other}" hreflang="${other}">${label}</a>` +
    `</div>`
  );
}

/** The Spanish page says, on the page, that its Spanish is unofficial. */
function translationNotice(locale) {
  if (locale !== 'es') return '';
  return `<p class="xl-note">${value('page.translationNotice', 'es')}</p>`;
}

const src = await readFile(resolve(DIST, 'index.html'), 'utf8');

const slots = [...src.matchAll(/data-i18n(?:-content)?="([^"]+)"/g)].map((m) => m[1]);
say(slots.length > 0, 'dist/index.html carries data-i18n slots', `${slots.length} slots`);
say(/src="\/assets\//.test(src) && /href="\/assets\//.test(src),
  'assets are absolute paths', 'so /es/ can share the bundle');

for (const locale of emitSpanish ? ['en', 'es'] : ['en']) {
  let html = localise(src, locale);
  const { out } = head(html, locale);
  html = out;

  // Language switch + notice go inside <header>, before the eyebrow.
  html = html.replace(
    /(<header>\s*)/,
    `$1${langSwitch(locale)}${translationNotice(locale)}\n    `,
  );

  const target = locale === 'es'
    ? resolve(DIST, 'es', 'index.html')
    : resolve(DIST, 'index.html');
  if (locale === 'es') await mkdir(resolve(DIST, 'es'), { recursive: true });
  await writeFile(target, html, 'utf8');

  // A key never contains a space. If one does, a substitution wrote a SENTENCE
  // into the key attribute instead of into content — which is exactly what
  // `\bcontent=` did, and it was invisible on the English page because the
  // sentence it misplaced was the English one.
  const clobbered = [...html.matchAll(/data-i18n(?:-content)?="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((k) => /\s/.test(k));
  say(clobbered.length === 0, `${locale}: no key attribute was overwritten`,
    clobbered.length ? `clobbered: "${clobbered[0].slice(0, 48)}…"` : '');

  const left = [...html.matchAll(/data-i18n(?:-content)?="([^"]+)"/g)].length;
  say(true, `wrote ${locale === 'es' ? 'dist/es/index.html' : 'dist/index.html'}`,
    `${left} slots kept for reference`);
}

say(missingKeys.size === 0, 'every data-i18n key exists in copy.json',
  missingKeys.size ? [...missingKeys].join(', ') : '');

if (!emitSpanish) {
  console.log(
    '\n  Spanish page NOT emitted.\n' +
    (unapproved.length ? '    · strings still unapproved\n' : '') +
    (!haveSidecar ? '    · public/data/quiz_89R.es.json is missing, so payload prose\n' +
                    '      (comparatorRule, candidateProvenance, outcome caveats, the 67\n' +
                    '      official captions) would render in English under Spanish headings\n' : '') +
    '    · re-run with --force to emit it anyway, for local review only\n',
  );
}

console.log(
  failures === 0
    ? `\n  locales built${emitSpanish ? ' — en, es' : ' — en only'}\n`
    : `\n  ${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
