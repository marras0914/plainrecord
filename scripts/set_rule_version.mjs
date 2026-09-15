/**
 * Stamp the shipped payload with the selection rule's current version.
 *
 *   node --experimental-strip-types --no-warnings scripts/set_rule_version.mjs
 *   node --experimental-strip-types --no-warnings scripts/set_rule_version.mjs --write
 *
 * WHY THIS EXISTS RATHER THAN A RE-EXPORT.
 *
 * `ruleVersion` is written by export_quiz_data.ts, which needs the two 51 MB
 * LegiScan CSVs that are not in the repo. So when the vote-collapse rule was
 * corrected on 14 September, the items were rebuilt but the version string
 * stayed at sel-2026-09-01.a, and the payload went on claiming to be the
 * output of a rule that no longer existed. The tally namespaces its counters
 * by that string; a stale one silently pooled readings from two different
 * question sets into one average.
 *
 * This writes the one field, and refuses to do it unless the items in the file
 * are demonstrably the corrected ones. A version stamp on the wrong payload is
 * worse than no stamp, because everything downstream then trusts it.
 *
 * THE PRECONDITION IS THE POINT. It asserts SB 17 points at the roll call the
 * corrected rule selects and carries the sign that goes with it. Before the
 * fix that item pointed at a failed procedural motion and its valence was
 * -0.873; after, it is record 1861 at +0.984. If someone runs this against a
 * restored pre-fix payload the assertion fails and nothing is written.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = join(ROOT, 'public', 'data', 'quiz_89R.json');
const RULE_SRC = join(ROOT, 'selection.ts');
const write = process.argv.includes('--write');

/**
 * Read DEFAULT_RULE.version out of selection.ts as text.
 *
 * Importing it would be cleaner, but selection.ts imports './scoring' with no
 * file extension and Node's ESM resolver refuses that outside the bundler.
 * Rather than reshape the module graph for a one-field script, the string is
 * read from source, and the read is an ASSERTION: it must match exactly once.
 * If someone reformats that line this fails loudly instead of quietly falling
 * back to a default and stamping the wrong version.
 */
function ruleVersionFromSource() {
  const src = readFileSync(RULE_SRC, 'utf8');
  const all = [...src.matchAll(/^\s*version:\s*'([^']+)'\s*,/gm)];
  if (all.length !== 1) {
    console.log(`\n  expected exactly one version: '...' line in selection.ts, found ${all.length}.`);
    console.log('  NOTHING WRITTEN. Fix the script or the source, do not guess.\n');
    process.exit(1);
  }
  return all[0][1];
}

let fails = 0;
const ok = (label, detail = '') => console.log(`  [PASS] ${label}${detail ? '  — ' + detail : ''}`);
const bad = (label, detail = '') => { fails++; console.log(`  [FAIL] ${label}${detail ? '  — ' + detail : ''}`); };
const check = (cond, label, detail) => (cond ? ok(label, detail) : bad(label, detail));

const raw = readFileSync(PAYLOAD, 'utf8');
const data = JSON.parse(raw);
const want = ruleVersionFromSource();

console.log(`\n  payload   ${data.ruleVersion}`);
console.log(`  rule      ${want}\n`);

// --- Preconditions: is this actually the corrected payload? ------------------

const sb17 = data.items.find((i) => i.billId === 'SB 17');
check(!!sb17, 'SB 17 is in the payload', sb17 ? `record ${sb17.rec}` : 'missing');

if (sb17) {
  check(
    sb17.rec === 1861,
    'SB 17 points at the roll call the corrected rule selects',
    `rec ${sb17.rec}, want 1861`,
  );
  check(
    sb17.valence > 0.9,
    'SB 17 carries the corrected sign',
    `valence ${sb17.valence}, want > 0.9 (pre-fix it was -0.873)`,
  );
}

// Every selection must come from a roll call the House adopted, which is what
// the corrected rule guarantees and the broken one did not.
check(
  data.provenance?.selectedJournalSourced === data.items.length,
  'every item is journal-sourced, as the corrected rule produces',
  `${data.provenance?.selectedJournalSourced} of ${data.items.length}`,
);

// SB 6 sits in the short set and is the item that made the old counters
// unusable, so its corrected value is worth asserting by name.
const sb6 = data.items.find((i) => i.billId === 'SB 6');
check(
  !!sb6 && sb6.headline === true && Math.abs(sb6.valence + 0.309) < 0.01,
  'SB 6 is in the short set at its corrected valence',
  sb6 ? `headline=${sb6.headline} valence=${sb6.valence}, want -0.309` : 'missing',
);

if (fails) {
  console.log(`\n  ${fails} precondition(s) failed. NOTHING WRITTEN.`);
  console.log('  This payload is not the corrected one, or the rule has moved again.\n');
  process.exit(1);
}

// --- The write ---------------------------------------------------------------

if (data.ruleVersion === want) {
  console.log(`\n  already stamped ${want}, nothing to do\n`);
  process.exit(0);
}

if (!write) {
  console.log(`\n  would rewrite ruleVersion ${data.ruleVersion} -> ${want}`);
  console.log('  re-run with --write to apply\n');
  process.exit(0);
}

// Textual replacement of the one field, so nothing else in the file is
// reformatted by a parse-and-stringify round trip.
const from = `"ruleVersion":"${data.ruleVersion}"`;
const to = `"ruleVersion":"${want}"`;
if (!raw.includes(from)) {
  console.log(`\n  could not find ${from} as literal text. NOTHING WRITTEN.\n`);
  process.exit(1);
}
const out = raw.replace(from, to);
if (out.split(to).length - 1 !== 1) {
  console.log('\n  the replacement was not unique. NOTHING WRITTEN.\n');
  process.exit(1);
}
writeFileSync(PAYLOAD, out, 'utf8');

const after = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
if (after.ruleVersion !== want) {
  console.log('\n  wrote the file but it did not take. Check it by hand.\n');
  process.exit(1);
}
console.log(`\n  ruleVersion -> ${want}`);
console.log(`  ${after.items.length} items untouched\n`);
