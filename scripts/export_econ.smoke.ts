/**
 * PlainRecord: smoke suite for the economy module's shipped files
 *
 *   npx tsx scripts/export_econ.smoke.ts
 *
 * Builds both payloads in memory from the committed FRED pulls (nothing is
 * written) and checks the one property that makes a blind round blind: the
 * blind file carries values under opaque keys and nothing a reader could use
 * to name the term. Then that the key is honest: every opaque key names one
 * complete term, and the blind values are that term's values.
 */

import { buildEconPayloads, loadFred, PAPER_TERMS } from './export_econ';
import { PRESIDENCIES } from '../econ_control';
import { PAPER_LAG_QUARTERS } from '../econ';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? '  — ' + detail : ''}`);
}

const { series, meta } = loadFred();
const { blind, terms } = buildEconPayloads(series, meta);

// Every string and every key anywhere in a JSON value.
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out); }
  return out;
}

// --- nothing in the blind file names a term --------------------------------

// The file's own field names are schema, not content, and are allowed: they
// include "unemploymentStart", which a substring scan would flag.
const SCHEMA = new Set(['key', 'metrics', 'baseline', ...Object.keys(blind.terms[0].metrics)]);
const blindStrings = strings(blind.terms).filter((s) => !SCHEMA.has(s));
// Digit boundaries, not \b: a word boundary does not exist between "FY" and
// "1981", and the first version of this check missed exactly that.
const YEAR = /(?<!\d)(18|19|20)\d\d(?!\d)/;
const years = blindStrings.filter((s) => YEAR.test(s));
check('no string or key in the blind terms carries a year', years.length === 0, years.slice(0, 3).join(', ') || `${blindStrings.length} strings`);

const surnames = [...new Set(PRESIDENCIES.map((p) => p.name.replace(/ Jr\.$/, '').split(' ').at(-1)!))];
const WORDS = [...surnames, 'Democrat', 'Republican', 'party', 'president', 'congress', 'senate', 'house',
  'chair', 'note', 'window', 'start', 'end', 'OPEC', 'war', 'pandemic', 'crisis', 'FY'];
const named = blindStrings.filter((s) => WORDS.some((w) => s.toLowerCase().includes(w.toLowerCase())));
check('no string or key in the blind terms names a person, party, office, date or shock', named.length === 0,
  named.slice(0, 5).join(', ') || `${WORDS.length} words`);

// The check has to be able to fail.
const planted = strings([{ key: 'term-a', metrics: { gdpGrowth: 3 }, note: 'FY1981-FY1984' }]).filter((s) => !SCHEMA.has(s));
check('(the scan catches a planted fiscal-year note)',
  planted.some((s) => YEAR.test(s)) && planted.some((s) => WORDS.some((w) => s.toLowerCase().includes(w.toLowerCase()))),
  planted.join(', '));

check('every blind key is opaque', blind.terms.every((t) => /^term-[a-z]$/.test(t.key)), blind.terms.map((t) => t.key).join(' '));
check('the blind file is at the paper\'s lag', blind.lagQuarters === PAPER_LAG_QUARTERS);

// --- the key is honest -----------------------------------------------------

const complete = terms.terms.filter((t) => t.complete);
const keyed = Object.values(terms.blindKey);
check('the blind file holds every complete term and only those',
  blind.terms.length === complete.length && complete.every((t) => keyed.includes(t.id)),
  `${blind.terms.length} blind, ${complete.length} complete`);
check('the term in progress is not in the blind file', !keyed.includes(terms.terms.at(-1)!.id));
check('each key names a different term', new Set(keyed).size === keyed.length);

const mismatched = blind.terms.filter((b) => {
  const t = terms.terms.find((x) => x.id === terms.blindKey[b.key])!;
  const m = t.byLag[PAPER_LAG_QUARTERS].metrics as unknown as Record<string, { value: number | null }>;
  return Object.entries(b.metrics).some(([k, v]) => m[k].value !== v);
});
check('every blind card carries exactly its term\'s numbers', mismatched.length === 0, mismatched.map((b) => b.key).join(', ') || 'all match');

const order = blind.terms.map((b) => terms.terms.findIndex((t) => t.id === terms.blindKey[b.key]));
check('the blind file is not in date order', order.some((v, i) => i > 0 && v < order[i - 1]), order.join(','));

// --- the labeled file ------------------------------------------------------

const carter = terms.terms.find((t) => t.id === '1977-carter')!;
check('shock notes live in the labeled file, with their sources',
  carter.notes.some((n) => n.id === 'opec-2' && /nber\.org/.test(n.source.url)));
check('every lag from 0 to 4 is in the labeled file',
  terms.terms.every((t) => [0, 1, 2, 3, 4].every((l) => t.byLag[l] !== undefined)));
check('the paper\'s sample is the paper\'s 16 terms', PAPER_TERMS.length === 16
  && PAPER_TERMS.every((id) => terms.terms.some((t) => t.id === id)));
const g = terms.groupings[PAPER_LAG_QUARTERS];
check('the labeled file carries the paper-sample reproduction', Math.abs(g.paperSample.D.mean - 4.35) < 0.3,
  `D ${g.paperSample.D.mean}, R ${g.paperSample.R.mean}`);
// It shipped as a refusal until 14 Nov 2026, when the five pre-1977
// redesignations were sourced from the Federal Reserve Bulletin.
check('the Fed grouping ships complete: both parties, with the vacancy quarter kept apart',
  g.fedAppointer.ok === true && 'appointed by D' in g.fedAppointer.result && 'appointed by R' in g.fedAppointer.result
  && Object.keys(g.fedAppointer.result).every((k) => /^appointed by (D|R|none \(vacancy\))$/.test(k)),
  g.fedAppointer.ok ? Object.keys(g.fedAppointer.result).join(', ') : g.fedAppointer.reason);
check('no known gap ships in the economy data', Array.isArray(terms.knownGaps) && terms.knownGaps.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
