/**
 * PlainRecord — Spanish for the prose the payload carries
 *
 * i18n/copy.json holds the site's own words. This holds the words that arrive
 * with the DATA — outcome labels and caveats, the comparator rule, why each
 * headline bill was chosen, an opponent's reason for having no votes. Those are
 * keyed by item and cannot live in a flat copy table.
 *
 * Every accessor here is a pass-through on the English page: `LOCALE === 'en'`
 * returns the payload value untouched, so the English site behaves exactly as it
 * did before this file existed.
 *
 * FALLBACK IS ALWAYS THE ENGLISH, NEVER A BLANK. If a translation is missing —
 * a reworded outcome label, a newly exported bill — the reader gets the English
 * sentence. That is a visible, reportable imperfection. An empty caveat is not:
 * it silently removes the qualification on a statistic, which is the one thing
 * on this page that must never happen quietly. scripts/check_sidecar.mjs fails
 * the build on exactly that drift, so this is the second line, not the first.
 */

import { LOCALE } from './i18n';
import es from '../public/data/quiz_89R.es.json';
import type { QuizItem, QuizOutcome, Opponent } from './quiz-data';

type Dict = Record<string, string>;

interface Sidecar {
  comparatorRule: string;
  candidateProvenance: string;
  causalNote: string;
  plainLanguageNote: string;
  categories: Dict;
  omissions: Dict;
  opponents: Record<string, { office: string; whyNoVotes: string; evidence: string; oneSided: string }>;
  incumbents: Record<string, { office: string; since: string; sessions: string; acts: string[] }>;
  outcomes: Record<string, {
    label: string; value: string; comparison: string; rank: string | null; caveat: string;
  }>;
  items: Record<string, { label?: string; why?: string; plain?: string }>;
}

const ES = es as unknown as Sidecar;
const spanish = () => LOCALE === 'es';

/** One of the four top-level prose fields. */
export function prose(
  key: 'comparatorRule' | 'candidateProvenance' | 'causalNote' | 'plainLanguageNote',
  english: string,
): string {
  return spanish() ? ES[key] || english : english;
}

/** A subject-area name, as shown in the question eyebrow and outcome headings. */
export function categoryName(category: string): string {
  return spanish() ? ES.categories[category] || category : category;
}

export function omissionWhy(category: string, english: string): string {
  return spanish() ? ES.omissions[category] || english : english;
}

/**
 * An outcome with its prose swapped. Returns a NEW object rather than mutating,
 * because DATA is the parsed payload and the page re-renders from it on every
 * answer — mutating would translate it once and then translate the translation.
 */
export function outcome(o: QuizOutcome): QuizOutcome {
  if (!spanish()) return o;
  const tr = ES.outcomes[o.label];
  if (!tr) return o;
  return {
    ...o,
    label: tr.label || o.label,
    value: tr.value || o.value,
    comparison: tr.comparison || o.comparison,
    // Null is meaningful: several outcomes have no rank, and the page renders no
    // badge for those. `|| o.rank` would be wrong here only if a translation
    // were the empty string, which the sidecar check forbids.
    rank: tr.rank ?? o.rank,
    caveat: tr.caveat || o.caveat,
  };
}

export function opponent(o: Opponent): Opponent {
  if (!spanish()) return o;
  const tr = ES.opponents[o.name];
  if (!tr) return o;
  return {
    ...o,
    office: tr.office || o.office,
    whyNoVotes: tr.whyNoVotes || o.whyNoVotes,
    evidence: tr.evidence || o.evidence,
    oneSided: tr.oneSided || o.oneSided,
  };
}

export interface Incumbent {
  name: string; office: string; since: string; sessions: string; acts: string[];
}

export function incumbent(i: Incumbent): Incumbent {
  if (!spanish()) return i;
  const tr = ES.incumbents[i.name];
  if (!tr) return i;
  return {
    ...i,
    office: tr.office || i.office,
    since: tr.since || i.since,
    sessions: tr.sessions || i.sessions,
    // Length is asserted equal by the sidecar check; fall back per-act anyway.
    acts: i.acts.map((a, n) => tr.acts?.[n] || a),
  };
}

/**
 * A headline bill's label, why-chosen note and plain-language gloss.
 *
 * NOT the caption. `caption` is the official record copied word for word, is
 * absent from the sidecar on purpose, and is never touched here — see
 * _meta.captions in public/data/quiz_89R.es.json.
 */
export function itemProse(it: QuizItem): QuizItem {
  if (!spanish()) return it;
  const tr = ES.items[it.billId];
  if (!tr) return it;
  return {
    ...it,
    label: tr.label || it.label,
    why: tr.why || it.why,
    plain: tr.plain || it.plain,
  };
}
