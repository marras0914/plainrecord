/**
 * PlainRecord — the classroom page
 *
 *   node scripts/build_classroom_page.mjs
 *
 * Writes public/classroom/index.html: a free two-page worksheet for Texas
 * Government classes, and what a teacher needs to decide whether to use it.
 *
 * WHY THIS EXISTS. October is when many high school government classes cover
 * the election, and a teacher searching for a worksheet will not find a quiz.
 * The first plan was a free Teachers Pay Teachers listing; listing there costs
 * money, so the worksheet lives here, where it is free, permanent and findable,
 * and free teacher libraries (Share My Lesson, OER Commons) can link to it.
 *
 * ENGLISH ONLY for now, like /open-data: the worksheet itself is English, and a
 * Spanish page would promise a Spanish worksheet that does not exist yet.
 *
 * The PDF is a committed file from scripts/build_worksheet_pdf.mjs. This script
 * refuses to write a page that links to a PDF that is not there.
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, loadFaces, document_ } from './_page_shell.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);
const PDF = 'texas-house-worksheet.pdf';
const pdfPath = resolve(ROOT, 'public/classroom', PDF);
if (!existsSync(pdfPath)) throw new Error(`missing ${PDF}: run node scripts/build_worksheet_pdf.mjs first`);
const pdfSize = `${Math.round(statSync(pdfPath).size / 1e3)} KB`;
const pdfUrl = `${SITE}/classroom/${PDF}`;

const canonical = `${SITE}/classroom`;
const title = 'How did your Texas House member vote? A free classroom worksheet';
const desc = 'A free two-page worksheet for Texas Government classes: students find their House district, chart how their representative voted in 2025, and ask whether a quiz built from real votes can be fair.';

const body = `
  <h1>How did your Texas House member vote? A free classroom worksheet</h1>
  <p class="lede">Two printable pages for a Texas Government or civics class, about 30 minutes. Students need a phone or computer and a ZIP code. Free, public domain, nothing to sign up for.</p>
  <p><a class="cta" href="${pdfUrl}">Download the worksheet</a> <span class="small">PDF, ${pdfSize}, letter size</span></p>

  <h2>What students do</h2>
  <ul>
    <li>Find their Texas House district from a ZIP code, and who represents it.</li>
    <li>See who is on the November 3 ballot for that seat.</li>
    <li>Chart three real 2025 votes: what each bill does, how their representative voted, and how they would have voted.</li>
    <li>Find a vote where the member broke with their own party, and say why a member might.</li>
    <li>Take a seven-question quiz with the party labels hidden, then compare with a classmate.</li>
  </ul>

  <h2>The discussion page</h2>
  <p>Page two asks a real question: can a quiz built only from real votes still be unfair? A legislature only votes on what its majority lets reach the floor, so the session’s best-known bills run the majority’s way. In October 2026 a reader showed that this site’s short quiz had no bill Democrats passed over Republican opposition, and the site changed it. Students use that correction to work out where power sits in the Legislature. The page ends with the early voting and election dates from the Texas Secretary of State.</p>

  <h2>For the teacher</h2>
  <ul>
    <li>No accounts, no ads, no cookies. It works on a phone, in <a href="${SITE}/es">English and Spanish</a>, though the worksheet itself is in English.</li>
    <li>The site endorses no one. Its author donates to the Democratic Party and says so on every page; the rule that picks which votes appear is published and applies the same way to both parties, and each vote links to the official House Journal.</li>
    <li>Students in the same ZIP code may be in different districts. That is real, not an error, and a good aside on how districts are drawn.</li>
    <li>A quiz result names the party a student’s answers matched, so the quiz and compare steps can stay private on the worksheet, or be skipped.</li>
    <li>For a data or statistics extension, <a href="${SITE}/open-data">every 2025 House floor vote is free to download</a>.</li>
  </ul>
  <p class="small">The worksheet is dedicated to the public domain (CC0): copy it, print it, adapt it, no permission needed.</p>

  <h2>What the worksheet uses</h2>
  <ul>
    <li><a href="${SITE}/districts">Find your representative</a>: all 150 districts, with a ZIP code lookup</li>
    <li><a href="${SITE}/">The quiz</a></li>
    <li><a href="${SITE}/fact-sheet">A one-page fact sheet</a>, to print for a bulletin board</li>
  </ul>
  <hr>`;

const resource = {
  '@type': 'LearningResource',
  '@id': `${canonical}#worksheet`,
  name: 'How did your Texas House member vote?',
  description: desc,
  url: canonical,
  learningResourceType: 'Worksheet',
  educationalLevel: ['High school', 'College'],
  teaches: 'How a Texas House member voted in 2025, and how a legislative majority shapes which bills reach a vote',
  timeRequired: 'PT30M',
  inLanguage: 'en-US',
  isAccessibleForFree: true,
  license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  creator: { '@type': 'Person', name: 'Marco Arras', url: `${SITE}/` },
  encoding: { '@type': 'MediaObject', contentUrl: pdfUrl, encodingFormat: 'application/pdf' },
};

const html = document_({
  lang: 'en', otherLang: null, title, siteName: 'The Purple Strip',
  docTitle: 'Free Texas House voting worksheet for Texas Government classes',
  desc, canonical, altHref: `${SITE}/`, altLabel: 'The quiz',
  ogImage: `${SITE}/og.png`, faces, kicker: 'For teachers · 2026 election', body,
  jsonld: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': canonical, url: canonical, name: title,
        description: desc, inLanguage: 'en-US',
        isPartOf: { '@type': 'WebSite', name: 'The Purple Strip', url: SITE },
        mainEntity: { '@id': resource['@id'] },
      },
      resource,
    ],
  },
});

const dir = resolve(ROOT, 'public/classroom');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'index.html'), html, 'utf8');
console.log(`  /classroom written (worksheet ${pdfSize})`);
