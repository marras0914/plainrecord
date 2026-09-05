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

import { readFile, writeFile, mkdir, access, readdir, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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

  // JSON-LD goes in the head, before </head>, so a crawler has it without
  // waiting on the body.
  out = out.replace(/(\s*<\/head>)/, `\n  ${structuredData(locale)}$1`);

  // The stylesheet is emitted by vite as an absolute /assets/ path, so the
  // Spanish page at /es/ loads the same CSS and the same bundle. Asserted below
  // rather than assumed, because a relative href would 404 one directory down
  // and the page would render unstyled.
  return { out, selfUrl, altUrl };
}

/**
 * schema.org JSON-LD: a WebSite and, more usefully, a Dataset.
 *
 * The Dataset block is the point. This project's distinctive asset is not the
 * quiz — it is 3,546 Texas House roll calls with per-vote Journal provenance,
 * published CORS-open as one file, which almost nobody does. Declaring it as a
 * Dataset makes it eligible for Google Dataset Search, which is where a
 * reporter or researcher actually looks, and where capitol.texas.gov and the
 * Tribune are not competing for the same query.
 *
 * Every figure is read from the payload rather than typed, for the same reason
 * the share card is: a number stated in structured data outlives any correction
 * made in prose, and a wrong one here is quoted back by a machine.
 */
function structuredData(locale) {
  const selfUrl = locale === 'es' ? `${SITE}${ES_PREFIX}` : `${SITE}/`;
  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: selfUrl,
      name: value('intro.h1', locale),
      description: value('page.description', locale),
      inLanguage: locale === 'es' ? 'es-US' : 'en-US',
    },
    {
      '@type': 'Dataset',
      '@id': `${SITE}/#dataset`,
      name: locale === 'es'
        ? 'Votaciones nominales de la Cámara de Representantes de Texas, 89.ª Legislatura (89R)'
        : 'Texas House of Representatives roll-call votes, 89th Legislature (89R)',
      description: locale === 'es'
        ? `${payload.provenance.houseItemsTotal} votaciones nominales de la Cámara de Texas de la sesión 89R, con ${payload.provenance.journalSourced} conciliadas con el Diario oficial de la Cámara y la fuente indicada en cada voto. Incluye los votos individuales de los tres candidatos, las valencias partidistas calculadas y la regla de selección publicada.`
        : `${payload.provenance.houseItemsTotal} Texas House roll-call votes from the 89R session, ${payload.provenance.journalSourced} of them reconciled against the official House Journal with the source recorded per vote. Includes individual member votes for the three candidates, computed partisan valences, and the published selection rule.`,
      url: `${SITE}/`,
      // CC0, and now it is actually granted rather than assumed.
      //
      // An earlier version of this block asserted CC0 before the project had
      // stated any licence at all, which was inventing a rights grant on the
      // author's behalf. It is now declared in LICENSE, in package.json, and on
      // the page itself in both languages, so the machine-readable claim matches
      // a real one. If the licence ever changes, this field and the page copy
      // have to move together — the verifier asserts both.
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      isAccessibleForFree: true,
      creator: { '@type': 'Person', name: 'Marco Arras' },
      temporalCoverage: '2025',
      spatialCoverage: { '@type': 'Place', name: 'Texas, United States' },
      keywords: [
        'Texas Legislature', 'roll call votes', 'Texas House of Representatives',
        '89th Legislature', 'voting records', 'open data',
      ],
      variableMeasured: [
        'bill identifier', 'chamber yea/nay totals', 'per-member vote',
        'partisan valence', 'vote source (journal or scrape)',
      ],
      distribution: [{
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: `${SITE}/data/quiz_89R.json`,
      }],
    },
  ];
  return (
    '<script type="application/ld+json">' +
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }) +
    '</script>'
  );
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

