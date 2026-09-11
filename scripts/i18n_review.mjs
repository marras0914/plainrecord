/**
 * PlainRecord — check i18n/copy.json, and build the reviewer's page
 *
 *   npm run i18n:review          # check + write i18n/review.html
 *   npm run i18n:check           # check only, no output file
 *
 * WHY A CHECKER AND NOT JUST A TABLE. The failure that matters in a translation
 * file is not a clumsy sentence — a reviewer catches those. It is a
 * {placeholder} that got renamed, dropped, or invented, because the English and
 * the Spanish then diverge silently and the page renders "Los {n} candidatos"
 * with a literal brace in front of a voter. Spanish word order forces
 * placeholders to MOVE, which is allowed and necessary, so position cannot be
 * checked — only the set can. That is what this does.
 *
 * It also refuses to let a string claim more certainty than it has: anything
 * still marked `draft` is counted and reported, so "the Spanish is done" is a
 * claim the tool can contradict.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = resolve(ROOT, 'i18n/copy.json');
const OUT = resolve(ROOT, 'i18n/review.html');

const checkOnly = process.argv.includes('--check');

const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const meta = raw._meta;
const entries = Object.entries(raw).filter(([k]) => k !== '_meta');

let failures = 0;
const problems = [];
const fail = (key, msg) => { failures++; problems.push({ key, msg }); };

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
// A SET, as the name and the comment below both say. It used to compare
// multisets: length first, then the sorted join. That made a string fail for
// using one of its own variables twice, which rep.excludedOne does legitimately
// ("{name} also represented district {district} ... so district {district}
// shows"), and no declaration could satisfy it short of listing "district"
// twice. Membership is the thing being checked; how often a sentence needs a
// value is the sentence's business.
const setEq = (a, b) => {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.join() === y.join();
};

for (const [key, e] of entries) {
  for (const field of ['en', 'es', 'where', 'status']) {
    if (!e[field]) fail(key, `missing "${field}"`);
  }
  if (!Array.isArray(e.vars)) { fail(key, 'missing "vars" array'); continue; }

  const inEn = placeholders(e.en);
  const inEs = placeholders(e.es);

  // The declared vars must describe the English exactly.
  if (!setEq(inEn, e.vars)) {
    fail(key, `vars ${JSON.stringify(e.vars)} do not match the English ${JSON.stringify(inEn)}`);
  }
  // And the Spanish must carry the same SET — order is free, membership is not.
  if (!setEq(inEs, inEn)) {
    const missing = inEn.filter((v) => !inEs.includes(v));
    const extra = inEs.filter((v) => !inEn.includes(v));
    fail(key,
      'placeholder mismatch' +
      (missing.length ? ` — Spanish is missing {${missing.join('} {')}}` : '') +
      (extra.length ? ` — Spanish invents {${extra.join('} {')}}` : ''));
  }
  // A stray brace that is not a placeholder is a typo that reaches a reader.
  for (const [lang, text] of [['en', e.en], ['es', e.es]]) {
    const stripped = String(text).replace(/\{\w+\}/g, '');
    if (/[{}]/.test(stripped)) fail(key, `stray brace in ${lang}`);
  }
}

// ---------------------------------------------------------------------------
// Diacritics
//
// The first draft of copy.json was written with no accents and no ñ at all.
// That is not a style choice — it is incorrect Spanish on every line, and two
// of the omissions changed the meaning outright: "campana" is a bell, and
// "senal" is not a word. On a page whose whole argument is that it is careful,
// shipping that would have cost more than a mistranslation.
//
// HARD is the list of forms that are not Spanish words at all without their
// diacritic, so a hit is always a defect. SOFT is for forms that ARE real words
// but rarely the intended one, so a hit is worth a human glance rather than a
// failure — "publico" is a legitimate first-person verb, just almost never what
// this file means.
// ---------------------------------------------------------------------------

const HARD = {
  tambien: 'también', asi: 'así', aqui: 'aquí', alli: 'allí',
  razon: 'razón', opinion: 'opinión', posicion: 'posición',
  conexion: 'conexión', accion: 'acción', calificacion: 'calificación',
  declaracion: 'declaración', seleccion: 'selección',
  comparacion: 'comparación', participacion: 'participación',
  direccion: 'dirección', clasificacion: 'clasificación',
  inclinacion: 'inclinación', traduccion: 'traducción', version: 'versión',
  decision: 'decisión', medicion: 'medición', eleccion: 'elección',
  organizacion: 'organización', sesion: 'sesión',
  democrata: 'demócrata', democratas: 'demócratas',
  camara: 'cámara', pagina: 'página', energia: 'energía',
  energetico: 'energético', ningun: 'ningún', mayoria: 'mayoría',
  linea: 'línea', lineas: 'líneas', espanol: 'español', senal: 'señal',
  despues: 'después', dificil: 'difícil', dificiles: 'difíciles',
  ingles: 'inglés', segun: 'según', caian: 'caían', politico: 'político',
};

const SOFT = {
  campana: 'campaña (campana is a bell)',
  ano: 'año (ano means something else entirely)',
  publico: 'público / publicó (publico is also "I publish")',
  titulo: 'título / tituló (titulo is also "I title")',
};

const warnings = [];
for (const [key, e] of entries) {
  const words = String(e.es).toLowerCase().match(/[a-záéíóúüñ]+/g) ?? [];
  for (const w of new Set(words)) {
    if (HARD[w]) fail(key, `Spanish "${w}" is missing its diacritic — should be "${HARD[w]}"`);
    else if (SOFT[w]) warnings.push({ key, msg: `check "${w}" — did you mean ${SOFT[w]}?` });
  }
}

const byStatus = {};
for (const [, e] of entries) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const enWords = entries.reduce((s, [, e]) => s + words(e.en), 0);

console.log(`\n  i18n/copy.json — ${entries.length} strings, ${enWords} English words\n`);
for (const [s, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
  const mark = s === 'ok' ? '  ok  ' : s === 'draft' ? ' draft' : ' !!   ';
  console.log(`  ${mark}  ${String(n).padStart(3)}  ${s}`);
}

if (problems.length) {
  console.log('\n  PROBLEMS\n');
  for (const p of problems) console.log(`    ${p.key}\n      ${p.msg}`);
}

if (warnings.length) {
  console.log('\n  WORTH A LOOK (not failures)\n');
  for (const w of warnings) console.log(`    ${w.key}\n      ${w.msg}`);
}

const approved = byStatus.ok ?? 0;
console.log(
  failures === 0
    ? `\n  structure ok. ${approved}/${entries.length} approved by a reviewer.` +
      (approved < entries.length
        ? `  ${entries.length - approved} still unapproved — not ready to ship.\n`
        : '  ready to ship.\n')
    : `\n  ${failures} problem(s) — fix before sending to a reviewer.\n`,
);

if (checkOnly) process.exit(failures === 0 ? 0 : 1);

// ---------------------------------------------------------------------------
// The reviewer's page
// ---------------------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Placeholders are highlighted in BOTH columns so a reviewer can see at a glance
// that they survived the move, which is the one thing they must not break.
const mark = (s) => esc(s).replace(/\{(\w+)\}/g, '<i class="ph">{$1}</i>');

const rows = entries.map(([key, e]) => `
    <tr id="${esc(key)}" class="st-${esc(e.status)}">
      <td class="k">
        <code>${esc(key)}</code>
        <span class="st">${esc(e.status)}</span>
        <span class="wh">${esc(e.where)}</span>
        ${e.note ? `<p class="nt">${esc(e.note)}</p>` : ''}
      </td>
      <td class="en" lang="en">${mark(e.en)}</td>
      <td class="es" lang="es">${mark(e.es)}</td>
    </tr>`).join('');

const termRows = Object.entries(meta.register.terms)
  .map(([en, es]) => `<tr><td lang="en">${esc(en)}</td><td lang="es">${esc(es)}</td></tr>`)
  .join('');

writeFileSync(OUT, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rightnleft — Spanish review sheet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root { color-scheme: light;
    --page:#f9f9f7; --surface:#fcfcfb; --sunk:#f2f1ec; --ink:#0b0b0b;
    --ink-2:#52514e; --muted:#898781; --hair:#e1e0d9; --rule:#c3c2b7;
    --blue:#2a78d6; --red:#e34948; --slot:#7d5ba6; --warn:#b8860b; }
  @media (prefers-color-scheme: dark) { :root {
    color-scheme: dark;
    --page:#0d0d0d; --surface:#1a1a19; --sunk:#141413; --ink:#fff;
    --ink-2:#c3c2b7; --muted:#898781; --hair:#2c2c2a; --rule:#383835;
    --blue:#3987e5; --red:#e66767; --slot:#b28fd4; --warn:#d8a531; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--page); color:var(--ink); font-size:15px;
    font-family:"IBM Plex Sans", system-ui, sans-serif; line-height:1.55; }
  .wrap { max-width:1180px; margin:0 auto; padding:34px 20px 80px; }
  h1 { font-size:26px; font-weight:600; letter-spacing:-0.015em; margin:0; }
  .eyebrow { font-family:"IBM Plex Mono",monospace; font-size:10.5px;
    letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); }
  .brief { margin:16px 0 0; max-width:74ch; color:var(--ink-2); }
  .brief b { color:var(--ink); }
  .box { border:1px solid var(--rule); background:var(--surface);
    padding:16px 18px; margin-top:22px; }
  .box h2 { font-size:15px; margin:0 0 8px; }
  table { border-collapse:collapse; width:100%; }
  .terms { margin-top:10px; font-size:13.5px; }
  .terms td { padding:3px 14px 3px 0; border:none; }
  .terms td:first-child { color:var(--muted); }
  .sheet { margin-top:26px; border:1px solid var(--hair); }
  .sheet th { text-align:left; padding:10px 14px; background:var(--sunk);
    border-bottom:1px solid var(--hair); font-family:"IBM Plex Mono",monospace;
    font-size:10px; letter-spacing:0.09em; text-transform:uppercase;
    color:var(--muted); font-weight:500; }
  .sheet td { padding:14px; border-bottom:1px solid var(--hair);
    vertical-align:top; background:var(--surface); }
  .sheet tr:last-child td { border-bottom:none; }
  .k { width:23%; }
  .k code { font-family:"IBM Plex Mono",monospace; font-size:11.5px;
    color:var(--ink); word-break:break-all; }
  .en, .es { width:38.5%; }
  .es { border-left:1px solid var(--hair); }
  .st { display:inline-block; margin-top:6px; font-family:"IBM Plex Mono",monospace;
    font-size:9.5px; letter-spacing:0.08em; text-transform:uppercase;
    padding:1px 6px; border:1px solid var(--rule); color:var(--muted); }
  .st-draft .st { color:var(--slot); border-color:var(--slot); }
  .st-needs-code-change .st, .st-decision-needed .st {
    color:var(--warn); border-color:var(--warn); }
  .wh { display:block; margin-top:7px; font-size:12px; color:var(--muted); }
  .nt { margin:9px 0 0; font-size:12.5px; line-height:1.5; color:var(--ink);
    border-left:2px solid var(--warn); padding-left:9px; }
  .ph { font-family:"IBM Plex Mono",monospace; font-style:normal; font-size:0.9em;
    color:var(--slot); background:color-mix(in srgb, var(--slot) 12%, transparent);
    padding:0 2px; }
  @media (max-width:820px) {
    .sheet, .sheet tbody, .sheet tr, .sheet td { display:block; width:auto; }
    .sheet thead { display:none; }
    .sheet tr { border-bottom:2px solid var(--rule); }
    .sheet td { border-bottom:1px solid var(--hair); }
    .es { border-left:none; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">Translation review sheet · generated from i18n/copy.json</div>
  <h1>rightnleft.com — Spanish</h1>

  <p class="brief"><b>What I need from you:</b> read the Spanish against the
  English and correct it. Anything you change, set that row's status to
  <code>ok</code> in <code>i18n/copy.json</code>. Rows left at
  <code>draft</code> are treated as unapproved and the page will not ship with
  them.</p>

  <p class="brief"><b>The one hard rule:</b> the highlighted
  <i class="ph">{placeholders}</i> are filled in with real numbers at runtime.
  Move them wherever the Spanish needs them — that's expected — but don't
  rename, add or remove one. A build check enforces it.</p>

  <p class="brief"><b>Rows marked <span style="color:var(--warn)">needs-code-change</span>
  or <span style="color:var(--warn)">decision-needed</span></b> can't be fixed
  by translation alone; write what you want and I'll change the code. The
  English plural suffix and the spelled-out numbers are the two known ones.</p>

  <div class="box">
    <h2>Register: ${esc(meta.register.decision)}</h2>
    <p style="margin:0;font-size:13.5px;color:var(--ink-2);max-width:74ch">${esc(meta.register.why)}</p>
    <table class="terms">${termRows}</table>
  </div>

  <div class="box" style="border-color:var(--red)">
    <h2>The official bill captions are not in this sheet</h2>
    <p style="margin:0;font-size:13.5px;color:var(--ink-2);max-width:74ch">${esc(raw._meta.official_text_rule)}</p>
  </div>

  <table class="sheet">
    <thead><tr><th>Key &amp; context</th><th>English</th><th>Spanish — edit this</th></tr></thead>
    <tbody>${rows}
    </tbody>
  </table>
</div>
</body>
</html>
`, 'utf8');

console.log(`  wrote i18n/review.html — ${entries.length} rows\n`);
process.exit(failures === 0 ? 0 : 1);
