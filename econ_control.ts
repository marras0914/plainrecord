/**
 * PlainRecord: who held each office, 1949 to now (the economy module)
 *
 * Hand-transcribed from official pages, one table per page, and every row
 * carries the URL it came from. The per-term view the module uses is DERIVED
 * from these tables by buildTerms(), never typed twice, so a correction is made
 * in one place.
 *
 *   PRESIDENCIES  House Historian, "Presidents, Vice Presidents, and
 *                 Coinciding Sessions of Congress"
 *   HOUSE         House Historian, "Party Divisions of the House of
 *                 Representatives, 1789 to Present"
 *   SENATE        Senate Historical Office, "Complete List of Majority and
 *                 Minority Leaders", which states who ORGANIZED the chamber,
 *                 with its footnotes for the changes inside a Congress. Seat
 *                 counts are the wrong measure: in the 83rd Congress Democrats
 *                 at times held more seats while Republicans kept control.
 *   FED_CHAIRS    Federal Reserve Board, "Board Members, 1914-Present",
 *                 the table of Chairmen of the Board of Governors
 *
 * The raw pages were saved to data/econ_sources/ (gitignored) on 12 Nov 2026
 * and read as text, not through a summarizer, because a summarizer can
 * invent a date.
 *
 * DATES. ISO strings. A stretch covers start up to but not including the next
 * stretch's start; the final one is open (end: null). Fed chair tenures are the
 * exception and are INCLUSIVE of both ends, because that is how the Board's
 * table reads: handovers share a day (Volcker and Miller both list 6 Aug 1979)
 * and real gaps show as missing days (see FED_VACANCIES).
 *
 * THE RULES FROM outcomes.ts AND stated_positions.ts APPLY. Nothing goes in that
 * has not been read on its source page. Where a fact could not be sourced it is
 * listed in KNOWN_GAPS and anything that depends on it refuses to compute.
 *
 * Last reviewed: 2026-11-12.
 */

export type Party = 'D' | 'R';

const SRC = {
  presidents: 'https://history.house.gov/Institution/Presidents-Coinciding/Presidents-Coinciding/',
  house: 'https://history.house.gov/Institution/Party-Divisions/Party-Divisions/',
  senate: 'https://www.senate.gov/senators/majority-minority-leaders.htm',
  senateDivision: 'https://www.senate.gov/about/parties-leadership/party-division.htm',
  fed: 'https://www.federalreserve.gov/aboutthefed/bios/board/boardmembership.htm',
} as const;

/** The window. Truman's elected term, the start Blinder and Watson use. */
export const WINDOW_START = '1949-01-20';

// ---------------------------------------------------------------------------
// Presidencies
// ---------------------------------------------------------------------------

export interface Presidency {
  name: string;
  party: Party;
  start: string;
  /** Exclusive. null for the president in office. */
  end: string | null;
  sourceUrl: string;
}

/**
 * Each row is one person's continuous time in office, as the House Historian
 * lists them (it splits by vice president; those splits are merged here, since
 * the vice president does not change who holds the presidency).
 */
export const PRESIDENCIES: Presidency[] = [
  { name: 'Harry S. Truman', party: 'D', start: '1945-04-12', end: '1953-01-20', sourceUrl: SRC.presidents },
  { name: 'Dwight D. Eisenhower', party: 'R', start: '1953-01-20', end: '1961-01-20', sourceUrl: SRC.presidents },
  { name: 'John F. Kennedy', party: 'D', start: '1961-01-20', end: '1963-11-22', sourceUrl: SRC.presidents },
  { name: 'Lyndon B. Johnson', party: 'D', start: '1963-11-22', end: '1969-01-20', sourceUrl: SRC.presidents },
  { name: 'Richard M. Nixon', party: 'R', start: '1969-01-20', end: '1974-08-09', sourceUrl: SRC.presidents },
  { name: 'Gerald R. Ford', party: 'R', start: '1974-08-09', end: '1977-01-20', sourceUrl: SRC.presidents },
  { name: 'Jimmy Carter', party: 'D', start: '1977-01-20', end: '1981-01-20', sourceUrl: SRC.presidents },
  { name: 'Ronald Reagan', party: 'R', start: '1981-01-20', end: '1989-01-20', sourceUrl: SRC.presidents },
  { name: 'George H.W. Bush', party: 'R', start: '1989-01-20', end: '1993-01-20', sourceUrl: SRC.presidents },
  { name: 'William J. Clinton', party: 'D', start: '1993-01-20', end: '2001-01-20', sourceUrl: SRC.presidents },
  { name: 'George W. Bush', party: 'R', start: '2001-01-20', end: '2009-01-20', sourceUrl: SRC.presidents },
  { name: 'Barack Obama', party: 'D', start: '2009-01-20', end: '2017-01-20', sourceUrl: SRC.presidents },
  { name: 'Donald J. Trump', party: 'R', start: '2017-01-20', end: '2021-01-20', sourceUrl: SRC.presidents },
  { name: 'Joseph R. Biden Jr.', party: 'D', start: '2021-01-20', end: '2025-01-20', sourceUrl: SRC.presidents },
  { name: 'Donald J. Trump', party: 'R', start: '2025-01-20', end: null, sourceUrl: SRC.presidents },
];

