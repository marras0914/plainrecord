/**
 * PlainRecord: the faith module's pages, in English and Spanish
 *
 *   node scripts/build_faith_pages.mjs            (FAITH_DRAFT=1 for a local look)
 *
 * Writes, per language:
 *   /faith                 /fe                    pick a tradition
 *   /faith/<tradition>     /fe/<tradicion>        that tradition, issue by issue,
 *                                                 beside the four platforms
 *   /faith/methodology     /fe/metodologia        rules, sources, what's missing
 *
 * READS ONLY WHAT SHIPS: public/data/faith.json (scripts/export_faith.ts), so a
 * page cannot say something the published record does not.
 *
 * ONE TRADITION AT A TIME, and no score anywhere. FAITH.md: a grid of every
 * church against every issue would read as a scoreboard, and the site never
 * says which party is closer to any church. Every page carries the "not yet
 * reviewed" notice (decided 12 Nov 2026), and verify_site.mjs checks that.
 *
 * NO JAVASCRIPT. The words are in i18n/faith.json, and nothing is written while
 * any of its Spanish is unapproved (see _faith_copy.mjs).
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, esc, loadFaces, document_ } from './_page_shell.mjs';
import { ft, tx, KEY, requireApprovedFaith, FAITH_PATHS, TRADITION_SLUG, traditionPath } from './_faith_copy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);
requireApprovedFaith('build_faith_pages');

const data = JSON.parse(readFileSync(resolve(ROOT, 'public/data/faith.json'), 'utf8'));
const REPO = 'https://github.com/marras0914/plainrecord';
const DATA_URL = '/data/faith.json';

// Both parties at each level, in a fixed order that does not change by issue.
const LEVELS = ['texas', 'national'];
const PARTIES = ['D', 'R'];

const MONTH = { en: 'en-US', es: 'es-US' };
/** "2024", "June 2026", "November 15, 2023", as the source gives it. */
function fmtDate(lang, s) {
  if (/^\d{4}$/.test(s)) return s;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d ?? 1));
  const opts = d ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' } : { year: 'numeric', month: 'long', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(MONTH[lang], opts).format(date);
}

const issueName = (lang, i) => tx(lang, KEY.issueName(i), i.name);
const tradName = (lang, t) => tx(lang, KEY.tradName(t), t.name);
const quote = (s) => `<blockquote class="q" lang="en">“${esc(s)}”</blockquote>`;
const otherOf = (lang) => (lang === 'es' ? 'en' : 'es');

// Page-local rules, here rather than in the shared stylesheet so adding them
// does not rewrite the CSS inside every other page on the site.
const STYLE = `<style>
  .notice{background:var(--surface);border:1px solid var(--rule);border-left:4px solid var(--ink-2);border-radius:8px;padding:12px 14px;margin:14px 0 18px;font-size:15.5px}
  .notice p{margin:0 0 4px}
  blockquote.q{margin:4px 0 12px;padding:2px 0 2px 12px;border-left:2px solid var(--hair);font-family:"Newsreader",Georgia,serif;font-size:1.05rem;color:var(--ink-2)}
  h3{font-size:1rem;margin:22px 0 6px;letter-spacing:.02em}
  h4{font-size:.95rem;margin:16px 0 4px;color:var(--ink-2);font-weight:600}
  .card p.small{margin-bottom:6px}
  .none{font-weight:600}
  details.verses{margin:0 0 12px}
  details.verses summary{cursor:pointer;font-size:14.5px;color:var(--blue);min-height:44px;display:flex;align-items:center}
  .vtext{font-family:"Newsreader",Georgia,serif;font-size:1rem;margin:4px 0 0}
  .vtext sup{font-family:"Lexend",system-ui,sans-serif;font-size:.65em;color:var(--muted);margin:0 2px 0 4px}
  details.earlier{margin:6px 0 14px}
  details.earlier summary{cursor:pointer;font-size:14.5px;color:var(--blue);min-height:44px;display:flex;align-items:center}
  .jump{display:flex;flex-wrap:wrap;gap:2px 14px;list-style:none;padding:0;font-size:14.5px}
  .jump li{margin:0}.jump a{display:inline-block;min-height:32px;padding:4px 0}
  </style>`;

