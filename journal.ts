/**
 * PlainRecord — Texas House Journal parser
 *
 * DATA_PIPELINE.md: "The House and Senate Journals are authoritative. Texas
 * members routinely file statements correcting how a vote was recorded, and those
 * corrections appear in the Journal, not necessarily in third-party mirrors.
 * Reconciliation is not optional."
 *
 * That warning is not hypothetical. Day 43 of 89R, Record No. 162 (HB 126):
 *
 *     STATEMENTS OF VOTE
 *     When Record No. 162 was taken, I was shown voting no. I intended to vote
 *     yes.
 *                                                                    Hinojosa
 *
 * Gina Hinojosa — one of the three candidates this project covers — is recorded
 * Nay and filed a statement saying she intended Yea. A scraped mirror carries the
 * Nay and nothing else.
 *
 * WHAT THIS MODULE DOES NOT DO: it never rewrites a vote from a statement. The
 * recorded vote is the official act and stays the vote; the statement is attached
 * alongside so the UI can show both. Silently flipping it would be inventing a
 * record, which is the same sin as getting it wrong in the first place — just
 * flattering instead of careless.
 *
 * Journals: https://journals.house.texas.gov/hjrnl/{session}/pdf/{SESSION}DAY{N}FINAL.PDF
 * Extract with:  pdftotext -layout -enc UTF-8   (without -enc, every accented
 * surname is mangled: Anchía, Gómez, Muñoz, Rodríguez Ramos, González.)
 *
 * Deterministic: no Math.random(), no Date, no I/O.
 */

export type VoteSide = 'yea' | 'nay' | 'present-not-voting' | 'absent-excused' | 'absent';

export interface JournalRecordVote {
  recordNumber: number;
  /** Normalized bill id, e.g. "HB 126". Null when the vote is not on a bill. */
  billId: string | null;
  /** Bill id exactly as printed, including any CS (committee substitute) prefix. */
  billIdRaw: string | null;
  /** e.g. "passed to engrossment", "adopted", "finally passed". */
  action: string;
  tally: { yeas: number; nays: number; presentNotVoting: number };
  members: Record<VoteSide, string[]>;
  /** Set when the printed tally disagrees with the length of the printed list. */
  tallyMismatch: string | null;
}

export interface JournalStatement {
  recordNumber: number;
  /** Journal surname form, e.g. "Hinojosa", "Bell, C.". */
  member: string;
  text: string;
  /** How the journal recorded them, when the statement says so. */
  shownAs: 1 | -1 | null;
  /** What they say they intended. */
  claimed: 1 | -1 | null;
}