// ---------------------------------------------------------------------------
// Congress
// ---------------------------------------------------------------------------

/**
 * Every Congress in the window convened on 3 January of an odd year, per the
 * Senate's party-division page ("1/3/1949 to 1/3/1951" through "1/3/2025 to
 * 1/3/2027"), so the start date is computed rather than typed 39 times.
 */
export const congressStart = (n: number): string => `${1949 + (n - 81) * 2}-01-03`;
export const FIRST_CONGRESS = 81;

/**
 * The House majority, by Congress, from the seat counts at the start of each
 * Congress. The House Historian's table shows no change of majority inside any
 * Congress in this window (its one such footnote is the 72nd, in 1931).
 */
export const HOUSE: Record<number, Party> = {
  81: 'D', 82: 'D', 83: 'R', 84: 'D', 85: 'D', 86: 'D', 87: 'D', 88: 'D', 89: 'D',
  90: 'D', 91: 'D', 92: 'D', 93: 'D', 94: 'D', 95: 'D', 96: 'D', 97: 'D', 98: 'D',
  99: 'D', 100: 'D', 101: 'D', 102: 'D', 103: 'D', 104: 'R', 105: 'R', 106: 'R',
  107: 'R', 108: 'R', 109: 'R', 110: 'D', 111: 'D', 112: 'R', 113: 'R', 114: 'R',
  115: 'R', 116: 'D', 117: 'D', 118: 'R', 119: 'R',
};
export const HOUSE_SOURCE = SRC.house;

export interface SenateStretch {
  start: string;
  party: Party;
  /** Why control sits where it does, when a reader might reasonably dispute it. */
  note: string | null;
  sourceUrl: string;
}

/**
 * Who organized the Senate, as a list of changes. Each stretch runs until the
 * next one starts. Only CHANGES of control are listed; a new Congress with the
 * same majority is not a new stretch.
 */
export const SENATE: SenateStretch[] = [
  { start: '1949-01-03', party: 'D', note: null, sourceUrl: SRC.senate },
  { start: '1953-01-03', party: 'R', note: 'Republicans organized the Senate throughout the 83rd Congress although deaths and replacements at times left Democrats with more seats.', sourceUrl: SRC.senateDivision },
  { start: '1955-01-03', party: 'D', note: null, sourceUrl: SRC.senate },
  { start: '1981-01-03', party: 'R', note: null, sourceUrl: SRC.senate },
  { start: '1987-01-03', party: 'D', note: null, sourceUrl: SRC.senate },
  { start: '1995-01-03', party: 'R', note: null, sourceUrl: SRC.senate },
  { start: '2001-01-03', party: 'D', note: 'Senate split 50-50; majority to the Democrats by the tie-breaking vote of outgoing Vice President Gore.', sourceUrl: SRC.senate },
  { start: '2001-01-20', party: 'R', note: 'Senate split 50-50; majority to the Republicans by the tie-breaking vote of Vice President Cheney.', sourceUrl: SRC.senate },
  { start: '2001-06-06', party: 'D', note: 'Senator Jeffords left the Republican Party, effective 6 June 2001, and caucused with the Democrats.', sourceUrl: SRC.senate },
  { start: '2003-01-03', party: 'R', note: null, sourceUrl: SRC.senate },
  { start: '2007-01-03', party: 'D', note: null, sourceUrl: SRC.senate },
  { start: '2015-01-03', party: 'R', note: null, sourceUrl: SRC.senate },
  { start: '2021-01-20', party: 'D', note: 'Senate split 50-50 after the Georgia runoffs; majority to the Democrats by the tie-breaking vote of Vice President Harris. Republicans held it from 3 to 20 January.', sourceUrl: SRC.senate },
  { start: '2025-01-03', party: 'R', note: null, sourceUrl: SRC.senate },
];

