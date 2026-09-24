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
import { SITE, esc, loadFaces, document_, sheetLine } from './_page_shell.mjs';

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

// --- who gets a page ------------------------------------------------------
//
// Everyone who holds a seat. This was ten districts, picked by the five biggest
// cities and then by who broke with their caucus most often, and the comment
// here said plainly that it was a pilot to see whether they rank at all before
// a page per member got published.
//
// What made scaling risky was thin pages: the only per-member content was the
// crossing list, the median member crossed four times, and pages ran as short
// as 319 words. The headline block fixed that, taking the minimum to 625.
//
// 149 and not 150. HD-93 has had no sitting member since 29 July 2026, and it
// drops out naturally because this reads the roster rather than counting to 150.
// The assertion below is what turns that from a silent omission into a stated
// fact if the roster ever changes shape.
const chosen = [...members.members]
  .sort((a, b) => a.d - b.d)
  .map((m) => ({ d: m.d }));

if (chosen.length < 100) {
  throw new Error(`only ${chosen.length} members on the roster; the file is probably truncated`);
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

/**
 * Where a reader goes to check a bill for themselves.
 *
 * WHY THIS EXISTS. The race pages link every bill they name to its history at
 * the Legislature. These pages did not, and they are the ones making a claim
 * about a named living person's voting record, so they were the pages where
 * "check it yourself" was hardest to act on.
 *
 * The payload already carries a curated URL for the 31 bills that drew a
 * Governor or Lieutenant Governor action, and that one is preferred wherever it
 * exists. It is not merely the same string: SB 3 deliberately points at the
 * Legislative Reference Library rather than at capitol.texas.gov, and
 * reconstructing it would quietly throw that decision away.
 *
 * The rest are built from the bill number. All 29 of those were fetched and
 * confirmed to name their bill before this shipped; capitol.texas.gov answers
 * 200 with a generic search page rather than a 404, so a bill that does not
 * exist returns about 3.6 KB naming nothing, against 5.9 KB or more for a real
 * one. A dead link on this page would be worse than no link at all.
 */
const CURATED = new Map();
for (const it of payload.items) {
  for (const a of it.acts ?? []) {
    if (/capitol\.texas\.gov|lrl\.texas\.gov/.test(a.sourceUrl) && !CURATED.has(it.billId)) {
      CURATED.set(it.billId, a.sourceUrl);
    }
  }
}
const billUrl = (billId) => CURATED.get(billId)
  ?? `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=${billId.replace(/\s+/g, '')}`;

/** The short approved name for a headline bill, in the reader's language. */
function labelFor(it, lang) {
  if (lang !== 'es') return it.label ?? it.billId;
  const es = sidecar.items?.[it.billId]?.label;
  if (!es) throw new Error(`no Spanish label in the sidecar for ${it.billId}`);
  return es;
}

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
    lede: (m, r) => `${m.n} represents Texas House District ${m.d} and is a ${PARTY.en[m.p]}. This page is the record: of the ${r.total} votes this site publishes, ${m.n} cast ${r.cast}, and on the ${r.divisive} of those where the two parties took opposite sides, ${r.crossed === 0 ? 'they never voted against their own party' : `they voted against their own party ${r.crossed} ${r.crossed === 1 ? 'time' : 'times'}`}.`,
    indexTitle: 'Every Texas House district',
    indexDesc: 'All 150 Texas House districts, the member who holds each one, and how they voted in the 2025 session. Free, no sign-up, nothing tracked.',
    indexLede: 'One page per sitting member, showing how they voted on the bills that drew the most attention and where they broke with their own party.',
    indexKey: 'The pair after each name is how often that member voted against their own party, out of the votes where the two parties took opposite sides.',
    indexVacant: (d) => `District ${d} has no sitting member and so has no page. Nate Schatzline held it and left on 29 July 2026, after casting 3,283 votes that are still the record for that district.`,
    indexZip: 'If you do not know your district, the lookup takes a ZIP code. Nearly half of Texas ZIP codes sit in more than one House district, so it lists every district yours touches rather than picking one.',
    indexBack: 'All 150 districts',
    h2head: 'How they voted on the bills people have heard of',
    headNote: 'These seven drew the most attention of the 67 this site publishes. Every member has a position on record for each one, whichever way they went.',
    yea: 'Voted for',
    nay: 'Voted against',
    noVote: 'No recorded vote',
    elsewhere: (v) => `${v}, on another vote on this bill`,
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
    histLabel: 'history',
    langSwitch: 'En español',
  },
  es: {
    other: 'en', siteName: 'La Franja Morada', target: `${SITE}/es`,
    kicker: 'Cámara de Texas · Sesión de 2025',
    title: (m) => `${m.n}, Distrito ${m.d} de la Cámara de Texas`,
    desc: (m, r) => `Cómo votó ${m.n} en 67 votos registrados de la Cámara de Texas en 2025, `
      + `incluidos los ${r.crossed} en los que se apartó de su propio partido. Gratis, sin registro y sin rastreo.`,
    lede: (m, r) => `${m.n} representa al Distrito ${m.d} de la Cámara de Texas y es ${PARTY.es[m.p]}. Esta página es el registro: de los ${r.total} votos que publica este sitio, ${m.n} emitió ${r.cast}, y en los ${r.divisive} en los que los dos partidos tomaron lados opuestos, ${r.crossed === 0 ? 'nunca votó en contra de su propio partido' : `votó en contra de su propio partido ${r.crossed} ${r.crossed === 1 ? 'vez' : 'veces'}`}.`,
    indexTitle: 'Todos los distritos de la Cámara de Texas',
    indexDesc: 'Los 150 distritos de la Cámara de Texas, quién ocupa cada uno, y cómo votaron en la sesión de 2025. Gratis, sin registro y sin rastreo.',
    indexLede: 'Una página por cada legislador en funciones, con cómo votó en los proyectos de ley que más atención recibieron y dónde se apartó de su propio partido.',
    indexKey: 'El par que sigue a cada nombre es cuántas veces esa persona votó en contra de su propio partido, de los votos en los que los dos partidos tomaron lados opuestos.',
    indexVacant: (d) => `El Distrito ${d} no tiene legislador en funciones, así que no tiene página. Nate Schatzline lo ocupaba y se fue el 29 de julio de 2026, después de emitir 3,283 votos que siguen siendo el registro de ese distrito.`,
    indexZip: 'Si no sabe cuál es su distrito, la búsqueda acepta un código postal. Casi la mitad de los códigos postales de Texas están en más de un distrito, así que le muestra todos los que le tocan en vez de escoger uno.',
    indexBack: 'Los 150 distritos',
    h2head: 'Cómo votó en los proyectos de ley de los que sí se habló',
    headNote: 'Estos siete fueron los que más atención recibieron de los 67 que publica este sitio. De cada uno hay una posición registrada para cada legislador, sea cual sea.',
    yea: 'Votó a favor',
    nay: 'Votó en contra',
    noVote: 'Sin voto registrado',
    elsewhere: (v) => `${v}, en otra votación sobre este mismo proyecto`,
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
    histLabel: 'historial',
    langSwitch: 'In English',
  },
};

