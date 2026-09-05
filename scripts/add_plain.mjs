/**
 * Merge APPROVED plain-language questions into the shipped payload and the
 * Spanish sidecar.
 *
 *   npm run data:plain            # dry run: says what it would do
 *   npm run data:plain -- --write # actually writes
 *
 * Same shape as data:acts — it edits an already-built payload rather than
 * re-running the exporter, which needs the LegiScan CSVs.
 *
 * THE GATE
 *
 * Only entries whose status is "ok" are merged. A summary replaces the bill's
 * official caption as the question a reader is asked and is attached to a real
 * recorded vote, so an unreviewed one is not a typo, it is the page asking
 * about something the Legislature did not vote on. Drafts are counted and
 * skipped, never written, and an entry flagged for a closer look is refused
 * even if someone has marked it approved.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const SRC = 'i18n/plain_89R.json';
const PAYLOAD = 'public/data/quiz_89R.json';
const SIDECAR = 'public/data/quiz_89R.es.json';
const write = process.argv.includes('--write');

const src = JSON.parse(readFileSync(SRC, 'utf8'));
const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
const sidecar = JSON.parse(readFileSync(SIDECAR, 'utf8'));

const entries = Object.entries(src.items);
const approved = entries.filter(([, v]) => v.status === 'ok');
const drafts = entries.filter(([, v]) => v.status !== 'ok');

// Refuse before touching anything.
for (const [billId, v] of approved) {
  if (!v.en?.trim() || !v.es?.trim()) {
    throw new Error(`${billId} is approved but is missing a summary in one language`);
  }
  if (v.flag) {
    throw new Error(
      `${billId} is marked approved but still carries the flag "${v.flag}". ` +
      'Clear the flag deliberately, or leave it as a draft.',
    );
  }
  if (!v.source && v.flag !== 'caption-only') {
    throw new Error(`${billId} is approved with no source URL to check it against`);
  }
}

let en = 0, es = 0, unchanged = 0;
const byBill = new Map(payload.items.map((i) => [i.billId, i]));
sidecar.items ??= {};

for (const [billId, v] of approved) {
  const item = byBill.get(billId);
  if (!item) throw new Error(`${billId} is not in the payload`);
  if (item.plain === v.en) unchanged++;
  else { item.plain = v.en; en++; }

  const s = (sidecar.items[billId] ??= {});
  if (s.plain !== v.es) { s.plain = v.es; es++; }
}

console.log('');
console.log(`  approved and merged   ${approved.length}`);
console.log(`    English changed     ${en}`);
console.log(`    Spanish changed     ${es}`);
console.log(`    already current     ${unchanged}`);
console.log(`  drafts left alone     ${drafts.length}`);
if (drafts.length) {
  const flagged = drafts.filter(([, v]) => v.flag).length;
  console.log(`    of which flagged    ${flagged}`);
}

if (!write) {
  console.log('\n  dry run — nothing written. Add --write to apply.\n');
  process.exit(0);
}

// A payload edited in place is the one file the whole site reads. Keep the
// previous version beside it before overwriting.
for (const f of [PAYLOAD, SIDECAR]) {
  if (existsSync(f)) copyFileSync(f, f + '.bak');
}
writeFileSync(PAYLOAD, JSON.stringify(payload), 'utf8');
writeFileSync(SIDECAR, JSON.stringify(sidecar), 'utf8');

const withPlain = payload.items.filter((i) => i.plain).length;
console.log(`\n  wrote ${PAYLOAD} and ${SIDECAR}`);
console.log(`  items now carrying a plain-language question: ${withPlain}/${payload.items.length}`);
console.log('  previous versions kept as .bak\n');