// ---------------------------------------------------------------------------
// The Federal Reserve
// ---------------------------------------------------------------------------

export interface FedChair {
  name: string;
  /** Inclusive, as the Board's table gives it. */
  start: string;
  /** Inclusive. null for the chair in office. */
  end: string | null;
  sourceUrl: string;
}

export const FED_CHAIRS: FedChair[] = [
  { name: 'Thomas B. McCabe', start: '1948-04-15', end: '1951-03-31', sourceUrl: SRC.fed },
  { name: 'William McChesney Martin Jr.', start: '1951-04-02', end: '1970-01-31', sourceUrl: SRC.fed },
  { name: 'Arthur F. Burns', start: '1970-02-01', end: '1978-01-31', sourceUrl: SRC.fed },
  { name: 'G. William Miller', start: '1978-03-08', end: '1979-08-06', sourceUrl: SRC.fed },
  { name: 'Paul A. Volcker', start: '1979-08-06', end: '1987-08-11', sourceUrl: SRC.fed },
  { name: 'Alan Greenspan', start: '1987-08-11', end: '2006-01-31', sourceUrl: SRC.fed },
  { name: 'Ben S. Bernanke', start: '2006-02-01', end: '2014-01-31', sourceUrl: SRC.fed },
  { name: 'Janet L. Yellen', start: '2014-02-03', end: '2018-02-03', sourceUrl: SRC.fed },
  { name: 'Jerome H. Powell', start: '2018-02-05', end: '2026-05-22', sourceUrl: SRC.fed },
  { name: 'Kevin Warsh', start: '2026-05-22', end: null, sourceUrl: SRC.fed },
];

/**
 * Days inside the window when the Board's table shows no chair. Written out so
 * that a change to FED_CHAIRS which opens or closes a gap fails the smoke test
 * instead of passing silently. Inclusive ranges.
 */
export const FED_VACANCIES: { start: string; end: string }[] = [
  { start: '1951-04-01', end: '1951-04-01' },
  { start: '1978-02-01', end: '1978-03-07' },
  { start: '2014-02-01', end: '2014-02-02' },
  { start: '2018-02-04', end: '2018-02-04' },
];

/**
 * Every Senate-confirmed appointment of a Fed chair that is on congress.gov
 * (its nomination records begin with the 97th Congress, 1981), read through the
 * congress.gov API on 12 Nov 2026.
 *
 * WHO APPOINTED is not typed: it is the president in office on the day the
 * Senate received the nomination, and the smoke test checks that against the
 * name written here. IN FORCE FROM is the day the Senate confirmed it. Until
 * then the previous appointment stands, which is how a chair serving "pro
 * tempore" between terms (Greenspan, March to June 1996) is counted.
 *
 * Where a nomination was returned to the President at a session's end and sent
 * again, the record is the one that was confirmed, and the returned one is
 * named in `note`.
 */
export interface FedAppointment {
  chair: string;
  president: string;
  received: string;
  /** null when congress.gov records no confirmation yet. */
  confirmed: string | null;
  kind: 'first' | 'reappointment';
  citation: string;
  note: string | null;
  sourceUrl: string;
}

const PN = (congress: string, n: number) => `https://www.congress.gov/nomination/${congress}-congress/${n}`;

