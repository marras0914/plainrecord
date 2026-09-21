/**
 * PlainRecord — the Spanish fact sheet, as a findable page and a printable PDF
 *
 *   node scripts/build_factsheet.mjs
 *
 * Writes:
 *   public/hoja/index.html          the page Google and AI crawlers read
 *   public/hoja/rightnleft-es.pdf   the file a librarian prints
 *   public/hoja/qr.png              the QR, copied from the generated one
 *
 * WHY BOTH, AND WHY THE HTML IS THE IMPORTANT ONE
 *
 * A PDF was the thing asked for, and on its own it would have been a mistake.
 * Search engines index PDFs but rank them below equivalent HTML, they are
 * awkward on a phone, and most crawlers that feed AI systems extract HTML far
 * more reliably than a PDF's text layer. So the HTML page is the artifact that
 * gets FOUND, and the PDF is the artifact that gets PRINTED and handed across a
 * table. Same source, rendered twice, so they cannot drift apart.
 *
 * The PDF is produced by printing the page itself through headless Chromium
 * rather than by laying it out separately. One content source, and the print
 * stylesheet is the only difference.
 *
 * NO JAVASCRIPT, NO THIRD PARTY, NO TRACKING on this page. It inherits the
 * site's CSP, uses the vendored fonts, and the whole point of handing it to an
 * institution is that there is nothing in it to object to.
 *
 * The Spanish is the approved text from private/rightnleft-spanish-assets.md,
 * reviewed 20 September 2026.
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, copyFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/hoja');
mkdirSync(OUT, { recursive: true });

// The page carries its OWN @font-face rules rather than linking /fonts.css.
//
// fonts.css lives in src/ and is bundled into a hashed asset by vite, so it does
// not exist under public/ and a link to it 404s — which is how the first PDF
// came out in a system serif that looked fine in isolation and nothing like the
// site. The rules are read from the vendored file at build time and filtered to
// the Latin subsets, so there is still one source of truth and the page is
// self-contained: a librarian who saves it still gets the right typography.
const vendored = readFileSync(resolve(ROOT, 'src/fonts.css'), 'utf8');
const faces = (vendored.match(/@font-face\s*\{[^}]*\}/g) ?? []).filter(
  (b) => /(lexend|newsreader)-latin(-ext)?-/.test(b));
if (faces.length < 2) {
  console.error('\n  Could not find the Latin Lexend and Newsreader faces in src/fonts.css.\n');
  process.exit(1);
}

const QR_SRC = resolve(ROOT, 'private/qr/rightnleft-es.png');
if (!existsSync(QR_SRC)) {
  console.error('\n  Missing private/qr/rightnleft-es.png — run scripts/make_qr.mjs first.\n');
  process.exit(1);
}
copyFileSync(QR_SRC, resolve(OUT, 'qr.png'));

const URL_ES = 'https://rightnleft.com/es';
const CANONICAL = 'https://rightnleft.com/hoja/';

// schema.org, so that both Google and anything ingesting the page for an AI
// gets the facts as data rather than having to infer them from prose. Dataset
// is the important one: the 3,546-vote corpus is a real public dataset under
// CC0 and is the most reusable thing this project has.
const jsonld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': CANONICAL,
      url: CANONICAL,
      name: 'Cómo votó su representante en la Cámara de Texas',
      inLanguage: 'es-US',
      description: 'Hoja informativa en español sobre rightnleft.com: 67 votos reales de la Cámara de Representantes de Texas de 2025, una búsqueda por código postal, sin registro y sin anuncios.',
      isPartOf: { '@type': 'WebSite', url: 'https://rightnleft.com/', name: 'PlainRecord' },
      author: { '@type': 'Person', name: 'Marco Arras' },
    },
    {
      '@type': 'Dataset',
      name: 'Texas House of Representatives recorded floor votes, 89th Legislature (2025)',
      alternateName: 'Votos registrados de la Cámara de Representantes de Texas, 89.ª Legislatura',
      description: 'Every recorded floor vote of the 2025 Texas House regular session: 3,546 roll calls with each member’s position, reconciled against the House Journal. Includes a derived ZIP code to Texas House district crosswalk built through 2020 Census blocks.',
      url: 'https://rightnleft.com/',
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      creator: { '@type': 'Person', name: 'Marco Arras' },
      isAccessibleForFree: true,
      spatialCoverage: { '@type': 'Place', name: 'Texas, United States' },
      temporalCoverage: '2025',
      keywords: ['Texas Legislature', 'roll call votes', 'Texas House of Representatives', 'open data', 'civic data', 'ZIP code to legislative district'],
      distribution: [
        { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: 'https://rightnleft.com/data/votes_89R.json', name: 'All 3,546 recorded House votes' },
        { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: 'https://rightnleft.com/data/zips_89R.json', name: 'ZIP code to Texas House district crosswalk' },
        { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: 'https://rightnleft.com/data/members_89R.json', name: 'Members and their votes on the 67 selected items' },
      ],
    },
  ],
};

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cómo votó su representante en la Cámara de Texas | La Franja Morada</title>
<meta name="description" content="Hoja informativa: 67 votos reales de la Cámara de Representantes de Texas de 2025, en español. Escriba su código postal y vea cómo votó su propio representante. Sin registro, sin anuncios, gratis.">
<link rel="canonical" href="${CANONICAL}">
<link rel="alternate" hreflang="es" href="${CANONICAL}">
<link rel="alternate" hreflang="x-default" href="https://rightnleft.com/">
<meta property="og:title" content="Cómo votó su representante en la Cámara de Texas">
<meta property="og:description" content="67 votos reales de la sesión de 2025, en español. Sin registro, sin anuncios.">
<meta property="og:url" content="${CANONICAL}">
<meta property="og:image" content="https://rightnleft.com/og.es.png">
<meta property="og:locale" content="es_US">
<meta property="og:type" content="article">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
${faces.join('\n')}
  :root { --ink:#101014; --muted:#55555f; --rule:#d4d4dc; --accent:#5b3fa8; }
  * { box-sizing: border-box; }
  body { margin:0; padding:28px 22px 40px; font-family:"Lexend",system-ui,sans-serif;
         color:var(--ink); background:#fff; max-width:46rem; margin-inline:auto;
         font-size:15.5px; line-height:1.55; }
  h1 { font-family:"Newsreader",Georgia,serif; font-size:30px; line-height:1.15;
       margin:0 0 6px; letter-spacing:-.01em; }
  .lede { font-size:16.5px; color:var(--ink); margin:0 0 20px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.09em; color:var(--accent);
       margin:22px 0 7px; }
  ol,ul { margin:0 0 4px; padding-left:20px; }
  li { margin-bottom:5px; }
  p { margin:0 0 10px; }
  .box { border:1px solid var(--rule); border-radius:8px; padding:14px 16px; margin:18px 0; }
  .dates { display:flex; gap:22px; flex-wrap:wrap; margin:6px 0 0; padding:0; list-style:none; }
  .dates li { margin:0; }
  .dates b { display:block; font-size:19px; font-family:"Newsreader",Georgia,serif; }
  .dates span { font-size:12.5px; color:var(--muted); }
  .cta { display:flex; align-items:center; gap:18px; border-top:2px solid var(--ink);
         margin-top:24px; padding-top:16px; }
  .cta img { width:104px; height:104px; }
  .url { font-family:"Newsreader",Georgia,serif; font-size:27px; font-weight:600; word-break:break-all; }
  .url span { display:block; font-family:"Lexend",sans-serif; font-size:12.5px;
              font-weight:400; color:var(--muted); text-transform:none; letter-spacing:0; margin-top:3px; }
  .who { font-size:13px; color:var(--muted); border-top:1px solid var(--rule); margin-top:18px; padding-top:12px; }
  .who b { color:var(--ink); }
  @media print {
    @page { size: letter; margin: 13mm; }
    body { padding:0; max-width:none; font-size:11.2pt; }
    h1 { font-size:22pt; }
    .cta img { width:96px; height:96px; }
    .url { font-size:19pt; }
  }
</style>
</head>
<body>

<h1>¿Cómo votó su representante en la Cámara de Texas?</h1>
<p class="lede">En 2025, la Cámara de Representantes de Texas votó cientos de proyectos de ley.
Este sitio toma 67 de esos votos reales y le pregunta qué habría votado usted, sin decirle antes
qué partido tomó qué lado.</p>

<h2>Cómo funciona</h2>
<ol>
  <li>Lea en español, y en palabras sencillas, lo que hace un proyecto de ley.</li>
  <li>Diga si votaría a favor o en contra.</li>
  <li>Al final vea dónde quedó usted, y cómo votaron de verdad los legisladores.</li>
</ol>

<h2>Si no quiere responder nada</h2>
<p>Escriba su código postal. Le dirá quién le representa en la Cámara de Texas y en qué votos
se apartó de su propio partido. No hace falta responder ni una pregunta.</p>

<h2>Lo que este sitio no hace</h2>
<ul>
  <li>No pide registro, ni su nombre, ni su correo electrónico.</li>
  <li>No tiene anuncios y no cuesta nada.</li>
  <li>Sus respuestas se quedan en su dispositivo, salvo que usted decida enviarlas.</li>
</ul>

<div class="box">
  <h2 style="margin-top:0">Fechas en Texas</h2>
  <ul class="dates">
    <li><b>5 de octubre</b><span>último día para registrarse</span></li>
    <li><b>19 al 30 de octubre</b><span>votación temprana</span></li>
    <li><b>3 de noviembre</b><span>día de la elección</span></li>
  </ul>
</div>

<div class="cta">
  <img src="qr.png" alt="Código QR que lleva a rightnleft.com/es">
  <div class="url">rightnleft.com/es<span>Gratis. En español. Sin registro.</span></div>
</div>

<p class="who"><b>Quién lo hizo.</b> Marco Arras, residente de Texas.
Yo dono al Partido Demócrata, y lo digo aquí antes que cualquier otra cosa.
La regla que escoge cuáles votos aparecen está publicada y se aplica igual a los dos partidos,
el partido está oculto hasta que usted responde, y tanto el código como todos los datos son
públicos para que no tenga que creerme.</p>

</body>
</html>
`;

writeFileSync(resolve(OUT, 'index.html'), html, 'utf8');

// Print the page itself, so the PDF cannot say something the page does not.
//
// Served over HTTP rather than opened from file://, because the stylesheet link
// is the absolute /fonts.css that the deployed page uses. Over file:// that
// resolves to the filesystem root, the vendored fonts silently do not load, and
// the PDF ships in whatever the system serif happens to be — looking fine in
// isolation and nothing like the site. Serving public/ makes the render
// identical to production.
const { createServer } = await import('node:http');
const { readFileSync: rf, existsSync: ex } = await import('node:fs');
const { join, extname } = await import('node:path');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png',
  '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml',
};
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(resolve(ROOT, 'public'), p);
  if (!ex(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(rf(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${origin}/hoja/`, { waitUntil: 'networkidle' });

// The fonts are the whole reason for the server, so assert they arrived rather
// than discovering it in a printed stack of flyers.
const gotFonts = await page.evaluate(() => performance.getEntriesByType('resource')
  .map((r) => r.name).filter((n) => /\.woff2?($|\?)/.test(n)).length);
if (gotFonts === 0) {
  await browser.close(); srv.close();
  console.error('\n  No webfont loaded — the PDF would print in a system fallback. Not written.\n');
  process.exit(1);
}

await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: resolve(OUT, 'rightnleft-es.pdf'),
  format: 'Letter',
  printBackground: true,
  margin: { top: '13mm', right: '13mm', bottom: '13mm', left: '13mm' },
});
const pages = await page.evaluate(() => document.body.scrollHeight);
const usedFonts = await page.evaluate(() => performance.getEntriesByType('resource')
  .map((r) => r.name.split('/').pop()).filter((n) => /\.woff2?$/.test(n)));
await browser.close();
srv.close();

console.log('');
for (const f of ['index.html', 'rightnleft-es.pdf', 'qr.png']) {
  console.log(`  public/hoja/${f.padEnd(20)} ${(statSync(resolve(OUT, f)).size / 1024).toFixed(1)} KB`);
}
console.log(`\n  body height ${pages}px — check it is still one page if the text grows`);
console.log('  HTML is the artifact that gets found; the PDF is the one that gets printed.\n');
