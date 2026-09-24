/**
 * PlainRecord — the open-data page, and the one canonical Dataset description
 *
 *   node scripts/build_data_page.mjs
 *
 * Writes public/open-data/index.html.
 *
 * WHY THIS EXISTS. Google Dataset Search has no submission form: it indexes
 * schema.org Dataset markup on pages it crawls. Before this page the full
 * corpus was described twice, differently, and never on a page of its own. The
 * homepage block describes the quiz payload (and verify_site.mjs holds it to
 * that), and the fact sheet carried a second block for votes_89R.json whose url
 * pointed at the homepage. Two descriptions of one dataset with different urls
 * is the case Dataset Search handles worst, so the fact sheet's block is gone
 * and this page is where the corpus is described, once.
 *
 * It is also the page a reporter or researcher is looking for when they search
 * "Texas House roll call votes 2025 data", which is the audience that links.
 *
 * ENGLISH ONLY, deliberately for now. Its readers are the people who will open a
 * JSON file, and a Spanish version would be a second review pass for a page
 * whose content is mostly field names. The encoding and caveat text is quoted
 * from each file's own _meta, so this page cannot drift from what it describes.
 */

import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, esc, loadFaces, document_ } from './_page_shell.mjs';
import { billPath } from './build_bill_pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);
const path = (f) => resolve(ROOT, 'public/data', f);
const read = (f) => JSON.parse(readFileSync(path(f), 'utf8'));

const bulk = read('votes_89R.json');
const roster = read('members_89R.json');
const quiz = read('quiz_89R.json');
const zips = read('zips_89R.json');

const n = (x) => x.toLocaleString('en-US');
const size = (f) => {
  const b = statSync(path(f)).size;
  return b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
};
// '2026-07-29' -> '29 July 2026', the way every other page on the site writes it.
const longDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const url = (f) => `${SITE}/data/${f}`;

const c = bulk.counts;
if (c.items !== bulk.items.length) throw new Error('votes_89R.json counts.items disagrees with its items');
const retired = roster.retired ?? [];
const headline = quiz.items.filter((i) => i.headline);

const FILES = [
  {
    f: 'votes_89R.json', name: `All ${n(c.items)} recorded House votes`,
    what: `Every recorded floor vote of the Texas House in the 2025 regular session: ${n(c.items)} roll calls and ${n(c.votesCast)} individual positions across ${c.members} members. ${n(c.journalSourced)} are reconciled against the House Journal and ${c.scrapeSourced} come from the Open States scrape, and each roll call says which.`,
  },
  {
    f: 'members_89R.json', name: 'Members and their votes on the 67 selected items',
    what: `The ${roster.members.length} sitting members, with district and party, and how each voted on the ${roster.itemOrder.length} items the site asks about.`,
  },
  {
    f: 'quiz_89R.json', name: `The ${quiz.items.length} items the site asks about`,
    what: `The selected roll calls with the published selection rule, plain-language summaries, partisan valences, and Governor and Lieutenant Governor actions. Spanish summaries are in quiz_89R.es.json (${size('quiz_89R.es.json')}).`,
  },
  {
    f: 'zips_89R.json', name: 'ZIP code to Texas House district crosswalk',
    what: `${n(Object.keys(zips.zips).length)} Texas ZIP codes mapped to House districts through 2020 Census blocks, with the share of each ZIP's people in every district it touches.`,
  },
];

