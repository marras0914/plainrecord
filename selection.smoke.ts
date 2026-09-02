/**
 * PlainRecord — smoke test for the item-selection rule
 *
 * The claim under test is the load-bearing one: WITHOUT a cross-cutting reserve,
 * a divisiveness-ranked selection picks almost entirely party-line votes and the
 * blue/red plot becomes bimodal no matter what anyone answers — so "purple" is
 * impossible by construction rather than absent by measurement. This proves that
 * end to end, by running real profiles through both item sets.
 *
 * Run: npx tsx selection.smoke.ts
 */

import type { VoteItem, VoteCast, Answer } from './scoring';
import { DEFAULT_OPTIONS } from './scoring';
import { computeValences, profileWeights, buildProfile } from './valence';
import type { PartyRoster } from './valence';
import {
  selectItems,
  assertFloorsAgree,
  DEFAULT_RULE,
} from './selection';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
}
const f = (n: number, d = 2) => n.toFixed(d).padStart(d + 3);

// ---------------------------------------------------------------------------
// Chamber
// ---------------------------------------------------------------------------
const REPS = Array.from({ length: 88 }, (_, i) => `R${i + 1}`);
const DEMS = Array.from({ length: 62 }, (_, i) => `D${i + 1}`);
const roster: PartyRoster = {};
REPS.forEach((r) => (roster[r] = 'R'));
DEMS.forEach((d) => (roster[d] = 'D'));

const CATS = ['Education', 'Health', 'Taxes', 'Energy', 'Courts'];

function mk(id: string, billId: string, category: string, votes: Record<string, VoteCast>,
            substantive = true): VoteItem {
  let yeas = 0; let nays = 0;
  for (const v of Object.values(votes)) { if (v === 1) yeas++; else if (v === -1) nays++; }
  return { id, billId, session: '89R', category, voteType: 'final', substantive, yeas, nays, votes };
}

function partyLine(id: string, cat: string, variant: number): VoteItem {
  const yesIsR = variant % 2 === 0;
  const rDef = 2 + (variant % 4);
  const dDef = 1 + (variant % 3);
  const votes: Record<string, VoteCast> = {};
  REPS.forEach((p, i) => (votes[p] = (i >= 88 - rDef) !== yesIsR ? 1 : -1));
  DEMS.forEach((p, i) => (votes[p] = (i >= 62 - dDef) === yesIsR ? 1 : -1));
  return mk(id, `HB ${100 + variant}`, cat, votes);
}

function crossCutting(id: string, cat: string, variant: number): VoteItem {
  const votes: Record<string, VoteCast> = {};
  [...REPS, ...DEMS].forEach((p, i) => {
    let t = (i * 374761393 + variant * 668265263) >>> 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177) >>> 0;
    t = (t ^ (t >>> 16)) >>> 0;
    votes[p] = (t & 1) === 0 ? 1 : -1;
  });
  return mk(id, `HB ${200 + variant}`, cat, votes);
}

// Each category gets 6 party-line and 4 cross-cutting eligible items, plus noise
// that the floor must drop.
const items: VoteItem[] = [];
CATS.forEach((cat, ci) => {
  for (let k = 0; k < 6; k++) items.push(partyLine(`pl-${ci}-${k}`, cat, ci * 10 + k));
  for (let k = 0; k < 4; k++) items.push(crossCutting(`cc-${ci}-${k}`, cat, ci * 10 + k + 1));
  // near-unanimous: must fail the floor
  const uv: Record<string, VoteCast> = {};
  [...REPS, ...DEMS].forEach((p, i) => (uv[p] = i < 3 ? -1 : 1));
  items.push(mk(`unan-${ci}`, `HB ${900 + ci}`, cat, uv));
  // procedural: must fail substantiveOnly
  items.push(mk(`proc-${ci}`, `HB ${950 + ci}`, cat, uv, false));
});

const valences = computeValences(items, roster);

