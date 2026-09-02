/**
 * PlainRecord — bill categories, derived from the Texas subject index
 *
 * OPEN_QUESTIONS #6: "Categories drive the subscores and the stratified selection
 * rule, but the taxonomy itself isn't defined anywhere yet. It's another curation
 * surface — worth deriving from an existing public scheme rather than inventing one."
 *
 * The existing public scheme is the Texas Legislative Reference Library subject
 * index, which Open States carries verbatim on every bill. Measured on 89R: all
 * 11,503 bills have subject terms, and 11,501 have at least one *subject* term.
 *
 * The index has two kinds of term, distinguished by their code:
 *
 *   I####   a SUBJECT term, hierarchical on "--"
 *           "Education--School Districts (I0220)"
 *           "Taxation--Property-Exemptions (I0793)"
 *   V####   an ENTITY term — the agency or office involved
 *           "HEALTH & HUMAN SERVICES COMMISSION (V0177)"
 *           "COMPTROLLER OF PUBLIC ACCOUNTS (V2608)"
 *
 * Only I-coded terms are used. A V-coded term says who ADMINISTERS a bill, not
 * what it is about, and bucketing by agency would put an education funding bill
 * and a teacher licensing bill in different categories because different offices
 * touch them.
 *
 * Taking the segment before the first "--" collapses 5,435 raw terms to 114
 * roots. Those 114 are then mapped to ~15 quiz categories by the published table
 * below.
 *
 * THE MAPPING TABLE IS A CURATION SURFACE and is treated like one: it is data,
 * versioned, and any root it does not cover is REPORTED rather than silently
 * swept into "Other". Adding a category is a visible diff.
 *
 * Deterministic: no Math.random(), no Date, no I/O.
 */

export const CATEGORY_MAP_VERSION = 'cat-2026-09-01.b';

/**
 * Roots that are not policy at all. Excluded outright — a congratulatory
 * resolution is not a position on anything, and "Resolutions" is the single
 * largest root in 89R (2,821 term occurrences), so leaving it in would make the
 * biggest category in the quiz ceremonial.
 */
export const NON_POLICY_ROOTS = new Set([
  'Resolutions',
  'Interim Studies',
  'Legislature',
  'Legislative Branch',
]);

/**
 * Root -> quiz category. Derived from the 114 I-coded roots observed in 89R,
 * ordered here by category so the groupings are reviewable at a glance.
 */
