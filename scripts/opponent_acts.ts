/**
 * PlainRecord — opponent actions, joined to a specific bill
 *
 * The three candidates run against Dan Patrick, Greg Abbott and Ken Paxton. None
 * of the three opponents has a roll-call record that overlaps them:
 *
 *   - Abbott has never served in a legislature, so there is no vote to compare.
 *   - Paxton's last legislative vote was in 2015, before any of the three took
 *     office. There is no session they share.
 *   - Patrick presides over the Senate rather than voting in the House, and every
 *     item in this quiz is a House roll call.
 *
 * So they can never be placed on the same axis by voting, and showing only the
 * three Democrats leaves the quiz looking one-sided. What CAN be joined is an
 * action on a SPECIFIC BILL — a veto, or a priority designation. That is the same
 * bill the reader just answered, which no other opponent signal is.
 *
 * Both lists are ONE-SIDED BY CONSTRUCTION. A governor only vetoes bills he
 * opposes; a priority list only names bills its author wants passed. So an act
 * can say where someone stood on a bill and can never say how often they would
 * agree with you. evidence.ts enforces that with Coverage.oneSided; the page
 * enforces it by keeping acts out of the vote tally and saying so on screen.
 *
 * This module exists so the join lives in ONE place. It is called both by
 * export_quiz_data.ts (a full rebuild) and by augment_acts.ts (adding acts to an
 * already-built payload), and a second hand-maintained copy of this logic is
 * exactly how the two would drift apart.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Evidence } from '../evidence';
import { PRIORITY_BILLS } from '../stated_positions';
import { WORK_DIR } from './paths';

/** One recorded action by a non-legislator on a specific bill. */
export interface OpponentAct {
  who: string;
  office: string;
  kind: Evidence['kind'];
  position: 1 | -1;
  sourceUrl: string;
}

/** Non-legislator ids get stable slugs; these are the two with per-bill acts. */
const OFFICE_OF: Record<string, { name: string; office: string }> = {
  'tx-ltgov-patrick-dan': { name: 'Dan Patrick', office: 'Lieutenant Governor' },
  'tx-gov-abbott-greg': { name: 'Greg Abbott', office: 'Governor' },
};

/** "SB  3 " and "sb 3" are the same bill; the payload and the LRL disagree on spacing. */
export const normBill = (b: string) => b.replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Every per-bill act for a session, keyed by normalised bill id.
 *
 * Line-item vetoes are excluded: striking one funding line is not a position on
 * the bill, and treating it as one would put words in the Governor's mouth.
 */
export function actsBySession(session: string, workDir = WORK_DIR): Map<string, OpponentAct[]> {
  const evidence: Evidence[] = PRIORITY_BILLS.filter((e) => e.session === session);

  const vetoPath = join(workDir, 'tx_evidence_vetoes.json');
  if (existsSync(vetoPath)) {
    const all: Evidence[] = JSON.parse(readFileSync(vetoPath, 'utf8'));
    evidence.push(...all.filter((e) => e.session === session && e.kind === 'veto'));
  } else {
    console.warn(`  WARNING: ${vetoPath} absent — payload will carry no veto actions`);
  }

  const out = new Map<string, OpponentAct[]>();
  for (const e of evidence) {
    const who = OFFICE_OF[e.personId];
    if (!who) continue; // a legislator's evidence belongs in the vote tier, not here
    // Evidence.billId is nullable, and an act with no bill cannot be attached to a
    // question — a general statement is the `stance` tier, which is never scored
    // and never appears here.
    if (!e.billId) continue;
    const k = normBill(e.billId);
    out.set(k, [
      ...(out.get(k) ?? []),
      {
        who: who.name,
        office: who.office,
        kind: e.kind,
        position: e.position as 1 | -1,
        sourceUrl: e.sourceUrl,
      },
    ]);
  }
  return out;
}

/**
 * Who the three are running against, and why none of them can be scored against
 * the reader. This ships with the payload so the page cannot show opponent acts
 * without also showing the reason they are not votes — an absence of data is not
 * an absence of positions, and the page must never let it read that way.
 */
export const OPPONENTS = [
  {
    name: 'Dan Patrick', office: 'Lieutenant Governor', party: 'R',
    opposing: 'Vikki Goodwin',
    whyNoVotes: 'Presides over the Senate rather than voting in the House, so he casts no vote on these bills.',
    evidence: 'priority-bill designations — bills he publicly named as must-pass',
    oneSided: 'Every bill on that list is one he wanted passed, so it can show where he stood on a bill but never how often he would agree with you.',
  },
  {
    name: 'Greg Abbott', office: 'Governor', party: 'R',
    opposing: 'Gina Hinojosa',
    whyNoVotes: 'Has never served in a legislature, so he has no roll-call record at all.',
    evidence: 'vetoes — bills he killed after they had passed',
    oneSided: 'A governor only vetoes bills he opposes, and letting a bill become law unsigned is not support, so this can never be read as agreement.',
  },
  {
    name: 'Ken Paxton', office: 'Attorney General', party: 'R',
    opposing: 'James Talarico',
    whyNoVotes: 'His last legislative vote was in 2015, before any of the three took office — there is no session they share.',
    evidence: 'nothing that attaches to these bills',
    oneSided: 'Nothing on his record can be joined to a bill in this quiz, so he appears on no question.',
  },
] as const;