/**
 * The seven bills the payload flags as headline, in the order it lists them.
 *
 * Every one carries an approved plain-language summary in both languages and an
 * approved label, so this block needs no new translation of bill content.
 */
const HEADLINE = payload.items.filter((i) => i.headline);

/**
 * How one member stood on one bill.
 *
 * A blank is not always an absence. The payload records, per item, members who
 * cast no vote on THE roll call this site uses but who did vote on another roll
 * call of the same bill. Reporting those as "no recorded vote" would be the
 * single most misleading thing this page could say about somebody, so they are
 * shown with the position they actually took and marked as not counted here.
 * That is the same rule the site itself applies.
 */
function standOn(item, member, lang) {
  const mark = member.v[order.indexOf(item.id)];
  const c = COPY[lang];
  if (mark === 'y') return { kind: 'yea', text: c.yea };
  if (mark === 'n') return { kind: 'nay', text: c.nay };
  const other = item.elsewhere?.[member.id];
  if (other === 1 || other === -1) {
    return { kind: 'elsewhere', text: c.elsewhere(other === 1 ? c.yea : c.nay) };
  }
  return { kind: 'none', text: c.noVote };
}

const slugFor = (d, lang) => (lang === 'es' ? `distrito/${d}` : `district/${d}`);

function render(m, lang) {
  const c = COPY[lang];
  const r = stat.get(m.d);
  const canonical = `${SITE}/${slugFor(m.d, lang)}`;
  const altHref = `${SITE}/${slugFor(m.d, c.other)}`;
  const zips = zipsFor(m.d);

  // Placed BELOW the crossings on purpose. This block is identical on all 150
  // pages except for seven words, so it is the boilerplate; the crossing list is
  // the part that is only true of this member. Unique content goes first, and an
  // earlier draft had these the other way round, which pushed the distinctive
  // material below seven repeated bill summaries on every page in the set.
  const headBlock = `<h2>${esc(c.h2head)}</h2><p class="small">${esc(c.headNote)}</p><ul class="stand">${
    HEADLINE.map((it) => {
      const st = standOn(it, m, lang);
      return `<li><span class="bill">${esc(it.billId)}</span> <b>${esc(labelFor(it, lang))}</b>`
        + ` <span class="vm vm-${st.kind}">${esc(st.text)}</span><br>`
        + `<span class="small">${esc(summaryFor(it, lang))} `
        + `<a class="hist" href="${esc(billUrl(it.billId))}" rel="nofollow noopener" target="_blank">${esc(c.histLabel)}</a></span></li>`;
    }).join('')}</ul>`;

  // Nothing to show is not a section. For the five members who never broke with
  // their caucus the lede already says so, and a heading followed by one
  // sentence restating it pushed the useful part of the page down while telling
  // the reader the same thing twice.
  const crossBlock = r.crossings.length
    ? `<h2>${esc(c.h2cross)}</h2><ul>${r.crossings.map((it) =>
      `<li><span class="bill">${esc(it.billId)}</span> — ${esc(summaryFor(it, lang))} `
      + `<a class="hist" href="${esc(billUrl(it.billId))}" rel="nofollow noopener" target="_blank">${esc(c.histLabel)}</a></li>`).join('')}</ul>`
    : '';

  const body = `
  <h1>${esc(c.title(m))}</h1>
  <p class="lede">${esc(c.lede(m, r))}</p>
  ${crossBlock}
  ${headBlock}
  <h2>${esc(c.h2zip(m))}</h2>
  <p class="zips">${zips.map(esc).join(' · ')}</p>
  <p class="small">${esc(c.zipNote)}</p>
  <hr>
  <h2>${esc(c.h2try)}</h2>
  <p>${esc(c.tryBody)}</p>
  <p><a class="cta" href="${c.target}">${esc(c.tryCta)}</a></p>
  <p class="small">${sheetLine(lang)}</p>
  <p class="small"><a href="${SITE}/${lang === 'es' ? 'distritos' : 'districts'}">${esc(c.indexBack)}</a></p>
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
// --- the index -------------------------------------------------------------
//
// This exists because nothing linked to the district pages. Each one had a
// single crawlable inbound link, its own translation, so the set was 149 closed
// pairs that a reader could only reach by finishing the quiz and a crawler could
// only reach through the sitemap.
for (const lang of ['en', 'es']) {
  const c = COPY[lang];
  const dir = lang === 'es' ? 'distritos' : 'districts';
  const canonical = `${SITE}/${dir}`;
  const altHref = `${SITE}/${lang === 'es' ? 'districts' : 'distritos'}`;

  const items = [...members.members].sort((a, b) => a.d - b.d).map((m) => {
    const r = stat.get(m.d);
    return `<li><a href="${SITE}/${slugFor(m.d, lang)}">`
      + `<span class="bill">${esc(String(m.d))}</span> ${esc(m.n)}</a>`
      + ` <span class="small">${esc(PARTY[lang][m.p])}, ${r.crossed}/${r.divisive}</span></li>`;
  }).join('');

  const body = `
  <h1>${esc(c.indexTitle)}</h1>
  <p class="lede">${esc(c.indexLede)}</p>
  <p class="small">${esc(c.indexKey)}</p>
  <ul class="dindex">${items}</ul>
  <p class="small">${esc(c.indexVacant(93))}</p>
  <p class="small">${esc(c.indexZip)}</p>
  <hr>
  <p><a class="cta" href="${c.target}">${esc(c.tryCta)}</a></p>
  <p class="small">${sheetLine(lang)}</p>
  <hr>
  <p class="small"><span class="label">${esc(c.discloseLabel)}</span> ${esc(c.disclose)}</p>
  <p class="small"><span class="label">${esc(c.sourceLabel)}</span> ${esc(c.source)}</p>`;

  const html = document_({
    lang, title: c.indexTitle, siteName: c.siteName, desc: c.indexDesc,
    canonical, altHref, altLabel: c.langSwitch, otherLang: c.other,
    faces, kicker: c.kicker, body,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: c.indexTitle, description: c.indexDesc, url: canonical,
      inLanguage: lang === 'es' ? 'es-US' : 'en-US',
      isPartOf: { '@type': 'WebSite', name: c.siteName, url: SITE },
    },
  });
  const out = resolve(ROOT, 'public', dir);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), html, 'utf8');
  n++;
}
console.log(`  /districts and /distritos written, linking all ${members.members.length} members`);

console.log(`\n  ${n} district pages written (${chosen.length} sitting members x 2 languages, plus 2 index pages)\n`);