// ---------------------------------------------------------------------------
console.log('\n=== floors agree with the scorer ===\n');
let threw = '';
try { assertFloorsAgree(DEFAULT_RULE, DEFAULT_OPTIONS); } catch (e) { threw = (e as Error).message; }
check('default rule and default scoring options agree', threw === '', threw.slice(0, 70));
threw = '';
try {
  assertFloorsAgree({ ...DEFAULT_RULE, minMinorityCount: 25 }, DEFAULT_OPTIONS);
} catch (e) { threw = (e as Error).message; }
check('a drifted floor is caught', threw.includes('minMinorityCount'),
  'an item asked but not scored silently shrinks every score');

// ---------------------------------------------------------------------------
console.log('\n=== eligibility + stratification ===\n');

const res = selectItems(items, valences, DEFAULT_RULE);
check('near-unanimous items excluded',
  res.excluded.some((e) => e.itemId === 'unan-0' && e.reason === 'minority-too-small'),
  res.excluded.find((e) => e.itemId === 'unan-0')?.reason);
check('procedural items excluded',
  res.excluded.some((e) => e.itemId === 'proc-0' && e.reason === 'non-substantive'));
check('capped at maxPerCategory',
  res.byCategory.every((c) => c.selected <= DEFAULT_RULE.maxPerCategory),
  `max selected ${Math.max(...res.byCategory.map((c) => c.selected))}`);
check('all five categories represented', res.byCategory.length === CATS.length);
check('reserve honoured: every category has cross-cutting items',
  res.byCategory.every((c) => c.crossCutting >= 2),
  `per-category cross-cutting: ${res.byCategory.map((c) => c.crossCutting).join(',')}`);
check('no reserve shortfall when the pool is deep enough',
  res.byCategory.every((c) => c.reserveShortfall === 0));

// Determinism: same inputs, different array order, same selected set.
const shuffled = [...items].reverse();
const res2 = selectItems(shuffled, computeValences(shuffled, roster), DEFAULT_RULE);
check('selection is order-independent (stable tie-break)',
  JSON.stringify(res.selected.map((i) => i.id).sort()) ===
    JSON.stringify(res2.selected.map((i) => i.id).sort()),
  `${res.selected.length} vs ${res2.selected.length} items`);

// ---------------------------------------------------------------------------
console.log('\n=== overrides must be justified ===\n');

threw = '';
try {
  selectItems(items, valences, DEFAULT_RULE, [{ itemId: 'unan-0', action: 'include', reason: '' }]);
} catch (e) { threw = (e as Error).message; }
check('an override with no reason is rejected', threw.includes('no reason'));

const withOverride = selectItems(items, valences, DEFAULT_RULE, [
  { itemId: 'unan-0', action: 'include', reason: 'landmark bill; near-unanimity is itself notable' },
  { itemId: 'pl-0-0', action: 'exclude', reason: 'duplicate of a companion bill in Health' },
]);
check('hand inclusion appears in the audit log',
  withOverride.auditLog.some((l) => l.includes('unan-0') && l.includes('INCLUDED by hand')));
check('hand exclusion appears in the audit log',
  withOverride.auditLog.some((l) => l.includes('pl-0-0') && l.includes('EXCLUDED by hand')));
check('excluded-by-hand is recorded with its reason',
  withOverride.excluded.some((e) => e.itemId === 'pl-0-0' && e.reason === 'manual-override' &&
    !!e.note));

// ---------------------------------------------------------------------------
// THE LOAD-BEARING TEST: does the reserve decide whether purple is reachable?
// ---------------------------------------------------------------------------
console.log('\n=== reserve vs "purple by construction" ===\n');

const noReserve = selectItems(items, valences, { ...DEFAULT_RULE, crossCuttingReserve: 0 });
check('with reserve 0, selection is almost entirely party-line',
  noReserve.crossCuttingShare < 0.05, `cross-cutting share ${f(noReserve.crossCuttingShare)}`);
