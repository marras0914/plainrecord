/**
 * PlainRecord — the six broadcast pitches, as one-click Gmail drafts
 *
 *   node scripts/build_outbox.mjs
 *
 * Writes private/outbox/gmail.html. Open it in the browser you are signed into
 * Gmail with, click a station, and Gmail's compose window opens with the
 * recipient, the subject and the right local paragraph already filled. Read it,
 * then press send.
 *
 * WHY THIS AND NOT .eml
 *
 * The first version of this wrote .eml files, which is correct for Outlook or
 * Thunderbird and useless for Gmail on the web: there is no way to open a local
 * .eml as a Gmail draft. Gmail's own compose URL is the right mechanism.
 *
 * WHY NOT mailto:
 *
 * mailto has a short practical length limit and hands the accented characters to
 * whatever the OS mail handler happens to be, which is how "cómo votó" arrives
 * as mojibake. An https compose URL with encodeURIComponent is unambiguous
 * UTF-8 and Gmail decodes it correctly.
 *
 * NOTHING IS SENT. This writes one HTML file. The recipients are real newsrooms
 * and pressing send stays a human act.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'private/outbox');
mkdirSync(OUT, { recursive: true });

const SUBJECT = 'Una herramienta gratuita en español: cómo votó su representante estatal';

// Read off each station's own contact page on 20 September 2026 by
// scripts/find_station_contacts.mjs. None is constructed from a pattern.
const STATIONS = [
  { order: 1, metro: 'Houston', people: '890,598', to: 'univision45@televisaunivision.com', station: 'Univision 45 KXLN' },
  { order: 2, metro: 'Dallas', people: '482,153', to: 'noticias23dfw@televisaunivision.com', station: 'Univision 23 KUVN' },
  { order: 3, metro: 'Valle del Río Grande', people: '333,440', to: 'ecanavati@entravision.com', station: 'Univision 48 KNVO', valley: true },
  { order: 4, metro: 'El Paso', people: '250,224', to: 'rfranco@entravision.com', station: 'Univision 26 KINT' },
  { order: 5, metro: 'San Antonio', people: '236,313', to: 'sanantoniodesk@televisaunivision.com', station: 'Univision 41 KWEX' },
  { order: 6, metro: 'Austin', people: '161,014', to: 'noticias62@televisaunivision.com', station: 'Univision 62 KAKW' },
];

const variable = (s) => s.valley
  ? `En el Valle del Río Grande viven ${s.people} personas que hablan español en casa y que dicen hablar inglés menos que "muy bien", según la Oficina del Censo. En proporción, es una de las concentraciones más altas del estado, y la información sobre lo que hace la legislatura estatal casi nunca existe en su idioma.`
  : `En el área de ${s.metro} viven ${s.people} personas que hablan español en casa y que dicen hablar inglés menos que "muy bien", según la Oficina del Censo. Para muchas de ellas, la información sobre lo que hace su legislatura estatal simplemente no existe en su idioma.`;

const body = (s) => `Buenos días,

Le escribo desde McKinney, Texas. Construí un sitio gratuito, en español, que le permite a cualquier persona escribir su código postal y ver cómo votó su propio representante en la Cámara de Texas durante la sesión de 2025. No pide registro, no pide correo electrónico, no tiene anuncios y no cuesta nada.

${variable(s)}

El sitio toma 67 votos reales de la sesión y explica, en español y en palabras sencillas, lo que hace cada proyecto de ley. También hay un cuestionario, pero lo que quizá les sirva más para un segmento es la búsqueda por distrito: se escribe el código postal, aparece quién le representa, y aparecen los votos en los que esa persona se apartó de su propio partido. Eso último es lo que no se puede adivinar por el partido, y se ve en pantalla en quince segundos.

Debo decirle algo antes que cualquier otra cosa: yo dono al Partido Demócrata. Está escrito en la primera línea de la página de autoría del sitio, no en una nota al pie. La regla que escoge cuáles votos aparecen está publicada y se aplica igual a los dos partidos, el partido no se muestra hasta que la persona ya respondió, y los tres republicanos que aparecen no reciben ninguna calificación porque ninguno ha votado nunca en la Cámara de Texas. El código y los datos completos son públicos para que nadie tenga que creerme.

Si les sirve para un segmento de asuntos comunitarios o de servicio al televidente, con gusto lo explico en español, en vivo o grabado, cuando les convenga. Y si no les sirve, también me ayuda saberlo.

Las fechas de esta elección en Texas: el último día para registrarse es el 5 de octubre, la votación temprana va del 19 al 30 de octubre, y la elección es el 3 de noviembre.

https://rightnleft.com/es

Gracias por su tiempo,

Marco Arras
rightnleft.com`;

const composeUrl = (s) => 'https://mail.google.com/mail/?view=cm&fs=1'
  + `&to=${encodeURIComponent(s.to)}`
  + `&su=${encodeURIComponent(SUBJECT)}`
  + `&body=${encodeURIComponent(body(s))}`;

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rows = STATIONS.map((s) => {
  const url = composeUrl(s);
  return `    <li>
      <a class="go" href="${esc(url)}" target="_blank" rel="noopener">${s.order}. ${esc(s.metro)}</a>
      <div class="meta"><b>${esc(s.station)}</b> &middot; ${esc(s.to)} &middot; ${esc(s.people)} personas</div>
      <details><summary>Read the email first</summary><pre>${esc(body(s))}</pre></details>
    </li>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Broadcast pitches</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.55 system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 16px; }
  h1 { font-size: 1.35rem; margin-bottom: .2rem; }
  .warn { background: #fff4e5; border-left: 4px solid #d97706; padding: .7rem .9rem; margin: 1rem 0; }
  @media (prefers-color-scheme: dark) { .warn { background: #2a2010; } }
  ol { list-style: none; padding: 0; }
  li { border-top: 1px solid #8884; padding: 1rem 0; }
  a.go { font-size: 1.1rem; font-weight: 600; text-decoration: none; }
  a.go:hover { text-decoration: underline; }
  .meta { color: #7a7a7a; font-size: .86rem; margin-top: .2rem; }
  details { margin-top: .55rem; }
  summary { cursor: pointer; font-size: .86rem; color: #7a7a7a; }
  pre { white-space: pre-wrap; font: 13px/1.5 ui-monospace, monospace; background: #8881; padding: .8rem; border-radius: 6px; }
</style></head><body>
<h1>Spanish-language TV pitches</h1>
<p>Click a metro. Gmail opens with the recipient, subject and that market's own
figure already filled in. Read it, then send.</p>
<div class="warn">
  <b>Nothing here has been sent.</b> Six separate emails, not one to all six:
  they are competing newsrooms, and the local number is the only line that is
  about them rather than about us.<br><br>
  Check two things before the first send: the email says you write
  <b>from McKinney</b>, and the dates line carries the <b>5 October</b>
  registration deadline, which is wrong from 6 October.<br><br>
  Log all six in <code>rightnleft-sent-ledger.md</code> the day they go out.
</div>
<ol>
${rows}
</ol>
</body></html>
`;

writeFileSync(resolve(OUT, 'gmail.html'), html, 'utf8');

console.log('');
for (const s of STATIONS) {
  const len = composeUrl(s).length;
  console.log(`  ${String(s.order)}. ${s.metro.padEnd(22)} ${s.to.padEnd(38)} url ${len} chars${len > 8000 ? '  ** TOO LONG **' : ''}`);
}
console.log(`\n  wrote ${resolve(OUT, 'gmail.html')}`);
console.log('  Open it in the browser you are signed into Gmail with.');
console.log('  NOTHING HAS BEEN SENT.\n');
