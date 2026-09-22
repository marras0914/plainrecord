/**
 * PlainRecord — a findable page per Texas House district, in both languages
 *
 *   node scripts/build_district_pages.mjs
 *
 * Writes public/district/<n>/index.html and public/distrito/<n>/index.html.
 *
 * THIS IS A PILOT OF TEN, NOT A PLAN FOR 150. The race pages went live on
 * 21 September to test whether static pages could earn search traffic at all,
 * and they compete with national news for "Greg Abbott". District pages compete
 * with almost nothing for "who represents Texas House district 47", which is
 * the more promising query and the larger prize, at 150 of them. Building all
 * 150 on spec would be a lot of work for something nobody may search. Ten is
 * enough to find out, and if they rank the remaining 140 are the same template.
 *
 * HOW THE TEN WERE CHOSEN, AND WHY THE RULE IS PARTY-BLIND. Five are the
 * district holding the most people in the downtown ZIP of the five largest
 * Texas cities. Five are the members who most often voted against their own
 * party, skipping any already chosen. Neither half looks at party, and the
 * result came out 4 Democrats and 6 Republicans, because the members who break
 * ranks most in this corpus happen to be Republicans. Choosing by hand would
 * have produced a defensible-looking list that I picked, which is exactly the
 * thing this site refuses to do elsewhere.
 *
 * WHAT EACH PAGE CARRIES that nothing else on the internet does: the member's
 * record on the 67 published votes, the specific bills where they broke with
 * their own caucus, and the ZIP codes that fall in the district. The ZIPs are
 * there because "77002 state representative" is a real query and the split-ZIP
 * problem means most tools answer it badly.
 *
 * Every figure is computed from the shipped payload. Crossings use the site's
 * own definition, over the votes where the two caucuses took opposite sides, so
 * a page and the site's own panel never disagree.
 *
 * THE SPANISH IS APPROVED. Bill summaries are quoted from the sidecar reviewed
 * on 20 September; the framing in COPY.es was written and approved on
 * 21 September.
 *
 * It sits inline here, as build_races.mjs and build_factsheet.mjs do, which
 * means THE SPANISH GATE DOES NOT COVER IT. npm run i18n:check will pass no
 * matter what this file says, so a later edit to the Spanish needs a human
 * read; no build will catch it.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, esc, loadFaces, document_ } from './_page_shell.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);

const payload = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
const sidecar = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.es.json'), 'utf8'));
const members = JSON.parse(readFileSync(resolve(ROOT, 'public/data/members_89R.json'), 'utf8'));
const zipFile = JSON.parse(readFileSync(resolve(ROOT, 'public/data/zips_89R.json'), 'utf8'));

const order = members.itemOrder;
const itemOf = new Map(payload.items.map((i) => [i.id, i]));
const opposed = (it) => (it.dYea > 0.5) !== (it.rYea > 0.5);

/** Same definition the site's own panel uses. See build_races.mjs. */
function recordOf(m) {
  let cast = 0, divisive = 0, crossed = 0;
  const crossings = [];
  for (let i = 0; i < order.length; i++) {
    const ch = m.v[i];
    if (ch !== 'y' && ch !== 'n') continue;
    cast++;
    const it = itemOf.get(order[i]);
    if (!it || !opposed(it)) continue;
    divisive++;
    const caucusYea = m.p === 'R' ? it.rYea > 0.5 : it.dYea > 0.5;
    if ((ch === 'y') !== caucusYea) { crossed++; crossings.push(it); }
  }
  return { cast, divisive, crossed, crossings, total: order.length };
}

const stat = new Map(members.members.map((m) => [m.d, recordOf(m)]));

// --- the ten ---------------------------------------------------------------

const BIG_CITY = {
  Houston: '77002', 'San Antonio': '78205', Dallas: '75201',
  Austin: '78701', 'Fort Worth': '76102',
};

const chosen = [];
const taken = new Set();
for (const [city, zip] of Object.entries(BIG_CITY)) {
  const v = zipFile.zips[zip];
  const d = Array.isArray(v) ? v[0][0] : v;
  if (taken.has(d)) continue;
  taken.add(d);
  chosen.push({ d, why: { en: city, es: city } });
}
const ranked = [...members.members].sort((a, b) => stat.get(b.d).crossed - stat.get(a.d).crossed);
for (const m of ranked) {
  if (chosen.length >= 10) break;
  if (taken.has(m.d)) continue;
  taken.add(m.d);
  chosen.push({ d: m.d, why: { en: 'breaks with their party most often', es: 'de quienes más se apartan de su partido' } });
}