function notice(lang) {
  return `<div class="notice" role="note"><p>${ft(lang, 'notice')}</p><p class="small">${ft(lang, 'reviewedCount', { n: data.reviewed.entries, of: data.reviewed.of })}</p></div>`;
}

function disclosure(lang) {
  return `<hr>
  <p class="small"><span class="label">${ft(lang, 'discloseLabel')}</span> ${ft(lang, 'disclose')} ${ft(lang, 'discloseFaith')}</p>`;
}

function wrap(lang, { path, otherPath, title, docTitle, desc, body, type = 'WebPage' }) {
  const other = otherOf(lang);
  return document_({
    lang, otherLang: other, title, docTitle,
    siteName: lang === 'es' ? 'La Franja Morada' : 'The Purple Strip',
    desc, canonical: `${SITE}/${path}`, altHref: `${SITE}/${otherPath}`,
    altLabel: ft(lang, 'langSwitch'), kicker: ft(lang, 'kicker'), faces, body: `${STYLE}${body}`,
    ogImage: `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`,
    jsonld: {
      '@context': 'https://schema.org', '@type': type, name: title, description: desc,
      inLanguage: lang === 'es' ? 'es-US' : 'en-US', url: `${SITE}/${path}`,
      isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/` },
    },
  });
}

// ---------------------------------------------------------------------------
// One tradition, issue by issue
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The Bible passages a statement cites (npm run data:faith:verses)
// ---------------------------------------------------------------------------

const V = data.verses;
// Said on the page only while the data says it: if a platform ever cites a
// verse, the sentence disappears rather than going stale.
const platformsCiteNothing = Object.values(V.platformReferenceCounts).every((n) => n === 0);
const bookName = (lang, code) => tx(lang, KEY.book(code), V.books[code]);
const rangeText = (ranges) => ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
const refLabel = (lang, r) => `${bookName(lang, r.code)} ${r.chapter}${r.ranges.length ? `:${rangeText(r.ranges)}` : ''}`;

function refItem(lang, r) {
  const T = V.translations[lang === 'es' ? 'rv1909' : 'web'];
  const href = `${T.chapterUrl}${r.chapterPage}`;
  const label = esc(refLabel(lang, r));
  const missing = r.notInBible.length
    ? `<p class="small">${ft(lang, 'tr.notInBible', { verses: r.notInBible.map((k) => k.split(':')[1]).join(', '), chapter: `${bookName(lang, r.code)} ${r.chapter}`, n: r.chapterLength })}</p>`
    : '';
  if (!r.verseKeys.length) {
    const what = r.ranges.length ? ft(lang, 'tr.longPassage', { n: r.verseCount }) : ft(lang, 'tr.wholeChapter');
    return `<li><a href="${esc(href)}"><b>${label}</b></a> <span class="small">(${what})</span>${missing}</li>`;
  }
  const text = r.verseKeys.map((k) => `<sup>${k.split(':')[1]}</sup>${esc(V.text[k][lang === 'es' ? 'rv1909' : 'web'])}`).join(' ');
  return `<li><a href="${esc(href)}"><b>${label}</b></a><p class="vtext">${text}</p>${missing}</li>`;
}

function versesBlock(lang, s) {
  const c = V.byStatement[`${s.traditionId}.${s.issueId}.${s.sourceDate}`];
  if (!c) throw new Error(`build_faith_pages: no verse record for ${s.traditionId} ${s.issueId} ${s.sourceDate}; run npm run data:faith:verses`);
  const section = c.scope !== 'whole document';
  if (!c.refs.length) return `<p class="small">${ft(lang, section ? 'tr.noVersesSection' : 'tr.noVersesWhole')}</p>`;
  return `<details class="verses"><summary>${ft(lang, 'tr.versesSummary', { n: c.refs.length })}</summary>
        <p class="small">${ft(lang, 'tr.versesNote')}${section ? ` ${ft(lang, 'tr.versesSection')}` : ''}</p>
        <ul class="stand" lang="${lang === 'es' ? 'es' : 'en'}">${c.refs.map((r) => refItem(lang, r)).join('')}</ul>
      </details>`;
}

function statementCard(lang, s) {
  return `<div class="card">
      <p class="small">${tx(lang, KEY.body(s), s.body)}, ${esc(fmtDate(lang, s.sourceDate))}</p>
      <p><a href="${esc(s.sourceUrl)}"><b lang="en">${esc(s.title)}</b></a></p>
      <p>${tx(lang, KEY.statement(s), s.summary)}</p>
      ${quote(s.excerpt)}
      ${versesBlock(lang, s)}
    </div>`;
}

function plankCard(lang, party, level, issueId) {
  const key = `${party}-${level}`;
  const plat = data.platforms[key];
  const line = `<p class="small">${ft(lang, 'tr.platformLine', { name: tx(lang, KEY.platform(key), plat.name), year: plat.year })}</p>`;
  const p = data.planks.find((x) => x.party === party && x.level === level && x.issueId === issueId);
  if (p) {
    return `<div class="card">${line}
      <p>${tx(lang, KEY.plank(p), p.summary)}</p>
      ${quote(p.excerpt)}
      <p class="small"><a href="${esc(p.sourceUrl)}">${ft(lang, 'tr.fullText')}</a></p>
    </div>`;
  }
  const n = data.noPlank.find((x) => x.party === party && x.level === level && x.issueId === issueId);
  if (!n) throw new Error(`build_faith_pages: no plank and no recorded silence for ${key} on ${issueId}`);
  return `<div class="card">${line}
      <p>${tx(lang, KEY.noPlank(n), n.note)}</p>
      <p class="small"><a href="${esc(plat.url)}">${ft(lang, 'tr.fullText')}</a></p>
    </div>`;
}

function issueSection(lang, t, issue) {
  const full = data.statements.filter((s) => s.traditionId === t.id && s.issueId === issue.id);
  const none = data.noStatement.find((n) => n.traditionId === t.id && n.issueId === issue.id);
  if (!full.length && !none) throw new Error(`build_faith_pages: ${t.id} has neither a statement nor "no official statement" on ${issue.id}`);
  const church = full.length
    ? full.map((s) => statementCard(lang, s)).join('\n    ')
    : `<div class="card"><p class="none">${ft(lang, 'tr.none')}</p><p>${tx(lang, KEY.noStatement(none), none.note)}</p></div>`;
  const earlier = data.earlier.filter((e) => e.traditionId === t.id && e.issueId === issue.id);
  const earlierHtml = earlier.length ? `<details class="earlier"><summary>${earlier.length === 1 ? ft(lang, 'tr.earlierOne') : ft(lang, 'tr.earlierMany', { n: earlier.length })}</summary>
      <p class="small">${ft(lang, 'tr.earlierNote')}</p>
      <ul class="stand">${earlier.map((e) => `<li><a href="${esc(e.url)}" lang="en">${esc(e.title)}</a> <span class="small">${esc(fmtDate(lang, e.date))}</span></li>`).join('')}</ul>
    </details>` : '';
  const platforms = LEVELS.map((level) => `<h4>${ft(lang, `tr.${level}`)}</h4>
    ${PARTIES.map((party) => plankCard(lang, party, level, issue.id)).join('\n    ')}`).join('\n    ');
  return `
  <h2 id="${issue.id}">${issueName(lang, issue)}</h2>
  <p class="small">${tx(lang, KEY.issueDesc(issue), issue.description)}</p>
  <h3>${ft(lang, 'tr.h3church')}</h3>
    ${church}
    ${earlierHtml}
  <h3>${ft(lang, 'tr.h3platforms')}</h3>
    ${platforms}`;
}

function traditionPage(lang, t) {
  const P = FAITH_PATHS[lang];
  const name = tradName(lang, t);
  const others = data.traditions.filter((x) => x.id !== t.id)
    .map((x) => `<li><a href="${SITE}/${traditionPath(x.id, lang)}">${tradName(lang, x)}</a></li>`).join('');
  const body = `
  <h1>${name}</h1>
  <p class="lede">${tx(lang, KEY.tradFamily(t), t.family)}</p>
  ${notice(lang)}
  <p><span class="label">${ft(lang, 'tr.official')}</span> ${tx(lang, KEY.tradOfficial(t), t.official)} <a class="hist" href="${esc(t.libraryUrl)}">${ft(lang, 'tr.fullText')}</a></p>
  <p class="small">${ft(lang, 'tr.quotes')}</p>
  ${platformsCiteNothing ? `<p class="small">${ft(lang, 'tr.platformsNoVerses')}</p>` : ''}
  <p class="small">${ft(lang, 'tr.jump')}</p>
  <ul class="jump">${data.issues.map((i) => `<li><a href="#${i.id}">${issueName(lang, i)}</a></li>`).join('')}</ul>
  ${data.issues.map((i) => issueSection(lang, t, i)).join('\n')}

  <h2>${ft(lang, 'tr.h2others')}</h2>
  <ul class="stand">${others}</ul>
  <p><a href="${SITE}/${P.home}">${ft(lang, 'homeLink')}</a> · <a href="${SITE}/${P.method}">${ft(lang, 'methodLink')}</a> · <a href="${DATA_URL}">${ft(lang, 'dataLink')}</a></p>
  ${disclosure(lang)}`;
  return wrap(lang, {
    path: traditionPath(t.id, lang), otherPath: traditionPath(t.id, otherOf(lang)),
    title: name, docTitle: ft(lang, 'tr.docTitle', { name }), desc: ft(lang, 'tr.desc', { name }), body,
  });
}

// ---------------------------------------------------------------------------
// The front page and the methodology
// ---------------------------------------------------------------------------

function homePage(lang) {
  const P = FAITH_PATHS[lang];
  const picks = data.traditions.map((t) => `<li><a href="${SITE}/${traditionPath(t.id, lang)}"><b>${tradName(lang, t)}</b></a><br><span class="small">${tx(lang, KEY.tradFamily(t), t.family)}</span></li>`).join('');
  const issues = data.issues.map((i) => `<li><b>${issueName(lang, i)}.</b> <span class="small">${tx(lang, KEY.issueDesc(i), i.description)}</span></li>`).join('');
  const body = `
  <h1>${ft(lang, 'home.h1')}</h1>
  <p class="lede">${ft(lang, 'home.lede')}</p>
  ${notice(lang)}
  <h2>${ft(lang, 'home.h2pick')}</h2>
  <ul class="stand">${picks}</ul>
  <p class="small">${ft(lang, 'home.oneAtATime')}</p>
  <p>${ft(lang, 'home.range')}</p>
  <h2>${ft(lang, 'home.h2issues')}</h2>
  <ul>${issues}</ul>
  <p><a href="${SITE}/${P.method}">${ft(lang, 'methodLink')}</a> · <a href="${DATA_URL}">${ft(lang, 'dataLink')}</a></p>
  ${disclosure(lang)}`;
  return wrap(lang, {
    path: P.home, otherPath: FAITH_PATHS[otherOf(lang)].home, type: 'CollectionPage',
    title: ft(lang, 'home.h1'), docTitle: ft(lang, 'home.docTitle'), desc: ft(lang, 'home.desc'), body,
  });
}

function methodPage(lang) {
  const P = FAITH_PATHS[lang];
  const officials = data.traditions.map((t) => `<li><a href="${SITE}/${traditionPath(t.id, lang)}"><b>${tradName(lang, t)}</b></a>: ${tx(lang, KEY.tradOfficial(t), t.official)}</li>`).join('');
  const platforms = Object.entries(data.platforms).map(([k, p]) => `<li><a href="${esc(p.url)}">${tx(lang, KEY.platform(k), p.name)}, ${p.year}</a></li>`).join('');
  const toRead = data.toRead.map((r, i) => `<li>${tradName(lang, data.traditions.find((t) => t.id === r.traditionId))}: ${tx(lang, KEY.toRead(r, i), r.what)}</li>`).join('');
  const body = `
  <h1>${ft(lang, 'me.h1')}</h1>
  <p class="lede">${ft(lang, 'me.lede')}</p>
  ${notice(lang)}

  <h2>${ft(lang, 'me.h2review')}</h2>
  <p>${ft(lang, 'me.review')}</p>
  <p>${ft(lang, 'me.corrections', { repoHtml: `<a href="${REPO}">${ft(lang, 'me.repo')}</a>` })}</p>

  <h2>${ft(lang, 'me.h2rules')}</h2>
  <ol>${['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((r) => `<li>${ft(lang, `me.${r}`)}</li>`).join('')}</ol>

  <h2>${ft(lang, 'me.h2official')}</h2>
  <p>${ft(lang, 'me.officialNote')}</p>
  <ul>${officials}</ul>

  <h2>${ft(lang, 'me.h2why')}</h2>
  <p>${ft(lang, 'me.why')}</p>

  <h2>${ft(lang, 'me.h2platforms')}</h2>
  <p>${ft(lang, 'me.platforms')}</p>
  <ul>${platforms}</ul>

  <h2>${ft(lang, 'me.h2earlier')}</h2>
  <p>${ft(lang, 'me.earlier', { n: data.sbcResolutionsSearched.toLocaleString(MONTH[lang]) })}</p>

  <h2>${ft(lang, 'me.h2verses')}</h2>
  <p>${ft(lang, 'me.verses')}</p>
  <p>${ft(lang, 'me.versesAsWritten')}</p>
  <p>${ft(lang, 'me.versesFixes', { list: V.fixes.map((f) => `${f.garbled} → ${f.fixed}`).join('; ') })}</p>
  ${platformsCiteNothing ? `<p>${ft(lang, 'me.versesPlatforms')}</p>` : ''}
  <p class="small">${ft(lang, 'me.bibles')}</p>

  <h2>${ft(lang, 'me.h2checks')}</h2>
  <p>${ft(lang, 'me.checks', { n: data.statements.length + data.planks.length })}</p>

  <h2>${ft(lang, 'me.h2missing')}</h2>
  <ul><li>${ft(lang, 'me.missingAme')}</li><li>${ft(lang, 'me.missingAg')}</li></ul>
  <p>${ft(lang, 'me.toRead')}</p>
  <ul>${toRead}</ul>

  <h2>${ft(lang, 'me.h2not')}</h2>
  <p>${ft(lang, 'me.not')}</p>

  <h2>${ft(lang, 'me.h2data')}</h2>
  <p>${ft(lang, 'me.data')} <a href="${DATA_URL}">${ft(lang, 'dataLink')}</a></p>
  <p><a href="${SITE}/${P.home}">${ft(lang, 'homeLink')}</a></p>
  ${disclosure(lang)}`;
  return wrap(lang, {
    path: P.method, otherPath: FAITH_PATHS[otherOf(lang)].method,
    title: ft(lang, 'me.h1'), docTitle: ft(lang, 'me.docTitle'), desc: ft(lang, 'me.desc'), body,
  });
}

const pages = [];
for (const lang of ['en', 'es']) {
  pages.push([FAITH_PATHS[lang].home, homePage(lang)], [FAITH_PATHS[lang].method, methodPage(lang)]);
  for (const t of data.traditions) pages.push([traditionPath(t.id, lang), traditionPage(lang, t)]);
}
// Every tradition has a page in both languages, and no two pages share a path.
const paths = pages.map(([p]) => p);
if (new Set(paths).size !== paths.length || data.traditions.some((t) => !TRADITION_SLUG[t.id])) {
  throw new Error('build_faith_pages: a tradition has no slug, or two pages share a path');
}
for (const [slug, html] of pages) {
  const dir = resolve(ROOT, 'public', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
}
console.log(`  ${pages.length} faith pages written: ${paths.map((p) => `/${p}`).join(', ')}`);
