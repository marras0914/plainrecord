/**
 * PlainRecord — one findable page per statewide race, in both languages
 *
 *   node scripts/build_races.mjs
 *
 * Writes, per race and locale:
 *   public/race/<slug>/index.html        (English)
 *   public/contienda/<slug>/index.html   (Spanish)
 *
 * WHY THIS EXISTS. On 21 September 2026 the site had four indexable URLs and
 * had taken eight search referrals in a fortnight against 4,230 views. The
 * whole 3,546-vote corpus was crawlable and none of it answered a question
 * anybody types. Nobody searches "blind quiz on Texas House votes". They search
 * a candidate's name.
 *
 * WHY A PAGE PER RACE AND NOT PER CANDIDATE. Six candidate pages would mean
 * publishing one titled for Ken Paxton whose entire content is that there is no
 * evidence about him, which is thin, ranks for his name, and — on a site whose
 * author discloses a donation to one party — would be three rich pages for
 * Democrats and three empty ones for Republicans. A race page carries both
 * names in its title and h1, so it is findable for either, and the asymmetry
 * between the two records becomes the thing the page explains rather than an
 * absence a reader has to notice.
 *
 * THE ASYMMETRY IS THE HONEST PART AND IT IS NOT FLATTENED. Three Democrats sit
 * in the Texas House and have roll calls on these bills. Their opponents do not,
 * for three different reasons, and the reasons are already written, sourced and
 * translated in the payload. This prints them rather than paraphrasing them.
 *
 * EVERY FIGURE IS COMPUTED FROM THE SHIPPED PAYLOAD at build time. Nothing is
 * retyped, so these pages cannot drift from the site. The crossing counts use
 * the SAME definition the site's own panel uses — votes against the member's
 * own caucus majority, counted over the votes where the two caucuses took
 * opposite sides — so a reader who checks one against the other finds the same
 * number.
 *
 * THE SPANISH IS APPROVED. The substance — whyNoVotes, evidence, oneSided and
 * every bill summary — is quoted from public/data/quiz_89R.es.json, reviewed on
 * 20 September. The framing in COPY.es below was written on 21 September and
 * approved by Marco the same day.
 *
 * It sits inline here rather than in i18n/copy.json, exactly as
 * build_factsheet.mjs does, which means THE SPANISH GATE DOES NOT COVER IT.
 * npm run i18n:check will pass no matter what this file says, so any later edit
 * to the Spanish here needs a human read; the build will not catch it.
 *
 * NO JAVASCRIPT, NOTHING THIRD-PARTY, NO TRACKING, every URL absolute. Same
 * rules as the fact sheet and for the same reason.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SITE, esc, loadFaces, document_, sheetLine } from './_page_shell.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const payload = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
const sidecar = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.es.json'), 'utf8'));

const faces = loadFaces(ROOT);

// ---------------------------------------------------------------------------
// The figures, computed rather than written down
// ---------------------------------------------------------------------------

/** Did the two caucus majorities line up on opposite sides of this vote? */
const opposed = (it) => (it.dYea > 0.5) !== (it.rYea > 0.5);

/**
 * A candidate's record over the shipped items.
 *
 * `crossed` counts votes against the member's own caucus majority, and ONLY
 * over the items where the caucuses opposed each other. That is the site's own
 * definition (rep.crossedCount says "{n} of the {divisive} votes where the two
 * parties took opposite sides"), and using a different one here would publish a
 * number that contradicts the panel a reader can open in the next tab.
 */
function recordOf(personId) {
  let cast = 0, divisive = 0, crossed = 0;
  const crossings = [];
  for (const it of payload.items) {
    const v = it.votes[personId];
    if (v !== 1 && v !== -1) continue;
    cast++;
    if (!opposed(it)) continue;
    divisive++;
    const caucusYea = it.dYea > 0.5;
    if ((v === 1) !== caucusYea) { crossed++; crossings.push(it); }
  }
  return { cast, divisive, crossed, crossings, total: payload.items.length };
}