export const SUBJECT_ROOT_MAP: Record<string, string> = {
  // --- Education ---
  'Education': 'Education',
  'Libraries & Librarians': 'Education',

  // --- Taxes & state money ---
  'Taxation': 'Taxes & Spending',
  'State Finances': 'Taxes & Spending',
  'Fees & Other Nontax Revenue': 'Taxes & Spending',
  'Purchasing': 'Taxes & Spending',
  'Retirement Systems': 'Taxes & Spending',
  'Bonds': 'Taxes & Spending',

  // --- Criminal justice ---
  'Crimes': 'Criminal Justice',
  'Criminal Procedure': 'Criminal Justice',
  'Law Enforcement': 'Criminal Justice',
  'Corrections': 'Criminal Justice',
  'Fire Fighters & Police': 'Criminal Justice',
  'Juvenile Boards & Officers': 'Criminal Justice',
  'Crime Victims Compensation': 'Criminal Justice',
  'Crime Prevention': 'Criminal Justice',
  'Weapons': 'Guns',

  // --- Courts & civil law ---
  'Courts': 'Courts & Civil Law',
  'Civil Remedies & Liabilities': 'Courts & Civil Law',
  'Property Interests': 'Courts & Civil Law',
  'Legal Services': 'Courts & Civil Law',
  'Lawyers': 'Courts & Civil Law',
  'Probate': 'Courts & Civil Law',
  'Malpractice': 'Courts & Civil Law',
  'Tort Reform': 'Courts & Civil Law',

  // --- Elections ---
  'Elections': 'Elections & Voting',
  'Redistricting': 'Elections & Voting',

  // --- Government structure ---
  'County Government': 'State & Local Government',
  'City Government': 'State & Local Government',
  'Special Districts & Authorities': 'State & Local Government',
  'Political Subdivisions': 'State & Local Government',
  'Boards & Commissions': 'State & Local Government',
  'State Agencies': 'State & Local Government',
  'Governor': 'State & Local Government',
  'Open Government': 'State & Local Government',
  'Open Records': 'State & Local Government',
  'Open Meetings': 'State & Local Government',
  'State Agencies, Boards & Commissions': 'State & Local Government',
  'State Employees': 'State & Local Government',
  'State Officers': 'State & Local Government',
  'Salaries & Expenses': 'State & Local Government',
  'Ethics': 'State & Local Government',
  'Intergovernmental Relations': 'State & Local Government',
  'Congress': 'State & Local Government',
  'Sunset': 'State & Local Government',
  'Sunset—Required Reviews': 'State & Local Government',
  'Notaries': 'State & Local Government',
  'Statutory Revision': 'State & Local Government',
  'Constitutional Revision': 'State & Local Government',
  'Daylight Saving Time': 'State & Local Government',

  // --- Health & human services ---
  'Health': 'Health & Human Services',
  'Health Care Providers': 'Health & Human Services',
  'Health Care Costs': 'Health & Human Services',
  'Mental Health & Substance Abuse': 'Health & Human Services',
  'Human Services': 'Health & Human Services',
  'Disabilities, Persons with': 'Health & Human Services',
  'Aging': 'Health & Human Services',
  'Hospitals': 'Health & Human Services',
  'Nursing Homes': 'Health & Human Services',
  'Alcoholism & Drug Abuse': 'Health & Human Services',
  'Tobacco Products': 'Health & Human Services',
  'Women': 'Health & Human Services',

  // --- Families & children ---
  'Minors': 'Families & Children',
  'Family': 'Families & Children',
  'Child Welfare': 'Families & Children',
  'Day Care': 'Families & Children',

  // --- Abortion. Kept separate rather than folded into health: it is among the
  //     most salient axes in Texas politics, and burying it inside a large
  //     bucket would make it unreachable by a stratified per-category cap.
  'Abortion': 'Abortion',

  // --- Energy, environment, land ---
  'Energy': 'Energy & Environment',
  'Environment': 'Energy & Environment',
  'Water': 'Energy & Environment',
  'Oil & Gas': 'Energy & Environment',
  'Utilities': 'Energy & Environment',
  'Parks & Wildlife': 'Energy & Environment',
  'Agriculture': 'Energy & Environment',
  'Animals': 'Energy & Environment',
  'Natural Resources': 'Energy & Environment',
  'Mines & Mineral Resources': 'Energy & Environment',
  'Coastal Affairs & Beaches': 'Energy & Environment',
  'Public Lands, Buildings & Resources': 'Energy & Environment',

  // --- Economy & work ---
  'Business & Commerce': 'Business & Labor',
  'Occupational Regulation': 'Business & Labor',
  'Labor': 'Business & Labor',
  'Insurance': 'Business & Labor',
  'Financial': 'Business & Labor',
  'Banks & Banking': 'Business & Labor',
  'Economic & Industrial Development': 'Business & Labor',
  'Consumer Protection': 'Business & Labor',
  'Sports & Amusements': 'Business & Labor',
  'Alcoholic Beverages': 'Business & Labor',
  'Alcoholic Beverage Regulation': 'Business & Labor',
  'Amusements, Games, Sports': 'Business & Labor',
  'Charitable & Nonprofit Organizations': 'Business & Labor',
  'Corporations & Associations': 'Business & Labor',

  // --- Transportation ---
  'Vehicles & Traffic': 'Transportation',
  'Highways': 'Transportation',
  'Transportation': 'Transportation',
  'Aviation': 'Transportation',
  'Aeronautics': 'Transportation',
  'Common Carriers': 'Transportation',

  // --- Housing ---
  'Housing': 'Housing',

  // --- Technology & privacy ---
  'Electronic Information Systems': 'Technology & Privacy',
  'Protection of Personal Information': 'Technology & Privacy',
  'Science & Technology': 'Technology & Privacy',

  // --- Military & veterans ---
  'Military & Veterans': 'Military & Veterans',

  // --- Immigration ---
  'Aliens': 'Immigration',
  'Immigration': 'Immigration',

  // --- Speech, religion, discrimination ---
  'Religion': 'Religion & Civil Liberties',
  'Human Relations': 'Religion & Civil Liberties',
  'Communications & Press': 'Religion & Civil Liberties',

  // --- Low-salience civic/cultural bills. Grouped so they do not each become a
  //     tiny category that a per-category cap would over-weight.
  'Historic Preservation & Museums': 'Arts, Culture & Tourism',
  'Arts & Humanities': 'Arts, Culture & Tourism',
  'Tourism': 'Arts, Culture & Tourism',
  'Holidays': 'Arts, Culture & Tourism',
  'State Symbols': 'Arts, Culture & Tourism',
  'Cemeteries': 'Arts, Culture & Tourism',

  // --- Public safety & emergencies ---
  'Safety': 'Public Safety',
  'Disaster Preparedness & Relief': 'Public Safety',
  'Emergency Management': 'Public Safety',
};

export const CATEGORIES = [...new Set(Object.values(SUBJECT_ROOT_MAP))].sort();

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Open States serialises `subject` either as a Postgres array literal
 * (`{"A","B"}`) or a Python list (`['A','B']`), depending on the export path.
 * Both appear in real files, so both are handled.
 */
