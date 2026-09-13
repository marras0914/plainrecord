/**
 * The Purple Strip — smoke suite for the voting dates
 *
 *   npx tsx src/election.smoke.ts
 *
 * Two things here can be wrong in ways no rendering check would notice.
 *
 * The timezone. "2026-10-05" read through the local zone is midnight UTC, which
 * is still 4 October in Texas, so a page built the obvious way prints a
 * registration deadline one day earlier than the state's. It would look right
 * to anyone east of UTC and be wrong for every reader the site has.
 *
 * The expiry. This is the only claim on the site that rots. Everything else is
 * about a vote already cast and stays true forever; a deadline goes stale while
 * nobody is looking, and the boundary it turns on is a date comparison that is
 * easy to get off by one in the direction that keeps a dead block on screen.
 */

import { readable, readableRange, stillCurrent, registrationClosed, ELECTION } from './election.js';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? '  — ' + detail : ''}`);
}

// --- the timezone trap ------------------------------------------------------

check('a date renders as the day it actually is, not the day before',
  readable('2026-10-05').includes('5'), readable('2026-10-05'));
check('the first of a month does not fall back into the previous one',
  readable('2026-11-01').includes('1') && /nov/i.test(readable('2026-11-01')),
  readable('2026-11-01'));
check('the last of a month does not roll forward',
  readable('2026-10-31').includes('31') && /oct/i.test(readable('2026-10-31')),
  readable('2026-10-31'));
check('a leap day survives',
  readable('2028-02-29').includes('29'), readable('2028-02-29'));

check('a range names both ends',
  readableRange('2026-10-19', '2026-10-30').includes('19')
  && readableRange('2026-10-19', '2026-10-30').includes('30'),
  readableRange('2026-10-19', '2026-10-30'));

// --- the expiry -------------------------------------------------------------
//
// Asserted on both sides of the boundary rather than sampled, because the
// failure that matters is one day wide.

check('the block still shows on the morning of the election',
  stillCurrent(ELECTION.election), ELECTION.election);
check('and is gone the day after',
  !stillCurrent('2026-11-04'), '2026-11-04');
check('and was showing the day before',
  stillCurrent('2026-11-02'), '2026-11-02');
check('a date well past the election does not revive it',
  !stillCurrent('2027-01-01'), '2027-01-01');

check('registration is not closed the day it closes',
  !registrationClosed(ELECTION.registerBy), ELECTION.registerBy);
check('registration is closed the day after',
  registrationClosed('2026-10-06'), '2026-10-06');

// --- the file itself --------------------------------------------------------

check('the shipped dates run in the right order',
  ELECTION.registerBy <= ELECTION.earlyStart
  && ELECTION.earlyStart <= ELECTION.earlyEnd
  && ELECTION.earlyEnd <= ELECTION.election,
  `${ELECTION.registerBy} -> ${ELECTION.election}`);

// The page would otherwise happily render a block for an election already held,
// and the only thing standing between that and a reader is this comparison.
check('the shipped election has not already happened',
  stillCurrent(), `${ELECTION.election} vs today`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