/** Everything the payload records an opponent doing to one of these bills. */
function actsOf(name) {
  const rows = [];
  for (const it of payload.items) {
    for (const a of it.acts ?? []) if (a.who === name) rows.push({ it, a });
  }
  const byKind = {};
  for (const r of rows) byKind[r.a.kind] = (byKind[r.a.kind] ?? 0) + 1;
  return { rows, byKind, bills: new Set(rows.map((r) => r.it.billId)).size };
}

// TWO SHAPES, because one does not work in both places.
//
// Under a single bill the act is described on its own: "signed it". In the
// summary line it takes a count, and prefixing the same phrase produced "26
// signed it" in English and, worse, "26 lo firmó" in Spanish, which reads as
// "26 he signed it". The count has to be the object of the verb, not a label
// stuck in front of it, and Spanish needs the number agreement too.
const KIND_EN = {
  signed: 'signed it',
  veto: 'vetoed it',
  became_law_unsigned: 'let it become law without signing',
  priority_bill: 'named it a must-pass priority',
};
const KIND_ES = {
  signed: 'lo firmó',
  veto: 'lo vetó',
  became_law_unsigned: 'dejó que se convirtiera en ley sin firmarlo',
  priority_bill: 'lo declaró de aprobación obligada',
};
const COUNT_EN = {
  signed: (n) => `signed ${n}`,
  veto: (n) => `vetoed ${n}`,
  became_law_unsigned: (n) => `let ${n} become law without signing`,
  priority_bill: (n) => `named ${n} a must-pass priority`,
};
const COUNT_ES = {
  signed: (n) => `firmó ${n}`,
  veto: (n) => `vetó ${n}`,
  became_law_unsigned: (n) => n === 1
    ? 'dejó que 1 se convirtiera en ley sin firmarlo'
    : `dejó que ${n} se convirtieran en ley sin firmarlos`,
  priority_bill: (n) => n === 1
    ? 'declaró 1 de aprobación obligada'
    : `declaró ${n} de aprobación obligada`,
};


/**
 * The plain-language summary for a bill, in the requested language.
 *
 * THE SIDECAR IS KEYED BY BILL ID, not by the ocd-vote id. Looking it up by
 * it.id silently missed every time and fell through to it.caption, which is the
 * official English caption — so the first build of the Spanish pages described
 * every bill in English legal wording, on pages whose whole purpose is being
 * the Spanish answer. It failed quietly because the fallback was a real string.
 *
 * So this throws rather than falling back. A Spanish page that cannot find its
 * Spanish is a broken build, not a page to ship.
 */
function summaryFor(it, lang) {
  if (lang !== 'es') return it.plain ?? it.caption;
  const es = sidecar.items?.[it.billId]?.plain;
  if (!es) throw new Error(`no Spanish summary in the sidecar for ${it.billId}`);
  return es;
}

// ---------------------------------------------------------------------------
// The races
// ---------------------------------------------------------------------------

const RACES = payload.candidates.map((cand) => {
  const opp = payload.opponents.find((o) => o.opposing === cand.name);
  if (!opp) throw new Error(`no opponent recorded for ${cand.name}`);
  const esOpp = sidecar.opponents?.[opp.name];
  if (!esOpp) throw new Error(`opponent not translated in the sidecar: ${opp.name}`);
  return { cand, opp, esOpp, rec: recordOf(cand.id), acts: actsOf(opp.name) };
});

const SLUG = {
  Governor: { en: 'race/governor', es: 'contienda/gobernador' },
  'Lieutenant Governor': { en: 'race/lieutenant-governor', es: 'contienda/vicegobernador' },
  'U.S. Senate': { en: 'race/us-senate', es: 'contienda/senado' },
};

const OFFICE_ES = {
  Governor: 'Gobernador',
  'Lieutenant Governor': 'Vicegobernador',
  'U.S. Senate': 'Senado de Estados Unidos',
};

// "Governor of Texas" works; "U.S. Senate of Texas" does not. A seat in a
// federal chamber is not an office OF the state, so it needs its own phrasing
// rather than a template that reads fine for two of the three races.
const RUNNING_FOR_EN = {
  Governor: 'Governor of Texas',
  'Lieutenant Governor': 'Lieutenant Governor of Texas',
  'U.S. Senate': "one of Texas's seats in the United States Senate",
};
const RUNNING_FOR_ES = {
  Governor: 'Gobernador de Texas',
  'Lieutenant Governor': 'Vicegobernador de Texas',
  'U.S. Senate': 'una de las bancas de Texas en el Senado de Estados Unidos',
};

