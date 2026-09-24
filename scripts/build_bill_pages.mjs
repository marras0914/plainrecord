/**
 * PlainRecord — one page per headline bill, listing how every member voted
 *
 *   node scripts/build_bill_pages.mjs
 *
 * Writes public/bill/<slug>/index.html and public/proyecto/<slug>/index.html
 * for the seven bills the payload flags as headline.
 *
 * WHY THIS EXISTS. People search a bill, not a person: "who voted for the Ten
 * Commandments bill", "Texas House vote on vouchers". The site held every
 * member's position on these seven, but spread across 149 district pages, so no
 * URL answered the question. This one does, and each district page links here
 * from the bill's name.
 *
 * THE ROLL CALL COMES FROM THE BULK CORPUS, not the district roster. The roster
 * holds sitting members only, so it silently drops anyone who has left the
 * House, and its totals fall short of the Journal's. votes_89R.json names every
 * member who voted, and it matches the Journal's totals on six of the seven.
 * Where it does not (SB 2, 85 named yeas against the Journal's 86), the page
 * says so rather than quietly printing one number or the other.
 *
 * "AGAINST MOST OF THEIR OWN PARTY" IS NOT THE DISTRICT PAGES' CROSSING COUNT.
 * That count only includes votes where the two caucuses took opposite sides.
 * Here a member is listed whenever they voted against their own caucus's
 * majority, on any of the seven, so the heading uses different words and the
 * two never have to agree.
 *
 * THE SPANISH IS INLINE, like build_district_pages.mjs, so THE SPANISH GATE DOES
 * NOT COVER IT. Bill labels and summaries are quoted from the approved sidecar;
 * the framing below was approved by Marco on 24 September 2026. A later edit to
 * it needs a human read, and no build will catch one.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, esc, loadFaces, document_, sheetLine } from './_page_shell.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const faces = loadFaces(ROOT);
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const payload = read('public/data/quiz_89R.json');
const sidecar = read('public/data/quiz_89R.es.json');
const roster = read('public/data/members_89R.json');
const bulk = read('public/data/votes_89R.json');

const HEADLINE = payload.items.filter((i) => i.headline);
if (HEADLINE.length !== 7) throw new Error(`expected 7 headline bills, found ${HEADLINE.length}`);

const sitting = new Set(roster.members.map((m) => m.id));
const retired = new Map((roster.retired ?? []).map((r) => [r.id, r]));
const bulkOf = new Map(bulk.items.map((i) => [i.id, i]));

export const billSlug = (billId) => billId.toLowerCase().replace(/\s+/g, '-');
export const billPath = (billId, lang) => `${lang === 'es' ? 'proyecto' : 'bill'}/${billSlug(billId)}`;
const districtPath = (d, lang) => (lang === 'es' ? `distrito/${d}` : `district/${d}`);

/** Same rule as build_district_pages.mjs: the curated source URL wins. */
const CURATED = new Map();
for (const it of payload.items) {
  for (const a of it.acts ?? []) {
    if (/capitol\.texas\.gov|lrl\.texas\.gov/.test(a.sourceUrl) && !CURATED.has(it.billId)) {
      CURATED.set(it.billId, a.sourceUrl);
    }
  }
}
const billUrl = (billId) => CURATED.get(billId)
  ?? `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=${billId.replace(/\s+/g, '')}`;

function es(it, field) {
  const v = sidecar.items?.[it.billId]?.[field];
  if (!v) throw new Error(`no Spanish ${field} in the sidecar for ${it.billId}`);
  return v;
}
const labelFor = (it, lang) => (lang === 'es' ? es(it, 'label') : it.label);
const summaryFor = (it, lang) => (lang === 'es' ? es(it, 'plain') : it.plain ?? it.caption);

// One act, described on its own. Same verbs as build_races.mjs, which Marco
// approved there; the office comes first because a reader may not know the name.
const ACT = {
  en: {
    signed: 'signed it', veto: 'vetoed it',
    became_law_unsigned: 'let it become law without signing',
    priority_bill: 'named it a must-pass priority',
    office: { Governor: 'Governor', 'Lieutenant Governor': 'Lieutenant Governor' },
  },
  es: {
    signed: 'lo firmó', veto: 'lo vetó',
    became_law_unsigned: 'dejó que se convirtiera en ley sin firmarlo',
    priority_bill: 'lo declaró de aprobación obligada',
    office: { Governor: 'El gobernador', 'Lieutenant Governor': 'El vicegobernador' },
  },
};
function actsLine(it, lang) {
  const t = ACT[lang];
  // Priority before signature, which is the order they happened in.
  const rank = { priority_bill: 0, signed: 1, veto: 1, became_law_unsigned: 1 };
  return (it.acts ?? [])
    .filter((a) => t[a.kind] && t.office[a.office])
    .sort((a, b) => rank[a.kind] - rank[b.kind])
    .map((a) => `${t.office[a.office]} ${a.who} ${t[a.kind]}.`)
    .join(' ');
}

