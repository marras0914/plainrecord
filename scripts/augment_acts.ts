/**
 * PlainRecord — add opponent actions to an already-built payload
 *
 *   npx tsx scripts/augment_acts.ts [payload.json]
 *
 * Why this exists rather than just re-running export_quiz_data.ts:
 *
 * The shipped payload was built from a roster snapshot that is no longer exactly
 * reproducible from the files in the repo. Re-running the exporter against the
 * available roster CSV produces a payload that is *nearly* identical but shifts
 * every rYea/dYea by a fraction of a percent — the roster it can rebuild includes
 * two members whose terms ended on 2025-01-13, which changes the denominators —
 * and that in turn changes which items clear the eligibility filter, moving one
 * candidate's coverage from 57 to 56. Those numbers have been verified on screen
 * and in 36 browser checks. Regenerating them to add an unrelated field would
 * silently replace verified figures with unverified ones.
 *
 * So this adds ONLY the new fields and touches nothing else:
 *
 *   items[].acts   per-bill vetoes and priority designations, where any exist
 *   opponents      who the three run against, and why none can be scored
 *
 * The join itself is imported from opponent_acts.ts — the same function the
 * exporter calls — so the two cannot disagree. Running this twice is a no-op
 * beyond rewriting the same values, and it verifies afterwards that nothing
 * except the new keys changed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHIP_DIR } from './paths';
import { actsBySession, normBill, OPPONENTS, type OpponentAct } from './opponent_acts';

interface Item { id: string; billId: string; acts?: OpponentAct[] }
interface Payload { session: string; items: Item[]; opponents?: unknown }

function main() {
  const path = process.argv[2] ?? join(SHIP_DIR, 'quiz_89R.json');
  const raw = readFileSync(path, 'utf8');
  const payload: Payload = JSON.parse(raw);

  const before = JSON.parse(raw) as Payload;
  const acts = actsBySession(payload.session);

  let touched = 0;
  const perPerson = new Map<string, number>();
  for (const it of payload.items) {
    const found = acts.get(normBill(it.billId));
    if (!found?.length) {
      delete it.acts; // keep the file idempotent if a bill drops off a list
      continue;
    }
    it.acts = found;
    touched++;
    for (const a of found) perPerson.set(a.who, (perPerson.get(a.who) ?? 0) + 1);
  }
  payload.opponents = OPPONENTS;

  // Prove the additive claim rather than asserting it: strip the new keys back
  // out and the result must be byte-identical to what was read.
  const stripped: Payload = JSON.parse(JSON.stringify(payload));
  delete stripped.opponents;
  for (const it of stripped.items) delete it.acts;
  const beforeClean = JSON.parse(JSON.stringify(before)) as Payload;
  delete beforeClean.opponents;
  for (const it of beforeClean.items) delete it.acts;
  if (JSON.stringify(stripped) !== JSON.stringify(beforeClean)) {
    throw new Error(
      'augment changed something other than `acts` and `opponents` — refusing to write. ' +
        'This script must never alter a verified figure.',
    );
  }

  writeFileSync(path, JSON.stringify(payload));

  const kb = (readFileSync(path).length / 1024).toFixed(1);
  console.log(`\n  ${touched} of ${payload.items.length} items carry an opponent action`);
  for (const [who, n] of [...perPerson].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${who.padEnd(14)} ${n}`);
  }
  for (const o of OPPONENTS) {
    if (!perPerson.has(o.name)) console.log(`    ${o.name.padEnd(14)} 0 — ${o.evidence}`);
  }
  console.log(`  every other field unchanged (verified)\n  -> ${path}  (${kb} KB)\n`);
}

main();