export const FED_APPOINTMENTS: FedAppointment[] = [
  { chair: 'Paul A. Volcker', president: 'Ronald Reagan', received: '1983-07-08', confirmed: '1983-07-27', kind: 'reappointment', citation: 'PN360, 98th Congress', note: 'Confirmed 84-16.', sourceUrl: PN('98th', 360) },
  { chair: 'Alan Greenspan', president: 'Ronald Reagan', received: '1987-07-15', confirmed: '1987-08-03', kind: 'first', citation: 'PN510, 100th Congress', note: 'Confirmed 91-2.', sourceUrl: PN('100th', 510) },
  { chair: 'Alan Greenspan', president: 'George H.W. Bush', received: '1991-10-17', confirmed: '1992-02-27', kind: 'reappointment', citation: 'PN708, 102nd Congress', note: 'A recess appointment preceded this nomination ("to which position he was appointed during the last recess of the Senate"); its date is not in the record. An earlier nomination, PN503 (received 1991-07-19), had no action. Same president either way.', sourceUrl: PN('102nd', 708) },
  { chair: 'Alan Greenspan', president: 'William J. Clinton', received: '1996-03-15', confirmed: '1996-06-20', kind: 'reappointment', citation: 'PN951, 104th Congress', note: 'Confirmed 91-7.', sourceUrl: PN('104th', 951) },
  { chair: 'Alan Greenspan', president: 'William J. Clinton', received: '2000-01-24', confirmed: '2000-02-03', kind: 'reappointment', citation: 'PN729, 106th Congress', note: 'Confirmed 89-4.', sourceUrl: PN('106th', 729) },
  { chair: 'Alan Greenspan', president: 'George W. Bush', received: '2004-05-18', confirmed: '2004-06-17', kind: 'reappointment', citation: 'PN1642, 108th Congress', note: 'Confirmed by voice vote.', sourceUrl: PN('108th', 1642) },
  { chair: 'Ben S. Bernanke', president: 'George W. Bush', received: '2005-11-01', confirmed: '2006-01-31', kind: 'first', citation: 'PN1026, 109th Congress', note: 'Confirmed by voice vote.', sourceUrl: PN('109th', 1026) },
  { chair: 'Ben S. Bernanke', president: 'Barack Obama', received: '2009-09-17', confirmed: '2010-01-28', kind: 'reappointment', citation: 'PN959, 111th Congress', note: 'Confirmed 70-30.', sourceUrl: PN('111th', 959) },
  { chair: 'Janet L. Yellen', president: 'Barack Obama', received: '2013-10-09', confirmed: '2014-01-06', kind: 'first', citation: 'PN921, 113th Congress', note: 'Confirmed 56-26.', sourceUrl: PN('113th', 921) },
  { chair: 'Jerome H. Powell', president: 'Donald J. Trump', received: '2018-01-08', confirmed: '2018-01-23', kind: 'first', citation: 'PN1353, 115th Congress', note: 'Confirmed 84-13. First sent as PN1201 (received 2017-11-02), returned at the end of the session.', sourceUrl: PN('115th', 1353) },
  { chair: 'Jerome H. Powell', president: 'Joseph R. Biden Jr.', received: '2022-01-04', confirmed: '2022-05-12', kind: 'reappointment', citation: 'PN1522, 117th Congress', note: 'Confirmed 80-19. First sent as PN1435 (received 2021-12-02), returned at the end of the session.', sourceUrl: PN('117th', 1522) },
  { chair: 'Kevin Warsh', president: 'Donald J. Trump', received: '2026-03-04', confirmed: null, kind: 'first', citation: 'PN855-1, 119th Congress', note: 'congress.gov showed no actions on this record on 12 Nov 2026, though the Board lists Warsh as chair from 22 May 2026.', sourceUrl: PN('119th', 855) },
];

/**
 * Redesignations before the 1977 Reform Act, each from the Board's own
 * announcement in the Federal Reserve Bulletin, read on FRASER on 14 Nov 2026
 * (through a browser: FRASER times out for scripts). Before 1977 the President
 * designated the chair by Order, without the Senate, so these are not in
 * congress.gov or the Congressional Record (see the note on KNOWN_GAPS).
 *
 * WHO is written as the Bulletin names or dates it, and the smoke test checks
 * it against the president in office on the Order's date. FROM is the start of
 * the four-year term the Order names; until then the previous designation
 * stands.
 */
export interface FedDesignation {
  chair: string;
  president: string;
  /** The date of the President's Order, or null where the source gives only the month. */
  ordered: string | null;
  from: string;
  quote: string;
  sourceUrl: string;
}

const BULLETIN = (issue: string, page: number) => `https://fraser.stlouisfed.org/title/federal-reserve-bulletin-62/${issue}?page=${page}`;