// ---------------------------------------------------------------------------
// Build each locale separately
//
// One bundle carrying both languages sent every English reader the Spanish
// strings and the 22.5 KB Spanish payload sidecar, and vice versa. Measured:
// 51.3 KB gzipped for the combined bundle, 35.5 KB for English alone and 45.0 KB
// for Spanish. So the site is built twice, with BUILD_LOCALE folded by vite so
// Rollup drops the other language outright.
//
// The Spanish build goes somewhere temporary because `emptyOutDir` would
// otherwise have it wipe the English one, then its assets are merged in.
// That is safe only because vite content-hashes filenames: two bundles built
// from different sources can never collide, and if they somehow produced
// identical content they would be the same file anyway.
//
// Spawned rather than driven by npm script chaining because `BUILD_LOCALE=en
// vite build` is not valid in cmd.exe, which is what npm uses on Windows.
// ---------------------------------------------------------------------------

const ES_BUILD = resolve(ROOT, '.locale-es');

// vite's own CLI, run by this node. Not `npx vite build` through a shell: that
// needs shell:true on Windows to find npx.cmd, which node now warns about
// (DEP0190, unescaped concatenated args) and which puts a shell between us and
// the exit code for no benefit.
const VITE_BIN = resolve(ROOT, 'node_modules/vite/bin/vite.js');