export interface JournalDay {
  day: number | null;
  votes: JournalRecordVote[];
  statements: JournalStatement[];
  /** Anything the parser could not account for. Never silently dropped. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * pdftotext renders the thin space in bill references as the letter "i", so the
 * journal text contains "HBi126", "CSHBi102", "SBi14". Restore the space.
 */
export function normalizeBillRef(raw: string): string {
  return (
    raw
      .replace(/\b(CS)?(HB|SB|HCR|SCR|HJR|SJR|HR|SR)i(\d+)/g, (_m, cs, type, num) =>
        `${cs ?? ''}${type} ${num}`)
      // The same thin space lands inside member names: "Perez, M." renders as
      // "Perez,iM", which then resolves to nobody and costs that member the vote.
      .replace(/,i([A-Z])(?![a-z])/g, ', $1')
  );
}

/**
 * Strip a committee-substitute prefix. CSHB 102 and HB 102 are the same bill; a
 * substitute is a version, not a different measure, and the vote records against
 * the bill.
 */
export function stripCommitteeSubstitute(billId: string): string {
  return billId.replace(/^CS/, '');
}

const SIDE_LABELS: [RegExp, VoteSide][] = [
  [/^Yeas$/i, 'yea'],
  [/^Nays$/i, 'nay'],
  [/^Present,?\s*not voting$/i, 'present-not-voting'],
  [/^Absent,?\s*Excused$/i, 'absent-excused'],
  [/^Absent$/i, 'absent'],
];

function emptyMembers(): Record<VoteSide, string[]> {
  return { yea: [], nay: [], 'present-not-voting': [], 'absent-excused': [], absent: [] };
}

/**
 * Split a printed member list into names. The journal separates with semicolons
 * and ends with a period. Names may themselves contain a comma
 * ("Bell, C."), a space ("Harris Davila"), or a parenthesised role marker
 * ("Mr. Speaker(C)"), so the ONLY safe separator is the semicolon.
 */
/**
 * Cut a member list at its terminating period.
 *
 * The last list in a block has no following label to stop at, so a lazy match
 * runs to the end of the block and swallows whatever prose follows — in day 43
 * the Absent list ended up carrying an entire bill's second-reading text as a
 * "member name".
 *
 * Lists wrap across lines ending in ";" and finish with ".". The complication is
 * that a name can legitimately end in a period: "Bell, C." and "Mr. Speaker(C).".
 * So the cut point is a period NOT preceded by a lone capital letter (which would
 * be an initial), at end of line.
 */
export function boundList(raw: string): string {
  const m = /(?<![A-Z])\.\s*(?:\n|$)/.exec(raw);
  return m ? raw.slice(0, m.index) : raw;
}

/**
 * Remove running page furniture that a page break injects into the middle of a
 * member list. Left in, the surrounding names absorb it and become things like
 * "1 Davis, Y. 26 89th LEGISLATURE — REGULAR SESSION", which then fail to
 * resolve — silently costing that member the vote.
 *
 * Two forms appear:
 *   "1396  89th LEGISLATURE — REGULAR SESSION"
 *   "Monday, April 14, 2025  HOUSE JOURNAL — 43rd Day  1393"
 */
export function stripPageFurniture(raw: string): string {
  return raw
    .replace(/\d*\s*\d+(?:st|nd|rd|th)?\s+LEGISLATURE\s*[—–-]+\s*[A-Z ]*SESSION/gi, ' ')
    .replace(
      /(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,\s+\w+\s+\d+,\s+\d{4}\s*/gi,
      ' ',
    )
    .replace(/HOUSE\s+JOURNAL\s*[—–-]+\s*\d+(?:st|nd|rd|th)\s+Day/gi, ' ')
    .replace(/\b\d{3,5}\b/g, ' '); // stray page numbers
}

export function splitMemberList(raw: string): string[] {
  return stripPageFurniture(raw)
    .replace(/\s+/g, ' ')
    .replace(/\.\s*$/, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    // Guard against a list that ran past its end into bill prose. A member entry
    // is a surname, optionally with an initial or a "(C)" chair marker; it is
    // never 40 characters long and never contains a digit.
    .filter((s) => s.length <= 40 && !/\d/.test(s));
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Hyphen, en dash, or em dash — the journal PDFs use U+2014. */
const DASH = '[-–—]{1,2}';

/**
 * Anchor on the record marker, not on the sentence shape.
 *
 * An earlier version required "<subject> was <action> by (Record N)" and silently
 * missed a THIRD of the session: 2,755 of 4,169 record numbers parsed. The forms
 * it could not see, counted in the real text:
 *
 *   ", as amended, was passed to engrossment by (Record N)"   513  (comma breaks
 *                                                                  "<bill> was")
 *   "The motion to table prevailed by (Record N)"             144  (no "was")
 *   "... failed of adoption by (Record N)"                     78  (no "was")
 *   "The motion prevailed by (Record N)"                       16
 *
 * Matching the marker and then reading backwards for the bill reference is
 * robust to all of them, and to whatever phrasing turns up in another session.
 */
const RECORD_ANCHOR_RE =
  /by\s+\(Record\s+(\d+)\):\s*(\d+)\s+Yeas?,\s*(\d+)\s+Nays?(?:,\s*(\d+)\s+Present,?\s*not\s*voting)?/g;

/** Last bill reference appearing in a window of text, or null. */
function lastBillRef(window: string): string | null {
  const re = /(CS)?(HB|SB|HCR|SCR|HJR|SJR|HR|SR)\s*(\d+)/g;
  let last: string | null = null;
  for (const m of window.matchAll(re)) last = `${m[1] ?? ''}${m[2]} ${m[3]}`;
  return last;
}

/**
 * The member's name is right-aligned on its own line AFTER a blank line:
 *
 *     When Record No. 162 was taken, I was shown voting no. I intended to vote
 *     yes.
 *
 *                                                                     Hinojosa
 *
 * So the capture has to span blank lines and stop at the next statement or an
 * all-caps section heading. Stopping at the first blank line — the obvious
 * reading — drops every signature and leaves the statement unattributable.
 */
const STATEMENT_RE =
  /When\s+Record\s+No\.?\s+(\d+)\s+was\s+taken,\s*([\s\S]*?)(?=When\s+Record\s+No\.|\n[ \t]*[A-Z]{3}[A-Z .,'—-]{5,}\n|$)/g;

/**
 * Does a line look like a signature on a statement of vote?
 *
 * The loose version of this test ("short, no trailing punctuation") pulled in
 * running page headers ("1392  89th LEGISLATURE — REGULAR SESSION"), bill sponsor
 * lines ("(by R. Lopez, et al.)") and calendar fragments ("April 10 - HCR 65").
 * A signature is a plain surname: no digits, no parentheses, few words.
 */
export function looksLikeMemberName(line: string): boolean {
  const l = line.trim();
  if (l.length === 0 || l.length > 34) return false;
  if (/\d/.test(l)) return false;
  if (/[()]/.test(l)) return false;
  if (/[—–]/.test(l)) return false;
  if (/[.;:]$/.test(l) && !/\b[A-Z]\.$/.test(l)) return false;
  if (/\b(vote|record|desk|intended|would have)\b/i.test(l)) return false;
  if (l.split(/\s+/).length > 4) return false;
  // Reject ALL-CAPS lines. Signatures are mixed case ("Hinojosa", "Leo Wilson",
  // "Bell, C."); the journal's section headings are capitalised. A keyword
  // blocklist could not keep up — it let "REMARKS ORDERED PRINTED" and "SENT TO
  // THE GOVERNOR" through as members. The case rule is general.
  if (l === l.toUpperCase() && /[A-Z]{3}/.test(l)) return false;
  return /^[A-Z]/.test(l);
}

export function parseJournalDay(rawText: string, day: number | null = null): JournalDay {
  const text = normalizeBillRef(rawText);
  const warnings: string[] = [];
  // `day` is passed in rather than parsed: the journal body is full of page
  // numbers and an earlier attempt to sniff it read "1387" off a page header.

  // ---- record votes ----
  const votes: JournalRecordVote[] = [];
  const seen = new Set<number>();
  for (const m of text.matchAll(RECORD_ANCHOR_RE)) {
    const recordNumber = parseInt(m[1], 10);
    const yeas = parseInt(m[2], 10);
    const nays = parseInt(m[3], 10);
    const pnv = m[4] ? parseInt(m[4], 10) : 0;

    if (seen.has(recordNumber)) continue; // the journal repeats some headers
    seen.add(recordNumber);

    // Read backwards for the subject. Bounded, and cut at the previous sentence
    // so a bill named in an unrelated preceding sentence cannot be picked up.
    let window = text.slice(Math.max(0, m.index! - 220), m.index!);
    const lastBreak = Math.max(
      window.lastIndexOf('\n\n'),
      (() => {
        let p = -1;
        for (const b of window.matchAll(/[.;]\s+(?=[A-Z(])/g)) p = b.index! + b[0].length;
        return p;
      })(),
    );
    if (lastBreak > 0) window = window.slice(lastBreak);

    const subject = lastBillRef(window);
    const isBill = subject !== null;
    const action = window
      .replace(/\s+/g, ' ')
      .replace(/^.*?(?:(CS)?(?:HB|SB|HCR|SCR|HJR|SJR|HR|SR)\s*\d+)\s*,?\s*/, '')
      .trim()
      .slice(0, 60) || window.replace(/\s+/g, ' ').trim().slice(0, 60);

    // The member lists follow the tally line, up to the next record vote, the
    // next all-caps section heading, or a statements block.
    const after = text.slice(m.index! + m[0].length);
    const stop = after.search(
      /\n\s*[A-Z][A-Z .,'&\-]{12,}\n|\(Record\s+\d+\):|STATEMENTS? OF VOTE/,
    );
    const block = stop === -1 ? after.slice(0, 4000) : after.slice(0, stop);

    const members = emptyMembers();
    // Each list reads "Label — name; name; ..." and runs until the next label.
    // The separator is an EM DASH (U+2014), not two hyphens. A terminal renders
    // "—" as "--", which is exactly how the ASCII assumption slipped in and left
    // every member list silently empty while the tallies parsed fine.
    const LABEL = "(Yeas|Nays|Present,?\\s*not voting|Absent,?\\s*Excused|Absent)";
    const listRe = new RegExp(
      `${LABEL}\\s*${DASH}\\s*([\\s\\S]*?)(?=\\n\\s*${LABEL}\\s*${DASH}|$)`,
      'g',
    );
    for (const lm of block.matchAll(listRe)) {
      const label = lm[1].replace(/\s+/g, ' ').trim();
      const side = SIDE_LABELS.find(([re]) => re.test(label))?.[1];
      if (!side) { warnings.push(`record ${recordNumber}: unknown list label "${label}"`); continue; }
      // Only take the first occurrence of each label for a given record.
      if (members[side].length === 0) members[side] = splitMemberList(boundList(lm[2]));
    }

    let tallyMismatch: string | null = null;
    if (members.yea.length > 0 && members.yea.length !== yeas) {
      tallyMismatch = `printed ${yeas} Yeas but listed ${members.yea.length}`;
    } else if (members.nay.length > 0 && members.nay.length !== nays) {
      tallyMismatch = `printed ${nays} Nays but listed ${members.nay.length}`;
    }

    votes.push({
      recordNumber,
      billId: isBill ? stripCommitteeSubstitute(subject!) : null,
      billIdRaw: isBill ? subject : null,
      action,
      tally: { yeas, nays, presentNotVoting: pnv },
      members,
      tallyMismatch,
    });
  }

  // ---- statements of vote ----
  const statements: JournalStatement[] = [];
  for (const m of text.matchAll(STATEMENT_RE)) {
    const recordNumber = parseInt(m[1], 10);
    const body = m[2];


    // The member's name is right-aligned on its own line at the end of the block.
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    let member = '';
    let nameIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (looksLikeMemberName(lines[i])) { member = lines[i]; nameIdx = i; break; }
    }
    // The statement ENDS at its signature. The block boundary cannot be relied on
    // for this: a following heading like "HB 5424 ON SECOND READING" starts with
    // "HB" and does not match an all-caps stop, so the capture ran on and carried
    // a whole unrelated bill's text into the quoted statement.
    const statementText =
      nameIdx > 0 ? lines.slice(0, nameIdx).join(' ') : lines.join(' ');
    if (!member) {
      warnings.push(`record ${recordNumber}: statement of vote with no attributable member`);
      continue;
    }

    const flat = statementText.replace(/\s+/g, ' ').trim();
    const shown = /shown voting (yes|no|nay|yea)/i.exec(flat);
    const intended = /(?:intended to vote|would have voted)\s+(yes|no|nay|yea)/i.exec(flat);
    const yn = (s: string | undefined): 1 | -1 | null =>
      s === undefined ? null : /^(yes|yea)$/i.test(s) ? 1 : -1;

    statements.push({
      recordNumber,
      member,
      text: flat,
      shownAs: yn(shown?.[1]),
      claimed: yn(intended?.[1]),
    });
  }

  return { day, votes, statements, warnings };
}

// ---------------------------------------------------------------------------
// Name resolution
// ---------------------------------------------------------------------------

/**
 * The journal identifies members by surname, disambiguating with a first initial
 * only when it must ("Bell, C." vs "Bell, K."). Resolving those to roster ids has
 * to be strict: a wrong resolution attributes a real person's vote to someone
 * else, which is the failure this whole reconciliation exists to prevent. So an
 * ambiguous name is REFUSED, not guessed.
 *
 * Hazards actually present in 89R:
 *   "Harris" and "Harris Davila"      — one surname is a prefix of another
 *   "Bell, C." / "Bell, K."           — initial-disambiguated
 *   "Davis, A." / "Davis, Y."
 *   "Morales, C." / "Morales, E." / "Morales Shaw"
 *   "Garcia, J." / "Garcia, L." / "Garcia Hernandez"
 *   "Mr. Speaker(C)"                  — the chair, not a district member
 *   "Anchía", "Gómez", "Muñoz"        — accents, which need -enc UTF-8
 */
export interface NameResolution {
  resolved: Map<string, string>;
  unresolved: { journalName: string; reason: string; candidates: string[] }[];
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normName = (s: string) =>
  stripAccents(s).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

interface RosterEntry {
  id: string;
  name: string;
  first: string;
  /** The member's own surname, e.g. "leo wilson" for Terri Leo-Wilson. */
  primary: string;
}

export interface ResolveOptions {
  /**
   * Break an ambiguous surname in favour of a member who is known to have voted
   * in this session. A roster built from chamber membership over-includes
   * departed members whose end_date was never recorded: 89R's House roster
   * carries 179 people for 150 seats, which made "Dutton" (Harold, sitting vs
   * Jill, departed) and "Thompson" (Senfronia vs Ed) ambiguous and cost those
   * members every vote. Where exactly one candidate voted, that is the member.
   *
   * Genuinely ambiguous cases — "King" (Ken and Tracy, neither observed voting)
   * and "Johnson" (Ann, Jarvis) — stay refused. They need a curated alias,
   * logged, not a guess.
   */
  preferIds?: Set<string>;
  /**
   * Restrict candidates to these ids. A House Journal must be resolved against
   * House members only: Texas has BOTH a Rep. Gina Hinojosa and a Sen. Adam
   * Hinojosa, and both a Rep. Ward Johnson and a Sen. Nathan Johnson. Without a
   * chamber filter those surnames are ambiguous and get refused — which is safe
   * but throws away most of the journal.
   */
  eligibleIds?: Set<string>;
}

export function resolveJournalNames(
  journalNames: string[],
  roster: { id: string; name: string }[],
  opts: ResolveOptions = {},
): NameResolution {
  const pool = opts.eligibleIds
    ? roster.filter((p) => opts.eligibleIds!.has(p.id))
    : roster;

  // One index, keyed by every plausible surname form a member could be printed
  // under, with `primary` recording their longest form. The journal's own usage
  // then decides which member a short form refers to.
  const primary = new Map<string, RosterEntry[]>();

  for (const p of pool) {
    const parts = normName(p.name).split(' ').filter(Boolean);
    if (parts.length === 0) continue;
    // Heuristic: a two-token name is first+last; three or more treats the last
    // two as the surname when the second-to-last is not a lone initial.
    // A three-token name is ambiguous on its face: "Charlene Ward Johnson" has the
    // compound surname "Ward Johnson", while "Mary Ann Perez" has the middle name
    // "Ann" and the surname "Perez". Nothing in the name itself distinguishes
    // them, so index BOTH candidate surname forms and let the journal decide
    // (see `longerFormsInJournal` below).
    const forms = new Set<string>([parts.slice(-1).join(' ')]);
    if (parts.length >= 3 && parts[parts.length - 2].length > 1) {
      forms.add(parts.slice(-2).join(' '));
    }
    const longest = [...forms].sort((a, b) => b.length - a.length)[0];
    for (const form of forms) {
      const entry: RosterEntry = { id: p.id, name: p.name, first: parts[0], primary: longest };
      const pArr = primary.get(form) ?? [];
      pArr.push(entry);
      primary.set(form, pArr);
    }
  }

  // Which members does the journal itself identify by their LONGER surname form?
  // If "Ward Johnson" appears in the journal, then bare "Johnson" is somebody
  // else and Charlene must not be a candidate for it. This is what makes the
  // both-forms indexing above safe, and it is evidence rather than a heuristic.
  const journalForms = new Set(journalNames.map((n) => normName(n.replace(/\(C\)\s*$/, ''))));
  const claimedByLongerForm = new Set<string>();
  for (const [form, entries] of primary) {
    if (!journalForms.has(form)) continue;
    for (const e of entries) if (e.primary === form && form.includes(' ')) claimedByLongerForm.add(e.id);
  }

  const resolved = new Map<string, string>();
  const unresolved: NameResolution['unresolved'] = [];

  for (const raw of journalNames) {
    const cleaned = raw.replace(/\(C\)\s*$/, '').trim();

    if (/^mr\.?\s*speaker/i.test(cleaned)) {
      unresolved.push({
        journalName: raw,
        reason: 'presiding officer, not a district vote',
        candidates: [],
      });
      continue;
    }

    // "Bell, C." -> surname "bell", initial "c"
    const initialMatch = /^(.+?),\s*([A-Za-z])\.?$/.exec(cleaned);
    const surnameText = normName(initialMatch ? initialMatch[1] : cleaned);
    const initial = initialMatch ? initialMatch[2].toLowerCase() : null;

    // PRIMARY ONLY. The fallback index — filing a multi-word surname under its
    // last word so a shortened journal form could still match — is unsafe, and
    // it produced the worst possible bug: the journal prints BOTH "Johnson" and
    // "Ward Johnson", so bare "Johnson" fell back to Charlene Ward Johnson and
    // overwrote her real position with another member's vote on 43 records.
    //
    // It also turns out to be unnecessary. A member whose surname is one word is
    // found by primary lookup anyway: "Hernandez" resolves uniquely to Ana
    // Hernandez because Cas Garcia Hernandez's primary form is "garcia
    // hernandez". Where the journal genuinely abbreviates, refusing is correct —
    // that needs a curated alias, not a guess.
    const tryPools: RosterEntry[][] = [];
    if (primary.has(surnameText)) {
      // Exclude a member the journal identifies by a longer surname form, unless
      // this IS that longer form. Keeps "Johnson" from resolving to Charlene Ward
      // Johnson while letting "Ward Johnson" do so.
      tryPools.push(
        primary.get(surnameText)!.filter(
          (c) => !claimedByLongerForm.has(c.id) || c.primary === surnameText,
        ),
      );
    }

    if (tryPools.length === 0) {
      unresolved.push({
        journalName: raw,
        reason: 'no roster member with that surname',
        candidates: [],
      });
      continue;
    }

    let done = false;
    let lastCandidates: RosterEntry[] = [];
    for (const candidates of tryPools) {
      let matches = initial
        ? candidates.filter((c) => c.first.startsWith(initial))
        : candidates;
      if (matches.length > 1 && opts.preferIds) {
        const preferred = matches.filter((c) => opts.preferIds!.has(c.id));
        if (preferred.length === 1) matches = preferred;
      }
      lastCandidates = matches.length ? matches : candidates;
      if (matches.length === 1) {
        resolved.set(raw, matches[0].id);
        done = true;
        break;
      }
    }
    if (done) continue;

    unresolved.push({
      journalName: raw,
      reason:
        lastCandidates.length > 1
          ? 'ambiguous — refusing to guess'
          : `surname matched but no first name starts with "${initial}"`,
      candidates: lastCandidates.map((c) => c.name),
    });
  }

  return { resolved, unresolved };
}
