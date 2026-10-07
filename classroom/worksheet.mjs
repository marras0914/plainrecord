/**
 * PlainRecord — the classroom worksheet, as one template for both languages
 *
 * The words live in i18n/classroom.json; this file owns the layout, the blanks
 * and the table. scripts/build_worksheet_pdf.mjs renders it to a PDF per
 * language. Dates come from public/data/election_tx.json, formatted here per
 * language, so a moved date cannot leave a stale one in either PDF.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const COPY = JSON.parse(readFileSync(resolve(ROOT, 'i18n/classroom.json'), 'utf8'));
const ELECTION = JSON.parse(readFileSync(resolve(ROOT, 'public/data/election_tx.json'), 'utf8'));

/** Where each language's PDF and its page-one preview are written, relative to the repo. */
export const OUTPUTS = {
  en: { dir: 'public/classroom', pdf: 'texas-house-worksheet.pdf', png: 'worksheet-page-1.png' },
  es: { dir: 'public/maestros', pdf: 'hoja-de-trabajo.pdf', png: 'hoja-pagina-1.png' },
};

/** Keys whose Spanish is not yet approved. Empty means Spanish may ship. */
export function unapprovedSpanish() {
  return Object.entries(COPY).filter(([k, e]) => k !== '_meta' && e.status !== 'ok').map(([k]) => k);
}

/** A string in one language, with {name} filled in. Throws on a missing key or an unfilled name. */
export function t(lang, key, vars = {}) {
  const e = COPY[key];
  if (!e || typeof e[lang] !== 'string') throw new Error(`classroom.json: no ${lang} for ${key}`);
  const out = e[lang].replace(/\{(\w+)\}/g, (m, name) => {
    if (!(name in vars)) throw new Error(`classroom.json ${key}: {${name}} not supplied`);
    return vars[name];
  });
  return out;
}

