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

import { readFileSync } from 'node:fs';
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
