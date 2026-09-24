/**
 * PlainRecord — /charts and /graficas: the corpus drawn three ways
 *
 *   node scripts/build_charts.mjs
 *
 * 1. How far apart the two parties were on every recorded vote.
 * 2. Who breaks with their own party, one dot per member.
 * 3. Where those members are, a district map with metro insets.
 *
 * EVERY FIGURE IS COMPUTED HERE from the shipped files, and every claim in a
 * caption is asserted before it is printed. The border-region sentence is the
 * one most likely to go stale, so the build throws if the three Democrats it
 * names stop being border districts.
 *
 * THE SPANISH IS INLINE, like the other static pages, so THE SPANISH GATE DOES
 * NOT COVER IT. Approved by Marco on 24 September 2026; a later edit needs a
 * human read.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, esc, loadFaces, document_, sheetLine } from './_page_shell.mjs';
import { crossingRates, gapBins, histogramSvg, dotPlotSvg, loadTopo, mapSvg } from './_charts.mjs';
import { billPath } from './build_bill_pages.mjs';
import { cardsFresh, chartsCard, chartDownload } from './_share_cards.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const bulk = read('public/data/votes_89R.json');
const roster = read('public/data/members_89R.json');
const quiz = read('public/data/quiz_89R.json');
const topo = loadTopo(resolve(ROOT, 'public/data/boundaries_tx.topo.json'));

// --- the numbers every caption quotes ---------------------------------------

const bins = gapBins(bulk);
const total = bins.reduce((a, b) => a + b, 0);
if (total !== bulk.items.length) throw new Error('gap bins do not account for every roll call');
const alike = bins[0];
const partyLine = bins[8] + bins[9];
const unanimous = bulk.items.filter((it) => it.yeas === 0 || it.nays === 0).length;

const { rows: rates, contested } = crossingRates(bulk, roster);
const noVotes = rates.filter((r) => r.rate === null);
const ranked = (p) => rates.filter((r) => r.p === p && r.rate !== null).sort((a, b) => b.rate - a.rate);
const median = (p) => { const a = ranked(p).map((r) => r.rate).sort((x, y) => x - y); return a[Math.floor((a.length - 1) / 2)]; };
const topD = ranked('D').slice(0, 3);
const topR = ranked('R').slice(0, 3);

// House districts that sit on or against the Rio Grande, from Laredo to the
// Valley and the Eagle Pass-Del Rio stretch. The caption calls the three most
// independent Democrats "from the border region"; if that stops being true of
// the data, the build fails rather than printing it.
const BORDER = new Set([31, 35, 36, 37, 38, 39, 40, 41, 42, 74, 80]);
if (!topD.every((r) => BORDER.has(r.d))) {
  throw new Error(`the top Democrats are no longer all border districts: ${topD.map((r) => r.d).join(', ')}`);
}
if (noVotes.length !== 1 || noVotes[0].d !== 83) {
  throw new Error(`expected only the Speaker (HD-83) to have no contested votes, got ${noVotes.map((r) => r.d).join(', ')}`);
}

const P = (x) => `${Math.round(x * 100)}%`;
const n = (x) => x.toLocaleString('en-US');
const districtPath = (d, lang) => (lang === 'es' ? `distrito/${d}` : `district/${d}`);
// "Raymond (42)" read as an age or a percentage, so the district is named.
const listNames = (rs, and, dist) => rs.map((r) => `${r.n} (${dist(r.d)})`).join(', ').replace(/, ([^,]*)$/, ` ${and} $1`);

const INSETS = {
  en: ['Houston', 'Dallas-Fort Worth', 'Austin', 'San Antonio'],
  es: ['Houston', 'Dallas-Fort Worth', 'Austin', 'San Antonio'],
};
const BOXES = [
  [-95.9, 29.45, -95.0, 30.2],
  [-97.6, 32.5, -96.45, 33.25],
  [-98.05, 30.1, -97.45, 30.65],
  [-98.85, 29.2, -98.2, 29.75],
];

const COPY = {
  en: {
    other: 'es', slug: 'charts', siteName: 'The Purple Strip', target: `${SITE}/`,
    kicker: 'Texas House · 2025 session', langSwitch: 'En español',
    docTitle: 'Texas House votes in charts: how often the parties agree',
    h1: `What ${n(total)} Texas House votes look like`,
    desc: `Every recorded Texas House vote of 2025 in three charts: how often the parties agreed, who broke with their own party, and where those members are.`,
    lede: 'Every recorded vote of the 2025 session, drawn three ways: how far apart the two parties were, which members broke with their own party, and where those members are.',
    h2a: 'Most votes were not party-line',
    capA: `Each column counts roll calls by the gap between the share of Republicans and the share of Democrats who voted yes. On ${n(alike)} of the ${n(total)} (${P(alike / total)}), the two parties were within 10 points of each other, and ${n(unanimous)} were unanimous. On ${n(partyLine)} (${P(partyLine / total)}), they were 80 points or more apart.`,
    caveatA: 'The source does not separate final passage from amendments and procedural motions, so every recorded vote is counted, and routine votes are part of why so many are nearly unanimous.',
    hist: {
      band: (a, b) => `${a} to ${b} points`,
      barTip: (range, v, t) => `${range}: ${n(v)} votes, ${P(v / t)} of all`,
      leftEnd: '← parties voted alike', rightEnd: 'party-line →',
      xTitle: 'Gap between the parties’ yes shares, in percentage points',
      alt: `A histogram of ${n(total)} votes. The tallest column, ${n(alike)} votes, is where the parties were within 10 points of each other; the columns shrink toward the party-line end.`,
    },
    tableA: ['Gap', 'Votes', 'Share of all'],
    h2b: 'Who breaks with their own party',
    capB: `One dot per member, placed at the share of contested votes, the ${n(contested)} where most Republicans and most Democrats voted opposite ways, on which that member voted against the majority of their own party. The median Democrat did it on ${P(median('D'))} of them and the median Republican on ${P(median('R'))}. The three Democrats furthest right are ${listNames(topD, 'and', (d) => `HD-${d}`)}, all from the border region. The three Republicans are ${listNames(topR, 'and', (d) => `HD-${d}`)}.`,
    speakerNote: (r) => `${r.n} (District ${r.d}), the Speaker, cast none of these votes and is left out.`,
    dots: {
      dem: 'Democrats', rep: 'Republicans',
      median: (x) => `median ${x}`,
      topLabel: (r) => `${r.n}, ${P(r.rate)}`,
      dotTip: (r) => `${r.n} (${r.p}, District ${r.d}): against their own party on ${n(r.broke)} of ${n(r.cast)} contested votes${r.left ? ', left the House on 29 July 2026' : ''}`,
      xTitle: 'Share of contested votes cast against their own party',
      alt: 'A dot plot of every member. Democrats cluster at the low end with three far to the right; Republicans are spread across the whole range.',
    },
    tableB: ['Member', 'Party', 'District', 'Against own party', 'Contested votes cast', 'Share'],
    h2c: 'Where they are',
    capC: 'Each district is shaded by how often its member voted against their own party on contested votes. Big rural districts dominate the state map but hold about as many people as the small city ones, so the four largest metro areas are drawn again below at a readable size. Each district links to its page.',
    map: {
      legendTitle: 'Voted against own party',
      classes: ['under 10%', '10 to 19%', '20 to 29%', '30 to 39%', '40% or more'],
      noData: 'no contested votes',
      tip: (r) => (r.rate === null
        ? `District ${r.d}, ${r.n}: no contested votes cast`
        : `District ${r.d}, ${r.n} (${r.p}): against their own party on ${P(r.rate)} of contested votes${r.left ? ', left the House on 29 July 2026' : ''}`),
      vacant: (d) => `District ${d}`,
      alt: 'A map of the 150 Texas House districts shaded by how often each member voted against their own party.',
      insetAlt: (name) => `${name} area districts, shaded the same way`,
    },
    tableNote: 'The table under the previous chart lists every member.',
    seeNumbers: 'See the numbers',
    download: 'Download image', linkHere: 'Link to this chart',
    h2more: 'The same data, as pages',
    more: [
      [`${SITE}/districts`, 'Find your representative by ZIP code'],
      ...quiz.items.filter((i) => i.headline).map((it) => [`${SITE}/${billPath(it.billId, 'en')}`, `${it.billId}, ${it.label}: every member's vote`]),
      [`${SITE}/open-data`, 'Download every vote as data'],
    ],
    tryCta: 'Take the quiz',
    discloseLabel: 'Who made this.',
    disclose: 'Marco Arras, a Texas resident. I donate to the Democratic Party, and I say so before anything else rather than in a footnote. Every chart here is computed from files you can download and check.',
    sourceLabel: 'Sources.',
    source: 'Roll calls from the Texas House Journal and Open States. District boundaries from the Census Bureau.',
  },
  es: {
    other: 'en', slug: 'graficas', siteName: 'La Franja Morada', target: `${SITE}/es`,
    kicker: 'Cámara de Texas · Sesión de 2025', langSwitch: 'In English',
    docTitle: 'Votos de la Cámara de Texas en gráficas',
    h1: `Cómo se ven ${n(total)} votos de la Cámara de Texas`,
    desc: 'Cada voto registrado de la Cámara de Texas en 2025, en tres gráficas: qué tan seguido coincidieron los partidos, quién se apartó del suyo y dónde están esas personas.',
    lede: 'Cada votación registrada de la sesión de 2025, vista de tres maneras: qué tan lejos estuvieron los dos partidos, quiénes se apartaron de su propio partido y dónde están esas personas.',
    h2a: 'La mayoría de los votos no fueron de línea partidista',
    capA: `Cada columna cuenta las votaciones nominales según la diferencia entre la proporción de la bancada republicana y la de la bancada demócrata que votó a favor. En ${n(alike)} de las ${n(total)} (${P(alike / total)}), los dos partidos quedaron a menos de 10 puntos, y ${n(unanimous)} fueron unánimes. En ${n(partyLine)} (${P(partyLine / total)}), quedaron a 80 puntos o más.`,
    caveatA: 'La fuente no distingue la aprobación final de las enmiendas y las mociones de procedimiento, así que se cuentan todos los votos registrados, y los votos de trámite son parte de por qué tantos son casi unánimes.',
    hist: {
      band: (a, b) => `de ${a} a ${b} puntos`,
      barTip: (range, v, t) => `${range}: ${n(v)} votos, ${P(v / t)} del total`,
      leftEnd: '← las bancadas votaron igual', rightEnd: 'de línea partidista →',
      xTitle: 'Diferencia entre las proporciones a favor de cada bancada, en puntos porcentuales',
      alt: `Un histograma de ${n(total)} votos. La columna más alta, ${n(alike)} votos, es donde los partidos quedaron a menos de 10 puntos; las columnas bajan hacia el extremo de línea partidista.`,
    },
    tableA: ['Diferencia', 'Votos', 'Proporción del total'],
    h2b: 'Quién se aparta de su propio partido',
    capB: `Hay un punto por cada integrante de la Cámara, ubicado según la proporción de votos disputados, los ${n(contested)} en los que la mayoría republicana y la mayoría demócrata votaron en sentidos opuestos, en los que votó en contra de la mayoría de su propio partido. En la bancada demócrata la mediana fue ${P(median('D'))}, y en la republicana, ${P(median('R'))}. Los tres puntos demócratas más a la derecha son ${listNames(topD, 'y', (d) => `Distrito ${d}`)}, todos de la región fronteriza. Los tres republicanos son ${listNames(topR, 'y', (d) => `Distrito ${d}`)}.`,
    speakerNote: (r) => `${r.n} (Distrito ${r.d}), presidente de la Cámara, no emitió ninguno de estos votos y queda fuera.`,
    dots: {
      dem: 'Bancada demócrata', rep: 'Bancada republicana',
      median: (x) => `mediana ${x}`,
      topLabel: (r) => `${r.n}, ${P(r.rate)}`,
      dotTip: (r) => `${r.n} (${r.p}, Distrito ${r.d}): en contra de su propio partido en ${n(r.broke)} de ${n(r.cast)} votos disputados${r.left ? ', se fue de la Cámara el 29 de julio de 2026' : ''}`,
      xTitle: 'Proporción de votos disputados en contra de su propio partido',
      alt: 'Una gráfica de puntos con cada integrante. La bancada demócrata se agrupa en el extremo bajo, con tres puntos muy a la derecha; la republicana se reparte por todo el rango.',
    },
    tableB: ['Integrante', 'Partido', 'Distrito', 'En contra de su partido', 'Votos disputados emitidos', 'Proporción'],
    h2c: 'Dónde están',
    capC: 'Cada distrito está sombreado según qué tan seguido su integrante votó en contra de su propio partido en los votos disputados. Los distritos rurales grandes dominan el mapa del estado, pero tienen más o menos la misma población que los urbanos pequeños, así que las cuatro zonas metropolitanas más grandes se muestran otra vez abajo a un tamaño legible. Cada distrito enlaza a su página.',
    map: {
      legendTitle: 'Votó en contra de su partido',
      classes: ['menos del 10%', 'del 10 al 19%', 'del 20 al 29%', 'del 30 al 39%', '40% o más'],
      noData: 'sin votos disputados',
      tip: (r) => (r.rate === null
        ? `Distrito ${r.d}, ${r.n}: no emitió votos disputados`
        : `Distrito ${r.d}, ${r.n} (${r.p}): en contra de su propio partido en el ${P(r.rate)} de los votos disputados${r.left ? ', se fue de la Cámara el 29 de julio de 2026' : ''}`),
      vacant: (d) => `Distrito ${d}`,
      alt: 'Un mapa de los 150 distritos de la Cámara de Texas, sombreados según qué tan seguido cada integrante votó en contra de su propio partido.',
      insetAlt: (name) => `Distritos de la zona de ${name}, con el mismo sombreado`,
    },
    tableNote: 'La tabla de la gráfica anterior incluye a cada integrante.',
    seeNumbers: 'Ver los números',
    download: 'Descargar imagen', linkHere: 'Enlace a esta gráfica',
    h2more: 'Los mismos datos, en páginas',
    more: [
      [`${SITE}/distritos`, 'Encuentre a su representante por código postal'],
      ...quiz.items.filter((i) => i.headline).map((it) => {
        const es = read('public/data/quiz_89R.es.json').items[it.billId].label;
        return [`${SITE}/${billPath(it.billId, 'es')}`, `${it.billId}, ${es}: el voto de cada integrante`];
      }),
    ],
    tryCta: 'Ábralo en español',
    discloseLabel: 'Quién lo hizo.',
    disclose: 'Marco Arras, residente de Texas. Yo dono al Partido Demócrata, y lo digo antes que cualquier otra cosa, no en una nota al pie. Cada gráfica de esta página se calcula a partir de archivos que usted puede descargar y verificar.',
    sourceLabel: 'Fuentes.',
    source: 'Votaciones nominales del Diario de la Cámara de Texas y de Open States. Límites de los distritos de la Oficina del Censo.',
  },
};

function render(lang) {
  const c = COPY[lang];
  const canonical = `${SITE}/${c.slug}`;
  const altHref = `${SITE}/${COPY[c.other].slug}`;
  // A member who has left has no page: HD-93 is vacant and /district/93 404s.
  const href = (r) => (r.left ? null : `${SITE}/${districtPath(r.d, lang)}`);

  // Download and link-to-chart, under each chart. The download only exists
  // while the committed image matches the data; the anchor always works.
  const share = (id) => `<p class="small chart-share">`
    + (cardsFresh() ? `<a href="${chartDownload(id, lang)}" download>${esc(c.download)}</a> · ` : '')
    + `<a href="#${id}">${esc(c.linkHere)}</a></p>`;

  const histTable = `<table class="chart-table"><thead><tr><th>${esc(c.tableA[0])}</th><th class="num">${esc(c.tableA[1])}</th><th class="num">${esc(c.tableA[2])}</th></tr></thead><tbody>`
    + bins.map((v, i) => `<tr><td>${esc(c.hist.band(i * 10, i * 10 + 10))}</td><td class="num">${n(v)}</td><td class="num">${P(v / total)}</td></tr>`).join('')
    + '</tbody></table>';

  const sorted = rates.filter((r) => r.rate !== null).sort((a, b) => b.rate - a.rate);
  const memberTable = `<table class="chart-table"><thead><tr>${c.tableB.map((h, i) => `<th${i >= 3 ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>`
    + sorted.map((r) => `<tr><td>${r.left ? esc(r.n) : `<a href="${href(r)}">${esc(r.n)}</a>`}</td><td>${r.p}</td><td>${r.d}</td>`
      + `<td class="num">${n(r.broke)}</td><td class="num">${n(r.cast)}</td><td class="num">${P(r.rate)}</td></tr>`).join('')
    + '</tbody></table>';

  const { mainSvg, insetSvgs, legendHtml } = mapSvg(topo, rates, c.map, href,
    BOXES.map((box, i) => ({ box, name: INSETS[lang][i] })));

  const body = `
  <h1>${esc(c.h1)}</h1>
  <p class="lede">${esc(c.lede)}</p>

  <h2 id="agree">${esc(c.h2a)}</h2>
  <figure class="chart">${histogramSvg(bins, c.hist)}<figcaption class="small">${esc(c.hist.xTitle)}</figcaption></figure>
  <p>${esc(c.capA)}</p>
  <p class="small" id="agree-end">${esc(c.caveatA)}</p>
  <details class="table"><summary>${esc(c.seeNumbers)}</summary>${histTable}</details>
  ${share('agree')}

  <h2 id="ranks">${esc(c.h2b)}</h2>
  <figure class="chart">${dotPlotSvg(rates, c.dots, href)}</figure>
  <p>${esc(c.capB)}</p>
  <p class="small" id="ranks-end">${esc(c.speakerNote(noVotes[0]))}</p>
  <details class="table"><summary>${esc(c.seeNumbers)}</summary>${memberTable}</details>
  ${share('ranks')}

  <h2 id="map">${esc(c.h2c)}</h2>
  ${legendHtml}
  <figure class="chart">${mainSvg}</figure>
  <div class="chart insets">${insetSvgs.join('')}</div>
  <p id="map-end">${esc(c.capC)}</p>
  <p class="small">${esc(c.tableNote)}</p>
  ${share('map')}

  <h2>${esc(c.h2more)}</h2>
  <ul>${c.more.map(([u, t]) => `<li><a href="${u}">${esc(t)}</a></li>`).join('')}</ul>
  <p><a class="cta" href="${c.target}">${esc(c.tryCta)}</a></p>
  <p class="small">${sheetLine(lang)}</p>
  <hr>
  <p class="small"><span class="label">${esc(c.discloseLabel)}</span> ${esc(c.disclose)}</p>
  <p class="small"><span class="label">${esc(c.sourceLabel)}</span> ${esc(c.source)}</p>`;

  return document_({
    lang, otherLang: c.other, title: c.h1, docTitle: c.docTitle, siteName: c.siteName,
    desc: c.desc, canonical, altHref, altLabel: c.langSwitch,
    ogImage: cardsFresh() ? chartsCard(lang) : `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`, faces, kicker: c.kicker, body,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'WebPage', name: c.h1, description: c.desc,
      inLanguage: lang === 'es' ? 'es-US' : 'en-US', url: canonical,
      isPartOf: { '@type': 'WebSite', name: c.siteName, url: SITE },
      about: { '@id': `${SITE}/open-data#dataset` },
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
  });
}

for (const lang of ['en', 'es']) {
  const dir = resolve(ROOT, 'public', COPY[lang].slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), render(lang), 'utf8');
}
console.log(`  /charts and /graficas written: ${n(total)} votes, ${n(alike)} within 10 points, ${n(partyLine)} at 80+,`
  + ` ${contested} contested; median D ${P(median('D'))}, R ${P(median('R'))}; top D ${topD.map((r) => r.d).join('/')}`);