// "Monday 19 October" / "lunes 19 de octubre", with the year where asked.
function day(lang, iso, withYear) {
  const d = new Date(`${iso}T12:00:00Z`);
  const o = { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC', ...(withYear ? { year: 'numeric' } : {}) };
  return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-GB', o).replace(/,/g, '');
}

export function dates(lang) {
  return {
    earlyStart: day(lang, ELECTION.earlyStart, false),
    earlyEnd: day(lang, ELECTION.earlyEnd, true),
    election: day(lang, ELECTION.election, true),
    mailApplyBy: day(lang, ELECTION.mailApplyBy, true),
    registerBy: day(lang, ELECTION.registerBy, true),
  };
}

const STYLE = `
@page{size:letter;margin:0}
:root{--ink:#1a1714;--ink-2:#45403a;--muted:#6f6a62;--rule:#b9ad9b;--hair:#ddd3c3}
*{box-sizing:border-box}
html,body{margin:0;color:var(--ink);font-family:Lexend,"Segoe UI",Arial,sans-serif;font-size:10.5pt;line-height:1.4}
.page{width:8.5in;height:11in;padding:.55in .65in;page-break-after:always;position:relative}
.page:last-child{page-break-after:auto}
h1{font-family:Newsreader,Georgia,serif;font-weight:600;font-size:23pt;line-height:1.05;margin:0 0 4px}
h2{font-family:Newsreader,Georgia,serif;font-weight:600;font-size:13pt;margin:10px 0 4px}
.kicker{font-size:8.5pt;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
.lede{color:var(--ink-2);margin:0 0 6px}
.name{display:flex;gap:18px;margin:8px 0 2px}
.name span{flex:1;border-bottom:1px solid var(--rule);padding-bottom:2px;color:var(--muted);font-size:9pt}
ol.steps{padding-left:0;list-style:none;margin:0;counter-reset:s}
ol.steps>li{counter-increment:s;position:relative;padding-left:30px;margin:0 0 15px}
ol.tight>li{margin-bottom:5px}
ol.steps>li::before{content:counter(s);position:absolute;left:0;top:0;width:21px;height:21px;border-radius:50%;background:var(--ink);color:#fff;font-weight:600;font-size:9.5pt;text-align:center;line-height:21px}
.line{display:block;border-bottom:1px solid var(--rule);height:21px;margin:2px 0}
.blank{display:inline-block;border-bottom:1px solid var(--rule);min-width:1.4in;height:15px;vertical-align:bottom}
table{width:100%;border-collapse:collapse;margin:5px 0 2px;font-size:9.5pt}
th,td{border:1px solid var(--hair);padding:5px 7px;text-align:left;vertical-align:top}
th{background:#f3eee5;font-weight:600}
td{height:44px}
.box{border:1px solid var(--hair);border-radius:8px;padding:8px 11px;margin:8px 0}
.small{font-size:8.5pt;color:var(--muted)}
.foot{position:absolute;left:.65in;right:.65in;bottom:.4in;font-size:8pt;color:var(--muted);border-top:1px solid var(--hair);padding-top:5px}
b{font-weight:600}
ul{margin:3px 0 6px;padding-left:16px}
li{margin:0 0 3px}`;

export function worksheetHtml(lang) {
  const s = (key, vars) => t(lang, key, vars);
  const D = dates(lang);
  const blank = (w) => `<span class="blank"${w ? ` style="min-width:${w}"` : ''}></span>`;
  const line = '<span class="line"></span>';
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${s('ws.title')}</title>
<style>${STYLE}</style></head><body>

<section class="page">
<p class="kicker">${s('ws.kicker')}</p>
<h1>${s('ws.title')}</h1>
<p class="lede">${s('ws.lede')}</p>
<div class="name"><span>${s('ws.name')}</span><span>${s('ws.period')}</span><span>${s('ws.date')}</span></div>

<ol class="steps" style="margin-top:12px">
<li>${s('ws.s1')}<br>
${s('ws.s1zip')} ${blank()} &nbsp; ${s('ws.s1district')} ${blank('.8in')}</li>

<li>${s('ws.s2')}<br>
${s('ws.s2rep')} ${blank('2.4in')} &nbsp; ${s('ws.s2party')} ${blank('1in')}<br>
${s('ws.s2ballot')} ${line}</li>

<li>${s('ws.s3')}
<table>
<tr><th style="width:15%">${s('ws.colBill')}</th><th style="width:43%">${s('ws.colWhat')}</th><th style="width:21%">${s('ws.colRep')}</th><th style="width:21%">${s('ws.colYou')}</th></tr>
${'<tr><td></td><td></td><td></td><td></td></tr>\n'.repeat(3)}</table></li>

<li>${s('ws.s4')} ${line}${line}</li>

<li>${s('ws.s5')}<br>
${s('ws.s5result')} ${blank('3.4in')}<br>
${s('ws.s5surprise')} ${line}</li>

<li>${s('ws.s6')} ${blank('.8in')}</li>
</ol>
<p class="foot">${s('ws.foot1')}</p>
</section>

<section class="page">
<p class="kicker">${s('ws.p2kicker')}</p>
<h2 style="margin-top:0">${s('ws.p2title')}</h2>
<p>${s('ws.p2a')}</p>
<p>${s('ws.p2b')}</p>
<ol class="steps tight" style="margin-top:8px">
<li>${s('ws.q1')} ${line}${line}</li>
<li>${s('ws.q2')} ${line}${line}</li>
<li>${s('ws.q3')} ${line}${line}</li>
</ol>

<h2>${s('ws.voteHead')}</h2>
<div class="box">
${s('ws.voteEarly', D)}<br>
${s('ws.voteDay', D)}<br>
${s('ws.voteMail', D)}<br>
<span class="small">${s('ws.voteNote', D)}</span>
</div>

<h2>${s('ws.teachHead')}</h2>
<ul class="small" style="font-size:8.5pt;color:var(--ink-2)">
${['ws.t1', 'ws.t2', 'ws.t3', 'ws.t4', 'ws.t5'].map((k) => `<li>${s(k)}</li>`).join('\n')}
</ul>
<p class="foot">${s('ws.foot2')}</p>
</section>
</body></html>`;
}
