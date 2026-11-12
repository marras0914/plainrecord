/**
 * PlainRecord: the economy module's labeled pages, in English and Spanish
 *
 *   node scripts/build_economy_pages.mjs            (ECON_DRAFT=1 for a local look)
 *
 * Writes, per language:
 *   /economy/explore      /economia/explorar      every term, labeled
 *   /economy/methodology  /economia/metodologia   sources, choices, gaps
 *
 * READS ONLY WHAT SHIPS: public/data/econ_terms.json (scripts/export_econ.ts)
 * for every figure, and data/fred/GDPC1.json for the two 2020 quarters the copy
 * cites. So a page cannot say something the published file does not.
 *
 * NO JAVASCRIPT. Every chart is SVG drawn here, every lag is in a table under
 * its chart, and the pages work with scripts off. The blind round, which does
 * need a script, is built separately.
 *
 * The words are in i18n/economy.json, and nothing is written while any of its
 * Spanish is unapproved (see _econ_copy.mjs).
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, esc, loadFaces, document_ } from './_page_shell.mjs';
import { et, requireApprovedEcon, ECON_PATHS, ECON_COPY } from './_econ_copy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
requireApprovedEcon('build_economy_pages');

const data = read('public/data/econ_terms.json');
const PAPER_LAG = data.paperLagQuarters;
const LAGS = data.lags;
const METRICS = ['gdpGrowth', 'jobGrowth', 'unemploymentChange', 'inflation', 'deficit', 'income', 'recessionMonths'];
const PARTY_CLASS = { D: 'D', R: 'R' };

// The two 2020 quarters the "all complete terms" line cites, computed here.
const gdp = read('data/fred/GDPC1.json').observations;
const gv = (d) => gdp.find((o) => o.date === d).value;
const annual = (a, b) => ((gv(b) / gv(a)) ** 4 - 1) * 100;
const FALL_2020 = Math.round(-annual('2020-01-01', '2020-04-01'));
const RISE_2020 = Math.round(annual('2020-04-01', '2020-07-01'));

const NUM = { en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }), es: new Intl.NumberFormat('es-US', { maximumFractionDigits: 2 }) };
const num = (lang, v) => (v === null || v === undefined ? et(lang, 'noData') : NUM[lang].format(v));
const surname = (n) => n.replace(/ Jr\.$/, '').split(' ').at(-1);
const year = (iso) => iso.slice(0, 4);

function termLabel(lang, t) {
  const names = t.presidents.map((p) => surname(p.name)).join(lang === 'es' ? ' y ' : ' and ');
  return t.end ? et(lang, 'termLabel', { names, from: year(t.start), to: year(t.end) }) : et(lang, 'termNow', { names, from: year(t.start) });
}
/** The chart row label: "Kennedy–Johnson 1961–65", "Trump 2025–now". Short,
 *  because the phone CSS enlarges chart text and a long label ran into the bars. */
function termShort(lang, t) {
  const names = t.presidents.map((p) => surname(p.name)).join('–');
  return `${names} ${year(t.start)}–${t.end ? year(t.end).slice(2) : et(lang, 'now')}`;
}
const QUARTER = {
  en: ['the first quarter', 'the second quarter', 'the third quarter', 'the fourth quarter'],
  es: ['el primer trimestre', 'el segundo trimestre', 'el tercer trimestre', 'el cuarto trimestre'],
};
const quarterText = (lang, label) => {
  const [y, q] = label.split('Q');
  return lang === 'es' ? `${QUARTER.es[q - 1]} de ${y}` : `${QUARTER.en[q - 1]} of ${y}`;
};

// ---------------------------------------------------------------------------
// The timeline: four lanes, 1949 to now
// ---------------------------------------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10);
const T0 = Date.parse('1949-01-20');
const T1 = Date.parse(TODAY);

