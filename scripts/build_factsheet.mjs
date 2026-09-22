/**
 * PlainRecord — the fact sheet, in both languages, as a findable page and a PDF
 *
 *   npm i --no-save qrcode          (playwright is already a devDependency)
 *   node scripts/build_factsheet.mjs
 *
 * Writes, per locale:
 *   public/hoja/index.html        + rightnleft-es.pdf      (Spanish)
 *   public/fact-sheet/index.html  + rightnleft-en.pdf      (English)
 *
 * WHY HTML AND PDF BOTH, AND WHY HTML IS THE IMPORTANT ONE
 *
 * A PDF was what was asked for and on its own it would have been a mistake.
 * Search engines rank PDFs below equivalent HTML, they are awkward on a phone,
 * and the crawlers that feed AI systems extract HTML far more reliably than a
 * PDF's text layer. So the HTML page is the artifact that gets FOUND and the PDF
 * is the one that gets PRINTED. The PDF is printed from the page itself, so they
 * cannot drift.
 *
 * THE QR IS INLINE SVG, AND THAT IS A BUG FIX
 *
 * It was a PNG referenced as src="qr.png". Vercel serves this page at /hoja with
 * NO trailing slash and 308-redirects /hoja/ to it, so the relative path resolved
 * to /qr.png at the site root, which 404s. Live, the flyer showed a broken image
 * where the QR should be. Inline SVG has no path to get wrong, needs no second
 * request, stays crisp at any size including print, and survives someone saving
 * the page to disk.
 *
 * Every URL here is absolute for the same reason.
 *
 * NO JAVASCRIPT, NOTHING THIRD-PARTY, NO TRACKING on these pages. Handing one to
 * a library only works if there is nothing in it to object to.
 *
 * The Spanish is the text approved on 20 September 2026, plus the voting-dates
 * block approved on 22 September 2026: the three captions, the wording used once
 * registration has closed, and the line naming the Secretary of State. The
 * English is a separate writing of the same content, not a gloss of the Spanish.
 *
 * THAT DATE IS THE ONLY RECORD. These strings live here rather than in
 * i18n/copy.json, so the gate that fails the build over one unapproved Spanish
 * string does not see them. Anything added here needs a person, not the build.
 */

import QRCode from 'qrcode';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://rightnleft.com';

// The Latin faces, read from the vendored stylesheet at build time. Linking
// /fonts.css would 404: vite bundles it into a hashed asset so it does not exist
// under public/, and the first PDF came out in a system serif because of it.
const vendored = readFileSync(resolve(ROOT, 'src/fonts.css'), 'utf8');
const faces = (vendored.match(/@font-face\s*\{[^}]*\}/g) ?? [])
  .filter((b) => /(lexend|newsreader|ibm-plex-mono)-latin(-ext)?-/.test(b));
if (faces.length < 2) {
  console.error('\n  Could not find the Latin Lexend and Newsreader faces in src/fonts.css.\n');
  process.exit(1);
}

// The figures are READ FROM THE SHIPPED PAYLOAD, not retyped here.
//
// The site already publishes these with their sources, ranks and caveats, and
// the Spanish is already approved in the sidecar, so quoting them by key means
// the sheet cannot drift from the site and needs no new translation review.
//
// Three chosen, and the choice is the editorial act worth naming: schools,
// children's health cover and the electricity bill. They are what a family
// actually feels, they are not coded to either party, and they leave out the
// two most inflammatory rows in the set (the abortion and border-spending
// figures) because this is a sheet handed across a table in a library.
const payload = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
const sidecar = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.es.json'), 'utf8'));
const PICK = [
  'Per-student school funding',
  'Children without health insurance',
  'What households pay for electricity',
];
const outcomesFor = (lang) => PICK.map((key) => {
  const en = payload.outcomes.find((o) => o.label === key);
  if (!en) throw new Error(`outcome not in the payload: ${key}`);
  if (lang === 'en') return { cat: en.category, label: en.label, value: en.value, cmp: en.comparison, rank: en.rank };
  const es = sidecar.outcomes?.[key];
  if (!es) throw new Error(`outcome not translated in the sidecar: ${key}`);
  return {
    cat: sidecar.categories?.[en.category] ?? en.category,
    label: es.label, value: es.value, cmp: es.comparison, rank: es.rank,
  };
});
const causalFor = (lang) => (lang === 'es' ? sidecar.causalNote : payload.causalNote);

