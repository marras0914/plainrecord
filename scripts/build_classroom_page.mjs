/**
 * PlainRecord — the classroom page, in English and Spanish
 *
 *   node scripts/build_classroom_page.mjs
 *
 * Writes public/classroom/index.html and public/maestros/index.html: a free
 * two-page worksheet for Texas Government classes, and what a teacher needs to
 * decide whether to use it. The words are in i18n/classroom.json.
 *
 * WHY THIS EXISTS. October is when many high school government classes cover
 * the election, and a teacher searching for a worksheet will not find a quiz.
 * The first plan was a free Teachers Pay Teachers listing; listing there costs
 * money, so the worksheet lives here, where it is free, permanent and findable,
 * and free teacher libraries (Share My Lesson, OER Commons) can link to it.
 *
 * Two refusals, both deliberate. The Spanish page is not written while any
 * string in i18n/classroom.json is unapproved, which fails the build exactly as
 * the site's Spanish gate does; CLASSROOM_DRAFT=1 lifts that for a local look
 * and must never be set on Vercel. And neither page is written without its PDF,
 * which is a committed file from scripts/build_worksheet_pdf.mjs.
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, loadFaces, document_ } from './_page_shell.mjs';
import { t, unapprovedSpanish, OUTPUTS } from '../classroom/worksheet.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);

const pending = unapprovedSpanish();
if (pending.length && process.env.CLASSROOM_DRAFT !== '1') {
  throw new Error(`i18n/classroom.json: ${pending.length} Spanish strings not approved (${pending.slice(0, 4).join(', ')}...)`);
}

const PAGES = {
  en: { slug: 'classroom', other: 'es', quiz: '/', districts: '/districts', sheet: '/fact-sheet', inLanguage: 'en-US' },
  es: { slug: 'maestros', other: 'en', quiz: '/es', districts: '/distritos', sheet: '/hoja', inLanguage: 'es-US' },
};

for (const lang of ['en', 'es']) {
  const P = PAGES[lang];
  const O = OUTPUTS[lang];
  const s = (key, vars) => t(lang, key, vars);
  const pdfPath = resolve(ROOT, O.dir, O.pdf);
  if (!existsSync(pdfPath)) throw new Error(`missing ${O.dir}/${O.pdf}: run node scripts/build_worksheet_pdf.mjs first`);
  const pdfSize = `${Math.round(statSync(pdfPath).size / 1e3)} KB`;
  const pdfUrl = `${SITE}/${P.slug}/${O.pdf}`;
  const canonical = `${SITE}/${P.slug}`;
  const altHref = `${SITE}/${PAGES[P.other].slug}`;
  const title = s('cls.title');
  const desc = s('cls.desc');

  const body = `
  <h1>${title}</h1>
  <p class="lede">${s('cls.lede')}</p>
  <p><a class="cta" href="${pdfUrl}">${s('cls.download')}</a> <span class="small">${s('cls.pdfNote', { size: pdfSize })}</span></p>

  <h2>${s('cls.doHead')}</h2>
  <ul>${['cls.do1', 'cls.do2', 'cls.do3', 'cls.do4', 'cls.do5'].map((k) => `<li>${s(k)}</li>`).join('')}</ul>

  <h2>${s('cls.discHead')}</h2>
  <p>${s('cls.disc')}</p>

  <h2>${s('cls.teachHead')}</h2>
  <ul>
    ${['cls.t1', 'cls.t2', 'cls.t3', 'cls.t4'].map((k) => `<li>${s(k)}</li>`).join('')}
    <li>${s('cls.t5', { openData: `${SITE}/open-data` })}</li>
  </ul>
  <p class="small">${s('cls.cc0')}</p>

  <h2>${s('cls.usesHead')}</h2>
  <ul>
    <li>${s('cls.uses1', { districts: `${SITE}${P.districts}` })}</li>
    <li>${s('cls.uses2', { quiz: `${SITE}${P.quiz}` })}</li>
    <li>${s('cls.uses3', { sheet: `${SITE}${P.sheet}` })}</li>
  </ul>
  <hr>`;

  const resource = {
    '@type': 'LearningResource',
    '@id': `${canonical}#worksheet`,
    name: s('ws.title'),
    description: desc,
    url: canonical,
    learningResourceType: 'Worksheet',
    educationalLevel: ['High school', 'College'],
    timeRequired: 'PT30M',
    inLanguage: P.inLanguage,
    isAccessibleForFree: true,
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    creator: { '@type': 'Person', name: 'Marco Arras', url: `${SITE}/` },
    encoding: { '@type': 'MediaObject', contentUrl: pdfUrl, encodingFormat: 'application/pdf' },
  };
  if (lang === 'es') resource.translationOfWork = { '@id': `${altHref}#worksheet` };
  else resource.workTranslation = { '@id': `${altHref}#worksheet` };

  const html = document_({
    lang, otherLang: P.other, title, siteName: 'The Purple Strip',
    docTitle: s('cls.docTitle'),
    desc, canonical, altHref, altLabel: lang === 'es' ? 'In English' : 'En español',
    ogImage: `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`, faces, kicker: s('cls.kicker'), body,
    jsonld: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage', '@id': canonical, url: canonical, name: title,
          description: desc, inLanguage: P.inLanguage,
          isPartOf: { '@type': 'WebSite', name: 'The Purple Strip', url: SITE },
          mainEntity: { '@id': resource['@id'] },
        },
        resource,
      ],
    },
  });

  const dir = resolve(ROOT, `public/${P.slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  console.log(`  /${P.slug} written (worksheet ${pdfSize})${pending.length ? ' [DRAFT Spanish]' : ''}`);
}