export function parseSubjects(raw: string): string[] {
  const t = (raw ?? '').trim();
  if (!t || t === '{}' || t === '[]') return [];

  const isPg = t.startsWith('{');
  const isPy = t.startsWith('[');
  const inner = isPg || isPy ? t.slice(1, -1) : t;

  // WHICH CHARACTER DELIMITS MATTERS, and getting it wrong is silent.
  //
  // In a Postgres array literal ONLY the double quote delimits; an apostrophe is
  // an ordinary character. Accepting `'` as a delimiter here merges terms: the
  // real term "GOVERNOR'S COMMITTEE ON PEOPLE WITH DISABILITIES (V0054)" opens a
  // bogus quoted region at the apostrophe that swallows every following comma
  // until the next one, gluing three subject terms into a single string. Measured
  // on 89R that silently corrupted ~60 subject assignments, and the giveaway was
  // that every mangled term had lost its apostrophe.
  //
  // Python's repr form (`['a', "b's"]`) does use single quotes, so it keeps both.
  const singleQuotes = isPy;

  const out: string[] = [];
  let field = '';
  let quote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      // Postgres escapes an embedded quote or backslash with a backslash.
      if (isPg && c === '\\' && i + 1 < inner.length) { field += inner[++i]; continue; }
      if (c === quote) { quote = null; continue; }
      field += c;
      continue;
    }
    if (c === '"' || (singleQuotes && c === "'")) { quote = c; continue; }
    if (c === ',') { if (field.trim()) out.push(field.trim()); field = ''; continue; }
    field += c;
  }
  if (field.trim()) out.push(field.trim());
  return out;
}

/** The index code, e.g. "I0220" or "V0177", or null if the term is uncoded. */
export function subjectCode(term: string): string | null {
  // Real 89R codes are not all letter+digits: VD8VF, NZ4KM, PS06N, UA1JQ, HF2SK
  // all occur. Match any parenthesised uppercase alphanumeric token, then let the
  // caller decide which prefix it cares about.
  return /\(([A-Z][A-Z0-9]*)\)\s*$/.exec(term)?.[1] ?? null;
}

/** True for a TLRL *subject* index term (I-coded), as opposed to an entity term. */
export function isSubjectTerm(term: string): boolean {
  const code = subjectCode(term);
  return code !== null && /^I\d/.test(code);
}

/** Root of a subject term: the part before the first "--", code stripped. */
export function subjectRoot(term: string): string {
  return term.replace(/\s*\([A-Z][A-Z0-9]*\)\s*$/, '').split('--')[0].trim();
}

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

export interface CategoryAssignment {
  /** billId (identifier, e.g. "HB 1") -> category. */
  byBill: Map<string, string>;
  /** Roots seen in the data that the map does not cover. Add them deliberately. */
  unmappedRoots: Map<string, number>;
  /** Bills whose only subject terms were non-policy (ceremonial resolutions). */
  nonPolicyBills: string[];
  /** Bills with no I-coded subject term at all. */
  uncategorizable: string[];
  counts: Map<string, number>;
}

export interface BillSubject {
  billId: string;
  subject: string;
}

/**
 * Assign one category per bill.
 *
 * A bill carries several subject terms, and the schema holds one category, so a
 * deterministic choice is required. The rule: among the bill's candidate
 * categories, take the one that is RAREST across the whole session, breaking
 * ties alphabetically.
 *
 * Rarest-wins is deliberate. Picking the most common category would push almost
 * everything into the biggest buckets, since a large share of bills touch
 * "State & Local Government" incidentally — an education funding bill that
 * amends a school district's authority would land under local government rather
 * than Education. Preferring the rarer category keeps the distinctive subject,
 * which is the one a reader would name.
 */
export function categorizeBills(bills: BillSubject[]): CategoryAssignment {
  // Pass 1: candidate categories per bill, and a global frequency table.
  const candidates = new Map<string, Set<string>>();
  const unmappedRoots = new Map<string, number>();
  const nonPolicyBills: string[] = [];
  const uncategorizable: string[] = [];
  const globalFreq = new Map<string, number>();

  for (const b of bills) {
    const terms = parseSubjects(b.subject);
    const iTerms = terms.filter(isSubjectTerm);
    if (iTerms.length === 0) { uncategorizable.push(b.billId); continue; }

    const cats = new Set<string>();
    let sawNonPolicy = false;
    for (const term of iTerms) {
      const root = subjectRoot(term);
      if (NON_POLICY_ROOTS.has(root)) { sawNonPolicy = true; continue; }
      const cat = SUBJECT_ROOT_MAP[root];
      if (cat) cats.add(cat);
      else unmappedRoots.set(root, (unmappedRoots.get(root) ?? 0) + 1);
    }

    if (cats.size === 0) {
      if (sawNonPolicy) nonPolicyBills.push(b.billId);
      else uncategorizable.push(b.billId);
      continue;
    }
    candidates.set(b.billId, cats);
    for (const c of cats) globalFreq.set(c, (globalFreq.get(c) ?? 0) + 1);
  }

  // Pass 2: rarest-wins, ties alphabetical.
  const byBill = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const [billId, cats] of candidates) {
    const chosen = [...cats].sort((a, b) => {
      const d = (globalFreq.get(a) ?? 0) - (globalFreq.get(b) ?? 0);
      return d !== 0 ? d : a.localeCompare(b);
    })[0];
    byBill.set(billId, chosen);
    counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
  }

  return { byBill, unmappedRoots, nonPolicyBills, uncategorizable, counts };
}
