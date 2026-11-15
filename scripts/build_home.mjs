/**
 * PlainRecord: the front page, a door to each of the three spaces
 *
 * Decided by Marco, 14 Nov 2026: the site's main spaces are Policy, Religion
 * and Economics, and rightnleft.com opens on a short page with one door to
 * each. The quiz, which used to be the front page, moved to /quiz and
 * /es/cuestionario.
 *
 * Not a standalone script: build_locales.mjs calls homePage() after vite has
 * written dist/, and writes the result over dist/index.html and to
 * dist/es/index.html.
 *
 * OLD INVITE LINKS. A comparison link put the answers in the fragment
 * (rightnleft.com/#d=...), which a server never sees, so no redirect can carry
 * it. /js/home.js sends any such link on to the quiz, fragment and all.
 *
 * The Religion and Economics doors reuse those modules' approved hub sentences
 * (faith.json and economy.json hub.lede); everything else is in i18n/home.json.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SITE, loadFaces, document_ } from './_page_shell.mjs';
import { ht, requireApprovedHome, QUIZ_PATH, HOME_PATH, POLICY_PATH } from './_home_copy.mjs';
import { ft, requireApprovedFaith, FAITH_PATHS } from './_faith_copy.mjs';
import { et, requireApprovedEcon, ECON_PATHS } from './_econ_copy.mjs';

requireApprovedHome('build_home');
requireApprovedFaith('build_home');
requireApprovedEcon('build_home');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);

/**
 * THE SEARCH ENGINES' OWNERSHIP TAGS GO ON THE FRONT PAGE. Google Search
 * Console (URL-prefix property for https://rightnleft.com, verified 22 Sep
 * 2026) and Bing Webmaster Tools (5 Oct 2026) each verified the site by a meta
 * tag on the home page, and each re-checks it there; losing it un-verifies the
 * property and its history. The tags were written in src/index.html when the
 * quiz WAS the home page. When the quiz moved to /quiz (14 Nov 2026) they went
 * with it, so they are read from that file here, never typed twice, and the
 * build fails if either is missing.
 */
export const VERIFICATION_TAGS = (() => {
  const src = readFileSync(resolve(ROOT, 'src/index.html'), 'utf8');
  const tags = ['google-site-verification', 'msvalidate.01'].map((name) => {
    const m = src.match(new RegExp(`<meta name="${name.replace('.', '\\.')}" content="[^"]+">`));
    if (!m) throw new Error(`build_home: src/index.html has no ${name} meta tag; the front page would lose its search-engine verification`);
    return m[0];
  });
  return tags.join('\n');
})();
const url = (p) => `${SITE}${p === '/' ? '/' : p}`;

export function homePage(lang) {
  const L = lang === 'es' ? 'es' : 'en';
  const other = L === 'es' ? 'en' : 'es';
  const doors = [
    { name: ht(L, 'nav.policy'), line: ht(L, 'home.policy'), href: url(POLICY_PATH[L]) },
    { name: ht(L, 'nav.religion'), line: ft(L, 'hub.lede'), href: url(`/${FAITH_PATHS[L].home}`) },
    { name: ht(L, 'nav.economics'), line: et(L, 'hub.lede'), href: url(`/${ECON_PATHS[L].blind}`) },
  ];
  const body = `
  <h1>${ht(L, 'home.h1')}</h1>
  <p class="lede">${ht(L, 'home.lede')}</p>
  <div class="trio">${doors.map((d) => `<div class="card door">
    <h2><a href="${d.href}">${d.name}</a></h2>
    <p>${d.line}</p>
    <p><a class="cta" href="${d.href}">${ht(L, 'home.go', { space: d.name.replace(/&amp;/g, '&') })}</a></p>
  </div>`).join('\n  ')}</div>
  <p><a href="${url(QUIZ_PATH[L])}">${ht(L, 'home.quiz')}</a></p>
  <hr>
  <p class="small"><span class="label">${ft(L, 'discloseLabel')}</span> ${ft(L, 'disclose')}</p>`;
  return document_({
    lang: L, otherLang: other,
    title: ht(L, 'home.h1'), docTitle: ht(L, 'home.docTitle'),
    siteName: L === 'es' ? 'La Franja Morada' : 'The Purple Strip',
    desc: ht(L, 'home.desc'), canonical: url(HOME_PATH[L]), altHref: url(HOME_PATH[other]),
    altLabel: L === 'es' ? 'In English' : 'En español', kicker: 'rightnleft.com', faces,
    ogImage: `${SITE}/${L === 'es' ? 'og.es.png' : 'og.png'}`,
    body: `<style>.door h2{margin:4px 0 6px}.door h2 a{text-decoration:none}</style>${body}`,
    scripts: ['/js/home.js'],
    head: VERIFICATION_TAGS,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'WebPage', name: ht(L, 'home.h1'), description: ht(L, 'home.desc'),
      inLanguage: L === 'es' ? 'es-US' : 'en-US', url: url(HOME_PATH[L]),
      isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/` },
    },
  });
}
