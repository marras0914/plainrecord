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
 * THREE SPACES since 14 Nov 2026 (Marco): Policy, Religion, Economics. Policy
 * (/policy, /politica) holds everything about the legislature: the quiz (now
 * at /quiz and /es/cuestionario), representatives, bills, charts, races.
 * Religion is the faith module under a new label; Economics is the economy
 * module. The front page (/ and /es) is a door to each. The Context hub that
 * held economy, faith and the races was retired, and redirects to the front
 * page (vercel.json). Before that the nav was Quiz, Your rep, Bills, Context,
 * Charts.
 *
 * This module imports nothing from the shell, so the shell can import it.
 */

import { readFileSync } from 'node:fs';
import { ht, HOME_COPY, POLICY_PATH, requireApprovedHome } from './_home_copy.mjs';
import { SESSION } from './session.mjs';

const SITE = 'https://rightnleft.com';
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const quiz = read(`public/data/quiz_${SESSION}.json`);
const sidecar = read(`public/data/quiz_${SESSION}.es.json`);
// The classroom link text lives with the rest of the classroom copy, under the
// same approval rule (build_classroom_page.mjs refuses unapproved Spanish).
const classroom = read('i18n/classroom.json');

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

requireApprovedHome('_site_nav');

// The three spaces (Marco, 14 Nov 2026). Religion is a label only: the faith
// pages keep /faith and /fe so links already shared keep working.
const NAV = Object.fromEntries(['en', 'es'].map((L) => [L, [
  ['policy', POLICY_PATH[L], ht(L, 'nav.policy')],
  ['religion', L === 'es' ? '/fe' : '/faith', ht(L, 'nav.religion')],
  ['economics', L === 'es' ? '/economia' : '/economy', ht(L, 'nav.economics')],
]]));

/** Which space a page belongs to, from its own URL. The front page belongs to none. */
export function sectionOf(canonical) {
  const path = canonical.replace(SITE, '') || '/';
  if (/^\/(policy|politica|quiz|districts|distritos|district|distrito|bills|proyectos|bill|proyecto|race|contienda|charts|graficas)(\/|$)/.test(path)) return 'policy';
  if (/^\/es\/cuestionario(\/|$)/.test(path)) return 'policy';
  if (/^\/(faith|fe)(\/|$)/.test(path)) return 'religion';
  if (/^\/(economy|economia)(\/|$)/.test(path)) return 'economics';
  return null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The logo, option A "the purple strip" (Marco, 14 Nov 2026): the word with
 * "right" on a red bar, the n on a purple one and "left" on a blue one, red for
 * the right and blue for the left as on every chart here, purple where they
 * meet. Live text in the self-hosted Lexend, so it is sharp in both themes and
 * needs no image. A link home on every page. Styled by .brand in
 * _page_shell.mjs and src/styles.css, which must stay in step.
 */
export function brandHtml(lang) {
  const L = lang === 'es' ? 'es' : 'en';
  const home = L === 'es' ? `${SITE}/es` : `${SITE}/`;
  const label = L === 'es' ? 'rightnleft, página de inicio' : 'rightnleft, home page';
  return `<a class="brand" href="${home}" aria-label="${label}"><span class="b-r">right</span><span class="b-n">n</span><span class="b-l">left</span></a>`;
}

/**
 * The logo's icon is the strip alone: red | purple | blue (public/favicon.svg,
 * and public/apple-touch-icon.png rendered from it by build_icons.mjs). It
 * replaced a plain purple dot.
 */
export const ICON_LINKS = '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">';

/** The logo's CSS, shared word for word by the static pages and the quiz. */
export const BRAND_CSS = '.brand{--b-r:#c8352f;--b-n:#7d5ba6;--b-l:#1f66bd;display:inline-flex;font-family:"Lexend",system-ui,sans-serif;font-weight:700;font-size:21px;letter-spacing:-.01em;line-height:1.1;color:inherit;text-decoration:none;padding-bottom:7px}'
  + ':root[data-theme="dark"] .brand{--b-r:#e66767;--b-n:#a377d3;--b-l:#3987e5}'
  + '.brand span{background:no-repeat 0 100%/calc(100% - 2px) 5px;padding-bottom:5px;margin-bottom:-7px}'
  + '.brand .b-r{background-image:linear-gradient(var(--b-r),var(--b-r))}'
  + '.brand .b-n{color:var(--b-n);background-image:linear-gradient(var(--b-n),var(--b-n))}'
  + '.brand .b-l{background-image:linear-gradient(var(--b-l),var(--b-l))}'
  + '.brand:hover{text-decoration:none}.brand:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:2px}'
  + '@media print{.brand{--b-r:#000;--b-n:#000;--b-l:#000}}';

export function navHtml(lang, canonical) {
  const here = sectionOf(canonical);
  const hub = (href) => canonical === `${SITE}${href}`;
  const label = lang === 'es' ? 'Secciones del sitio' : 'Site sections';
  return `<nav class="sitenav" aria-label="${label}">${NAV[lang === 'es' ? 'es' : 'en'].map(([key, href, text]) =>
    // aria-current="page" only on the hub itself; "true" on a page inside the section.
    // `text` is already escaped by ht().
    `<a href="${SITE}${href}"${key === here ? ` aria-current="${hub(href) ? 'page' : 'true'}"` : ''}>${text}</a>`).join('')}</nav>`;
}

const FOOT = {
  en: {
    label: 'More on this site', site: 'The site', bills: 'The seven bills', races: 'The three races',
    links: [
      ['/', 'Home'], ['/policy', 'Policy'], ['/faith', 'Religion'], ['/economy', 'Economics'],
      ['/quiz', 'The quiz'], ['/districts', 'Find your representative'], ['/bills', 'The bills'],
      ['/charts', 'Charts'], ['/fact-sheet', 'One-page fact sheet'],
      ['/open-data', 'Download the data'], ['/classroom', classroom['cls.footLink'].en],
    ],
  },
  es: {
    label: 'Más en este sitio', site: 'El sitio', bills: 'Los siete proyectos', races: 'Las tres contiendas',
    links: [
      ['/es', 'Inicio'], ['/politica', 'Política'], ['/fe', 'Religión'], ['/economia', 'Economía'],
      ['/es/cuestionario', 'El cuestionario'], ['/distritos', 'Encuentre a su representante'], ['/proyectos', 'Los proyectos'],
      ['/graficas', 'Gráficas'], ['/hoja', 'Hoja informativa de una página'],
      ['/open-data', 'Descargar los datos (en inglés)'], ['/maestros', classroom['cls.footLink'].es],
    ],
  },
};
// The new labels must be the approved ones in home.json, not a second copy.
for (const L of ['en', 'es']) {
  const want = { 0: 'foot.home', 1: 'nav.policy', 2: 'nav.religion', 3: 'nav.economics', 4: 'foot.quiz' };
  for (const [i, key] of Object.entries(want)) {
    if (FOOT[L].links[i][1] !== HOME_COPY[key][L]) throw new Error(`_site_nav: footer "${FOOT[L].links[i][1]}" is not home.json ${key}`);
  }
}

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
