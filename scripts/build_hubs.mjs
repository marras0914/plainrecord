/**
 * PlainRecord — the two hubs the site nav points at: /bills and /races
 *
 *   node scripts/build_hubs.mjs
 *
 * Writes /bills and /proyectos (the seven headline bills) and /races and
 * /contiendas (the three statewide races). Before these, neither set had an
 * index: the bill pages were three or four clicks from the homepage and the race
 * pages could only be reached from a link the quiz draws after a reader has
 * answered something. The nav needed somewhere to point.
 *
 * NOTHING HERE IS NEW SUBSTANCE. Every summary, tally, act and reason is quoted
 * from the payload and the approved Spanish sidecar, in the same words the
 * pages they link to use. Only the framing sentences are new; Marco approved the
 * Spanish on 24 September 2026. It is inline, so THE SPANISH GATE DOES NOT
 * COVER IT, and a later edit needs a human read.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, esc, loadFaces, document_, sheetLine } from './_page_shell.mjs';
import { HEADLINE_BILLS, RACES, billPath } from './_site_nav.mjs';
import { actsLine } from './build_bill_pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const quiz = read('public/data/quiz_89R.json');
const sidecar = read('public/data/quiz_89R.es.json');
const itemOf = new Map(quiz.items.map((i) => [i.billId, i]));

const summary = (it, lang) => {
  const v = lang === 'es' ? sidecar.items?.[it.billId]?.plain : it.plain;
  if (!v) throw new Error(`build_hubs: no ${lang} summary for ${it.billId}`);
  return v;
};
const whyNoVotes = (name, lang) => {
  const v = lang === 'es' ? sidecar.opponents?.[name]?.whyNoVotes : quiz.opponents.find((o) => o.name === name)?.whyNoVotes;
  if (!v) throw new Error(`build_hubs: no ${lang} reason for ${name}`);
  return v;
};

const COPY = {
  en: {
    other: 'es', siteName: 'The Purple Strip', kicker: 'Texas House · 2025 session', langSwitch: 'En español', quiz: `${SITE}/`,
    bills: {
      slug: 'bills', otherSlug: 'proyectos',
      docTitle: 'How the Texas House voted on the biggest 2025 bills',
      h1: 'The seven bills that drew the most attention',
      desc: 'How every Texas House member voted on the seven 2025 bills that drew the most attention: education savings accounts, the Ten Commandments, the THC ban, immigration enforcement and more.',
      lede: 'These seven drew the most attention of the 67 votes this site asks about. Each page lists how every member of the Texas House voted, and who went against most of their own party.',
      tally: (it) => `The House voted ${it.yeas} to ${it.nays}.`,
      open: (it) => `How every member voted on ${it.billId}`,
      rest: 'The other 60 votes are in the quiz, with the party labels hidden until you answer.',
      cta: 'Take the quiz',
    },
    races: {
      slug: 'races', otherSlug: 'contiendas',
      docTitle: '2026 Texas races: Governor, Lt. Governor, U.S. Senate',
      h1: 'Three 2026 races, and what the record shows',
      desc: 'What the public record shows about both candidates in three 2026 Texas races: Governor, Lieutenant Governor and U.S. Senate.',
      lede: 'In each race, one candidate sits in the Texas House and has votes on these bills, and the other does not. Each page says exactly what the record shows for both, and where the two kinds of record stop being comparable.',
      noVotes: (r) => `Why ${r.opp} has no votes here:`,
      open: (r) => `What the record shows for both`,
      rest: 'The quiz shows how all three House candidates voted on each bill once you have answered it.',
      cta: 'Take the quiz',
    },
    discloseLabel: 'Who made this.',
    disclose: 'Marco Arras, a Texas resident. I donate to the Democratic Party, and I say so before anything else rather than in a footnote. The rule that picks which votes appear is published and runs identically on both caucuses, and every vote and count is in a file you can download and check.',
  },
  es: {
    other: 'en', siteName: 'La Franja Morada', kicker: 'Cámara de Texas · Sesión de 2025', langSwitch: 'In English', quiz: `${SITE}/es`,
    bills: {
      slug: 'proyectos', otherSlug: 'bills',
      docTitle: 'Cómo votó la Cámara de Texas en los grandes proyectos de 2025',
      h1: 'Los siete proyectos de ley que más atención recibieron',
      desc: 'Cómo votó cada integrante de la Cámara de Texas en los siete proyectos de 2025 que más atención recibieron: las cuentas de ahorro educativo, los Diez Mandamientos, la prohibición del THC, la aplicación de la ley migratoria y más.',
      lede: 'Estos siete fueron los que más atención recibieron de los 67 votos que consulta este sitio. Cada página muestra cómo votó cada integrante de la Cámara de Texas, y quién votó en contra de la mayoría de su propio partido.',
      tally: (it) => `La Cámara votó ${it.yeas} a ${it.nays}.`,
      open: (it) => `Cómo votó cada integrante sobre el proyecto ${it.billId}`,
      rest: 'Los otros 60 votos están en el cuestionario, con las etiquetas de partido ocultas hasta que usted responda.',
      cta: 'Ábralo en español',
    },
    races: {
      slug: 'contiendas', otherSlug: 'races',
      docTitle: 'Contiendas de Texas en 2026: gobernador, vicegobernador y Senado',
      h1: 'Tres contiendas de 2026 y lo que muestra el historial',
      desc: 'Lo que muestra el registro público sobre ambos candidatos en tres contiendas de Texas en 2026: gobernador, vicegobernador y Senado de Estados Unidos.',
      lede: 'En cada contienda, una de las dos personas ocupa una curul en la Cámara de Texas y tiene votos sobre estos proyectos, y la otra no. Cada página dice exactamente qué muestra el registro de cada una, y dónde los dos tipos de registro dejan de ser comparables.',
      noVotes: (r) => `Por qué ${r.opp} no tiene votos aquí:`,
      open: () => 'Lo que muestra el historial de cada una',
      rest: 'El cuestionario muestra cómo votaron las tres personas candidatas de la Cámara en cada proyecto, una vez que usted responde.',
      cta: 'Ábralo en español',
    },
    discloseLabel: 'Quién lo hizo.',
    disclose: 'Marco Arras, residente de Texas. Yo dono al Partido Demócrata, y lo digo antes que cualquier otra cosa, no en una nota al pie. La regla que escoge cuáles votos aparecen está publicada y se aplica igual a las dos bancadas, y cada voto y cada conteo están en un archivo que usted puede descargar y verificar.',
  },
};

function page(lang, which, items) {
  const c = COPY[lang];
  const h = c[which];
  const canonical = `${SITE}/${h.slug}`;
  const body = `
  <h1>${esc(h.h1)}</h1>
  <p class="lede">${esc(h.lede)}</p>
  <ul class="stand">${items}</ul>
  <p>${esc(h.rest)}</p>
  <p><a class="cta" href="${c.quiz}">${esc(h.cta)}</a></p>
  <p class="small">${sheetLine(lang)}</p>
  <hr>
  <p class="small"><span class="label">${esc(c.discloseLabel)}</span> ${esc(c.disclose)}</p>`;
  return document_({
    lang, otherLang: c.other, title: h.h1, docTitle: h.docTitle, siteName: c.siteName,
    desc: h.desc, canonical, altHref: `${SITE}/${h.otherSlug}`, altLabel: c.langSwitch,
    ogImage: `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`, faces, kicker: c.kicker, body,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: h.h1, description: h.desc,
      inLanguage: lang === 'es' ? 'es-US' : 'en-US', url: canonical,
      isPartOf: { '@type': 'WebSite', name: c.siteName, url: SITE },
    },
  });
}

let n = 0;
for (const lang of ['en', 'es']) {
  const c = COPY[lang];
  const billItems = HEADLINE_BILLS.map((b) => {
    const it = itemOf.get(b.billId);
    const acts = actsLine(it, lang);
    return `<li><a href="${SITE}/${billPath(b.billId, lang)}"><span class="bill">${esc(b.billId)}</span> <b>${esc(b.label[lang])}</b></a><br>`
      + `<span class="small">${esc(summary(it, lang))} ${esc(c.bills.tally(it))}${acts ? ' ' + esc(acts) : ''}</span><br>`
      + `<a class="small" href="${SITE}/${billPath(b.billId, lang)}">${esc(c.bills.open(it))}</a></li>`;
  }).join('');
  const raceItems = RACES.map((r) => `<li><a href="${SITE}/${r.slug[lang]}"><b>${esc(r.title[lang])}</b></a><br>`
    + `<span class="small">${esc(c.races.noVotes(r))} ${esc(whyNoVotes(r.opp, lang))}</span><br>`
    + `<a class="small" href="${SITE}/${r.slug[lang]}">${esc(c.races.open(r))}</a></li>`).join('');
  for (const [which, items] of [['bills', billItems], ['races', raceItems]]) {
    const dir = resolve(ROOT, 'public', c[which].slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), page(lang, which, items), 'utf8');
    n++;
  }
}
console.log(`  ${n} hub pages written: /bills, /proyectos, /races, /contiendas`);
