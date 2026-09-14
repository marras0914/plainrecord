/**
 * Apply the headline items' `label` and `why` to the already-built payload.
 *
 *   npm run data:headlines            # dry run
 *   npm run data:headlines -- --write
 *
 * WHY THIS EXISTS. `why` and `label` are authored in HEADLINE_SET in
 * scripts/export_quiz_data.ts, and that exporter cannot be re-run without the
 * LegiScan bulk CSVs, which are 51 MB and not committed. Without this, changing
 * one sentence of `why` would mean rebuilding the entire payload from inputs
 * nobody has checked out. Same reason add_plain.mjs edits the payload in place.
 *
 * IT READS HEADLINE_SET RATHER THAN CARRYING ITS OWN COPY. Two files holding the
 * same sentence is two files that drift, and the one that drifts silently is the
 * one nobody runs.
 *
 * ENGLISH ONLY, DELIBERATELY. The payload's Spanish lives in
 * public/data/quiz_89R.es.json, which is authored rather than generated.
 *
 * AND NO MACHINE HERE CAN TELL A STALE TRANSLATION FROM A CURRENT ONE. The first
 * version of this checked that a Spanish `why` EXISTED, which it always does, so
 * it would have waved through an English sentence rewritten under Spanish that
 * still said the old thing. check_sidecar.mjs has the same blind spot for the
 * same reason: it checks coverage, and stale text is covered.
 *
 * So the script refuses to write a changed sentence unless the operator passes
 * --spanish-reviewed, naming what they have looked at. That is not a formality.
 * It is the only point in this pipeline where somebody who reads both languages
 * has to say so, and inventing a check that pretends to do it for them would be
 * worse than having none.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HEADLINE_SET } from './export_quiz_data.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PAYLOAD = join(ROOT, 'public/data/quiz_89R.json');
const SIDECAR = join(ROOT, 'public/data/quiz_89R.es.json');

const write = process.argv.includes('--write');
const spanishReviewed = process.argv.includes('--spanish-reviewed');
const say = (s) => console.log('  ' + s);

const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
const sidecar = JSON.parse(readFileSync(SIDECAR, 'utf8'));

const byBill = new Map(payload.items.map((i) => [i.billId, i]));

let changed = 0;
let unchanged = 0;
const orphaned = [];
const needReview = [];

for (const h of HEADLINE_SET) {
  const item = byBill.get(h.billId);
  if (!item) throw new Error(`${h.billId} is in HEADLINE_SET but not in the payload`);
  if (!item.headline) throw new Error(`${h.billId} is in HEADLINE_SET but not flagged headline`);

  const before = { label: item.label, why: item.why };
  item.label = h.label;
  item.why = h.why;

  if (before.why === h.why && before.label === h.label) { unchanged++; continue; }
  changed++;
  say(`${h.billId}: ${before.why === h.why ? 'label' : 'why'} changed`);

  // The sidecar is keyed by bill. A changed English sentence whose Spanish still
  // says the old thing is worse than a missing one, because nothing detects it.
  const es = sidecar.items?.[h.billId];
  if (!es) orphaned.push(`${h.billId}: no sidecar entry at all`);
  else if (es.why === undefined) orphaned.push(`${h.billId}: no Spanish why`);
  else if (!spanishReviewed) {
    needReview.push(`${h.billId}: EN changed, Spanish reads "${String(es.why).slice(0, 60)}..."`);
  }
}

say(`${changed} changed, ${unchanged} already current, ${HEADLINE_SET.length} headline items`);

if (needReview.length) {
  console.error('\n  REFUSING TO WRITE. These sentences changed in English and nothing here');
  console.error('  can tell whether the Spanish still matches:');
  for (const r of needReview) console.error(`    ${r}`);
  console.error('\n  Check public/data/quiz_89R.es.json, then re-run with --spanish-reviewed.\n');
  process.exitCode = 1;
} else if (orphaned.length) {
  console.error('\n  REFUSING TO WRITE. The Spanish would be left behind:');
  for (const o of orphaned) console.error(`    ${o}`);
  console.error('\n  Edit public/data/quiz_89R.es.json, then run this again.\n');
  process.exitCode = 1;
} else if (!write) {
  console.log('\n  dry run - nothing written. Add --write to apply.\n');
} else if (!changed) {
  console.log('\n  nothing to do.\n');
} else {
  writeFileSync(PAYLOAD, JSON.stringify(payload), 'utf8');
  console.log(`\n  wrote ${PAYLOAD.replace(ROOT, '.')}`);
  console.log('  Spanish is edited by hand in the sidecar; run npm run i18n:sidecar to check it.\n');
}