/** The payload's evidence fragments are lowercase, and they land mid-sentence
 *  in the payload and at the start of one here. */
const upper = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// ---------------------------------------------------------------------------
// Copy. The substance is quoted from the payload; only this framing is new.
// ---------------------------------------------------------------------------

const COPY = {
  en: {
    lang: 'en', other: 'es', target: `${SITE}/`, siteName: 'The Purple Strip',
    title: (r) => `${r.cand.name} and ${r.opp.name} on the 2025 Texas bills`,
    meta: (r) => `What the public record shows about both candidates for Texas ${r.cand.office}: `
      + `${r.rec.cast} recorded Texas House votes for ${r.cand.name}, and ${r.opp.evidence} for ${r.opp.name}. `
      + `Free, no sign-up, nothing tracked.`,
    kicker: 'Texas House · 2025 session',
    lede: (r) => `They are running for ${RUNNING_FOR_EN[r.cand.office]}. Only one of them has cast a vote on the bills this site asks about, and that is a fact about the offices they have held rather than a judgement about either of them. This page says exactly what the record shows for each, and where the two kinds of record stop being comparable.`,
    h2dem: (r) => `What ${r.cand.name}'s record shows`,
    // No pronouns for the candidates anywhere on these pages. The three are not
    // the same gender, the payload does not record pronouns, and a name is not
    // evidence of them. Surname plus "they" reads naturally and cannot be wrong.
    demBody: (r) => `${r.cand.name} sits in the Texas House, so there is a roll call on these bills. Of the ${r.rec.total} votes this site asks about, ${r.cand.name} cast ${r.rec.cast}. On the ${r.rec.divisive} of those where the two parties took opposite sides, they voted against their own party's majority ${r.rec.crossed} ${r.rec.crossed === 1 ? 'time' : 'times'}.`,
    crossHead: 'Where they broke with their own party',
    h2opp: (r) => `What ${r.opp.name}'s record shows`,
    noVotesLabel: 'Why there are no votes.',
    evidenceLabel: 'What there is instead.',
    limitLabel: 'What that evidence cannot tell you.',
    actsHead: (r) => `On these ${r.rec.total} bills, ${r.opp.name} left a recorded mark on ${r.acts.bills} of them`,
    nothingHead: (r) => `Nothing in ${r.opp.name}'s record attaches to these bills`,
    h2why: 'Why these are not the same kind of evidence',
    whyBody: 'A vote is a choice between yes and no on one question, made at the same moment as 149 other people, and it can go either way. A signature is the last word on a bill that already passed, and a priority list names only bills somebody wanted. Printing them side by side as though they were one measurement would flatter whichever candidate you already preferred, so this page keeps them apart and says what each one is.',
    h2try: 'See where you land, before you see the party',
    tryBody: 'The site asks you about real votes with the party labels hidden, then shows you where you landed and how these members actually voted.',
    tryCta: 'Take it in English',
    discloseLabel: 'Who made this.',
    disclose: 'Marco Arras, a Texas resident. I donate to the Democratic Party, and I say so before anything else rather than in a footnote. The rule that picks which votes appear is published and runs identically on both caucuses, the party label is hidden until you answer, and every vote, count and score is in a file you can download and check, so none of this asks you to trust me.',
    sourceLabel: 'Sources.',
    source: (r) => 'Roll calls from the Texas House Journal and LegiScan.'
      + (r.acts.rows.length ? ' Governor and Lieutenant Governor actions from the bill history at capitol.texas.gov, linked on each bill above.' : ''),
    langSwitch: 'En español',
  },
  es: {
    lang: 'es', other: 'en', target: `${SITE}/es`, siteName: 'La Franja Morada',
    title: (r) => `${r.cand.name} y ${r.opp.name} ante los proyectos de ley de Texas de 2025`,
    meta: (r) => `Lo que muestra el registro público sobre ambos candidatos a ${OFFICE_ES[r.cand.office]} de Texas: `
      + `${r.rec.cast} votos registrados en la Cámara de Texas para ${r.cand.name}, y ${r.esOpp.evidence} para ${r.opp.name}. `
      + `Gratis, sin registro y sin rastreo.`,
    kicker: 'Cámara de Texas · Sesión de 2025',
    lede: (r) => `Compiten por ${RUNNING_FOR_ES[r.cand.office]}. Solo una de las dos personas ha emitido votos sobre los proyectos de ley que este sitio consulta, y eso es un hecho sobre los cargos que han ocupado, no un juicio sobre ninguna de ellas. Esta página dice exactamente qué muestra el registro de cada una, y dónde los dos tipos de registro dejan de ser comparables.`,
    h2dem: (r) => `Qué muestra el historial de ${r.cand.name}`,
    demBody: (r) => `${r.cand.name} ocupa una curul en la Cámara de Texas, así que existe una votación nominal suya sobre estos proyectos. De los ${r.rec.total} votos que consulta este sitio, emitió ${r.rec.cast}. En los ${r.rec.divisive} en los que los dos partidos tomaron lados opuestos, votó en contra de la mayoría de su propio partido ${r.rec.crossed} ${r.rec.crossed === 1 ? 'vez' : 'veces'}.`,
    crossHead: 'Dónde se apartó de su propio partido',
    h2opp: (r) => `Qué muestra el historial de ${r.opp.name}`,
    noVotesLabel: 'Por qué no hay votos.',
    evidenceLabel: 'Qué hay en su lugar.',
    limitLabel: 'Qué no puede decirle esa evidencia.',
    actsHead: (r) => `De estos ${r.rec.total} proyectos, ${r.opp.name} dejó constancia en ${r.acts.bills} de ellos`,
    nothingHead: (r) => `Nada del historial de ${r.opp.name} se puede unir a estos proyectos`,
    h2why: 'Por qué no son el mismo tipo de evidencia',
    whyBody: 'Un voto es una elección entre sí y no sobre una sola pregunta, hecha en el mismo momento que otras 149 personas, y puede salir para cualquier lado. Una firma es la última palabra sobre un proyecto que ya se aprobó, y una lista de prioridades solo nombra proyectos que alguien quería. Ponerlos lado a lado como si fueran una sola medición favorecería a quien usted ya prefería, así que esta página los mantiene separados y dice qué es cada uno.',
    h2try: 'Vea dónde queda usted, antes de ver el partido',
    tryBody: 'El sitio le pregunta sobre votos reales con las etiquetas de partido ocultas, y después le muestra dónde quedó y cómo votaron de verdad estos legisladores.',
    tryCta: 'Hágalo en español',
    discloseLabel: 'Quién lo hizo.',
    disclose: 'Marco Arras, residente de Texas. Yo dono al Partido Demócrata, y lo digo antes que cualquier otra cosa, no en una nota al pie. La regla que escoge cuáles votos aparecen está publicada y se aplica igual a las dos bancadas, la etiqueta de partido queda oculta hasta que usted responde, y cada voto, conteo y calificación está en un archivo que puede descargar y verificar, así que nada de esto le pide que confíe en mí.',
    sourceLabel: 'Fuentes.',
    source: (r) => 'Votaciones nominales del Diario de la Cámara de Texas y de LegiScan.'
      + (r.acts.rows.length ? ' Las acciones del Gobernador y del Vicegobernador vienen del historial de cada proyecto en capitol.texas.gov, enlazado en cada proyecto de arriba.' : ''),
    langSwitch: 'In English',
  },
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------


function billList(rows, kinds, lang) {
  const seen = new Map();
  for (const { it, a } of rows) {
    if (!seen.has(it.billId)) seen.set(it.billId, { it, acts: [] });
    seen.get(it.billId).acts.push(a);
  }
  const li = [...seen.values()].map(({ it, acts }) => {
    const summary = summaryFor(it, lang);
    const what = acts.map((a) => kinds[a.kind] ?? a.kind).join(', ');
    const url = acts[0]?.sourceUrl;
    const link = url
      ? ` <a href="${esc(url)}" rel="nofollow noopener" target="_blank">${lang === 'es' ? 'historial' : 'history'}</a>`
      : '';
    return `<li><span class="bill">${esc(it.billId)}</span> — ${esc(summary)}<br>`
      + `<span class="small">${esc(what)}.${link ? ' ' + link : ''}</span></li>`;
  });
  return `<ul>${li.join('')}</ul>`;
}

function render(race, lang) {
  const c = COPY[lang];
  const slug = SLUG[race.cand.office][lang];
  const otherSlug = SLUG[race.cand.office][c.other];
  const canonical = `${SITE}/${slug}`;
  const kinds = lang === 'es' ? KIND_ES : KIND_EN;
  const opp = lang === 'es' ? race.esOpp : race.opp;

  const counts = lang === 'es' ? COUNT_ES : COUNT_EN;
  const kindLine = upper(Object.entries(race.acts.byKind)
    .map(([k, n]) => (counts[k] ? counts[k](n) : `${n} ${k}`)).join(', '));

  const crossSection = race.rec.crossings.length
    ? `<h2>${esc(c.crossHead)}</h2>`
      + `<ul>${race.rec.crossings.map((it) => {
        const summary = summaryFor(it, lang);
        return `<li><span class="bill">${esc(it.billId)}</span> — ${esc(summary)}</li>`;
      }).join('')}</ul>`
    : '';

  // With no acts there is nothing to head, and the card above has already said
  // three times that the record does not reach these bills. A heading repeating
  // it a fourth time reads as insistence rather than as information.
  const oppSection = race.acts.rows.length
    ? `<h2>${esc(c.actsHead(race))}</h2>`
      + `<p class="small">${esc(kindLine)}.</p>`
      + billList(race.acts.rows, kinds, lang)
    : '';

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: c.title(race),
    description: c.meta(race),
    inLanguage: lang === 'es' ? 'es-US' : 'en-US',
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: c.siteName, url: SITE },
    about: [race.cand.name, race.opp.name].map((n) => ({ '@type': 'Person', name: n })),
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  };

  return document_({
    lang, otherLang: c.other, title: c.title(race), siteName: c.siteName,
    desc: c.meta(race), canonical, altHref: `${SITE}/${otherSlug}`,
    altLabel: c.langSwitch, kicker: c.kicker,
    ogImage: `${SITE}/${lang === 'es' ? 'og.es.png' : 'og.png'}`,
    jsonld, faces,
    body: `
  <h1>${esc(c.title(race))}</h1>
  <p class="lede">${esc(c.lede(race))}</p>

  <h2>${esc(c.h2dem(race))}</h2>
  <p>${esc(c.demBody(race))}</p>
  ${crossSection}

  <h2>${esc(c.h2opp(race))}</h2>
  <div class="card">
    <p><span class="label">${esc(c.noVotesLabel)}</span> ${esc(opp.whyNoVotes)}</p>
    <p><span class="label">${esc(c.evidenceLabel)}</span> ${esc(upper(opp.evidence))}.</p>
    <p><span class="label">${esc(c.limitLabel)}</span> ${esc(opp.oneSided)}</p>
  </div>
  ${oppSection}

  <h2>${esc(c.h2why)}</h2>
  <p>${esc(c.whyBody)}</p>

  <hr>

  <h2>${esc(c.h2try)}</h2>
  <p>${esc(c.tryBody)}</p>
  <p><a class="cta" href="${c.target}">${esc(c.tryCta)}</a></p>
  <p class="small">${sheetLine(lang)}</p>

  <hr>

  <p class="small"><span class="label">${esc(c.discloseLabel)}</span> ${esc(c.disclose)}</p>
  <p class="small"><span class="label">${esc(c.sourceLabel)}</span> ${esc(c.source(race))}</p>`,
  });
}

// ---------------------------------------------------------------------------

let written = 0;
const urls = [];
for (const race of RACES) {
  for (const lang of ['en', 'es']) {
    const slug = SLUG[race.cand.office][lang];
    const dir = resolve(ROOT, 'public', slug);
    mkdirSync(dir, { recursive: true });
    const html = render(race, lang);
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
    const words = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
    console.log(`  wrote public/${slug}/index.html  — ${words} words, `
      + `${race.rec.cast} votes, ${race.acts.bills} opponent bill(s)`);
    urls.push(`${SITE}/${slug}`);
    written++;
  }
}
console.log(`\n  ${written} race pages written\n`);
