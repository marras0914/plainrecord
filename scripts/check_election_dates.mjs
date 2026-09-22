/**
 * Are the shipped election dates still true?
 *
 *   npm run data:election:check
 *   npm run data:election:check -- --online   # also re-fetch and compare
 *
 * STALENESS IS THE FAILURE THIS EXISTS FOR, not malformation. Every other data
 * file here is wrong only if it was built wrong. This one goes wrong by sitting
 * still: a page telling Texans to register by 5 October is correct today,
 * useless in November and actively misleading in the next cycle, and nothing
 * about its markup or its shape changes when that happens. So the check is
 * against the clock.
 *
 * The election date passing is a HARD failure rather than a warning. A warning
 * is a thing a person has to notice, and the whole point is that this goes stale
 * while nobody is looking at it.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FILE = join(ROOT, 'public/data/election_tx.json');

const online = process.argv.includes('--online');

let fails = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

console.log('\n  Texas election dates\n');

const d = JSON.parse(readFileSync(FILE, 'utf8'));
const FIELDS = ['election', 'registerBy', 'earlyStart', 'earlyEnd', 'mailApplyBy'];

check('every date is present and ISO',
  FIELDS.every((f) => /^\d{4}-\d{2}-\d{2}$/.test(d[f] ?? '')),
  FIELDS.filter((f) => !/^\d{4}-\d{2}-\d{2}$/.test(d[f] ?? '')).join(', ') || `${FIELDS.length} fields`);

check('the calendar runs in the right order',
  d.registerBy <= d.earlyStart && d.earlyStart <= d.earlyEnd && d.earlyEnd <= d.election,
  `${d.registerBy} -> ${d.earlyStart} -> ${d.earlyEnd} -> ${d.election}`);

check('mail ballot applications close within the cycle',
  d.mailApplyBy >= d.registerBy && d.mailApplyBy <= d.election, d.mailApplyBy);

check('the sources are recorded',
  Array.isArray(d._meta?.sources) && d._meta.sources.length >= 2,
  (d._meta?.sources ?? []).length + ' source(s)');

// --- the clock --------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

check('the election this file describes has not already happened',
  d.election >= today, `election ${d.election}, today ${today}`);

// Not a failure, because a deadline passing mid-cycle is normal and the page
// keeps telling the truth by stating dates rather than issuing instructions.
// Worth saying out loud all the same, because it is the moment the wording
// stops being useful even while it stays accurate.
if (d.registerBy < today && d.election >= today) {
  console.log(`  [ -- ] registration closed ${days(d.registerBy, today)} day(s) ago;`
    + ' the page should no longer lead with it');
}

if (d.election >= today) {
  const n = days(today, d.registerBy);
  console.log(n >= 0
    ? `\n  ${n} day(s) until registration closes, ${days(today, d.election)} until the election`
    : `\n  ${days(today, d.election)} day(s) until the election`);
}

// --- the printed sheets ------------------------------------------------------
//
// WHY THIS LIVES HERE. scripts/build_factsheet.mjs derives its dates from this
// same file and refuses to build a stale one, but that only helps if somebody
// runs it, and nothing does: it is not in `npm run build` and never has been.
// The sheets therefore sit on disk with whatever they said the last time a human
// typed the command. This is the check that runs, so this is where the drift has
// to be caught.
//
// It reads the SHIPPED HTML rather than re-deriving anything, because the thing
// worth knowing is what a reader is being handed today.

const SHEETS = [
  { file: 'public/fact-sheet/index.html', lang: 'en', open: /last day to register/i, closed: /registration has closed/i },
  { file: 'public/hoja/index.html', lang: 'es', open: /último día para registrarse/i, closed: /el registro ya cerró/i },
];

for (const sheet of SHEETS) {
  const path = join(ROOT, sheet.file);
  if (!existsSync(path)) {
    console.log(`  [ -- ] ${sheet.file} has not been built`);
    continue;
  }
  const html = readFileSync(path, 'utf8');

  // By day number, with the month left to Intl. The day is the part a reader
  // acts on and the part a timezone bug moves. Same rule as verify_site.mjs.
  const missing = FIELDS
    .filter((k) => k !== 'mailApplyBy')   // the sheet carries three rows, not five
    .filter((k) => !new RegExp(`\\b${Number(d[k].slice(8, 10))}\\b`).test(html));
  check(`${sheet.lang} sheet: every date it shows is a date from this file`,
    missing.length === 0, missing.join(', ') || 'register, early voting, election day');

  // The wording has to match the calendar. Before the deadline the sheet tells
  // people to register; after it, saying so on a piece of paper somebody is
  // holding is worse than saying nothing.
  const closed = d.registerBy < today;
  check(`${sheet.lang} sheet: the registration line matches the calendar`,
    closed ? sheet.closed.test(html) && !sheet.open.test(html) : sheet.open.test(html),
    closed ? 'registration has closed, the sheet must say so' : 'registration is open');

  check(`${sheet.lang} sheet: it says when the dates were confirmed`,
    /confirmed|confirmadas/.test(html));
}

if (d.registerBy < today || d.election < today) {
  console.log('\n  The sheets are also PDFs that people print. Rebuild and redistribute:'
    + '\n    npm run data:factsheet');
}

// --- optional: ask the state again ------------------------------------------

if (online) {
  const strip = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  try {
    const notice = strip(await (await fetch(d._meta.sources[0], { redirect: 'follow' })).text());
    const m = /last day to register to vote for the\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+Election/i.exec(notice);
    const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
    const live = m
      ? `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`
      : null;
    check('the state still names the election this file describes',
      live === d.election, `state says ${live ?? 'unreadable'}, file says ${d.election}`);
  } catch (e) {
    console.log(`  [ -- ] could not reach the state: ${String(e.message ?? e)}`);
  }
}

console.log(fails ? `\n  ${fails} problem(s)\n` : '\n  dates are current\n');
// exitCode rather than exit(): calling process.exit() while the --online fetch
// still holds a handle aborts libuv on Windows and reports 127, which reads as
// a crash rather than as a verdict. Setting the code lets Node leave normally.
process.exitCode = fails ? 1 : 0;
