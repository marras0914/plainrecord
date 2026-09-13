/**
 * The Purple Strip — the dates a Texas voter has to hit.
 *
 * The file this reads is built from the state's own pages by
 * scripts/build_election_dates.mjs, which refuses to write unless two of them
 * agree on the registration deadline. See that script for why these are not
 * four constants typed into a source file.
 *
 * NOTHING HERE INSTRUCTS ANYONE. The block states dates and links to the state,
 * and that is a deliberate limit rather than a stylistic one. The author of this
 * site discloses that he donates to the Democratic Party, and a turnout appeal
 * from a disclosed donor reads differently than a voting record does, however
 * non-partisan the content. Dates are civic facts and survive that; "make your
 * voice heard" would not. It is also why a passed deadline is left on screen
 * rather than hidden: a date that has gone by is still true, and quietly
 * removing it would be the page managing what the reader knows.
 */

import DATES from '../public/data/election_tx.json' with { type: 'json' };
import { LOCALE } from './i18n.js';

export interface ElectionDates {
  election: string;
  registerBy: string;
  earlyStart: string;
  earlyEnd: string;
  mailApplyBy: string;
}

export const ELECTION: ElectionDates = DATES as unknown as ElectionDates;

/**
 * An ISO date as a person would read it, in their language.
 *
 * Parsed as UTC and formatted in UTC. Reading "2026-10-05" with the local
 * timezone puts it at midnight UTC, which is still 4 October in Texas, and the
 * page would print a registration deadline one day earlier than the state's.
 * On this of all numbers that is not an acceptable rounding.
 */
export function readable(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(LOCALE === 'es' ? 'es-US' : 'en-US', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(at);
}

/** Early voting, as one span rather than two dates. */
export function readableRange(fromIso: string, toIso: string): string {
  return `${readable(fromIso)} – ${readable(toIso)}`;
}

/**
 * Whether this file still describes an election that has not happened.
 *
 * The page shows nothing at all once it has. Every other claim on this site
 * stays true forever because it is about a vote already cast; this one rots,
 * and a stale deadline is worse than no deadline. scripts/check_election_dates
 * fails the build side of the same rule.
 */
export function stillCurrent(today = new Date().toISOString().slice(0, 10)): boolean {
  return ELECTION.election >= today;
}

/** Whether registration has already closed for this cycle. */
export function registrationClosed(today = new Date().toISOString().slice(0, 10)): boolean {
  return ELECTION.registerBy < today;
}