function timelineSvg(lang) {
  const W = 608, L = 96, R = 8, laneH = 20, gap = 8, top = 4;
  const x = (iso) => L + ((Date.parse(iso) - T0) / (T1 - T0)) * (W - L - R);
  const clip = (iso) => (iso < '1949-01-20' ? '1949-01-20' : iso > TODAY ? TODAY : iso);
  const rect = (lane, a, b, cls, title) => {
    const x0 = x(clip(a)), x1 = x(clip(b));
    if (x1 <= x0) return '';
    const y = top + lane * (laneH + gap);
    return `<rect class="${cls}" x="${x0.toFixed(1)}" y="${y}" width="${(x1 - x0).toFixed(1)}" height="${laneH}"><title>${esc(title)}</title></rect>`;
  };
  const parts = [];
  for (const t of data.terms) {
    t.presidents.forEach((p, i) => {
      const end = t.presidents[i + 1]?.start ?? t.end ?? TODAY;
      parts.push(rect(0, p.start, end, PARTY_CLASS[p.party], `${p.name}, ${year(p.start)}`));
    });
    for (const c of t.control) {
      const end = c.end ?? TODAY;
      parts.push(rect(1, c.start, end, PARTY_CLASS[c.house], `${et(lang, 'lane.house')}: ${et(lang, c.house)}, ${year(c.start)}`));
      parts.push(rect(2, c.start, end, PARTY_CLASS[c.senate], `${et(lang, 'lane.senate')}: ${et(lang, c.senate)}, ${year(c.start)}${c.note ? `. ${c.note}` : ''}`));
    }
  }
  for (const s of data.fedLane) {
    parts.push(rect(3, s.start, s.end, s.party ? PARTY_CLASS[s.party] : 'nodata', `${s.chair}, ${year(s.start)}`));
  }
  const labels = ['lane.president', 'lane.house', 'lane.senate', 'lane.fed']
    .map((k, i) => `<text class="lab" x="0" y="${top + i * (laneH + gap) + 14}">${esc(et(lang, k))}</text>`).join('');
  const h = top + 4 * (laneH + gap) + 16;
  const ticks = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((yy) => {
    const xx = x(`${yy}-01-01`);
    return `<line class="grid" x1="${xx}" x2="${xx}" y1="${top}" y2="${h - 16}"/><text class="tick" x="${xx}" y="${h - 2}" text-anchor="middle">${yy}</text>`;
  }).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(et(lang, 'ex.h2who'))}">${ticks}${parts.join('')}${labels}</svg></figure>`;
}

// ---------------------------------------------------------------------------
// One bar chart per measure, each term a row
// ---------------------------------------------------------------------------

function barsSvg(lang, metric) {
  const rows = data.terms.map((t) => ({ t, v: t.byLag[PAPER_LAG].metrics[metric].value }));
  const vals = rows.map((r) => r.v).filter((v) => v !== null);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  // Wide label column and tall rows: on a phone the chart scales to about 0.6
  // and the site's CSS raises chart text to 17 to 18 units to stay legible.
  const W = 608, L = 236, R = 64, rowH = 26;
  const x = (v) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
  const h = rows.length * rowH + 6;
  const zero = x(0);
  const out = rows.map((r, i) => {
    const y = i * rowH + 3;
    const label = `<text class="tick" x="0" y="${y + 16}">${esc(termShort(lang, r.t))}${r.t.complete ? '' : ' *'}</text>`;
    if (r.v === null) return `${label}<text class="note" x="${zero + 4}" y="${y + 16}">${esc(et(lang, 'noData'))}</text>`;
    const a = Math.min(x(r.v), zero), b = Math.max(x(r.v), zero);
    // Every value sits right of both the bar and the zero line, so a negative
    // bar's figure can never land on the label column.
    const valX = Math.max(b, zero) + 4;
    return `${label}<rect class="${PARTY_CLASS[r.t.party]}" x="${a.toFixed(1)}" y="${y + 4}" width="${Math.max(1, b - a).toFixed(1)}" height="${rowH - 9}"><title>${esc(termLabel(lang, r.t))}: ${esc(num(lang, r.v))}</title></rect>`
      + `<text class="val" x="${valX.toFixed(1)}" y="${y + 16}">${esc(num(lang, r.v))}</text>`;
  }).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(et(lang, `m.${metric}`))}"><line class="axis" x1="${zero}" x2="${zero}" y1="0" y2="${h}"/>${out}</svg></figure>`;
}

