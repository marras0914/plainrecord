/**
 * PlainRecord — the site's navigation, in one place
 *
 * Every static page gets the same top nav and the same footer from here, via
 * document_() in _page_shell.mjs. Before this, a static page carried only a
 * language switch, and the way between sections was whatever links happened to
 * be written into each page's body. A navigation audit on 24 September 2026
 * found the race pages linked nothing but each other, the fact sheet linked
 * only home, and the bill pages sat three or four clicks from the homepage.
 *
 * FIVE ITEMS, one per kind of page a reader comes for: the quiz, their own
 * representative, the bills, the races, the charts. Each points at a hub, and
 * /bills and /races exist because the nav needed somewhere to point.
 *
 * This module imports nothing from the shell, so the shell can import it.
 */

import { readFileSync } from 'node:fs';

const SITE = 'https://rightnleft.com';
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const quiz = read('public/data/quiz_89R.json');
const sidecar = read('public/data/quiz_89R.es.json');

export const billSlug = (billId) => billId.toLowerCase().replace(/\s+/g, '-');
export const billPath = (billId, lang) => `${lang === 'es' ? 'proyecto' : 'bill'}/${billSlug(billId)}`;

/** The seven headline bills, with the approved label in each language. */
export const HEADLINE_BILLS = quiz.items.filter((i) => i.headline).map((i) => {
  const es = sidecar.items?.[i.billId]?.label;
  if (!es) throw new Error(`_site_nav: no Spanish label for ${i.billId}`);
  return { billId: i.billId, label: { en: i.label, es } };
});

/** The three races, office names as build_races.mjs writes them. */
const RACE_SLUG = {
  Governor: { en: 'race/governor', es: 'contienda/gobernador' },
  'Lieutenant Governor': { en: 'race/lieutenant-governor', es: 'contienda/vicegobernador' },
  'U.S. Senate': { en: 'race/us-senate', es: 'contienda/senado' },
};
const OFFICE_ES = { Governor: 'Gobernador', 'Lieutenant Governor': 'Vicegobernador', 'U.S. Senate': 'Senado de Estados Unidos' };
// Top of the ticket first, not the payload's order.
const RACE_ORDER = ['Governor', 'Lieutenant Governor', 'U.S. Senate'];
export const RACES = [...quiz.candidates].sort((a, b) => RACE_ORDER.indexOf(a.office) - RACE_ORDER.indexOf(b.office)).map((cand) => {
  const opp = quiz.opponents.find((o) => o.opposing === cand.name);
  if (!opp || !RACE_SLUG[cand.office]) throw new Error(`_site_nav: no race for ${cand.name}`);
  return {
    office: cand.office, cand: cand.name, opp: opp.name, slug: RACE_SLUG[cand.office],
    title: {
      en: `${cand.office}: ${cand.name} and ${opp.name}`,
      es: `${OFFICE_ES[cand.office]}: ${cand.name} y ${opp.name}`,
    },
  };
});

const NAV = {
  en: [
    ['quiz', '/', 'Quiz'],
    ['rep', '/districts', 'Your rep'],
    ['bills', '/bills', 'Bills'],
    ['races', '/races', 'Races'],
    ['charts', '/charts', 'Charts'],
  ],
  es: [
    ['quiz', '/es', 'Cuestionario'],
    ['rep', '/distritos', 'Su representante'],
    ['bills', '/proyectos', 'Proyectos'],
    ['races', '/contiendas', 'Contiendas'],
    ['charts', '/graficas', 'Gráficas'],
  ],
};

/** Which nav item a page belongs to, from its own URL. */
export function sectionOf(canonical) {
  const path = canonical.replace(SITE, '') || '/';
  if (path === '/' || path === '/es') return 'quiz';
  if (/^\/(districts|distritos|district|distrito)(\/|$)/.test(path)) return 'rep';
  if (/^\/(bills|proyectos|bill|proyecto)(\/|$)/.test(path)) return 'bills';
  if (/^\/(races|contiendas|race|contienda)(\/|$)/.test(path)) return 'races';
  if (/^\/(charts|graficas)(\/|$)/.test(path)) return 'charts';
  return null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function navHtml(lang, canonical) {
  const here = sectionOf(canonical);
  const hub = (href) => canonical === `${SITE}${href}`;
  const label = lang === 'es' ? 'Secciones del sitio' : 'Site sections';
  return `<nav class="sitenav" aria-label="${label}">${NAV[lang === 'es' ? 'es' : 'en'].map(([key, href, text]) =>
    // aria-current="page" only on the hub itself; "true" on a page inside the section.
    `<a href="${SITE}${href}"${key === here ? ` aria-current="${hub(href) ? 'page' : 'true'}"` : ''}>${esc(text)}</a>`).join('')}</nav>`;
}

const FOOT = {
  en: {
    label: 'More on this site', site: 'The site', bills: 'The seven bills', races: 'The three races',
    links: [
      ['/', 'The quiz'], ['/districts', 'Find your representative'], ['/bills', 'The bills'],
      ['/races', 'The races'], ['/charts', 'Charts'], ['/fact-sheet', 'One-page fact sheet'],
      ['/open-data', 'Download the data'],
    ],
  },
  es: {
    label: 'Más en este sitio', site: 'El sitio', bills: 'Los siete proyectos', races: 'Las tres contiendas',
    links: [
      ['/es', 'El cuestionario'], ['/distritos', 'Encuentre a su representante'], ['/proyectos', 'Los proyectos'],
      ['/contiendas', 'Las contiendas'], ['/graficas', 'Gráficas'], ['/hoja', 'Hoja informativa de una página'],
      ['/open-data', 'Descargar los datos (en inglés)'],
    ],
  },
};

export function footerHtml(lang) {
  const L = lang === 'es' ? 'es' : 'en';
  const f = FOOT[L];
  const col = (head, items) => `<div><p class="foot-head">${esc(head)}</p><ul>${items.join('')}</ul></div>`;
  return `<footer class="sitefoot" aria-label="${esc(f.label)}">`
    + col(f.site, f.links.map(([h, t]) => `<li><a href="${SITE}${h}">${esc(t)}</a></li>`))
    + col(f.bills, HEADLINE_BILLS.map((b) => `<li><a href="${SITE}/${billPath(b.billId, L)}"><span class="bill">${esc(b.billId)}</span> ${esc(b.label[L])}</a></li>`))
    + col(f.races, RACES.map((r) => `<li><a href="${SITE}/${r.slug[L]}">${esc(r.title[L])}</a></li>`))
    + `</footer>`;
}