const COPY = {
  en: {
    other: 'es', siteName: 'The Purple Strip', target: `${SITE}/`,
    kicker: 'Texas House · 2025 session',
    docTitle: (it) => `${it.billId}, ${it.label}: Texas House vote`,
    h1: (it) => `How every Texas House member voted on ${it.billId}`,
    desc: (it) => `How all 150 Texas House members voted on ${it.billId} (${it.label}) in 2025: `
      + `${it.yeas} for, ${it.nays} against, and who went against most of their own party.`,
    tally: (it) => `The House voted ${it.yeas} to ${it.nays}. This is record vote ${it.rec} in the House Journal.`,
    gap: (it, t) => `The list below names ${t.yeas} of the ${it.yeas} votes for and ${t.nays} of the ${it.nays} against. The Journal’s total includes ${gapCount(it, t, 'en')} that this site cannot match to a named member.`,
    gapUnit: (n) => (n === 1 ? '1 vote' : `${n} votes`),
    readBill: (it) => `Read ${it.billId} in full at the Texas Legislature`,
    h2party: 'How each party voted',
    partyLine: (p, c) => `${p === 'R' ? 'Republicans' : 'Democrats'}: ${c.y} for, ${c.n} against, ${c.none} with no recorded vote.`,
    h2split: 'Who voted against most of their own party',
    splitNone: 'Every member who voted went with the majority of their own party.',
    splitNote: 'Against the majority of their own party on this vote. This is not the same count as the district pages, which only include votes where the two parties took opposite sides.',
    h2all: 'Every member',
    yea: 'Voted for', nay: 'Voted against', noVote: 'No recorded vote',
    elsewhere: (v) => `${v}, on another vote on this bill`,
    leftHouse: 'left the House on 29 July 2026',
    h2others: 'The other six bills that drew the most attention',
    h2try: 'See how your own answers compare',
    tryBody: 'The site asks you about these same votes with the party labels hidden, then shows you where you landed next to the members who actually voted.',
    tryCta: 'Open it in English',
    indexBack: 'All 150 districts',
    discloseLabel: 'Who made this.',
    disclose: 'Marco Arras, a Texas resident. I donate to the Democratic Party, and I say so before anything else rather than in a footnote. The rule that picks which votes appear is published and runs identically on both caucuses, and every vote and count is in a file you can download and check.',
    sourceLabel: 'Sources.',
    source: 'Roll calls from the Texas House Journal and LegiScan. Governor and Lieutenant Governor actions from the bill history and the Lieutenant Governor’s published priority list.',
    langSwitch: 'En español',
  },
  es: {
    other: 'en', siteName: 'La Franja Morada', target: `${SITE}/es`,
    kicker: 'Cámara de Texas · Sesión de 2025',
    docTitle: (it) => `${it.billId}, ${es(it, 'label')}: votación en la Cámara de Texas`,
    h1: (it) => `Cómo votó cada integrante de la Cámara de Texas sobre el proyecto ${it.billId}`,
    desc: (it) => `Cómo votaron los 150 integrantes de la Cámara de Texas sobre el proyecto ${it.billId} (${es(it, 'label')}) en 2025: `
      + `${it.yeas} a favor, ${it.nays} en contra, y quién votó en contra de la mayoría de su propio partido.`,
    tally: (it) => `La Cámara votó ${it.yeas} a ${it.nays}. Es la votación nominal ${it.rec} del Diario de la Cámara.`,
    // "este sitio" is the subject, so the verb does not agree with the count and
    // the sentence reads the same for 1 vote or 5.
    gap: (it, t) => `La lista que sigue nombra ${t.yeas} de los ${it.yeas} votos a favor y ${t.nays} de los ${it.nays} en contra. El total del Diario incluye ${gapCount(it, t, 'es')} que este sitio no puede atribuir a una persona con nombre.`,
    gapUnit: (n) => (n === 1 ? '1 voto' : `${n} votos`),
    readBill: (it) => `Lea el texto completo de ${it.billId} en la Legislatura de Texas (en inglés)`,
    h2party: 'Cómo votó cada bancada',
    partyLine: (p, c) => `La bancada ${p === 'R' ? 'republicana' : 'demócrata'}: ${c.y} a favor, ${c.n} en contra, ${c.none} sin voto registrado.`,
    h2split: 'Quién votó en contra de la mayoría de su propio partido',
    splitNone: 'Cada integrante que votó lo hizo con la mayoría de su propio partido.',
    splitNote: 'En contra de la mayoría de su propio partido en esta votación. No es el mismo conteo de las páginas de distrito, que solo incluyen los votos en los que los dos partidos tomaron lados opuestos.',
    h2all: 'Cada integrante',
    yea: 'Votó a favor', nay: 'Votó en contra', noVote: 'Sin voto registrado',
    elsewhere: (v) => `${v}, en otra votación sobre este mismo proyecto`,
    leftHouse: 'se fue de la Cámara el 29 de julio de 2026',
    h2others: 'Los otros seis proyectos que más atención recibieron',
    h2try: 'Vea cómo se comparan sus propias respuestas',
    tryBody: 'El sitio le pregunta sobre estos mismos votos con las etiquetas de partido ocultas, y después le muestra dónde quedó usted junto a quienes votaron de verdad.',
    tryCta: 'Ábralo en español',
    indexBack: 'Los 150 distritos',
    discloseLabel: 'Quién lo hizo.',
    disclose: 'Marco Arras, residente de Texas. Yo dono al Partido Demócrata, y lo digo antes que cualquier otra cosa, no en una nota al pie. La regla que escoge cuáles votos aparecen está publicada y se aplica igual a las dos bancadas, y cada voto y cada conteo están en un archivo que usted puede descargar y verificar.',
    sourceLabel: 'Fuentes.',
    source: 'Votaciones nominales del Diario de la Cámara de Texas y de LegiScan. Las acciones del gobernador y del vicegobernador provienen del historial del proyecto y de la lista de prioridades que publicó el vicegobernador.',
    langSwitch: 'In English',
  },
};

