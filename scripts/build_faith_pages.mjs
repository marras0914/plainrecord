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
 *   /faith/sides           /fe/posturas           which side each church takes
 *
 * NO SCORE ANYWHERE. Until 15 Nov 2026 there was no grid at all, because one
 * would read as a scoreboard. Marco then asked for one: per issue, which
 * party's platform each church's own words line up with, on a point the
 * platforms themselves split on, with no total and no "should" (see
 * SIDE_POINTS in faith_positions.ts). Every page carries the "not yet
 * reviewed" notice (decided 12 Nov 2026), and verify_site.mjs checks that.
 *
 * NO JAVASCRIPT. The words are in i18n/faith.json, and nothing is written while
 * any of its Spanish is unapproved (see _faith_copy.mjs).
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, esc, loadFaces, document_ } from './_page_shell.mjs';
import { ft, tx, KEY, requireApprovedFaith, FAITH_PATHS, TRADITION_SLUG, traditionPath, houseVotesPath, areaKey } from './_faith_copy.mjs';

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
  .tablewrap{overflow-x:auto;margin:8px 0}
  table.hv{border-collapse:collapse;font-size:15px;min-width:100%}
  table.hv th,table.hv td{padding:6px 10px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
  table.hv td{font-variant-numeric:tabular-nums}
  ul.tally{list-style:none;padding:0;margin:4px 0 6px;font-size:15px}
  ul.tally li{margin:2px 0}
  .way{font-weight:600}
  p.caption{font-family:"Newsreader",Georgia,serif;font-size:1.02rem;color:var(--ink-2);margin:2px 0 6px}
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
    // The Religion space's own card (scripts/build_space_cards.mjs), not the quiz's.
    ogImage: `${SITE}/${lang === 'es' ? 'og-religion.es.png' : 'og-religion.png'}`,
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

// ---------------------------------------------------------------------------
// What a Jewish statement cites (npm run data:faith:citations): listed as the
// statement writes it and linked to Sefaria, never printed (decided 15 Nov
// 2026: the verse text above is from Christian translations).
// ---------------------------------------------------------------------------

const JEWISH = new Set(data.traditions.filter((t) => t.family === 'Jewish').map((t) => t.id));
const C = data.citations;

function citesBlock(lang, s) {
  const c = C.byStatement[`${s.traditionId}.${s.issueId}.${s.sourceDate}`];
  if (!c) throw new Error(`build_faith_pages: no citation record for ${s.traditionId} ${s.issueId} ${s.sourceDate}; run npm run data:faith:citations`);
  if (!c.citations.length) return `<p class="small">${ft(lang, c.scope === 'paragraph' ? 'tr.noCitesParagraph' : 'tr.noCitesWhole')}</p>`;
  const items = c.citations.map((x) => `<li><a href="${esc(x.url)}" lang="en"><b>${esc(x.written)}</b></a> <span class="small">(${ft(lang, KEY.citeKind(x.kind))}${x.ref !== x.written ? ` · <span lang="en">${esc(x.ref)}</span>` : ''})</span></li>`).join('');
  return `<details class="verses"><summary>${ft(lang, 'tr.citesSummary', { n: c.citations.length })}</summary>
        <p class="small">${ft(lang, 'tr.citesNote')}</p>
        <ul class="stand">${items}</ul>
      </details>`;
}

function statementCard(lang, s) {
  return `<div class="card">
      <p class="small">${tx(lang, KEY.body(s), s.body)}, ${esc(fmtDate(lang, s.sourceDate))}</p>
      <p><a href="${esc(s.sourceUrl)}"><b lang="en">${esc(s.title)}</b></a></p>
      <p>${tx(lang, KEY.statement(s), s.summary)}</p>
      ${quote(s.excerpt)}
      ${JEWISH.has(s.traditionId) ? citesBlock(lang, s) : versesBlock(lang, s)}
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
  // Side by side on a laptop (.duo in _page_shell.mjs), one above the other on a phone.
  const platforms = LEVELS.map((level) => `<h4>${ft(lang, `tr.${level}`)}</h4>
    <div class="duo">${PARTIES.map((party) => plankCard(lang, party, level, issue.id)).join('\n    ')}</div>`).join('\n    ');
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
  ${HV.has(t.id)
    ? `<div class="card"><p><a href="${SITE}/${houseVotesPath(t.id, lang)}"><b>${ft(lang, 'tr.houseLink')}</b></a></p><p class="small">${ft(lang, 'tr.houseLinkNote')}</p></div>`
    : `<p class="small">${ft(lang, 'tr.noBillList')}</p>`}
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
// The Texas House on the bills a church took a side on (faith_house_votes.ts)
// ---------------------------------------------------------------------------

const HV = new Map(data.houseVotes.map((h) => [h.traditionId, h]));
const VOTES_URL = '/data/votes_89R.json';
const listBills = (bills) => bills.join(', ');
const pct = (a, n) => (n ? Math.round((100 * a) / n) : 0);

function wayText(lang, way) {
  return `<span class="way way-${way}">${ft(lang, `hv.way.${way}`)}</span>`;
}

function hvBillCard(lang, b) {
  const h = b.house;
  const comp = b.with.length ? ` ${ft(lang, 'hv.companions', { list: listBills(b.with) })}` : '';
  return `<div class="card">
      <p><a href="${esc(h.history)}"><b>${esc(b.bill)}</b></a> · ${ft(lang, b.position === 'supports' ? 'hv.supported' : 'hv.opposed')}</p>
      <p class="caption" lang="en">${esc(b.caption)}</p>
      <p class="small">${ft(lang, 'hv.voteLine', { date: fmtDate(lang, h.date.replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, '$3-$1-$2')), rv: h.rv, yeas: h.yeas, nays: h.nays })}</p>
      <ul class="tally">
        <li>${ft(lang, 'hv.partyLine', { party: ft(lang, 'hv.R'), yea: h.R.yea, nay: h.R.nay, wayHtml: wayText(lang, h.rWay) })}</li>
        <li>${ft(lang, 'hv.partyLine', { party: ft(lang, 'hv.D'), yea: h.D.yea, nay: h.D.nay, wayHtml: wayText(lang, h.dWay) })}</li>
      </ul>
      <p class="small"><a href="${esc(b.source)}">${ft(lang, 'hv.theirEntry')}</a>${comp}</p>
    </div>`;
}

function conflictItem(lang, c) {
  const why = ft(lang, `hv.c.${c.kind}`, c.kind === 'link' || c.kind === 'words' ? { bill: c.bill, other: c.other } : {});
  const where = [...new Set(c.entries.map((e) => e.page))].map((u) => `<a href="${esc(u)}">${esc(u.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`).join(' · ');
  return `<li><b>${esc(c.bill)}</b>: ${why} <span class="small">${where}</span></li>`;
}

function houseVotesPage(lang, t, hv) {
  const P = FAITH_PATHS[lang];
  const T = hv.total;
  const differFirst = (a, b) => (Number(b.house.rWay !== b.house.dWay) - Number(a.house.rWay !== a.house.dWay)) || 0;
  const areaRows = hv.byArea.map((a) => `<tr><th scope="row">${ft(lang, areaKey(a.area))}</th><td>${a.bills}</td><td>${a.R.with}</td><td>${a.D.with}</td><td>${a.partiesDiffer}</td></tr>`).join('');
  const sections = hv.byArea.map((a) => {
    const list = hv.bills.filter((b) => (a.area === null ? b.areas.length === 0 : b.areas.includes(a.area))).sort(differFirst);
    return `<h3 id="${areaKey(a.area).slice(8)}">${ft(lang, areaKey(a.area))}</h3>
    <div class="duo">${list.map((b) => hvBillCard(lang, b)).join('\n    ')}</div>`;
  }).join('\n  ');
  const nv = hv.notVoted;
  const total = hv.bills.length + Object.values(nv).reduce((s, l) => s + l.length, 0);
  const body = `
  <h1>${ft(lang, 'hv.h1')}</h1>
  <p class="lede">${ft(lang, 'hv.lede')}</p>
  ${notice(lang)}
  <p>${ft(lang, 'hv.whose', { date: fmtDate(lang, hv.saved) })}</p>
  ${quote(hv.caveat)}

  <h2>${ft(lang, 'hv.h2count')}</h2>
  <p>${ft(lang, 'hv.countIntro', { n: T.bills, total })}</p>
  <div class="tablewrap"><table class="hv">
    <thead><tr><th scope="col">${ft(lang, 'hv.th.party')}</th><th scope="col">${ft(lang, 'hv.th.with')}</th><th scope="col">${ft(lang, 'hv.th.against')}</th><th scope="col">${ft(lang, 'hv.th.split')}</th></tr></thead>
    <tbody>
      <tr><th scope="row">${ft(lang, 'hv.R')}</th><td>${T.R.with} <span class="small">(${pct(T.R.with, T.bills)}%)</span></td><td>${T.R.against}</td><td>${T.R.split}</td></tr>
      <tr><th scope="row">${ft(lang, 'hv.D')}</th><td>${T.D.with} <span class="small">(${pct(T.D.with, T.bills)}%)</span></td><td>${T.D.against}</td><td>${T.D.split}</td></tr>
    </tbody></table></div>
  <p class="small">${ft(lang, 'hv.wayDef')}</p>
  <p>${ft(lang, 'hv.differ', { d: T.partiesDiffer, n: T.bills })}</p>
  <p class="small">${ft(lang, 'hv.scope')}</p>

  <h2>${ft(lang, 'hv.h2areas')}</h2>
  <div class="tablewrap"><table class="hv">
    <thead><tr><th scope="col">${ft(lang, 'hv.th.area')}</th><th scope="col">${ft(lang, 'hv.th.bills')}</th><th scope="col">${ft(lang, 'hv.th.rWith')}</th><th scope="col">${ft(lang, 'hv.th.dWith')}</th><th scope="col">${ft(lang, 'hv.th.differ')}</th></tr></thead>
    <tbody>${areaRows}</tbody></table></div>
  <p class="small">${ft(lang, 'hv.areaNote')}</p>

  <h2>${ft(lang, 'hv.h2bills')}</h2>
  <p class="small">${ft(lang, 'hv.billsNote')}</p>
  ${sections}

  <h2>${ft(lang, 'hv.h2notVoted')}</h2>
  <ul>
    <li>${ft(lang, 'hv.nv.notPassed', { n: nv.notPassed.length })}</li>
    ${nv.noRecordVote.length ? `<li>${ft(lang, 'hv.nv.noRecord', { n: nv.noRecordVote.length })} <span class="small">${esc(listBills(nv.noRecordVote))}</span></li>` : ''}
    ${nv.voteNotInFile.length ? `<li>${ft(lang, 'hv.nv.notInFile', { n: nv.voteNotInFile.length, list: listBills(nv.voteNotInFile) })}</li>` : ''}
    ${nv.noSuchBill.length ? `<li>${ft(lang, 'hv.nv.noSuch', { n: nv.noSuchBill.length, list: listBills(nv.noSuchBill) })}</li>` : ''}
  </ul>
  <p class="small">${ft(lang, 'hv.nv.note')}</p>

  <h2>${ft(lang, 'hv.h2conflicts')}</h2>
  <p>${ft(lang, 'hv.conflictsNote', { n: hv.conflicts.length })}</p>
  <ul class="stand">${hv.conflicts.map((c) => conflictItem(lang, c)).join('')}</ul>

  <h2>${ft(lang, 'hv.h2method')}</h2>
  <ol>
    <li>${ft(lang, 'hv.m1')}</li>
    <li>${ft(lang, 'hv.m2')}</li>
    <li>${ft(lang, 'hv.m3', { dataHtml: `<a href="${VOTES_URL}">${ft(lang, 'hv.votesFile')}</a>` })}</li>
  </ol>
  <p class="small">${ft(lang, 'hv.sources')} ${Object.values(hv.pages).map((p) => `<a href="${esc(p.url)}">${esc(p.url.replace(/^https:\/\//, ''))}</a>`).join(' · ')}</p>

  <h2>${ft(lang, 'hv.h2others')}</h2>
  <p>${ft(lang, 'hv.others')}</p>
  <p><a href="${SITE}/${traditionPath(t.id, lang)}">${ft(lang, 'hv.back', { name: tradName(lang, t) })}</a> · <a href="${SITE}/${P.method}">${ft(lang, 'methodLink')}</a> · <a href="${DATA_URL}">${ft(lang, 'dataLink')}</a></p>
  ${disclosure(lang)}`;
  return wrap(lang, {
    path: houseVotesPath(t.id, lang), otherPath: houseVotesPath(t.id, otherOf(lang)),
    title: ft(lang, 'hv.h1'), docTitle: ft(lang, 'hv.docTitle'), desc: ft(lang, 'hv.desc'), body,
  });
}

// ---------------------------------------------------------------------------
// Which side each church takes (faith_positions.ts SIDE_POINTS)
// ---------------------------------------------------------------------------
//
// Decided 15 Nov 2026: per issue, which party's platform each church's own
// words line up with, on a point the platforms themselves split on. NO TOTAL,
// here or anywhere: verify_site.mjs checks the page carries no count of marks.

const SIDE_STYLE = `<style>
  table.sides{border-collapse:collapse;font-size:14.5px;min-width:100%}
  table.sides th,table.sides td{padding:6px 8px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
  table.sides thead th{font-size:13.5px;font-weight:600}
  .mk{display:inline-block;min-width:26px;padding:1px 7px;border-radius:4px;font-weight:700;text-align:center;color:#fff}
  .mk.D{background:var(--blue)} .mk.R{background:var(--red)}
  .mk.none{color:var(--muted);font-weight:400;background:none;padding:1px 0;min-width:0;font-size:13.5px;text-align:left}
  table.sides th[scope=row]{position:sticky;left:0;background:var(--page);z-index:1;min-width:7.5em}
  @media print{.mk{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  .ans{font-weight:600}
  </style>`;

const P2 = ['D', 'R'];
/** Which party's platform is on the church's side at each compared level. */
function partiesWith(pt, q) {
  return pt.levels.map((level) => ({ level, party: P2.find((p) => pt.platforms[`${p}-${level}`].side === q.side) }));
}

/** The grid cell, and the same mark in words for the issue section. */
function sideMark(lang, issueId, tradId) {
  const pt = data.sidePoints.find((p) => p.issueId === issueId);
  if (!pt) return { cell: `<span class="mk none">${ft(lang, 'sd.mark.notCompared')}</span>`, words: '' };
  if (!(tradId in pt.churches)) return { cell: `<span class="mk none">${ft(lang, 'sd.mark.noStatement')}</span>`, words: ft(lang, 'sd.noStatement') };
  const q = pt.churches[tradId];
  if (!q) return { cell: `<span class="mk none">${ft(lang, 'sd.mark.doesntSay')}</span>`, words: ft(lang, 'sd.doesntSay') };
  const by = partiesWith(pt, q);
  const parties = [...new Set(by.map((b) => b.party))];
  // Every compared level puts the church beside the same party in the data so
  // far; if that ever differs, the mark says so level by level.
  const cell = parties.length === 1
    ? `<span class="mk ${parties[0]}" title="${ft(lang, `sd.same.${parties[0]}`)}">${ft(lang, `sd.mark.${parties[0]}`)}</span>`
    : by.map((b) => `${ft(lang, `tr.${b.level}`)} <span class="mk ${b.party}">${ft(lang, `sd.mark.${b.party}`)}</span>`).join(' ');
  const words = parties.length === 1
    ? ft(lang, `sd.same.${parties[0]}`)
    : by.map((b) => `${ft(lang, `tr.${b.level}`)}: ${ft(lang, `sd.same.${b.party}`)}`).join('; ');
  return { cell, words };
}

// Every tradition: the Jewish movements joined on 16 Nov 2026.
const SIDE_TRADITIONS = data.traditions;

function sidesPage(lang) {
  const P = FAITH_PATHS[lang];
  const short = (t) => ft(lang, `sd.short.${t.id}`);
  const head = `<tr><th scope="col">${ft(lang, 'sd.th.issue')}</th>${SIDE_TRADITIONS.map((t) => `<th scope="col">${short(t)}</th>`).join('')}</tr>`;
  const rows = data.issues.map((i) => `<tr><th scope="row"><a href="#${i.id}">${issueName(lang, i)}</a></th>${SIDE_TRADITIONS.map((t) => `<td>${sideMark(lang, i.id, t.id).cell}</td>`).join('')}</tr>`).join('');

  const sections = data.issues.map((issue) => {
    const pt = data.sidePoints.find((p) => p.issueId === issue.id);
    if (!pt) {
      const n = data.noSidePoint.find((x) => x.issueId === issue.id);
      return `<h2 id="${issue.id}">${issueName(lang, issue)}</h2>
  <p>${tx(lang, KEY.noSide(n), n.note)}</p>`;
    }
    const ans = (s) => (s === 'a' ? tx(lang, KEY.sideA(pt), pt.a) : tx(lang, KEY.sideB(pt), pt.b));
    const plats = pt.levels.flatMap((level) => P2.map((party) => {
      const k = `${party}-${level}`;
      const q = pt.platforms[k];
      return `<div class="card"><p class="small">${ft(lang, 'tr.platformLine', { name: tx(lang, KEY.platform(k), data.platforms[k].name), year: data.platforms[k].year })}</p>
      <p><span class="mk ${party}">${ft(lang, `sd.mark.${party}`)}</span> <span class="ans">${ans(q.side)}</span></p>
      ${quote(q.quote)}
      <p class="small"><a href="${esc(q.url)}">${ft(lang, 'tr.fullText')}</a></p></div>`;
    })).join('\n    ');
    const churches = SIDE_TRADITIONS.map((t) => {
      const m = sideMark(lang, issue.id, t.id);
      const q = pt.churches[t.id];
      return `<div class="card"><p><a href="${SITE}/${traditionPath(t.id, lang)}#${issue.id}"><b>${tradName(lang, t)}</b></a></p>
      <p>${m.cell} ${q ? `<span class="ans">${ans(q.side)}</span>` : ''}</p>
      ${q ? `${quote(q.quote)}<p class="small">${m.words}. <a href="${esc(q.url)}">${ft(lang, 'tr.fullText')}</a></p>` : `<p class="small">${m.words}</p>`}</div>`;
    }).join('\n    ');
    return `<h2 id="${issue.id}">${issueName(lang, issue)}</h2>
  <p><b>${tx(lang, KEY.sideQ(pt), pt.question)}</b></p>
  <p class="small">${ft(lang, pt.levels.length === 2 ? 'sd.levels.both' : 'sd.levels.texas')}</p>
  <h3>${ft(lang, 'sd.h3platforms')}</h3>
  <div class="duo">${plats}</div>
  <h3>${ft(lang, 'sd.h3churches')}</h3>
  <div class="duo">${churches}</div>`;
  }).join('\n');

  const body = `${SIDE_STYLE}
  <h1>${ft(lang, 'sd.h1')}</h1>
  <p class="lede">${ft(lang, 'sd.lede')}</p>
  ${notice(lang)}
  <h2>${ft(lang, 'sd.h2grid')}</h2>
  <p class="small">${ft(lang, 'sd.legend')}</p>
  <div class="tablewrap"><table class="sides"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
  <p class="small">${ft(lang, 'sd.noTotal')}</p>
  ${sections}
  <h2>${ft(lang, 'sd.h2rules')}</h2>
  <ol>${['r1', 'r2', 'r3', 'r4'].map((r) => `<li>${ft(lang, `sd.${r}`)}</li>`).join('')}</ol>
  <h2>${ft(lang, 'sd.h2calls')}</h2>
  <p>${ft(lang, 'sd.callsNote')}</p>
  <ul>${['c1', 'c2', 'c3'].map((c) => `<li>${ft(lang, `sd.${c}`)}</li>`).join('')}</ul>
  <p><a href="${SITE}/${P.home}">${ft(lang, 'homeLink')}</a> · <a href="${SITE}/${P.method}">${ft(lang, 'methodLink')}</a> · <a href="${DATA_URL}">${ft(lang, 'dataLink')}</a></p>
  ${disclosure(lang)}`;
  return wrap(lang, {
    path: P.sides, otherPath: FAITH_PATHS[otherOf(lang)].sides,
    title: ft(lang, 'sd.h1'), docTitle: ft(lang, 'sd.docTitle'), desc: ft(lang, 'sd.desc'), body,
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
  <div class="card"><p><a href="${SITE}/${P.sides}"><b>${ft(lang, 'sd.h1')}</b></a></p><p class="small">${ft(lang, 'home.sidesNote')}</p></div>
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
  <p>${ft(lang, 'me.jewishCurrent')}</p>

  <h2>${ft(lang, 'me.h2why')}</h2>
  <p>${ft(lang, 'me.why')}</p>
  <p>${ft(lang, 'me.whyJewish')}</p>

  <h2>${ft(lang, 'me.h2platforms')}</h2>
  <p>${ft(lang, 'me.platforms')}</p>
  <ul>${platforms}</ul>

  <h2>${ft(lang, 'me.h2earlier')}</h2>
  <p>${ft(lang, 'me.earlier', { n: data.sbcResolutionsSearched.toLocaleString(MONTH[lang]) })}</p>
  <p>${ft(lang, 'me.earlierJewish', Object.fromEntries(Object.entries(data.jewishResolutionsSearched).map(([b, n]) => [b, n.toLocaleString(MONTH[lang])])))}</p>

  <h2>${ft(lang, 'me.h2verses')}</h2>
  <p>${ft(lang, 'me.verses')}</p>
  <p>${ft(lang, 'me.versesAsWritten')}</p>
  <p>${ft(lang, 'me.versesFixes', { list: V.fixes.map((f) => `${f.garbled} → ${f.fixed}`).join('; ') })}</p>
  ${platformsCiteNothing ? `<p>${ft(lang, 'me.versesPlatforms')}</p>` : ''}
  <p class="small">${ft(lang, 'me.bibles')}</p>

  <h2>${ft(lang, 'me.h2cites')}</h2>
  <p>${ft(lang, 'me.cites')}</p>
  <p class="small" lang="en">${ft(lang, 'me.citesAliases', { list: C.aliases.map((a) => `${a.written} → ${a.sefaria} (${a.why})`).join('; ') })}</p>

  <h2>${ft(lang, 'me.h2sides')}</h2>
  <p>${ft(lang, 'me.sides', { linkHtml: `<a href="${SITE}/${P.sides}">${ft(lang, 'sd.h1')}</a>` })}</p>

  <h2>${ft(lang, 'me.h2house')}</h2>
  <p>${ft(lang, 'me.house', { linkHtml: data.houseVotes.map((h) => `<a href="${SITE}/${houseVotesPath(h.traditionId, lang)}">${ft(lang, 'hv.h1')}</a>`).join(', ') })}</p>

  <h2>${ft(lang, 'me.h2checks')}</h2>
  <p>${ft(lang, 'me.checks', { n: data.statements.length + data.planks.length })}</p>

  <h2>${ft(lang, 'me.h2missing')}</h2>
  <ul><li>${ft(lang, 'me.missingAme')}</li><li>${ft(lang, 'me.missingAg')}</li><li>${ft(lang, 'me.missingOrthodox')}</li></ul>
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
  pages.push([FAITH_PATHS[lang].home, homePage(lang)], [FAITH_PATHS[lang].method, methodPage(lang)], [FAITH_PATHS[lang].sides, sidesPage(lang)]);
  for (const t of data.traditions) pages.push([traditionPath(t.id, lang), traditionPage(lang, t)]);
  for (const hv of data.houseVotes) {
    const t = data.traditions.find((x) => x.id === hv.traditionId);
    pages.push([houseVotesPath(t.id, lang), houseVotesPage(lang, t, hv)]);
  }
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