export const FED_DESIGNATIONS: FedDesignation[] = [
  { chair: 'William McChesney Martin Jr.', president: 'Dwight D. Eisenhower', ordered: '1955-03-11', from: '1955-04-01',
    quote: 'The President of the United States on March 11, 1955, issued an Order redesignating Mr. Wm. McC. Martin, Jr., as Chairman of the Board of Governors of the Federal Reserve System, to serve as such for a term of four years from April 1, 1955',
    sourceUrl: BULLETIN('march-1955-21243', 30) },
  { chair: 'William McChesney Martin Jr.', president: 'Dwight D. Eisenhower', ordered: '1959-03-12', from: '1959-04-01',
    quote: 'The President of the United States on March 12, 1959, issued an Order redesignating Mr. Wm. McC. Martin, Jr., as Chairman of the Board of Governors of the Federal Reserve System, to serve as such for a term of four years from April 1, 1959',
    sourceUrl: BULLETIN('march-1959-21291', 19) },
  // The Order's day is not in hand: the April 1967 Bulletin names the month
  // and the President, and Kennedy announced it at his news conference of
  // 7 February 1963 (presidency.ucsb.edu/documents/the-presidents-news-conference-157).
  { chair: 'William McChesney Martin Jr.', president: 'John F. Kennedy', ordered: null, from: '1963-04-01',
    quote: 'Mr. Martin was again designated Chairman of the Board in March 1959 by President Eisenhower and in March 1963 by President Kennedy.',
    sourceUrl: BULLETIN('april-1967-21388', 93) },
  { chair: 'William McChesney Martin Jr.', president: 'Lyndon B. Johnson', ordered: '1967-03-30', from: '1967-04-01',
    quote: 'The President of the United States on March 30, 1967, issued an Order redesignating Mr. William McChesney Martin, Jr., as Chairman of the Board of Governors of the Federal Reserve System, to serve as such for a term of 4 years from April 1, 1967',
    sourceUrl: BULLETIN('april-1967-21388', 93) },
  { chair: 'Arthur F. Burns', president: 'Richard M. Nixon', ordered: '1974-01-28', from: '1974-02-01',
    quote: 'The President of the United States on January 28, 1974, issued an Order redesignating Arthur F. Burns as Chairman of the Board of Governors of the Federal Reserve System, to serve as such for a term of 4 years from February 1, 1974',
    sourceUrl: BULLETIN('february-1974-21470', 100) },
];

/**
 * Redesignations still unsourced, by the date the chair's previous term ran
 * out: from then on, fedAppointingParty() throws rather than guess. Empty
 * since 14 Nov 2026, when the Bulletin supplied all five; kept so a future
 * gap is recorded the same way.
 */
export const UNSOURCED_REAPPOINTMENTS: { chair: string; from: string }[] = [];

/**
 * What could not be sourced, and what refuses to compute because of it.
 *
 * The party of the president who appointed the chair is the plan's third
 * grouping. A chair's FIRST appointment can be derived: the president in office
 * on the day the chair took office (checked for every chair in the smoke test).
 * Reappointments from 1981 on are in FED_APPOINTMENTS. Those before are not.
 *
 * DO NOT LOOK FOR THEM IN THE SENATE'S RECORDS. Before the Federal Reserve
 * Reform Act of 1977 the chair was DESIGNATED by the President from among the
 * governors, without Senate confirmation (the Board's own membership page says
 * so: the Banking Act of 1935 "required the President to designate one of the
 * persons appointed as 'chairman'", and only the 1977 Act added "by and with
 * the advice and consent of the Senate"). So Martin's and Burns's renewals are
 * presidential designations, not nominations. This was learned the hard way:
 * 34 Senate days of the bound Congressional Record around Martin's 1955
 * renewal were searched on 12 Nov 2026 and held nothing, while the same search
 * found an ordinary Board nomination (Shepardson, 18 Feb 1955), so the search
 * itself worked. The source to read is the President's own papers (a
 * designation announcement) or the Federal Reserve Bulletin; FRASER and the
 * Fed's history site both time out for scripted requests.
 */
export const KNOWN_GAPS: string[] = [];

/** The president in office on a date. */
export function presidentOn(date: string): Presidency {
  const p = PRESIDENCIES.find((x) => x.start <= date && (x.end === null || date < x.end));
  if (!p) throw new Error(`no president on ${date}`);
  return p;
}

/** A presidency by the name written in PRESIDENCIES. */
export function presidentByName(name: string): Presidency {
  const p = PRESIDENCIES.find((x) => x.name === name);
  if (!p) throw new Error(`no president named ${name}`);
  return p;
}