function viteBuild(locale, outDir) {
  const r = spawnSync(process.execPath, [VITE_BIN, 'build'], {
    cwd: ROOT,
    env: { ...process.env, BUILD_LOCALE: locale, BUILD_OUTDIR: outDir },
    encoding: 'utf8',
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) {
    console.error(`\n  vite build (${locale}) failed:\n${out}\n`);
    process.exit(1);
  }
  // vite colourises its size table, so the digits are wrapped in escape codes.
  const plain = out.replace(/\[[0-9;]*m/g, '');
  const size = /index-[\w-]+\.js\s+([\d.]+)\s*kB\s*│\s*gzip:\s*([\d.]+)\s*kB/.exec(plain)
    ?? /index-[\w-]+\.js[^\n]*?([\d.]+)\s*kB[^\n]*?gzip:\s*([\d.]+)\s*kB/.exec(plain);
  return size ? `${size[1]} kB raw, ${size[2]} kB gzip` : 'built (size not parsed)';
}

console.log(`  [PASS] built en  — ${viteBuild('en', '../dist')}`);
if (emitSpanish) {
  console.log(`  [PASS] built es  — ${viteBuild('es', '../.locale-es')}`);
  // Merge the Spanish assets in beside the English ones.
  const from = resolve(ES_BUILD, 'assets');
  const to = resolve(DIST, 'assets');
  await mkdir(to, { recursive: true });
  let copied = 0;
  for (const f of await readdir(from)) {
    await copyFile(resolve(from, f), resolve(to, f));
    copied++;
  }
  say(copied > 0, 'Spanish assets merged into dist/assets', `${copied} files`);
}

const src = await readFile(resolve(DIST, 'index.html'), 'utf8');

// The Spanish page is built FROM THE SPANISH BUILD's html, not from the English
// one — that is where the Spanish bundle's asset hashes are. Deriving it from
// dist/index.html would give the Spanish page the English JavaScript, which is
// the whole bug this change exists to fix, reintroduced one layer up.
const esSrc = emitSpanish
  ? await readFile(resolve(ES_BUILD, 'index.html'), 'utf8')
  : null;

const slots = [...src.matchAll(/data-i18n(?:-content)?="([^"]+)"/g)].map((m) => m[1]);
say(slots.length > 0, 'dist/index.html carries data-i18n slots', `${slots.length} slots`);
// Absolute, so /es/ resolves them at the domain root rather than at /es/assets/.
// They are NOT shared any more — each locale loads its own bundle, asserted
// below — but both sets live in one directory, which only works because the
// paths do not depend on the page's own depth.
say(/src="\/assets\//.test(src) && /href="\/assets\//.test(src),
  'assets are absolute paths', 'so /es/ resolves them from the root, not /es/assets/');

for (const locale of emitSpanish ? ['en', 'es'] : ['en']) {
  // Each locale starts from ITS OWN build's html, so it references its own
  // bundle. Starting both from `src` would hand the Spanish page the English
  // JavaScript.
  let html = localise(locale === 'es' ? esSrc : src, locale);
  const { out } = head(html, locale);
  html = out;

  // The language switch goes FIRST, before the eyebrow: someone who cannot read
  // this page needs the way out before anything else.
  // Both of these go where the markup SAYS they go. Positioning them by regex
  // against <header> meant that renaming the header dropped the language switch
  // from every page while the build still reported success.
  const fill = (marker, content) => {
    if (!html.includes(marker)) {
      throw new Error(`src/index.html no longer contains ${marker} — nothing would be injected`);
    }
    html = html.replace(marker, content);
  };
  fill('<!--LANG_SWITCH-->', langSwitch(locale));

  // The translation notice goes LAST inside <header>, after the explainer.
  //
  // It used to sit directly under the language switch, which on a phone made a
  // disclaimer the first thing a Spanish reader saw — above the title, before
  // the page had said what it was. A caveat is only useful once the reader knows
  // what it is a caveat about, so it now follows the explainer rather than
  // preceding everything.
  fill('<!--TRANSLATION_NOTICE-->', translationNotice(locale));

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

// ---------------------------------------------------------------------------
// sitemap.xml — GENERATED, so it cannot forget a locale
//
// The committed public/sitemap.xml listed only "/" and had no hreflang
// alternates, so nothing pointed a crawler at the Spanish page and the two
// versions looked unrelated. Hand-maintaining a list of the URLs this script
// emits is exactly the drift the rest of the build refuses, so it is written
// from the same `locales` decision that writes the pages.
// ---------------------------------------------------------------------------

{
  const urls = emitSpanish
    ? [{ loc: `${SITE}/`, locale: 'en' }, { loc: `${SITE}${ES_PREFIX}`, locale: 'es' }]
    : [{ loc: `${SITE}/`, locale: 'en' }];

  const alternates = urls
    .map((u) => `      <xhtml:link rel="alternate" hreflang="${u.locale}" href="${u.loc}"/>`)
    .concat(`      <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`)
    .join('\n');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.map((u) =>
      '  <url>\n' +
      `    <loc>${u.loc}</loc>\n` +
      `${alternates}\n` +
      '    <changefreq>weekly</changefreq>\n' +
      `    <priority>${u.locale === 'en' ? '1.0' : '0.9'}</priority>\n` +
      '  </url>').join('\n') + '\n' +
    '</urlset>\n';

  await writeFile(resolve(DIST, 'sitemap.xml'), xml, 'utf8');
  say(true, 'wrote dist/sitemap.xml', `${urls.length} url(s), hreflang on each`);
}

// The point of the whole two-build arrangement: the pages must NOT share a
// bundle. If they do, one is carrying the other language and the split bought
// nothing — and that is invisible from the outside, because both pages would
// still render correctly.
if (emitSpanish) {
  const bundleOf = (html) => (/src="(\/assets\/index-[\w-]+\.js)"/.exec(html) ?? [])[1];
  const enHtml = await readFile(resolve(DIST, 'index.html'), 'utf8');
  const esHtml = await readFile(resolve(DIST, 'es', 'index.html'), 'utf8');
  const a = bundleOf(enHtml);
  const b = bundleOf(esHtml);
  say(Boolean(a && b && a !== b), 'the two pages load DIFFERENT bundles',
    a === b ? `both load ${a} — the locale split did nothing` : `${a} vs ${b}`);

  // And each bundle must actually be missing the other language, which is the
  // property the split exists to create rather than a proxy for it.
  if (a && b && a !== b) {
    const enJs = await readFile(resolve(DIST, a.slice(1)), 'utf8');
    const esJs = await readFile(resolve(DIST, b.slice(1)), 'utf8');
    say(!enJs.includes('Franja Morada') && !enJs.includes('bancada'),
      'the English bundle carries no Spanish', `${(enJs.length / 1024).toFixed(0)} KB raw`);
    say(!esJs.includes('Purple Strip'),
      'the Spanish bundle carries no English', `${(esJs.length / 1024).toFixed(0)} KB raw`);
  }

  await rm(ES_BUILD, { recursive: true, force: true });
}

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
