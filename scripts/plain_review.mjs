/**
 * The reviewer's sheet for the plain-language questions.
 *
 *   npm run plain:review          -> i18n/plain_review.html
 *   npm run plain:check           -> checks only, non-zero on a problem
 *
 * Every summary on this page replaces a bill's official caption as the question
 * a reader is actually asked. That makes it the most load-bearing prose on the
 * site: get one wrong and the page asks about something the Legislature did not
 * vote on, in the reader's own language, with a recorded vote attached to it.
 *
 * So the sheet shows, side by side and in this order:
 *
 *   the summary, in both languages   — what a reader will see
 *   the official caption             — what it replaces
 *   the operative analysis           — what it must be faithful to
 *   the sponsor's own framing        — what it must NOT have been written from
 *
 * The last row is there so a reviewer can catch the failure that matters most:
 * a summary that reads like the bill's supporters describing it.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'i18n/plain_89R.json';
const OUT = 'i18n/plain_review.html';
const checkOnly = process.argv.includes('--check');

const d = JSON.parse(readFileSync(SRC, 'utf8'));
const entries = Object.entries(d.items);

let failures = 0;
const say = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

console.log('');

// --- checks ----------------------------------------------------------------

const missing = entries.filter(([, v]) => !v.en?.trim() || !v.es?.trim());
say(missing.length === 0, 'every item has a summary in both languages',
  missing.length ? missing.map(([k]) => k).join(', ') : `${entries.length} items`);

// A summary that is just the caption reworded has done no work.
const tooClose = entries.filter(([, v]) => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, '').trim();
  return norm(v.en).startsWith('relating to');
});
say(tooClose.length === 0, 'no summary just repeats the caption\'s "Relating to" form',
  tooClose.map(([k]) => k).join(', '));

// Length: long enough to say something, short enough to be the question.
const tooLong = entries.filter(([, v]) => (v.en.match(/\S+/g) ?? []).length > 34);
const tooShort = entries.filter(([, v]) => (v.en.match(/\S+/g) ?? []).length < 8);
say(tooLong.length === 0, 'no summary is longer than 34 words',
  tooLong.map(([k, v]) => `${k} (${(v.en.match(/\S+/g) ?? []).length})`).join(', '));
say(tooShort.length === 0, 'no summary is shorter than 8 words',
  tooShort.map(([k]) => k).join(', '));

// Missing diacritics, the way i18n_review.mjs does it: look for forms that
// are not Spanish words at all without their accent.
//
// The first version of this check simply required each Spanish string to
// contain SOME accented character, and flagged 15 of 67 — every one of them
// correct Spanish that happens to contain no word needing an accent. One of
// the fifteen was already approved and live. A check that fires on correct
// input is worse than no check: it trains the reviewer to wave it through.
const HARD = {
  informacion: 'información', administracion: 'administración', poblacion: 'población',
  educacion: 'educación', region: 'región', energia: 'energía',
  publico: 'público', publica: 'pública', electronico: 'electrónico',
  credito: 'crédito', ademas: 'además', asi: 'así', numero: 'número',
  codigo: 'código', practica: 'práctica', medico: 'médico', medicas: 'médicas',
  camara: 'cámara', dias: 'días', anos: 'años', nino: 'niño', ninos: 'niños',
  senal: 'señal', campana: 'campaña', tambien: 'también', despues: 'después',
  linea: 'línea', jurisdiccion: 'jurisdicción', prision: 'prisión',
  condicion: 'condición', proteccion: 'protección', eleccion: 'elección',
  division: 'división', demografico: 'demográfico', subvencion: 'subvención',
  peticion: 'petición', sancion: 'sanción', construccion: 'construcción',
  inspeccion: 'inspección', mitigacion: 'mitigación', deteccion: 'detección',
  ejercito: 'ejército', economico: 'económico', anadir: 'añadir',
  companias: 'compañías', ensenanza: 'enseñanza', pequeno: 'pequeño',
};
// A map entry that maps a word to itself would fire on correct Spanish, which
// is how three of them got in. Assert the list cannot do that again.
for (const [wrong, right] of Object.entries(HARD)) {
  if (wrong === right) throw new Error(`HARD["${wrong}"] maps to itself — it is a correct Spanish word`);
  if (!/[áéíóúñü]/.test(right)) throw new Error(`HARD["${wrong}"] -> "${right}" has no diacritic`);
}
const missingAccent = [];
for (const [k, v] of entries) {
  for (const w of v.es.toLowerCase().match(/[a-záéíóúñü]+/g) ?? []) {
    if (HARD[w]) missingAccent.push(`${k}: "${w}" -> "${HARD[w]}"`);
  }
}
say(missingAccent.length === 0, 'no Spanish word is missing a diacritic it needs',
  missingAccent.length ? missingAccent.join('; ') : `${entries.length} strings scanned`);

// Anything shipping must be traceable to the document it was written from.
const approvedNoSource = entries.filter(([, v]) => v.status === 'ok' && !v.source && !v.flag);
say(approvedNoSource.length === 0, 'nothing is approved without a source to check it against',
  approvedNoSource.map(([k]) => k).join(', '));

// The seven that were already live must not have been quietly rewritten.
const payload = JSON.parse(readFileSync('public/data/quiz_89R.json', 'utf8'));
const shipped = new Map(payload.items.filter((i) => i.plain).map((i) => [i.billId, i.plain]));
const drifted = [...shipped].filter(([k, v]) => d.items[k] && d.items[k].en !== v);
say(drifted.length === 0, 'the summaries already live are unchanged',
  drifted.length ? drifted.map(([k]) => k).join(', ') : `${shipped.size} checked`);

const approved = entries.filter(([, v]) => v.status === 'ok').length;
const flagged = entries.filter(([, v]) => v.flag);
console.log(`\n  approved: ${approved}/${entries.length}   awaiting review: ${entries.length - approved}`);
if (flagged.length) {
  console.log(`  flagged for a closer look before approval:`);
  for (const [k, v] of flagged) console.log(`    ${k.padEnd(9)} ${v.flag}`);
}

if (checkOnly) {
  console.log(failures === 0
    ? '\n  plain-language source is consistent\n'
    : `\n  ${failures} problem(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

// --- the sheet -------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const rows = entries.map(([billId, v]) => `
  <article class="${v.status === 'ok' ? 'ok' : 'draft'}${v.flag ? ' flagged' : ''}">
    <h2>${esc(billId)} <span class="cat">${esc(v.category)}</span>
      <span class="status">${esc(v.status)}${v.flag ? ' · ' + esc(v.flag) : ''}</span></h2>
    <div class="pair">
      <div><label>English — what the reader is asked</label><p class="sum">${esc(v.en)}</p></div>
      <div><label>Español</label><p class="sum">${esc(v.es)}</p></div>
    </div>
    ${v.note ? `<p class="note">${esc(v.note)}</p>` : ''}
    <details><summary>What it replaces, and what it was written from</summary>
      <label>Official caption</label><p class="cap">${esc(v.caption)}</p>
      <label>Operative section of the analysis${v.source ? ` — <a href="${esc(v.source)}">source</a>` : ''}</label>
      <p class="op">${esc(v.operative) || '<em>none published</em>'}</p>
      <label class="warn">The sponsor's own framing — NOT the source for the summary</label>
      <p class="sponsor">${esc(v.sponsorsCase) || '—'}</p>
    </details>
  </article>`).join('');

writeFileSync(OUT, `<!doctype html><meta charset="utf-8">
<title>Plain-language questions — review</title>
<style>
  body { font: 15px/1.55 "Lexend", system-ui, sans-serif; max-width: 60rem; margin: 0 auto;
    padding: 32px 20px 80px; background: #faf7f1; color: #1a1714; }
  h1 { font-size: 26px; margin: 0 0 6px; }
  .lede { color: #57514a; margin: 0 0 26px; }
  article { border: 1px solid #e6ded1; border-radius: 8px; padding: 14px 16px; margin: 0 0 14px;
    background: #fffdf9; }
  article.ok { opacity: .6; }
  article.flagged { border-color: #b8860b; }
  h2 { font-size: 15px; margin: 0 0 10px; display: flex; gap: 10px; align-items: baseline; }
  .cat { color: #8c857b; font-weight: 400; }
  .status { margin-left: auto; font-size: 11.5px; color: #8c857b; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 720px) { .pair { grid-template-columns: 1fr; } }
  label { display: block; font-size: 11px; color: #8c857b; margin-bottom: 3px; }
  label.warn { color: #b8860b; }
  .sum { margin: 0; font-size: 16px; }
  .note { margin: 10px 0 0; font-size: 12.5px; color: #b8860b; }
  details { margin-top: 12px; }
  summary { font-size: 12.5px; color: #57514a; cursor: pointer; }
  .cap, .op, .sponsor { font-size: 12.5px; color: #57514a; margin: 0 0 12px; }
  .sponsor { color: #8c857b; font-style: italic; }
</style>
<h1>Plain-language questions</h1>
<p class="lede">${approved} approved, ${entries.length - approved} awaiting review.
Each summary replaces the bill's official caption as the question a reader is asked.
Open a card to see the caption it replaces, the operative analysis it must be faithful to,
and the sponsor's framing it must <em>not</em> read like.</p>
${rows}
`, 'utf8');

console.log(`\n  -> ${OUT}\n`);
process.exit(failures === 0 ? 0 : 1);
