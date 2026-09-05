/**
 * Correct the subject shown above a question, where the pipeline picked the
 * least representative one.
 *
 *   npm run data:categories            # dry run
 *   npm run data:categories -- --write
 *
 * WHAT WENT WRONG
 *
 * A Texas bill carries many official subject tags — HB 5138 has ten. categorize.ts
 * maps them to categories and then picks one by "rarest-wins, ties alphabetical",
 * which spreads the quiz nicely across subjects and, for any bill with several,
 * systematically chooses the least representative. 54 of the 67 quiz bills have
 * more than one candidate, and 52 of those 54 — 96% — ended up labelled with the
 * rarest. That is the rule working as written, not a data fault: every current
 * label is a subject the Legislature really did tag.
 *
 * It is still wrong on the page. "Abortion" above a question about the attorney
 * general prosecuting election crimes tells the reader something false about
 * what they are voting on.
 *
 * THE SAFETY RULE
 *
 * A corrected category must be one of that bill's OWN candidate categories,
 * derived from its official subject list. This script refuses anything else. So
 * a correction can never invent a subject — it can only choose a different one
 * of the subjects the Legislature itself assigned, which is exactly the choice
 * the pipeline was already making.
 *
 * WHAT IT DOES NOT FIX
 *
 * The selection rule ran on the original categories, so a bill picked as the
 * third "Abortion" item was picked under a label it did not deserve. Correcting
 * the label afterwards cannot undo that; it makes the realised distribution
 * visible instead of hiding it. Seven categories were already above the stated
 * cap of three before any of this, because the seven headline bills are added
 * after selection.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const OVERRIDES = 'i18n/categories_89R.json';
const SUBJECTS = 'data/bill_subjects_89R.json';
const PAYLOAD = 'public/data/quiz_89R.json';
const write = process.argv.includes('--write');

const ov = JSON.parse(readFileSync(OVERRIDES, 'utf8'));
const subs = JSON.parse(readFileSync(SUBJECTS, 'utf8'));
const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));

const candidatesOf = new Map(subs.items.map((s) => [s.billId, s.candidates]));
const byBill = new Map(payload.items.map((i) => [i.billId, i]));

const approved = Object.entries(ov.items).filter(([, v]) => v.status === 'ok');
const held = Object.entries(ov.items).filter(([, v]) => v.status !== 'ok');

// Refuse before touching anything.
for (const [billId, v] of approved) {
  const item = byBill.get(billId);
  if (!item) throw new Error(`${billId} is not in the payload`);
  const cands = candidatesOf.get(billId) ?? [];
  if (!cands.length) throw new Error(`${billId} has no official subject list to check against`);
  if (!cands.includes(v.proposed)) {
    throw new Error(
      `${billId}: "${v.proposed}" is not one of the categories the Legislature's own ` +
      `subjects map to (${cands.join(', ')}). A correction may only pick a different ` +
      'subject the bill actually carries.',
    );
  }
  if (item.category !== v.current) {
    throw new Error(`${billId}: payload says "${item.category}", override expected "${v.current}"`);
  }
}

console.log('');
let changed = 0;
for (const [billId, v] of approved) {
  const item = byBill.get(billId);
  console.log(`  ${billId.padEnd(9)} ${v.current}  ->  ${v.proposed}`);
  console.log(`            ${v.reason}`);
  item.category = v.proposed;
  changed++;
}
if (held.length) {
  console.log(`\n  held for review: ${held.map(([k]) => k).join(', ')}`);
}

// What the reader will actually see change.
const visible = approved.filter(([b]) => !byBill.get(b).label).length;
console.log(`\n  corrections: ${changed}   of which visible on a question card: ${visible}`);
console.log('  (the seven headline bills carry their own label, so their category never shows)');

if (!write) {
  console.log('\n  dry run — nothing written. Add --write to apply.\n');
  process.exit(0);
}

if (existsSync(PAYLOAD)) copyFileSync(PAYLOAD, PAYLOAD + '.bak');
writeFileSync(PAYLOAD, JSON.stringify(payload), 'utf8');

const dist = {};
for (const i of payload.items) dist[i.category] = (dist[i.category] ?? 0) + 1;
console.log(`\n  wrote ${PAYLOAD}  (previous kept as .bak)`);
console.log(`  subjects now represented: ${Object.keys(dist).length}\n`);