// --- the voting dates -------------------------------------------------------
//
// READ FROM public/data/election_tx.json for the same reason the figures above
// are read from the payload: the site already publishes these with their source,
// and a sheet keeping its own copy of a deadline is a sheet that will one day
// disagree with the page it points at. They were six hardcoded strings.
//
// THE PRINTED SHEET IS THE HARD CASE. Everything else here can be corrected by
// deploying. A PDF somebody printed in September and put on a table in October
// cannot be, and it carries no clue about its own age. Two things follow. The
// build refuses to write a sheet for an election that has already happened, and
// the block states when the dates were last confirmed with the state, so a sheet
// found lying around says how old it is.
const ELECTION = JSON.parse(readFileSync(resolve(ROOT, 'public/data/election_tx.json'), 'utf8'));
// Overridable ONLY so the two wordings below can be exercised on a day that is
// not the day they matter. A guard that has never been seen to fire is a guard
// nobody knows the shape of, and this one first matters on 6 October, which is
// too late to find out it was wrong.
const TODAY = process.env.FACTSHEET_TODAY ?? new Date().toISOString().slice(0, 10);

if (ELECTION.election < TODAY) {
  console.error(`\n  election_tx.json describes an election on ${ELECTION.election}, which has passed.`
    + '\n  Refresh it with: npm run data:election\n  Nothing written.\n');
  process.exit(1);
}

// Registration closing mid-cycle is normal and is NOT a build failure. What has
// to change is the caption. "last day to register" is an instruction, and an
// expired instruction on a piece of paper is worse than no line at all, so once
// the date is past the row states what happened instead of telling anyone to act.
const REGISTRATION_CLOSED = ELECTION.registerBy < TODAY;