// --- ZIPs per district ------------------------------------------------------

const zipsByDistrict = new Map();
for (const [zip, v] of Object.entries(zipFile.zips)) {
  const rows = Array.isArray(v) ? v : [[v, null, null]];
  for (const [d, people] of rows) {
    if (!zipsByDistrict.has(d)) zipsByDistrict.set(d, []);
    zipsByDistrict.get(d).push({ zip, people });
  }
}
/** Most people first, so the list leads with where the district actually is. */
const zipsFor = (d) => (zipsByDistrict.get(d) ?? [])
  .slice().sort((a, b) => (b.people ?? 0) - (a.people ?? 0)).map((z) => z.zip);

function summaryFor(it, lang) {
  if (lang !== 'es') return it.plain ?? it.caption;
  const es = sidecar.items?.[it.billId]?.plain;
  if (!es) throw new Error(`no Spanish summary in the sidecar for ${it.billId}`);
  return es;
}

const PARTY = {
  en: { D: 'Democrat', R: 'Republican' },
  es: { D: 'demócrata', R: 'republicano' },
};

const COPY = {
  en: {
    other: 'es', siteName: 'The Purple Strip', target: `${SITE}/`,
    kicker: 'Texas House · 2025 session',
    title: (m) => `${m.n}, Texas House District ${m.d}`,
    desc: (m, r) => `How ${m.n} voted on 67 recorded Texas House votes from the 2025 session, `
      + `including the ${r.crossed} where they broke with their own party. Free, no sign-up, nothing tracked.`,
    lede: (m, r, why) => `${m.n} represents Texas House District ${m.d} and is a ${PARTY.en[m.p]}. This page is the record: of the ${r.total} votes this site publishes, ${m.n} cast ${r.cast}, and on the ${r.divisive} of those where the two parties took opposite sides, they voted against their own party ${r.crossed} ${r.crossed === 1 ? 'time' : 'times'}.`,
    h2cross: 'Where they broke with their own party',
    noCross: (m) => `On the votes where the two parties took opposite sides, ${m.n} voted with their own party every time.`,
    h2zip: (m) => `ZIP codes in District ${m.d}`,
    zipNote: 'Most people first. Nearly half of Texas ZIP codes sit in more than one House district, so a ZIP on this list may also be in another one, and your street decides which.',
    h2try: 'See how your own answers compare',
    tryBody: 'The site asks you about these same votes with the party labels hidden, then shows you where you landed next to the members who actually voted.',
    tryCta: 'Open it in English',
    discloseLabel: 'Who made this.',
    disclose: 'Marco Arras, a Texas resident. I donate to the Democratic Party, and I say so before anything else rather than in a footnote. The rule that picks which votes appear is published and runs identically on both caucuses, and every vote and count is in a file you can download and check.',
    sourceLabel: 'Sources.',
    source: 'Roll calls from the Texas House Journal and LegiScan. Districts and ZIP codes derived from 2020 Census blocks; the method and its known error are documented in ZIP_TO_DISTRICT.md.',
    langSwitch: 'En español',
  },
  es: {
    other: 'en', siteName: 'La Franja Morada', target: `${SITE}/es`,
    kicker: 'Cámara de Texas · Sesión de 2025',
    title: (m) => `${m.n}, Distrito ${m.d} de la Cámara de Texas`,
    desc: (m, r) => `Cómo votó ${m.n} en 67 votos registrados de la Cámara de Texas en 2025, `
      + `incluidos los ${r.crossed} en los que se apartó de su propio partido. Gratis, sin registro y sin rastreo.`,
    lede: (m, r) => `${m.n} representa al Distrito ${m.d} de la Cámara de Texas y es ${PARTY.es[m.p]}. Esta página es el registro: de los ${r.total} votos que publica este sitio, ${m.n} emitió ${r.cast}, y en los ${r.divisive} en los que los dos partidos tomaron lados opuestos, votó en contra de su propio partido ${r.crossed} ${r.crossed === 1 ? 'vez' : 'veces'}.`,
    h2cross: 'Dónde se apartó de su propio partido',
    noCross: (m) => `En los votos en los que los dos partidos tomaron lados opuestos, ${m.n} votó siempre con el suyo.`,
    h2zip: (m) => `Códigos postales del Distrito ${m.d}`,
    zipNote: 'Ordenados por población. Casi la mitad de los códigos postales de Texas están repartidos entre más de un distrito, así que un código de esta lista puede estar también en otro, y su calle decide cuál le corresponde.',
    h2try: 'Vea cómo se comparan sus propias respuestas',
    tryBody: 'El sitio le pregunta sobre estos mismos votos con las etiquetas de partido ocultas, y después le muestra dónde quedó usted junto a quienes votaron de verdad.',
    tryCta: 'Ábralo en español',
    discloseLabel: 'Quién lo hizo.',
    disclose: 'Marco Arras, residente de Texas. Yo dono al Partido Demócrata, y lo digo antes que cualquier otra cosa, no en una nota al pie. La regla que escoge cuáles votos aparecen está publicada y se aplica igual a las dos bancadas, y cada voto y cada conteo están en un archivo que usted puede descargar y verificar.',
    sourceLabel: 'Fuentes.',
    source: 'Votaciones nominales del Diario de la Cámara de Texas y de LegiScan. Los distritos y códigos postales se derivan de los bloques del censo de 2020; el método y su error conocido están documentados en ZIP_TO_DISTRICT.md.',
    langSwitch: 'In English',
  },
};