function lagTable(lang, metric) {
  const head = `<tr><th>${et(lang, 'ex.colTerm')}</th>${LAGS.map((l) => `<th class="num">${et(lang, 'ex.colLag', { n: l })}${l === PAPER_LAG ? ` ${et(lang, 'ex.paperLagMark')}` : ''}</th>`).join('')}</tr>`;
  const body = data.terms.map((t) => `<tr><td>${esc(termLabel(lang, t))}</td>${LAGS.map((l) => `<td class="num">${esc(num(lang, t.byLag[l].metrics[metric].value))}</td>`).join('')}</tr>`).join('');
  return `<details class="table"><summary>${et(lang, 'ex.otherLags')}</summary><table class="chart-table">${head}${body}</table></details>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const partyName = (lang, p) => et(lang, p);
const groupTable = (lang, g, labelOf) => `<table class="chart-table"><tr><th>${et(lang, 'ex.colGroup')}</th><th class="num">${et(lang, 'ex.colGrowth')}</th><th class="num">${et(lang, 'ex.colQuarters')}</th></tr>`
  + Object.entries(g).map(([k, v]) => `<tr><td>${labelOf(k)}</td><td class="num">${esc(num(lang, v.mean))}%</td><td class="num">${v.quarters}</td></tr>`).join('') + '</table>';

function explorePage(lang) {
  const P = ECON_PATHS[lang];
  const other = lang === 'es' ? 'en' : 'es';
  const g = data.groupings[PAPER_LAG];
  const complete = data.terms.filter((t) => t.complete);
  const current = data.terms.find((t) => !t.complete);
  const govLabel = (k) => (k === 'unified D' ? et(lang, 'g.unifiedD') : k === 'unified R' ? et(lang, 'g.unifiedR') : et(lang, 'g.divided'));
  const notes = data.terms.filter((t) => t.notes.length).map((t) => `<li><b>${esc(termLabel(lang, t))}</b><ul>${t.notes.map((n) => `<li>${esc(n.text)} <a class="hist" href="${esc(n.source.url)}">${et(lang, 'ex.source')}</a></li>`).join('')}</ul></li>`).join('');

  const body = `
  <h1>${et(lang, 'ex.h1')}</h1>
  <p class="lede">${et(lang, 'ex.lede')}</p>
  <p><a href="${SITE}/${P.method}">${et(lang, 'methodLink')}</a></p>

  <h2>${et(lang, 'ex.h2who')}</h2>
  <p class="small">${et(lang, 'ex.whoNote')}</p>
  ${timelineSvg(lang)}
  <ul class="legend"><li><span class="sw D"></span>${et(lang, 'D')}</li><li><span class="sw R"></span>${et(lang, 'R')}</li><li><span class="sw nodata"></span>${et(lang, 'noData')}</li></ul>

  <h2>${et(lang, 'ex.h2metrics')}</h2>
  <p class="small">${et(lang, 'ex.lagNote')}</p>
  ${current ? `<p class="small">* ${et(lang, 'ex.inProgress', { through: quarterText(lang, current.byLag[PAPER_LAG].window.to) })}</p>` : ''}
  ${METRICS.map((m) => `<p class="lab">${et(lang, `m.${m}`)}</p>${barsSvg(lang, m)}${lagTable(lang, m)}`).join('\n  ')}

  <h2>${et(lang, 'ex.h2groups')}</h2>
  <p class="small">${et(lang, 'ex.groupsNote')}</p>
  <p>${et(lang, 'ex.paperRow')}</p>
  ${groupTable(lang, g.paperSample, (k) => partyName(lang, k))}
  <p>${et(lang, 'ex.allRow', { n: complete.length, end: year(complete.at(-1).end), fall: FALL_2020, rise: RISE_2020 })}</p>
  ${groupTable(lang, g.allComplete, (k) => partyName(lang, k))}
  <p class="lab">${et(lang, 'ex.govHead')}</p>
  ${groupTable(lang, g.government, govLabel)}
  <p class="small">${et(lang, 'ex.fedRefused')}</p>

  <h2>${et(lang, 'ex.h2notes')}</h2>
  <p class="small">${et(lang, 'ex.notesNote', { r: data.contextByParty.R, d: data.contextByParty.D })}</p>
  <ul class="stand">${notes}</ul>
  <p><a href="${SITE}/${P.method}">${et(lang, 'methodLink')}</a></p>`;

  return document_({
    lang, otherLang: other, title: et(lang, 'ex.h1'), docTitle: et(lang, 'ex.docTitle'),
    siteName: lang === 'es' ? 'La Franja Morada' : 'The Purple Strip',
    desc: et(lang, 'ex.desc'), canonical: `${SITE}/${P.explore}`, altHref: `${SITE}/${ECON_PATHS[other].explore}`,
    altLabel: et(lang, 'langSwitch'), kicker: et(lang, 'kicker'), faces, body,
    ogImage: `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'WebPage', name: et(lang, 'ex.h1'), description: et(lang, 'ex.desc'),
      inLanguage: lang === 'es' ? 'es-US' : 'en-US', url: `${SITE}/${P.explore}`,
      isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/` },
    },
  });
}

function methodPage(lang) {
  const P = ECON_PATHS[lang];
  const other = lang === 'es' ? 'en' : 'es';
  const gaps = LAGS.map((l) => {
    const p = data.groupings[l].paperSample;
    return num(lang, Math.round((p.D.mean - p.R.mean) * 100) / 100);
  }).join(', ');
  const fred = data.sources.fred.map((s) => `<li><a href="${esc(s.sourceUrl)}">${esc(s.title)}</a> (${esc(s.id)}), ${et(lang, 'me.updated', { date: s.lastUpdated.slice(0, 10) })}</li>`).join('');
  const offices = [
    ['src.house', data.sources.house],
    ['src.senate', data.sources.senate[0]],
    ['src.fed', data.sources.fed[0]],
    ['src.paper', data.paper.url],
  ].map(([k, url]) => `<li><a href="${esc(url)}">${et(lang, k)}</a></li>`).join('');

  const body = `
  <h1>${et(lang, 'me.h1')}</h1>
  <p class="lede">${et(lang, 'me.lede')}</p>
  <p><a href="${SITE}/${P.explore}">${et(lang, 'exploreLink')}</a></p>

  <h2>${et(lang, 'me.h2research')}</h2>
  <p>${et(lang, 'me.research')}</p>

  <h2>${et(lang, 'me.h2sources')}</h2>
  <p>${et(lang, 'me.sourcesFred')}</p>
  <ul>${fred}</ul>
  <p>${et(lang, 'me.sourcesOffices')}</p>
  <ul>${offices}</ul>

  <h2>${et(lang, 'me.h2defs')}</h2>
  <ul>${METRICS.map((m) => `<li><b>${et(lang, `m.${m}`)}.</b> ${et(lang, `d.${m}`)}</li>`).join('')}</ul>
  <p>${et(lang, 'd.baseline')}</p>

  <h2>${et(lang, 'me.h2lag')}</h2>
  <p>${et(lang, 'me.lag', { gaps })}</p>
  <p>${et(lang, 'me.terms')}</p>

  <h2>${et(lang, 'me.h2notes')}</h2>
  <p>${et(lang, 'me.notes', { r: data.contextByParty.R, d: data.contextByParty.D })}</p>

  <h2>${et(lang, 'me.h2blind')}</h2>
  <p>${et(lang, 'me.blind')}</p>

  <h2>${et(lang, 'me.h2missing')}</h2>
  <ul><li>${et(lang, 'me.missingFed')}</li><li>${et(lang, 'me.missingOct')}</li><li>${et(lang, 'me.missingIncome')}</li></ul>

  <h2>${et(lang, 'me.h2not')}</h2>
  <p>${et(lang, 'me.not')}</p>`;

  return document_({
    lang, otherLang: other, title: et(lang, 'me.h1'), docTitle: et(lang, 'me.docTitle'),
    siteName: lang === 'es' ? 'La Franja Morada' : 'The Purple Strip',
    desc: et(lang, 'me.desc'), canonical: `${SITE}/${P.method}`, altHref: `${SITE}/${ECON_PATHS[other].method}`,
    altLabel: et(lang, 'langSwitch'), kicker: et(lang, 'kicker'), faces, body,
    ogImage: `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'WebPage', name: et(lang, 'me.h1'), description: et(lang, 'me.desc'),
      inLanguage: lang === 'es' ? 'es-US' : 'en-US', url: `${SITE}/${P.method}`,
      isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/` },
    },
  });
}

/**
 * The blind round. The page ships no figures at all: public/js/econ-blind.js
 * fetches econ_blind.json (values under opaque keys) to draw the cards, and
 * fetches econ_terms.json, the labeled file, only when the reader asks for the
 * reveal. verify_site.mjs asserts that order. Every word the script shows is
 * written into data-strings here, from the same gated i18n/economy.json, so the
 * script holds no copy in either language.
 */
function blindPage(lang) {
  const P = ECON_PATHS[lang];
  const other = lang === 'es' ? 'en' : 'es';
  // Raw templates, placeholders intact: the script fills them. et() would
  // demand the values now, so take them straight from the copy.
  const strings = Object.fromEntries(Object.entries(ECON_COPY)
    .filter(([k]) => /^(bl\.|m\.|D$|R$|noData$|termLabel$|termNow$|me\.research$|exploreLink$|methodLink$|ex\.source$)/.test(k))
    .map(([k, e]) => [k, e[lang]]));
  const config = {
    lang: lang === 'es' ? 'es-US' : 'en-US',
    blindUrl: '/data/econ_blind.json',
    termsUrl: '/data/econ_terms.json',
    exploreUrl: `/${P.explore}`,
    methodUrl: `/${P.method}`,
    metrics: METRICS,
  };
  // The round's controls, here rather than in the shared stylesheet so adding
  // them does not rewrite the CSS inside every other page on the site. 44px
  // targets for a thumb; the disabled Next is visibly disabled.
  const style = `<style>
  #econ-blind .choice{font:inherit;padding:10px 16px;border-radius:999px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);margin:4px 6px 4px 0;cursor:pointer;min-height:44px}
  #econ-blind .linkish{font:inherit;font-size:14.5px;background:none;border:0;color:var(--blue);text-decoration:underline;padding:10px 0;cursor:pointer;min-height:44px}
  #econ-blind button.cta{border:0;font:inherit;font-weight:600;cursor:pointer}
  #econ-blind button.cta:disabled{opacity:.4;cursor:default}
  #econ-blind fieldset.rate{border:0;padding:0;margin:16px 0 4px}
  #econ-blind .scale{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
  #econ-blind .pick{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 6px;font-variant-numeric:tabular-nums;cursor:pointer}
  #econ-blind h2{margin-top:6px}
  </style>`;
  const body = `${style}
  <h1>${et(lang, 'bl.h1')}</h1>
  <p class="lede">${et(lang, 'bl.lede')}</p>
  <p class="small">${et(lang, 'bl.limits')} <a href="${SITE}/${P.method}">${et(lang, 'methodLink')}</a></p>
  <noscript><p>${et(lang, 'bl.noscript')} <a href="${SITE}/${P.explore}">${et(lang, 'exploreLink')}</a></p></noscript>
  <div id="econ-blind" data-strings="${esc(JSON.stringify(strings))}" data-config="${esc(JSON.stringify(config))}"></div>
  <p class="small"><a href="${SITE}/${P.explore}">${et(lang, 'exploreLink')}</a> · <a href="${SITE}/${P.method}">${et(lang, 'methodLink')}</a></p>`;

  return document_({
    lang, otherLang: other, title: et(lang, 'bl.h1'), docTitle: et(lang, 'bl.docTitle'),
    siteName: lang === 'es' ? 'La Franja Morada' : 'The Purple Strip',
    desc: et(lang, 'bl.desc'), canonical: `${SITE}/${P.blind}`, altHref: `${SITE}/${ECON_PATHS[other].blind}`,
    altLabel: et(lang, 'langSwitch'), kicker: et(lang, 'kicker'), faces, body,
    ogImage: `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`,
    scripts: ['/js/econ-blind.js'],
    jsonld: {
      '@context': 'https://schema.org', '@type': 'WebPage', name: et(lang, 'bl.h1'), description: et(lang, 'bl.desc'),
      inLanguage: lang === 'es' ? 'es-US' : 'en-US', url: `${SITE}/${P.blind}`,
      isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/` },
    },
  });
}

let n = 0;
for (const lang of ['en', 'es']) {
  for (const [slug, html] of [[ECON_PATHS[lang].blind, blindPage(lang)], [ECON_PATHS[lang].explore, explorePage(lang)], [ECON_PATHS[lang].method, methodPage(lang)]]) {
    const dir = resolve(ROOT, 'public', slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
    n++;
  }
}
console.log(`  ${n} economy pages written: ${['en', 'es'].flatMap((l) => Object.values(ECON_PATHS[l]).map((p) => `/${p}`)).join(', ')}`);
