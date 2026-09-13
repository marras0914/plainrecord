/**
 * The dates a Texas voter has to hit, from the state, checked against itself.
 *
 *   npm run data:election
 *   npm run data:election -- --write
 *
 * WHY THIS IS A BUILD STEP AND NOT FOUR CONSTANTS TYPED INTO A FILE.
 *
 * A wrong registration deadline on a page that tells people to register is
 * worse than no deadline at all: it is the one number here that can cost
 * somebody their vote, and unlike everything else this site publishes, a reader
 * cannot check it against the record because the record is the state's website.
 * So the dates are taken FROM the state, from two of its pages, and the two are
 * required to agree before anything is written.
 *
 * TWO SOURCES, ON PURPOSE.
 *
 *   sos.state.tx.us carries a notice naming the last day to register and the
 *   date of the election in one sentence, which ties the deadline to the
 *   election it belongs to. A deadline parsed alone could be last cycle's.
 *
 *   votetexas.gov carries the countdown block with the early voting window and
 *   the mail ballot application deadline, which the notice does not mention.
 *
 * They overlap on the registration deadline, and that overlap is asserted. If
 * the state ever disagrees with itself this refuses to write rather than
 * picking one.
 *
 * STALENESS IS THE OTHER FAILURE MODE. A page still telling people to register
 * by 5 October in December is broken in a way no test of its markup would
 * catch, so the file carries the election date and check_election_dates.mjs
 * fails once it is in the past. See also the `showUntil` note there.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'public/data/election_tx.json');

const NOTICE = 'https://www.sos.state.tx.us/elections/voter/important-election-dates.shtml';
const COUNTDOWN = 'https://www.votetexas.gov/';

const write = process.argv.includes('--write');
const say = (s) => console.log('  ' + s);

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

async function text(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const html = await res.text();
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

console.log('\n  Texas election dates\n');

// --- the notice: "... last day to register to vote for the November 3, 2026 Election"
const notice = await text(NOTICE);
const m = /last day to register to vote for the\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+Election/i.exec(notice);
const reg = /([A-Za-z]+day),?\s+([A-Za-z]+)\s+(\d{1,2})\s+is the last day to register/i.exec(notice);
if (!m) throw new Error('could not find the election date in the notice');
if (!reg) throw new Error('could not find the registration deadline in the notice');

const year = Number(m[3]);
const electionMonth = MONTHS[m[1].toLowerCase()];
if (!electionMonth) throw new Error(`unknown month ${m[1]}`);
const election = iso(year, electionMonth, Number(m[2]));

const regMonth = MONTHS[reg[2].toLowerCase()];
if (!regMonth) throw new Error(`unknown month ${reg[2]}`);
// The deadline precedes the election, so it shares its year unless the election
// is in January and the deadline falls in December.
const regYear = regMonth > electionMonth ? year - 1 : year;
const registerBy = iso(regYear, regMonth, Number(reg[3]));
say(`notice: election ${election}, register by ${registerBy}`);

// --- the countdown block: "Last Day to Register 5 OCT ... Early Voting Begins 19 OCT ..."
const countdown = await text(COUNTDOWN);
const pick = (label) => {
  const re = new RegExp(`${label}\\s+(\\d{1,2})\\s+([A-Za-z]{3,9})`, 'i');
  const got = re.exec(countdown);
  if (!got) return null;
  const mm = MONTHS[got[2].toLowerCase()];
  if (!mm) return null;
  return iso(mm > electionMonth ? year - 1 : year, mm, Number(got[1]));
};

const countdownReg = pick('Last Day to Register');
const earlyStart = pick('Early Voting Begins');
const earlyEnd = pick('Early Voting Ends');
const mailApplyBy = pick('Mail Ballot App Deadline');

for (const [name, v] of [['early voting start', earlyStart], ['early voting end', earlyEnd],
  ['mail ballot deadline', mailApplyBy], ['countdown registration deadline', countdownReg]]) {
  if (!v) throw new Error(`could not read the ${name} from ${COUNTDOWN}`);
}
say(`countdown: register by ${countdownReg}, early ${earlyStart} to ${earlyEnd}, mail by ${mailApplyBy}`);

// --- the two have to agree where they overlap ------------------------------
if (countdownReg !== registerBy) {
  throw new Error(
    `the state disagrees with itself: the notice says register by ${registerBy}, ` +
    `the countdown says ${countdownReg}. Refusing to pick one.`,
  );
}
say('both pages agree on the registration deadline');

// --- and the calendar has to be in a sane order ----------------------------
const order = [registerBy, earlyStart, earlyEnd, election];
for (let i = 1; i < order.length; i++) {
  if (!(order[i - 1] <= order[i])) {
    throw new Error(`dates out of order: ${order.join(' -> ')}`);
  }
}
if (!(mailApplyBy >= registerBy && mailApplyBy <= election)) {
  throw new Error(`mail ballot deadline ${mailApplyBy} is outside the cycle`);
}
say('the calendar is in order');

const body = {
  _meta: {
    what: 'Dates a Texas voter has to hit for the current cycle, taken from the state.',
    why: 'A wrong deadline on a page that tells people to register is the one number here that can cost somebody their vote.',
    sources: [NOTICE, COUNTDOWN],
    generated: new Date().toISOString().slice(0, 10),
    rule: 'Both pages must agree on the registration deadline or nothing is written. scripts/check_election_dates.mjs refuses a file whose election date has passed.',
  },
  election,
  registerBy,
  earlyStart,
  earlyEnd,
  mailApplyBy,
};

console.log('');
for (const [k, v] of Object.entries(body)) if (k !== '_meta') say(`${k.padEnd(12)} ${v}`);

if (!write) {
  console.log('\n  dry run - nothing written. Add --write to apply.\n');
  process.exit(0);
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
if (prev && prev.election === body.election
  && prev.registerBy === body.registerBy && prev.earlyStart === body.earlyStart) {
  say('unchanged from what is already shipped');
}
writeFileSync(OUT, JSON.stringify(body, null, 2) + '\n', 'utf8');
console.log(`\n  wrote ${OUT.replace(ROOT, '.')}\n`);