const slugFor = (d, lang) => (lang === 'es' ? `distrito/${d}` : `district/${d}`);

function render(m, lang) {
  const c = COPY[lang];
  const r = stat.get(m.d);
  const canonical = `${SITE}/${slugFor(m.d, lang)}`;
  const altHref = `${SITE}/${slugFor(m.d, c.other)}`;
  const zips = zipsFor(m.d);

  const crossBlock = r.crossings.length
    ? `<h2>${esc(c.h2cross)}</h2><ul>${r.crossings.map((it) =>
      `<li><span class="bill">${esc(it.billId)}</span> — ${esc(summaryFor(it, lang))}</li>`).join('')}</ul>`
    : `<h2>${esc(c.h2cross)}</h2><p>${esc(c.noCross(m))}</p>`;

  const body = `
  <h1>${esc(c.title(m))}</h1>
  <p class="lede">${esc(c.lede(m, r))}</p>
  ${crossBlock}
  <h2>${esc(c.h2zip(m))}</h2>
  <p class="zips">${zips.map(esc).join(' · ')}</p>
  <p class="small">${esc(c.zipNote)}</p>
  <hr>
  <h2>${esc(c.h2try)}</h2>
  <p>${esc(c.tryBody)}</p>
  <p><a class="cta" href="${c.target}">${esc(c.tryCta)}</a></p>
  <hr>
  <p class="small"><span class="label">${esc(c.discloseLabel)}</span> ${esc(c.disclose)}</p>
  <p class="small"><span class="label">${esc(c.sourceLabel)}</span> ${esc(c.source)}</p>`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: c.title(m),
    description: c.desc(m, r),
    inLanguage: lang === 'es' ? 'es-US' : 'en-US',
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: c.siteName, url: SITE },
    about: {
      '@type': 'Person', name: m.n,
      jobTitle: lang === 'es' ? `Representante, Distrito ${m.d}` : `Representative, District ${m.d}`,
    },
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  };

  return document_({
    lang, otherLang: c.other, title: c.title(m), siteName: c.siteName,
    desc: c.desc(m, r), canonical, altHref, altLabel: c.langSwitch,
    ogImage: `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`,
    jsonld, faces, kicker: c.kicker, body,
  });
}

// ---------------------------------------------------------------------------

let n = 0;
for (const { d } of chosen) {
  const m = members.members.find((x) => x.d === d);
  if (!m) throw new Error(`district ${d} has no sitting member in members_89R.json`);
  for (const lang of ['en', 'es']) {
    const slug = slugFor(d, lang);
    const dir = resolve(ROOT, 'public', slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), render(m, lang), 'utf8');
    n++;
  }
  const r = stat.get(d);
  console.log(`  HD-${String(d).padStart(3)}  ${m.n.padEnd(22)}${m.p}  `
    + `cast ${r.cast}/${r.total}, crossed ${r.crossed} of ${r.divisive}, ${zipsFor(d).length} ZIPs`);
}
console.log(`\n  ${n} district pages written (${chosen.length} districts x 2 languages)\n`);

export const PILOT_DISTRICTS = chosen.map((c) => c.d);