const gapTotal = (it, t) => (it.yeas - t.yeas) + (it.nays - t.nays);
function gapCount(it, t, lang) {
  // Only SB 2 has a gap today, and it is on one side. Written for both so a
  // rebuilt payload cannot print a sentence that is quietly wrong.
  return COPY[lang].gapUnit(gapTotal(it, t));
}

/** Every member's position on one item, from the bulk corpus. */
function rollOf(it) {
  const b = bulkOf.get(it.id);
  if (!b) throw new Error(`${it.billId}: roll call ${it.id} is not in votes_89R.json`);
  const rows = bulk.memberOrder.map((id, i) => {
    const m = bulk.members[id];
    const mark = b.v[i];
    // The corpus carries no name or district for a member who has left, so they
    // come from the roster's retired list. Without this he rendered as "null".
    const gone = retired.get(id);
    const n = m.n ?? gone?.name;
    const d = m.d ?? gone?.district;
    if (!n || !d) throw new Error(`${it.billId}: no name or district for ${id}`);
    return {
      id, n, d, p: m.p, mark,
      sitting: sitting.has(id), retired: retired.get(id) ?? null,
      elsewhere: mark === '.' ? (it.elsewhere?.[id] ?? 0) : 0,
    };
  });
  for (const r of rows) {
    if (!r.sitting && !r.retired) throw new Error(`${it.billId}: ${r.n} is neither sitting nor retired`);
  }
  const t = { yeas: rows.filter((r) => r.mark === 'y').length, nays: rows.filter((r) => r.mark === 'n').length };
  if (t.yeas !== b.vYeas || t.nays !== b.vNays) throw new Error(`${it.billId}: recount disagrees with the corpus`);
  const party = {};
  for (const p of ['R', 'D']) {
    const mine = rows.filter((r) => r.p === p);
    party[p] = {
      y: mine.filter((r) => r.mark === 'y').length,
      n: mine.filter((r) => r.mark === 'n').length,
      none: mine.filter((r) => r.mark === '.').length,
    };
  }
  // Against their own caucus majority. A tie has no majority, so nobody in that
  // caucus is listed as breaking from it.
  const split = rows.filter((r) => {
    if (r.mark === '.') return false;
    const c = party[r.p];
    if (c.y === c.n) return false;
    return (r.mark === 'y') !== (c.y > c.n);
  });
  return { rows, t, party, split };
}

function memberItem(r, lang, c, extra = '') {
  const tag = `${r.p}, ${lang === 'es' ? 'Distrito' : 'District'} ${r.d}`;
  const name = r.sitting
    ? `<a href="${SITE}/${districtPath(r.d, lang)}">${esc(r.n)}</a>`
    : `${esc(r.n)}`;
  const note = r.retired ? `, ${esc(c.leftHouse)}` : '';
  return `<li>${name} <span class="small">${esc(tag)}${note}${extra}</span></li>`;
}

const byDistrict = (a, b) => a.d - b.d;

