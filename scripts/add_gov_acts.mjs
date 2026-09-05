/**
 * Attach the Governor's action to each bill, and rewrite what the page claims
 * his record can show.
 *
 *   npm run data:govacts:add            # dry run
 *   npm run data:govacts:add -- --write
 *
 * Before this, Dan Patrick appeared on eight questions as the man who wanted
 * bills passed and Greg Abbott appeared on one as the man who killed a bill.
 * After it, Abbott appears on 32 with what he actually did — signed, vetoed, or
 * let it become law without signing — and the page states plainly that a
 * signature is the weakest of the three.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const ACTS = 'data/gov_acts_89R.json';
const PAYLOAD = 'public/data/quiz_89R.json';
const SIDECAR = 'public/data/quiz_89R.es.json';
const write = process.argv.includes('--write');

const src = JSON.parse(readFileSync(ACTS, 'utf8'));
const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
const sidecar = JSON.parse(readFileSync(SIDECAR, 'utf8'));
const byBill = new Map(payload.items.map((i) => [i.billId, i]));

const WHO = src.who;
const OFFICE = src.office;

let added = 0, replaced = 0, skipped = 0;
for (const a of src.items) {
  if (!a.kind) { skipped++; continue; }
  const item = byBill.get(a.billId);
  if (!item) throw new Error(`${a.billId} is not in the payload`);
  item.acts ??= [];

  // The one veto is already recorded, with the Legislative Reference Library as
  // its source. Keep that one: it is the better citation for a veto, and
  // replacing it would swap a specific veto record for a generic bill page.
  const existing = item.acts.findIndex((x) => x.who === WHO);
  const act = {
    who: WHO,
    office: OFFICE,
    kind: a.kind,
    // null for a bill left unsigned: that is a refusal to endorse something he
    // also declined to stop, and it is not a position for or against.
    position: a.position,
    date: a.date ?? null,
    sourceUrl: a.sourceUrl,
  };
  if (existing >= 0) {
    if (item.acts[existing].kind === 'veto') { skipped++; continue; }
    item.acts[existing] = act; replaced++;
  } else { item.acts.push(act); added++; }
}

// --- what the page says his record can and cannot show ---------------------

const signed = src.tally.signed;
const reached = src.tally.signed + src.tally.unsigned + src.tally.vetoed;
const never = src.tally.neverReached;

const EN = {
  evidence: 'what he did with each bill that reached him — signed it, vetoed it, or let it become law without signing',
  oneSided:
    `Every bill that reaches a governor gets one of three answers, so unlike a priority list this can ` +
    `show both directions. It is still uneven: he signed ${signed} of the ${reached} that reached him, so a ` +
    `signature mostly means he did not object rather than that he pushed. The ${src.tally.unsigned} he let become law ` +
    `without signing are recorded as taking no side, because that is what they are. ${never} of these bills ` +
    `never reached his desk at all, and he appears on none of those.`,
};
const ES = {
  evidence: 'qué hizo con cada proyecto que llegó a su escritorio: firmarlo, vetarlo o dejar que fuera ley sin firmarlo',
  oneSided:
    `Todo proyecto que llega a un gobernador recibe una de tres respuestas, así que, a diferencia de una lista de ` +
    `prioridades, esto puede mostrar ambas direcciones. Sigue siendo desigual: firmó ${signed} de los ${reached} que ` +
    `le llegaron, así que una firma significa sobre todo que no se opuso, no que lo impulsara. Los ${src.tally.unsigned} que dejó ` +
    `ser ley sin firmar se registran como sin postura, porque eso es lo que son. ${never} de estos proyectos nunca ` +
    `llegaron a su escritorio, y no aparece en ninguno de ellos.`,
};

const opp = payload.opponents.find((o) => o.name === WHO);
if (!opp) throw new Error(`${WHO} is not in the payload's opponents`);
const beforeEvidence = opp.evidence;
opp.evidence = EN.evidence;
opp.oneSided = EN.oneSided;

sidecar.opponents ??= {};
sidecar.opponents[WHO] ??= {};
sidecar.opponents[WHO].evidence = ES.evidence;
sidecar.opponents[WHO].oneSided = ES.oneSided;

console.log('');
console.log(`  acts added      ${added}`);
console.log(`  acts replaced   ${replaced}`);
console.log(`  skipped         ${skipped}   (${never} never reached him, plus the existing veto record)`);
console.log(`\n  ${WHO} now appears on ${payload.items.filter((i) => (i.acts ?? []).some((x) => x.who === WHO)).length} of ${payload.items.length} questions`);
console.log(`  was: "${beforeEvidence}"`);
console.log(`  now: "${opp.evidence}"`);

if (!write) {
  console.log('\n  dry run — nothing written. Add --write to apply.\n');
  process.exit(0);
}

for (const f of [PAYLOAD, SIDECAR]) if (existsSync(f)) copyFileSync(f, f + '.bak');
writeFileSync(PAYLOAD, JSON.stringify(payload), 'utf8');
writeFileSync(SIDECAR, JSON.stringify(sidecar), 'utf8');
console.log(`\n  wrote ${PAYLOAD} and ${SIDECAR}  (previous kept as .bak)\n`);