const LOC = { es: 'es-US', en: 'en-US' };
const at = (iso) => new Date(`${iso}T00:00:00Z`);
const day = (iso, lang) => new Intl.DateTimeFormat(LOC[lang], { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(at(iso));
const monthOf = (iso, lang) => new Intl.DateTimeFormat(LOC[lang], { month: 'long', timeZone: 'UTC' }).format(at(iso));
const dayNum = (iso) => String(Number(iso.slice(8, 10)));

/** "October 19 to 30" against "19 al 30 de octubre", which are not one shape. */
const span = (fromIso, toIso, lang) => {
  // Early voting has never crossed a month boundary in Texas, but the fallback
  // is here because the day it does is not the day to find out.
  if (fromIso.slice(0, 7) !== toIso.slice(0, 7)) return `${day(fromIso, lang)} - ${day(toIso, lang)}`;
  return lang === 'es'
    ? `${dayNum(fromIso)} al ${dayNum(toIso)} de ${monthOf(fromIso, 'es')}`
    : `${monthOf(fromIso, 'en')} ${dayNum(fromIso)} to ${dayNum(toIso)}`;
};

const CAPTIONS = {
  es: { open: 'último día para registrarse', closed: 'el registro ya cerró', early: 'votación temprana', day: 'día de la elección' },
  en: { open: 'last day to register', closed: 'registration has closed', early: 'early voting', day: 'election day' },
};

const datesFor = (lang) => [
  [day(ELECTION.registerBy, lang), REGISTRATION_CLOSED ? CAPTIONS[lang].closed : CAPTIONS[lang].open],
  [span(ELECTION.earlyStart, ELECTION.earlyEnd, lang), CAPTIONS[lang].early],
  [day(ELECTION.election, lang), CAPTIONS[lang].day],
];

/** Where the dates came from and when. Only the printed copy really needs it. */
const asOfFor = (lang) => {
  const on = ELECTION._meta.generated;
  return lang === 'es'
    ? `Fechas de la Secretaría de Estado de Texas, confirmadas el ${day(on, 'es')} de ${on.slice(0, 4)}.`
    : `Dates from the Texas Secretary of State, confirmed ${day(on, 'en')}, ${on.slice(0, 4)}.`;
};

const LOCALES = [
  {
    lang: 'es', dir: 'hoja', pdf: 'rightnleft-es.pdf', target: `${SITE}/es`,
    canonical: `${SITE}/hoja`,
    title: '¿Cómo votó su representante en la Cámara de Texas?',
    docTitle: 'Cómo votó su representante en la Cámara de Texas | La Franja Morada',
    meta: 'Hoja informativa: 67 votos reales de la Cámara de Representantes de Texas de 2025, en español. Escriba su código postal y vea cómo votó su propio representante. Sin registro, sin anuncios, gratis.',
    lede: 'En 2025, la Cámara de Representantes de Texas votó cientos de proyectos de ley. Este sitio toma <b>67 de esos votos reales</b> y le pregunta qué habría votado usted, sin decirle antes qué partido tomó qué lado.',
    kicker: 'Cámara de Representantes de Texas · Sesión de 2025',
    h2out: 'Cómo se ve Texas hoy',
    outFoot: 'Cada cifra lleva su fuente y sus salvedades en el sitio.',
    h2how: 'Cómo funciona',
    steps: [
      'Lea en español, y en palabras sencillas, lo que hace un proyecto de ley.',
      'Diga si votaría a favor o en contra.',
      'Al final vea dónde quedó usted, y cómo votaron de verdad los legisladores.',
    ],
    h2not: 'Lo que este sitio no hace',
    nots: [
      'No pide registro, ni su nombre, ni su correo electrónico.',
      'No tiene anuncios y no cuesta nada.',
      'Sus respuestas se quedan en su dispositivo, salvo que usted decida enviarlas.',
    ],
    h2dates: 'Fechas en Texas',
    urlLabel: 'rightnleft.com/es',
    urlSub: 'Gratis. En español. Sin registro.',
    whoLabel: 'Quién lo hizo.',
    who: 'Marco Arras, residente de Texas. Yo dono al Partido Demócrata, y lo digo aquí antes que cualquier otra cosa. La regla que escoge cuáles votos aparecen está publicada y se aplica igual a los dos partidos, el partido está oculto hasta que usted responde, y tanto el código como todos los datos son públicos para que no tenga que creerme.',
    qrAlt: 'Código QR que lleva a rightnleft.com/es',
  },
  {
    lang: 'en', dir: 'fact-sheet', pdf: 'rightnleft-en.pdf', target: `${SITE}/`,
    canonical: `${SITE}/fact-sheet`,
    title: 'How did your Texas House member actually vote?',
    docTitle: 'How did your Texas House member actually vote? | The Purple Strip',
    meta: 'Fact sheet: 67 real votes from the 2025 Texas House. Type your ZIP code and see how your own representative voted. No sign-up, no ads, free.',
    lede: 'In 2025 the Texas House voted on hundreds of bills. This site takes <b>67 of those real votes</b> and asks how you would have voted, without telling you first which party took which side.',
    kicker: 'Texas House of Representatives · 2025 session',
    h2out: 'What Texas looks like now',
    outFoot: 'Every figure carries its source and its caveats on the site.',
    h2how: 'How it works',
    steps: [
      'Read what a bill does, in plain language.',
      'Say whether you would vote for it or against it.',
      'At the end, see where you landed and how the legislators actually voted.',
    ],
    h2not: 'What this site does not do',
    nots: [
      'It asks for no sign-up, no name and no email address.',
      'It has no ads and costs nothing.',
      'Your answers stay on your device unless you choose to send them.',
    ],
    h2dates: 'Texas dates',
    urlLabel: 'rightnleft.com',
    urlSub: 'Free. No sign-up. Also in Spanish.',
    whoLabel: 'Who made it.',
    who: 'Marco Arras, a Texas resident. I donate to the Democratic Party, and I say so here before anything else. The rule that picks which votes appear is published and runs identically on both parties, the party is hidden until you answer, and the code and all the data are public so you do not have to take my word for any of it.',
    qrAlt: 'QR code linking to rightnleft.com',
  },
];

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const jsonldFor = (L) => JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage', '@id': L.canonical, url: L.canonical, name: L.title,
      inLanguage: L.lang === 'es' ? 'es-US' : 'en-US', description: L.meta,
      isPartOf: { '@type': 'WebSite', url: `${SITE}/`, name: 'PlainRecord' },
      author: { '@type': 'Person', name: 'Marco Arras' },
    },
    {
      '@type': 'Dataset',
      name: 'Texas House of Representatives recorded floor votes, 89th Legislature (2025)',
      description: 'Every recorded floor vote of the 2025 Texas House regular session: 3,546 roll calls with each member’s position, reconciled against the House Journal. Includes a derived ZIP code to Texas House district crosswalk built through 2020 Census blocks.',
      url: `${SITE}/`,
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      creator: { '@type': 'Person', name: 'Marco Arras' },
      isAccessibleForFree: true,
      spatialCoverage: { '@type': 'Place', name: 'Texas, United States' },
      temporalCoverage: '2025',
      keywords: ['Texas Legislature', 'roll call votes', 'Texas House of Representatives', 'open data', 'civic data', 'ZIP code to legislative district'],
      distribution: [
        { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/data/votes_89R.json`, name: 'All 3,546 recorded House votes' },
        { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/data/zips_89R.json`, name: 'ZIP code to Texas House district crosswalk' },
        { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/data/members_89R.json`, name: 'Members and their votes on the 67 selected items' },
      ],
    },
  ],
});

const CSS = `
${faces.join('\n')}
/* The site's own tokens, lifted from src/styles.css rather than approximated,
   so the sheet and the page are recognisably the same object. Warm paper, not
   white; rust for the badge; mono for the small labels. */
:root{--page:#faf7f1;--surface:#fffdf9;--ink:#1a1714;--ink-2:#57514a;
      --muted:#6f6a62;--hair:#e6ded1;--rule:#cabfae;--rust:#c8352f;}
*{box-sizing:border-box}
body{margin:0 auto;padding:32px 24px 40px;max-width:47rem;background:var(--page);
     color:var(--ink);font-family:"Lexend",system-ui,sans-serif;font-size:14.5px;line-height:1.5}
.mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
.kicker{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px;
        color:var(--ink-2);margin:0 0 9px}
h1{font-size:31px;line-height:1.1;margin:0 0 9px;letter-spacing:-.02em;font-weight:600}
.lede{font-size:15.5px;color:var(--ink-2);margin:0 0 20px;max-width:41rem}
.lede b{color:var(--ink);font-weight:600}
/* The outcomes, in the site's own card grammar: stacked rows separated by
   hairlines rather than boxed, exactly as they appear on the page. */
.outs{background:var(--surface);border:1px solid var(--hair);margin:0 0 14px}
.out{padding:12px 16px;border-top:1px solid var(--hair)}
.out:first-child{border-top:0}
.out-cat{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;color:var(--ink-2)}
.out-val{font-size:21px;font-weight:600;letter-spacing:-.015em;margin-top:2px;line-height:1.15}
.out-cmp{font-size:13px;color:var(--ink-2);margin-top:2px}
.badge{display:inline-block;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10px;
       border:1px solid currentColor;padding:2px 7px;margin-top:7px;color:var(--rust)}
.out-foot{font-size:11.5px;color:var(--muted);margin:0 0 6px;font-style:italic}
.causal{font-size:11.5px;color:var(--muted);margin:0 0 18px;line-height:1.45}
.cols{display:flex;gap:32px;flex-wrap:wrap}
.col{flex:1;min-width:15rem}
h2{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px;color:var(--ink-2);
   margin:0 0 7px;font-weight:400;text-transform:none;letter-spacing:0}
ol,ul{margin:0;padding-left:17px}
li{margin-bottom:5px}
.dates{border-top:1px solid var(--hair);border-bottom:1px solid var(--hair);
       padding:12px 0;margin:19px 0 0;display:flex;gap:30px;flex-wrap:wrap}
.dates div{min-width:8rem}
.dates b{display:block;font-size:18px;font-weight:600;letter-spacing:-.01em}
.dates span{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;color:var(--muted)}
.asof{font-size:10px;color:var(--muted);margin:6px 0 0}
.cta{display:flex;align-items:center;gap:20px;margin-top:20px;padding-top:17px;
     border-top:2px solid var(--ink)}
.cta svg{width:106px;height:106px;flex:none;display:block}
.url{font-size:30px;font-weight:600;line-height:1.05;letter-spacing:-.02em;word-break:break-word}
.url a{color:inherit;text-decoration:none}
.url span{display:block;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11.5px;
          font-weight:400;color:var(--muted);margin-top:6px;letter-spacing:0}
.who{font-size:11.5px;color:var(--muted);margin-top:15px;padding-top:11px;
     border-top:1px solid var(--hair);font-style:italic}
.who b{color:var(--ink-2);font-style:normal}
@media print{
  @page{size:letter;margin:12mm}
  body{padding:0;max-width:none;font-size:10.5pt;background:var(--page) !important}
  h1{font-size:23pt}
  .card-val{font-size:20pt}
  .url{font-size:20pt}
  .cta svg{width:98px;height:98px}
  body,.card{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;

const pageFor = (L, qrSvg) => `<!doctype html>
<html lang="${L.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(L.docTitle)}</title>
<meta name="description" content="${esc(L.meta)}">
<link rel="canonical" href="${L.canonical}">
<link rel="alternate" hreflang="es" href="${SITE}/hoja">
<link rel="alternate" hreflang="en" href="${SITE}/fact-sheet">
<link rel="alternate" hreflang="x-default" href="${SITE}/fact-sheet">
<meta property="og:title" content="${esc(L.title)}">
<meta property="og:description" content="${esc(L.meta)}">
<meta property="og:url" content="${L.canonical}">
<meta property="og:image" content="${SITE}/${L.lang === 'es' ? 'og.es.png' : 'og.png'}">
<meta property="og:locale" content="${L.lang === 'es' ? 'es_US' : 'en_US'}">
<meta property="og:type" content="article">
<script type="application/ld+json">${jsonldFor(L)}</script>
<style>${CSS}</style>
</head>
<body>

<p class="kicker">${esc(L.kicker)}</p>
<h1>${esc(L.title)}</h1>
<p class="lede">${L.lede}</p>

<h2>${esc(L.h2out)}</h2>
<div class="outs">
${outcomesFor(L.lang).map((o) => `  <div class="out">
    <div class="out-cat">${esc(o.cat)} &middot; ${esc(o.label)}</div>
    <div class="out-val">${esc(o.value)}</div>
    <div class="out-cmp">${esc(o.cmp)}</div>
    ${o.rank ? `<div class="badge">${esc(o.rank)}</div>` : ''}
  </div>`).join('\n')}
</div>
<p class="out-foot">${esc(L.outFoot)}</p>
<p class="causal">${esc(causalFor(L.lang))}</p>

<div class="cols">
  <div class="col">
    <h2>${esc(L.h2how)}</h2>
    <ol>${L.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
  </div>
  <div class="col">
    <h2>${esc(L.h2not)}</h2>
    <ul>${L.nots.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  </div>
</div>

<div class="dates">
  ${datesFor(L.lang).map(([d, w]) => `<div><b>${esc(d)}</b><span>${esc(w)}</span></div>`).join('')}
</div>
<p class="asof">${esc(asOfFor(L.lang))}</p>

<div class="cta">
  ${qrSvg}
  <div class="url"><a href="${L.target}">${esc(L.urlLabel)}</a><span>${esc(L.urlSub)}</span></div>
</div>

<p class="who"><b>${esc(L.whoLabel)}</b> ${esc(L.who)}</p>

</body>
</html>
`;

// --- build ------------------------------------------------------------------

for (const L of LOCALES) {
  const out = resolve(ROOT, 'public', L.dir);
  mkdirSync(out, { recursive: true });

  // Inline SVG, sized by CSS. No file, no path, nothing to 404.
  let svg = await QRCode.toString(L.target, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  svg = svg.replace('<svg ', `<svg role="img" aria-label="${esc(L.qrAlt)}" `);

  writeFileSync(resolve(out, 'index.html'), pageFor(L, svg), 'utf8');
}

// Serve public/ so the pages render exactly as deployed, then print each.
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(resolve(ROOT, 'public'), p);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch();
console.log('');
for (const L of LOCALES) {
  const page = await browser.newPage();
  await page.goto(`${origin}/${L.dir}/`, { waitUntil: 'networkidle' });

  const gotFonts = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((r) => r.name).filter((n) => /\.woff2?($|\?)/.test(n)).length);
  if (gotFonts === 0) {
    await browser.close(); srv.close();
    console.error('\n  No webfont loaded — the PDF would print in a system fallback. Nothing written.\n');
    process.exit(1);
  }

  await page.emulateMedia({ media: 'print' });
  const out = resolve(ROOT, 'public', L.dir);
  await page.pdf({
    path: resolve(out, L.pdf), format: 'Letter', printBackground: true,
    margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
  });
  const h = await page.evaluate(() => document.body.scrollHeight);
  console.log(`  ${L.lang}  public/${L.dir}/  index.html ${(statSync(resolve(out, 'index.html')).size / 1024).toFixed(1)} KB`
    + `, ${L.pdf} ${(statSync(resolve(out, L.pdf)).size / 1024).toFixed(1)} KB, body ${h}px`);
  await page.close();
}
await browser.close();
srv.close();
console.log('\n  QR is inline SVG: no second request, nothing to 404, crisp in print.');
console.log('  Letter at 96dpi is ~1056px, so body height under that is one page.\n');