function render(it, lang) {
  const c = COPY[lang];
  const { rows, t, party, split } = rollOf(it);
  const canonical = `${SITE}/${billPath(it.billId, lang)}`;
  const altHref = `${SITE}/${billPath(it.billId, c.other)}`;

  const gapLine = (t.yeas !== it.yeas || t.nays !== it.nays)
    ? `<p class="small">${esc(c.gap(it, t))}</p>` : '';

  const splitBlock = split.length
    ? `<ul class="dindex">${split.sort(byDistrict).map((r) =>
      memberItem(r, lang, c, ` · ${esc(r.mark === 'y' ? c.yea : c.nay)}`)).join('')}</ul>`
      + `<p class="small">${esc(c.splitNote)}</p>`
    : `<p>${esc(c.splitNone)}</p>`;

  const group = (label, list, extra) => list.length
    ? `<h3>${esc(label)} (${list.length})</h3><ul class="dindex">${list.sort(byDistrict).map((r) => memberItem(r, lang, c, extra?.(r) ?? '')).join('')}</ul>`
    : '';
  const noVoteExtra = (r) => (r.elsewhere === 1 || r.elsewhere === -1)
    ? ` · ${esc(c.elsewhere(r.elsewhere === 1 ? c.yea : c.nay))}` : '';

  const others = HEADLINE.filter((o) => o.id !== it.id).map((o) =>
    `<li><a href="${SITE}/${billPath(o.billId, lang)}"><span class="bill">${esc(o.billId)}</span> ${esc(labelFor(o, lang))}</a></li>`).join('');

  const acts = actsLine(it, lang);

  const body = `
  <h1>${esc(c.h1(it))}</h1>
  <p class="lede"><b>${esc(labelFor(it, lang))}.</b> ${esc(summaryFor(it, lang))}</p>
  <p>${esc(c.tally(it))}${acts ? ' ' + esc(acts) : ''}</p>
  ${gapLine}
  <p class="small"><a href="${esc(billUrl(it.billId))}" rel="nofollow noopener" target="_blank">${esc(c.readBill(it))}</a></p>
  <h2>${esc(c.h2party)}</h2>
  <ul>${['R', 'D'].map((p) => `<li>${esc(c.partyLine(p, party[p]))}</li>`).join('')}</ul>
  <h2>${esc(c.h2split)}</h2>
  ${splitBlock}
  <h2>${esc(c.h2all)}</h2>
  ${group(c.yea, rows.filter((r) => r.mark === 'y'))}
  ${group(c.nay, rows.filter((r) => r.mark === 'n'))}
  ${group(c.noVote, rows.filter((r) => r.mark === '.'), noVoteExtra)}
  <h2>${esc(c.h2others)}</h2>
  <ul>${others}</ul>
  <hr>
  <h2>${esc(c.h2try)}</h2>
  <p>${esc(c.tryBody)}</p>
  <p><a class="cta" href="${c.target}">${esc(c.tryCta)}</a></p>
  <p class="small">${sheetLine(lang)}</p>
  <p class="small"><a href="${SITE}/${lang === 'es' ? 'distritos' : 'districts'}">${esc(c.indexBack)}</a></p>
  <hr>
  <p class="small"><span class="label">${esc(c.discloseLabel)}</span> ${esc(c.disclose)}</p>
  <p class="small"><span class="label">${esc(c.sourceLabel)}</span> ${esc(c.source)}</p>
  ${lang === 'en' ? `<p class="small"><a href="${SITE}/open-data">Download every House vote as data</a> (JSON, CC0).</p>` : ''}`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: c.docTitle(it),
    description: c.desc(it),
    inLanguage: lang === 'es' ? 'es-US' : 'en-US',
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: c.siteName, url: SITE },
    about: {
      '@type': 'Legislation',
      name: labelFor(it, lang),
      legislationIdentifier: it.billId,
      legislationJurisdiction: 'Texas',
      url: billUrl(it.billId),
    },
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  };

  return {
    html: document_({
      lang, otherLang: c.other, title: c.h1(it), docTitle: c.docTitle(it), siteName: c.siteName,
      desc: c.desc(it), canonical, altHref, altLabel: c.langSwitch,
      ogImage: `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`,
      jsonld, faces, kicker: c.kicker, body,
    }),
    t, party, split,
  };
}

// Only when run directly: build_district_pages.mjs imports billPath from here.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let n = 0;
  for (const it of HEADLINE) {
    for (const lang of ['en', 'es']) {
      const { html, t, party, split } = render(it, lang);
      const dir = resolve(ROOT, 'public', billPath(it.billId, lang));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), html, 'utf8');
      n++;
      if (lang === 'en') {
        console.log(`  ${it.billId.padEnd(6)} named ${t.yeas}-${t.nays} (Journal ${it.yeas}-${it.nays})  `
          + `R ${party.R.y}/${party.R.n}/${party.R.none}  D ${party.D.y}/${party.D.n}/${party.D.none}  split ${split.length}`);
      }
    }
  }
  console.log(`\n  ${n} bill pages written (${HEADLINE.length} bills x 2 languages)\n`);
}