check('with reserve 0, partisanByConstruction fires', noReserve.partisanByConstruction === true);
check('with the default reserve it does not',
  res.partisanByConstruction === false, `cross-cutting share ${f(res.crossCuttingShare)}`);
check('the finding is written into the audit log',
  noReserve.auditLog.some((l) => l.includes('FINDING') && l.includes('bimodal')));

// Now run a real profile through each item set. A voter who answers "yes" to
// everything — the least informative possible input.
function profileFor(sel: VoteItem[]): { spread: number; atPoles: number; n: number } {
  const pw = profileWeights(sel, DEFAULT_OPTIONS);
  const answers: Record<string, Answer> = {};
  for (const it of sel) answers[it.id] = 1;
  const p = buildProfile(sel, answers, valences, pw);
  const coords = p.marks.map((m) => Math.abs(m.coordinate));
  const atPoles = coords.filter((c) => c > 0.6).length / Math.max(1, coords.length);
  return { spread: p.crossoverShare, atPoles, n: p.n };
}

const noReserveProfile = profileFor(noReserve.selected);
const reserveProfile = profileFor(res.selected);
console.log(`  reserve 0   : ${noReserveProfile.n} marks, ${(noReserveProfile.atPoles * 100).toFixed(0)}% sit at |coordinate| > 0.6`);
console.log(`  reserve 1/3 : ${reserveProfile.n} marks, ${(reserveProfile.atPoles * 100).toFixed(0)}% sit at |coordinate| > 0.6`);

check('reserve 0 pushes nearly every mark to a pole',
  noReserveProfile.atPoles > 0.9,
  `${(noReserveProfile.atPoles * 100).toFixed(0)}% at the poles — a bimodal plot is guaranteed`);
check('the reserve puts real mass off the poles',
  reserveProfile.atPoles < 0.75,
  `${(reserveProfile.atPoles * 100).toFixed(0)}% at the poles`);

// ---------------------------------------------------------------------------
console.log('\n=== shortfall is reported, not silently backfilled ===\n');

// Strip the cross-cutting items from one category only.
const thin = items.filter((i) => !(i.id.startsWith('cc-0-')));
const thinRes = selectItems(thin, computeValences(thin, roster), DEFAULT_RULE);
const edu = thinRes.byCategory.find((c) => c.category === 'Education')!;
check('a category with no cross-cutting items reports a shortfall',
  edu.reserveShortfall > 0 && edu.crossCutting === 0,
  `wanted ${edu.reserveWanted}, short ${edu.reserveShortfall}`);
check('the shortfall is backfilled to keep the category full',
  edu.selected === DEFAULT_RULE.maxPerCategory, `selected ${edu.selected}`);
check('and the backfill is disclosed in the audit log',
  thinRes.auditLog.some((l) => l.includes('Education') && l.includes('RESERVE SHORT BY')),
  thinRes.auditLog.find((l) => l.includes('Education'))?.trim().slice(0, 96));

// ---------------------------------------------------------------------------
console.log('\n=== uncategorized items are flagged, not silently pooled ===\n');
const uncat = items.map((i) => ({ ...i, category: '' }));
const uncatRes = selectItems(uncat, computeValences(uncat, roster), DEFAULT_RULE);
check('missing categories produce a warning',
  uncatRes.auditLog.some((l) => l.includes('no category') && l.includes('OPEN_QUESTIONS #6')));
check('and the cap then applies to the single pool, not per real category',
  uncatRes.selected.length === DEFAULT_RULE.maxPerCategory,
  `${uncatRes.selected.length} selected vs ${res.selected.length} when categorized`);

console.log('\n--- audit log (default rule) ---');
res.auditLog.forEach((l) => console.log('  ' + l));

console.log(
  failures === 0 ? '\n=== all checks passed ===\n' : `\n=== ${failures} CHECK(S) FAILED ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
