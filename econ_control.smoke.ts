/**
 * PlainRecord: smoke suite for who held each office (econ_control.ts)
 *
 *   npx tsx econ_control.smoke.ts
 *
 * The data is hand-transcribed, so most of what can go wrong is a typo that
 * still looks plausible: a stretch that starts a year late, a chair whose dates
 * overlap the next, a term that drops a day. These checks are structural
 * (everything tiles, nothing overlaps) plus a handful of facts read off the
 * source pages, asserted by name so a reader can check them against the page.
 *
 * Each structural check is also run against a deliberately broken copy, so a
 * check that cannot fail is caught here rather than trusted.
 */

import {
  PRESIDENCIES, HOUSE, SENATE, FED_CHAIRS, FED_VACANCIES, KNOWN_GAPS, WINDOW_START,
  congressStart, buildTerms, presidentOn, houseOn, senateOn, fedChairOn,
  firstAppointedBy, fedAppointingParty, FED_APPOINTMENTS, UNSOURCED_REAPPOINTMENTS,
  type Presidency, type FedChair, type Term, type Party,
} from './econ_control';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? '  — ' + detail : ''}`);
}

const TODAY = new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// --- structural rules, written once and run on good and broken data ----------

/** Presidencies tile: each starts where the last ended, one open at the end. */
function presidenciesTile(ps: Presidency[]): string | null {
  for (let i = 1; i < ps.length; i++) {
    if (ps[i - 1].end !== ps[i].start) return `${ps[i - 1].name} ends ${ps[i - 1].end}, ${ps[i].name} starts ${ps[i].start}`;
  }
  if (ps.at(-1)!.end !== null) return 'the last presidency is closed';
  if (ps[0].start > WINDOW_START) return 'the first presidency starts after the window';
  return null;
}

/** Chair tenures: in order, no overlap beyond a shared handover day, and every
 *  missing day inside the window is one of the documented vacancies. */
function chairsTile(cs: FedChair[], vacancies: { start: string; end: string }[]): string | null {
  const found: { start: string; end: string }[] = [];
  for (let i = 1; i < cs.length; i++) {
    const prevEnd = cs[i - 1].end;
    if (prevEnd === null) return `${cs[i - 1].name} is open but is not the last chair`;
    if (cs[i].start < prevEnd) return `${cs[i].name} starts ${cs[i].start}, before ${cs[i - 1].name} ends ${prevEnd}`;
    const gapStart = addDays(prevEnd, 1);
    if (cs[i].start > gapStart && cs[i].start > WINDOW_START) {
      found.push({ start: gapStart < WINDOW_START ? WINDOW_START : gapStart, end: addDays(cs[i].start, -1) });
    }
  }
  if (cs.at(-1)!.end !== null) return 'the last chair is closed';
  const a = JSON.stringify(found);
  const b = JSON.stringify(vacancies);
  return a === b ? null : `gaps in the table ${a} vs documented ${b}`;
}

/** Senate stretches strictly increase and actually change party each time. */
function senateOrdered(ss: typeof SENATE): string | null {
  for (let i = 1; i < ss.length; i++) {
    if (ss[i].start <= ss[i - 1].start) return `stretch ${ss[i].start} is not after ${ss[i - 1].start}`;
    if (ss[i].party === ss[i - 1].party) return `stretch ${ss[i].start} repeats ${ss[i].party}`;
  }
  return ss[0].start <= congressStart(81) ? null : 'first stretch starts after the 81st Congress';
}

/** Terms tile the window, and each term's control and chairs tile the term. */
function termsTile(ts: Term[]): string | null {
  if (ts[0].start !== WINDOW_START) return `first term starts ${ts[0].start}`;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const next = ts[i + 1];
    if (next && t.end !== next.start) return `${t.id} ends ${t.end}, ${next.id} starts ${next.start}`;
    if (!next && t.end !== null) return 'the last term is closed';
    if (t.control[0].start !== t.start) return `${t.id}: control starts ${t.control[0].start}`;
    for (let j = 1; j < t.control.length; j++) {
      if (t.control[j - 1].end !== t.control[j].start) return `${t.id}: control gap at ${t.control[j].start}`;
    }
    if (t.control.at(-1)!.end !== t.end) return `${t.id}: control ends ${t.control.at(-1)!.end}`;
    if (t.presidents.length < 1 || t.fedChairs.length < 1) return `${t.id}: missing a president or a chair`;
  }
  return null;
}

// --- the shipped data ---------------------------------------------------------

const terms = buildTerms(TODAY);

check('presidencies run end to end with no gap or overlap', presidenciesTile(PRESIDENCIES) === null,
  presidenciesTile(PRESIDENCIES) ?? `${PRESIDENCIES.length} presidencies`);
check('Fed chairs run in order, and every gap is a documented vacancy',
  chairsTile(FED_CHAIRS, FED_VACANCIES) === null,
  chairsTile(FED_CHAIRS, FED_VACANCIES) ?? `${FED_CHAIRS.length} chairs, ${FED_VACANCIES.length} vacancies`);
check('Senate control changes are in order and each is a real change',
  senateOrdered(SENATE) === null, senateOrdered(SENATE) ?? `${SENATE.length} stretches`);
check('every Congress from the 81st to the current one has a House majority',
  Array.from({ length: 119 - 81 + 1 }, (_, i) => 81 + i).every((n) => HOUSE[n] === 'D' || HOUSE[n] === 'R'),
  `${Object.keys(HOUSE).length} Congresses`);
check('terms tile the window, and control tiles each term', termsTile(terms) === null,
  termsTile(terms) ?? `${terms.length} terms`);

// --- the same rules must fail on broken data ----------------------------------

const brokenPres = PRESIDENCIES.map((p) => ({ ...p }));
brokenPres[4].end = '1974-08-10'; // Nixon a day too long
check('(the presidency rule catches a one-day overlap)', presidenciesTile(brokenPres) !== null,
  presidenciesTile(brokenPres) ?? 'NOT CAUGHT');

const brokenChairs = FED_CHAIRS.map((c) => ({ ...c }));
brokenChairs[6].end = '2014-01-30'; // opens an undocumented one-day gap
check('(the chair rule catches an undocumented gap)', chairsTile(brokenChairs, FED_VACANCIES) !== null,
  chairsTile(brokenChairs, FED_VACANCIES) ?? 'NOT CAUGHT');

const brokenSenate = SENATE.map((s) => ({ ...s }));
brokenSenate[8].party = 'R'; // Jeffords never happened
check('(the Senate rule catches a stretch that does not change party)', senateOrdered(brokenSenate) !== null,
  senateOrdered(brokenSenate) ?? 'NOT CAUGHT');

const brokenTerms = buildTerms(TODAY).map((t) => ({ ...t, control: t.control.map((c) => ({ ...c })) }));
brokenTerms[8].control[0].end = addDays(brokenTerms[8].control[0].end!, -1);
check('(the term rule catches a one-day hole in control)', termsTile(brokenTerms) !== null,
  termsTile(brokenTerms) ?? 'NOT CAUGHT');

// --- facts read off the source pages ------------------------------------------

const byId = Object.fromEntries(terms.map((t) => [t.id, t]));
const ids = terms.map((t) => t.id);
check('term ids read as expected',
  ['1949-truman', '1961-kennedy-johnson', '1973-nixon-ford', '1981-reagan-1', '1989-bush', '2017-trump-1', '2025-trump-2']
    .every((id) => ids.includes(id)),
  ids.join(', '));

check('20 terms from Truman (1949) to the current one', terms.length === 20, String(terms.length));
check('the term in progress is not counted as complete',
  !terms.at(-1)!.complete && terms.slice(0, -1).every((t) => t.complete),
  `${terms.filter((t) => t.complete).length} complete`);
check('every term has presidents of one party only', terms.every((t) => new Set(t.presidents.map((p) => p.party)).size === 1));

check('Kennedy to Johnson on 22 Nov 1963, inside one term',
  byId['1961-kennedy-johnson']?.presidents.map((p) => `${p.name} ${p.start}`).join(' / ')
    === 'John F. Kennedy 1961-01-20 / Lyndon B. Johnson 1963-11-22');
check('Nixon to Ford on 9 Aug 1974, inside one term',
  presidentOn('1974-08-08').name === 'Richard M. Nixon' && presidentOn('1974-08-09').name === 'Gerald R. Ford');

check('Reagan\'s first term: Democratic House, Republican Senate',
  houseOn('1982-06-01') === 'D' && senateOn('1982-06-01').party === 'R');
check('the 83rd Congress: Republicans held both chambers',
  houseOn('1954-01-01') === 'R' && senateOn('1954-01-01').party === 'R');
check('2001 Senate: D on 3 Jan (Gore), R on 20 Jan (Cheney), D on 6 June (Jeffords)',
  senateOn('2001-01-03').party === 'D' && senateOn('2001-01-19').party === 'D'
  && senateOn('2001-01-20').party === 'R' && senateOn('2001-06-05').party === 'R'
  && senateOn('2001-06-06').party === 'D');
check('2021 Senate: R until 20 Jan, then D by the Vice President',
  senateOn('2021-01-19').party === 'R' && senateOn('2021-01-20').party === 'D'
  && /Harris/.test(senateOn('2021-01-20').note ?? ''));
check('every 50-50 Senate carries a note saying how control was decided',
  SENATE.filter((s) => ['2001-01-03', '2001-01-20', '2021-01-20'].includes(s.start)).every((s) => /50-50/.test(s.note ?? '')));
// Cheney's tie-break from inauguration day, Jeffords from 6 June 2001, then
// the 108th Congress with Republicans back in the Senate.
check('Bush (2001): control changes are split out within the term',
  byId['2001-bush-1']?.control.map((c) => `${c.start}:${c.house}${c.senate}`).join(' ')
    === '2001-01-20:RR 2001-06-06:RD 2003-01-03:RR',
  byId['2001-bush-1']?.control.map((c) => `${c.start} H${c.house} S${c.senate}`).join(' | '));

check('Volcker followed Miller on 6 Aug 1979, the shared handover day',
  fedChairOn('1979-08-06')?.name === 'G. William Miller' && fedChairOn('1979-08-07')?.name === 'Paul A. Volcker');
check('no chair between Burns and Miller (Feb to early Mar 1978)', fedChairOn('1978-02-15') === null);
check('Warsh has chaired the Fed since 22 May 2026', fedChairOn('2026-06-01')?.name === 'Kevin Warsh');

// --- the appointment rule -----------------------------------------------------

const firsts = FED_CHAIRS.map((c) => `${c.name.replace(/ Jr\.$/, '').split(' ').at(-1)}:${firstAppointedBy(c)}`);
check('first appointments derive from the president in office on the start date',
  firsts.join(' ') === 'McCabe:D Martin:D Burns:R Miller:D Volcker:D Greenspan:R Bernanke:R Yellen:D Powell:R Warsh:R',
  firsts.join(' '));

// Who appointed is derived from the received date; the name written in the
// record has to agree with it, so a typo in either is caught.
const wrongPresident = FED_APPOINTMENTS.filter((a) => presidentOn(a.received).name !== a.president);
check('every appointment names the president in office when the Senate received it',
  wrongPresident.length === 0, wrongPresident.map((a) => a.citation).join(', ') || `${FED_APPOINTMENTS.length} records`);
const chairNames = new Set(FED_CHAIRS.map((c) => c.name));
check('every appointment is of a chair in the Board\'s table',
  FED_APPOINTMENTS.every((a) => chairNames.has(a.chair)));
const outside = FED_APPOINTMENTS.filter((a) => {
  const c = FED_CHAIRS.find((x) => x.name === a.chair)!;
  return a.kind === 'reappointment' && a.confirmed !== null && (a.confirmed < c.start || (c.end !== null && a.confirmed > c.end));
});
check('every reappointment was confirmed while that chair was serving',
  outside.length === 0, outside.map((a) => a.citation).join(', ') || 'all inside');
const firstMismatch = FED_APPOINTMENTS.filter((a) => a.kind === 'first'
  && presidentOn(a.received).party !== firstAppointedBy(FED_CHAIRS.find((c) => c.name === a.chair)!));
check('each recorded first appointment agrees with the derived one',
  firstMismatch.length === 0, firstMismatch.map((a) => a.citation).join(', ') || 'agree');

const party = (d: string) => { try { return fedAppointingParty(d); } catch { return 'REFUSED'; } };
const cases: [string, string, Party | null | 'REFUSED'][] = [
  ['1952-01-01', 'Martin, first appointed by Truman', 'D'],
  ['1960-01-01', 'Martin after April 1955: unsourced, so refused', 'REFUSED'],
  ['1972-01-01', 'Burns, first appointed by Nixon', 'R'],
  ['1975-01-01', 'Burns after February 1974: unsourced, so refused', 'REFUSED'],
  ['1978-02-15', 'no chair', null],
  ['1983-07-20', 'Volcker before the Senate confirmed Reagan\'s reappointment', 'D'],
  ['1983-07-27', 'Volcker on the day it was confirmed', 'R'],
  ['1996-05-01', 'Greenspan pro tempore, Bush\'s appointment still in force', 'R'],
  ['1996-06-20', 'Greenspan once Clinton\'s reappointment was confirmed', 'D'],
  ['2005-01-01', 'Greenspan after Bush\'s 2004 reappointment', 'R'],
  ['2010-06-01', 'Bernanke after Obama\'s reappointment', 'D'],
  ['2021-01-01', 'Powell, first appointed by Trump', 'R'],
  ['2022-06-01', 'Powell after Biden\'s reappointment', 'D'],
  ['2026-06-01', 'Warsh, appointed by Trump', 'R'],
];
for (const [d, what, want] of cases) {
  const got = party(d);
  check(`appointing party on ${d}: ${what}`, got === want, `got ${got}`);
}
check('the gap list names exactly the reappointments that refuse',
  KNOWN_GAPS.length === 1 && UNSOURCED_REAPPOINTMENTS.length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
