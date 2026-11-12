/**
 * PlainRecord: smoke suite for the economy module's shock notes
 *
 *   npx tsx econ_context.smoke.ts
 *
 * The quotes are checked against their sources by `npm run data:econ:quotes`,
 * which needs the downloaded sources. This suite checks what needs nothing:
 * that the blind wording gives nothing away, that the set of notes is exactly
 * what the rule in econ_context.ts produces, and which terms each note lands on.
 */

import { CONTEXT, BLIND, notesForTerm } from './econ_context';
import { PRESIDENCIES, buildTerms } from './econ_control';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? '  — ' + detail : ''}`);
}

// --- the blind wording ------------------------------------------------------

check('every note\'s blind text is the single wording for its kind',
  CONTEXT.every((n) => n.blind === BLIND[n.kind]));

// Built from the data, not a hand list, so a new president or a new note's
// proper noun is covered without anyone remembering to add it.
const surnames = [...new Set(PRESIDENCIES.map((p) => p.name.replace(/ Jr\.$/, '').split(' ').at(-1)!))];
const GIVEAWAYS = [...surnames, 'OPEC', 'Korea', 'Vietnam', 'Gulf', 'Iraq', 'Afghanistan', 'COVID', 'Great Recession',
  'Democrat', 'Republican', 'Blinder', 'Watson', 'NBER'];
const leaks = Object.values(BLIND).flatMap((b) => [
  ...(/\d/.test(b) ? [`a digit in "${b}"`] : []),
  ...GIVEAWAYS.filter((g) => b.toLowerCase().includes(g.toLowerCase())).map((g) => `"${g}" in "${b}"`),
]);
check('no blind wording carries a year, a name, a place or a party', leaks.length === 0,
  leaks.join('; ') || `${GIVEAWAYS.length} words checked`);

// The giveaway check must be able to fail.
const planted = 'Oil prices rose sharply after OPEC acted.';
check('(the giveaway check catches a planted proper noun)',
  GIVEAWAYS.some((g) => planted.toLowerCase().includes(g.toLowerCase())));

// --- the rule ---------------------------------------------------------------

// Exactly the shocks the rule produces. Adding one here without changing the
// rule in econ_context.ts is the thing this exists to stop.
const EXPECTED = ['opec-1', 'opec-2', 'oil-1990', 'oil-2005', 'crisis-2008',
  'war-korea', 'war-vietnam', 'war-gulf', 'war-iraq-afghanistan', 'pandemic-2020'];
const ids = CONTEXT.map((n) => n.id);
check('the notes are exactly the ones the rule names', JSON.stringify([...ids].sort()) === JSON.stringify([...EXPECTED].sort()),
  ids.join(', '));
check('every note has a source URL and a non-empty quote',
  CONTEXT.every((n) => /^https:\/\//.test(n.source.url) && n.source.quote.length > 15));
check('every note runs forward in time', CONTEXT.every((n) => n.fromYear <= n.toYear));
check('only NBER-sourced notes fall after the paper\'s sample (2012)',
  CONTEXT.filter((n) => n.fromYear > 2012).every((n) => /nber\.org\/news/.test(n.source.url)));

// --- which terms each note lands on -----------------------------------------

const terms = buildTerms();
const on = (id: string) => {
  const t = terms.find((x) => x.id === id)!;
  return notesForTerm(Number(t.start.slice(0, 4)), t.end ? Number(t.end.slice(0, 4)) : null).map((n) => n.id).sort().join(',');
};
const CASES: [string, string][] = [
  ['1949-truman', 'war-korea'],
  ['1953-eisenhower-1', 'war-korea'],
  ['1961-kennedy-johnson', ''],
  // The war notes land on exactly the terms the paper lists for each war.
  ['1965-johnson', 'war-vietnam'],
  ['1969-nixon', 'war-vietnam'],
  ['1973-nixon-ford', 'opec-1'],
  ['1977-carter', 'opec-2'],
  ['1981-reagan-1', ''],
  ['1989-bush', 'oil-1990,war-gulf'],
  ['1993-clinton-1', ''],
  ['2005-bush-2', 'crisis-2008,oil-2005,war-iraq-afghanistan'],
  ['2009-obama-1', 'crisis-2008,war-iraq-afghanistan'],
  ['2013-obama-2', ''],
  ['2017-trump-1', 'pandemic-2020'],
  ['2021-biden', ''],
];
for (const [term, want] of CASES) {
  const got = on(term);
  check(`${term}: ${want || 'no notes'}`, got === want, got || 'none');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