/** The Fed chair on a date, or null on a documented vacancy. */
export function fedChairOn(date: string): FedChair | null {
  return FED_CHAIRS.find((c) => c.start <= date && (c.end === null || date <= c.end)) ?? null;
}

/**
 * Party of the president whose appointment of the chair was in force on a
 * date: the most recent confirmed appointment of the sitting chair, or, before
 * any is on record, the chair's first appointment (derived). null on a
 * vacancy. THROWS for a date that falls after an unsourced reappointment could
 * have taken effect, rather than guessing.
 */
export function fedAppointingParty(date: string): Party | null {
  const chair = fedChairOn(date);
  return chair ? appointingPartyFor(chair, date) : null;
}

/**
 * The same, for a named chair. Separate because a handover day belongs to two
 * chairs in the Board's table (Powell's last day and Warsh's first are both 22
 * May 2026), and a date lookup returns whichever is listed first: the Fed lane
 * once showed Warsh under Biden's appointment of Powell because of it.
 */
export function appointingPartyFor(chair: FedChair, date: string): Party {
  const gap = UNSOURCED_REAPPOINTMENTS.find((u) => u.chair === chair.name && date >= u.from);
  if (gap) throw new Error(`unsourced: ${chair.name}'s reappointment from ${gap.from}`);
  // The latest renewal in force: a Senate-confirmed reappointment (1981 on) or
  // a presidential designation (before 1977), whichever took effect last.
  const renewals = [
    ...FED_APPOINTMENTS
      .filter((a) => a.chair === chair.name && a.kind === 'reappointment' && a.confirmed !== null && a.confirmed <= date)
      .map((a) => ({ from: a.confirmed!, party: presidentOn(a.received).party })),
    ...FED_DESIGNATIONS
      .filter((d) => d.chair === chair.name && d.from <= date)
      .map((d) => ({ from: d.from, party: presidentByName(d.president).party })),
  ].sort((a, b) => a.from.localeCompare(b.from));
  return renewals.length ? renewals[renewals.length - 1].party : firstAppointedBy(chair);
}

/** The party of the president who FIRST appointed each chair, derived, not typed. */
export function firstAppointedBy(chair: FedChair): Party {
  return presidentOn(chair.start).party;
}

/**
 * The Fed chair as a lane on a timeline: stretches of one chair under one
 * appointment, from WINDOW_START on. `party` is the appointing president's
 * party, or null where that is unsourced; vacancies are left as gaps. Built
 * from the same rules as fedAppointingParty(), so the lane and the grouping
 * cannot disagree.
 */
export function fedSegments(today: string = new Date().toISOString().slice(0, 10)): { start: string; end: string; chair: string; party: Party | null }[] {
  const out: { start: string; end: string; chair: string; party: Party | null }[] = [];
  for (const c of FED_CHAIRS) {
    const from = c.start < WINDOW_START ? WINDOW_START : c.start;
    const to = c.end ?? today;
    if (to < WINDOW_START) continue;
    const cuts = new Set([from]);
    for (const a of FED_APPOINTMENTS) if (a.chair === c.name && a.kind === 'reappointment' && a.confirmed && a.confirmed > from && a.confirmed <= to) cuts.add(a.confirmed);
    for (const d of FED_DESIGNATIONS) if (d.chair === c.name && d.from > from && d.from <= to) cuts.add(d.from);
    for (const u of UNSOURCED_REAPPOINTMENTS) if (u.chair === c.name && u.from > from && u.from <= to) cuts.add(u.from);
    const sorted = [...cuts].sort();
    sorted.forEach((s, i) => {
      let party: Party | null;
      try { party = appointingPartyFor(c, s); } catch { party = null; }
      out.push({ start: s, end: sorted[i + 1] ?? to, chair: c.name, party });
    });
  }
  return out;
}

export function houseOn(date: string): Party {
  let n = FIRST_CONGRESS;
  while (HOUSE[n + 1] !== undefined && congressStart(n + 1) <= date) n++;
  if (date < congressStart(FIRST_CONGRESS)) throw new Error(`before the window: ${date}`);
  return HOUSE[n];
}

export function senateOn(date: string): SenateStretch {
  let hit: SenateStretch | null = null;
  for (const s of SENATE) if (s.start <= date) hit = s;
  if (!hit) throw new Error(`before the window: ${date}`);
  return hit;
}

