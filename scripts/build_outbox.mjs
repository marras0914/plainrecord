/**
 * PlainRecord — build ready-to-send .eml drafts for the broadcast pitch
 *
 *   node scripts/build_outbox.mjs
 *
 * Writes one .eml per station into private/outbox/. Double-clicking one opens it
 * in the default mail client with the recipient, the subject and the body
 * already filled, so sending is a click rather than six copy-pastes.
 *
 * WHY .eml AND NOT mailto:
 *
 * mailto: links break on exactly this content: they have a practical length
 * limit well under this body, and accented characters have to be percent-encoded
 * by hand, which is how "¿Cómo votó?" becomes mojibake in somebody's sent
 * folder. An .eml file carries a real MIME header and states its charset.
 *
 * The body is base64-encoded UTF-8 rather than quoted-printable, because the
 * Spanish here is dense with accents and tildes and quoted-printable turns it
 * into an unreadable diff that is easy to corrupt by editing.
 *
 * NOTHING IS SENT. This only writes files. Sending stays a human action, which
 * is the right place for it when the recipients are real newsrooms.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'private/outbox');
mkdirSync(OUT, { recursive: true });

const SUBJECT = 'Una herramienta gratuita en español: cómo votó su representante estatal';

// Addresses read off each station's own contact page on 20 September 2026 by
// scripts/find_station_contacts.mjs. None is constructed from a pattern.
const STATIONS = [
  { order: 1, metro: 'Houston', to: 'univision45@televisaunivision.com',
    lead: 'En el área de Houston viven 890,598 personas' },
  { order: 2, metro: 'Dallas', to: 'noticias23dfw@televisaunivision.com',
    lead: 'En el área de Dallas viven 482,153 personas' },
  { order: 3, metro: 'Valle del Rio Grande', to: 'ecanavati@entravision.com',
    lead: 'En el Valle del Río Grande viven 333,440 personas', valley: true },
  { order: 4, metro: 'El Paso', to: 'rfranco@entravision.com',
    lead: 'En el área de El Paso viven 250,224 personas' },
  { order: 5, metro: 'San Antonio', to: 'sanantoniodesk@televisaunivision.com',
    lead: 'En el área de San Antonio viven 236,313 personas' },
  { order: 6, metro: 'Austin', to: 'noticias62@televisaunivision.com',
    lead: 'En el área de Austin viven 161,014 personas' },
];

const variable = (s) => s.valley
  ? `${s.lead} que hablan español en casa y que dicen hablar inglés menos que "muy bien", según la Oficina del Censo. En proporción, es una de las concentraciones más altas del estado, y la información sobre lo que hace la legislatura estatal casi nunca existe en su idioma.`
  : `${s.lead} que hablan español en casa y que dicen hablar inglés menos que "muy bien", según la Oficina del Censo. Para muchas de ellas, la información sobre lo que hace su legislatura estatal simplemente no existe en su idioma.`;

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
rightnleft.com
`;

// RFC 2047 for the header, base64 UTF-8 for the body.
const encHeader = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
const b64 = (s) => (Buffer.from(s, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');

for (const s of STATIONS) {
  const eml = [
    `To: ${s.to}`,
    `Subject: ${encHeader(SUBJECT)}`,
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(body(s)),
    '',
  ].join('\r\n');

  const name = `${String(s.order).padStart(2, '0')}-${s.metro.toLowerCase().replace(/\s+/g, '-')}.eml`;
  writeFileSync(resolve(OUT, name), eml, 'utf8');
  console.log(`  ${name.padEnd(28)} -> ${s.to}`);
}

console.log(`\n  ${STATIONS.length} drafts in private/outbox/`);
console.log('  X-Unsent: 1 makes Outlook open them as editable drafts rather than received mail.');
console.log('  NOTHING HAS BEEN SENT. Open each one, read it, press send.');
console.log('  Then log all six in rightnleft-outreach/rightnleft-sent-ledger.md.\n');