const body = `
  <h1>Download every Texas House vote from 2025</h1>
  <p class="lede">Every recorded floor vote of the 89th Texas Legislature's regular session, with each member's position, as plain JSON. Free, no sign-up, and dedicated to the public domain under CC0.</p>

  <h2>The files</h2>
  <ul class="stand">${FILES.map((x) => `<li><a href="${url(x.f)}"><b>${esc(x.f)}</b></a> <span class="small">${esc(size(x.f))}</span><br>`
    + `<b>${esc(x.name)}.</b> <span class="small">${esc(x.what)}</span></li>`).join('')}</ul>

  <h2>How a vote is encoded</h2>
  <p>${esc(bulk._meta.encoding)}</p>
  <p class="small">${esc(bulk._meta.valence)}</p>

  <h2>What the files do not contain</h2>
  <ul>
    <li>${esc(bulk._meta.noCaptions)}</li>
    <li>${esc(bulk._meta.shortRecords)}</li>
    ${retired.map((r) => `<li>${esc(`${r.name} (District ${r.district}) left the House on ${longDate(r.until)}. The ${n(r.voted)} votes cast in that seat are kept in votes_89R.json with a null name and district, and members_89R.json names the member under "retired".`)}</li>`).join('')}
  </ul>

  <h2>Where it comes from</h2>
  <p>${esc(bulk._meta.provenance)}</p>

  <h2>Licence and citation</h2>
  <p>${esc(bulk._meta.licenseNote)} Credit is appreciated and not required:</p>
  <p class="small">Arras, Marco. <i>Texas House of Representatives recorded floor votes, 89th Legislature (2025).</i> ${SITE}/open-data. CC0 1.0.</p>

  <h2>The same data, as pages</h2>
  <ul>
    <li><a href="${SITE}/districts">Every Texas House district</a>, with how its member voted</li>
    ${headline.map((it) => `<li><a href="${SITE}/${billPath(it.billId, 'en')}"><span class="bill">${esc(it.billId)}</span> ${esc(it.label)}</a>, every member's vote</li>`).join('')}
  </ul>
  <p><a class="cta" href="${SITE}/">Take the quiz</a></p>
  <hr>
  <p class="small"><span class="label">Who made this.</span> Marco Arras, a Texas resident. I donate to the Democratic Party, and I say so before anything else rather than in a footnote. The rule that picks which votes appear is published and runs identically on both caucuses, and every vote and count is in the files above.</p>`;

const canonical = `${SITE}/open-data`;
const title = 'Download every Texas House vote from 2025';
const desc = `Every recorded Texas House floor vote of the 2025 session: ${n(c.items)} roll calls with each member's position, reconciled against the House Journal. Free JSON, CC0.`;

const dataset = {
  '@type': 'Dataset',
  '@id': `${canonical}#dataset`,
  name: 'Texas House of Representatives recorded floor votes, 89th Legislature (2025)',
  description: `Every recorded floor vote of the 2025 Texas House regular session: ${n(c.items)} roll calls with each member's position, ${n(c.journalSourced)} of them reconciled against the official House Journal. Includes the ${quiz.items.length} votes selected by a published rule for the quiz at rightnleft.com, and a ZIP code to Texas House district crosswalk built through 2020 Census blocks.`,
  url: canonical,
  license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  isAccessibleForFree: true,
  creator: { '@type': 'Person', name: 'Marco Arras', url: `${SITE}/` },
  dateModified: bulk.generated,
  // The 89th regular session convened 14 January 2025 and adjourned 2 June.
  temporalCoverage: '2025-01-14/2025-06-02',
  spatialCoverage: { '@type': 'Place', name: 'Texas, United States' },
  measurementTechnique: 'Open States roll calls reconciled against the official Texas House Journal',
  keywords: [
    'Texas Legislature', 'Texas House of Representatives', 'roll call votes',
    '89th Legislature', 'voting records', 'open data', 'ZIP code to legislative district',
  ],
  variableMeasured: [
    'bill identifier', 'chamber yea/nay totals', 'per-member vote',
    'partisan valence', 'vote source (journal or scrape)',
  ],
  distribution: FILES.map((x) => ({
    '@type': 'DataDownload', name: x.name, encodingFormat: 'application/json',
    contentUrl: url(x.f), contentSize: size(x.f),
  })),
};

const html = document_({
  lang: 'en', otherLang: null, title, siteName: 'The Purple Strip',
  docTitle: 'Texas House roll call votes 2025: free data download',
  desc, canonical, altHref: `${SITE}/`, altLabel: 'The quiz',
  ogImage: `${SITE}/og.png`, faces, kicker: 'Texas House · 2025 session', body,
  jsonld: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': canonical, url: canonical, name: title,
        description: desc, inLanguage: 'en-US',
        isPartOf: { '@type': 'WebSite', name: 'The Purple Strip', url: SITE },
        mainEntity: { '@id': dataset['@id'] },
      },
      dataset,
    ],
  },
});

const dir = resolve(ROOT, 'public/open-data');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'index.html'), html, 'utf8');
console.log(`  /open-data written: ${FILES.length} files, ${n(c.items)} roll calls`);