// ---------------------------------------------------------------------------
// Terms, derived
// ---------------------------------------------------------------------------

export interface Term {
  /** '1981-reagan-1' */
  id: string;
  start: string;
  /** Exclusive. null for the term in progress. */
  end: string | null;
  /** One president, or two when the office changed hands inside the term. */
  presidents: { name: string; party: Party; start: string }[];
  party: Party;
  /** Stretches of unchanged House and Senate control, clipped to the term. */
  control: { start: string; end: string | null; house: Party; senate: Party; note: string | null }[];
  fedChairs: { name: string; start: string; end: string | null }[];
  complete: boolean;
}

/**
 * The elected terms, four years from each inauguration. A term in which the
 * office passed to the vice president (Kennedy to Johnson, Nixon to Ford) stays
 * ONE term, because both presidents were of the same party and the measurement
 * window is the term. The methodology page must say so, and say whether Blinder
 * and Watson split those two the same way.
 */
const TERM_STARTS = [
  '1949-01-20', '1953-01-20', '1957-01-20', '1961-01-20', '1965-01-20', '1969-01-20',
  '1973-01-20', '1977-01-20', '1981-01-20', '1985-01-20', '1989-01-20', '1993-01-20',
  '1997-01-20', '2001-01-20', '2005-01-20', '2009-01-20', '2013-01-20', '2017-01-20',
  '2021-01-20', '2025-01-20',
];

const slug = (name: string) => name.split(' ').filter((w) => !/^(Jr\.|[A-Z]\.|[A-Z]\.[A-Z]\.)$/.test(w)).at(-1)!.toLowerCase();

export function buildTerms(today: string = new Date().toISOString().slice(0, 10)): Term[] {
  return TERM_STARTS.map((start, i) => {
    const end = TERM_STARTS[i + 1] ?? null;
    const inTerm = (d: string) => d >= start && (end === null || d < end);
    const presidents = PRESIDENCIES
      .filter((p) => (p.end === null || p.end > start) && (end === null || p.start < end))
      .map((p) => ({ name: p.name, party: p.party, start: p.start < start ? start : p.start }));
    const parties = new Set(presidents.map((p) => p.party));
    if (parties.size !== 1) throw new Error(`term ${start} has presidents of both parties`);

    // Every date where House, Senate or nothing changes, inside the term.
    const cuts = new Set<string>([start]);
    for (let n = FIRST_CONGRESS; HOUSE[n] !== undefined; n++) if (inTerm(congressStart(n))) cuts.add(congressStart(n));
    for (const s of SENATE) if (inTerm(s.start)) cuts.add(s.start);
    const sorted = [...cuts].sort();
    const control = sorted.map((c, j) => ({
      start: c,
      end: sorted[j + 1] ?? end,
      house: houseOn(c),
      senate: senateOn(c).party,
      note: senateOn(c).note,
    }))
      // Merge neighbours where nothing changed (a new Congress, same majorities).
      .reduce<Term['control']>((acc, s) => {
        const last = acc.at(-1);
        if (last && last.house === s.house && last.senate === s.senate && last.note === s.note) last.end = s.end;
        else acc.push({ ...s });
        return acc;
      }, []);

    const fedChairs = FED_CHAIRS
      .filter((c) => (c.end === null || c.end >= start) && (end === null || c.start < end))
      .map((c) => ({ name: c.name, start: c.start < start ? start : c.start, end: c.end }));

    // '1981-reagan-1', '1973-nixon-ford', '1949-truman'. The ordinal counts
    // only the single-president terms the same person began, so it appears
    // exactly when that person has more than one.
    const names = presidents.map((p) => slug(p.name));
    const own = TERM_STARTS.map((_, k) => k).filter((k) => {
      const s = TERM_STARTS[k];
      const e = TERM_STARTS[k + 1] ?? null;
      const ps = PRESIDENCIES.filter((p) => (p.end === null || p.end > s) && (e === null || p.start < e));
      return ps.length === 1 && ps[0].name === presidents[0].name;
    });
    const ordinal = presidents.length === 1 && own.length > 1 ? `-${own.indexOf(i) + 1}` : '';
    const id = `${start.slice(0, 4)}-${names.join('-')}${ordinal}`;

    return {
      id, start, end, presidents, party: presidents[0].party, control, fedChairs,
      complete: end !== null && end <= today,
    };
  });
}
