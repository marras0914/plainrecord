/**
 * PlainRecord — smoke test for the evidence tier model
 *
 * Runs against the REAL veto data pulled by scripts/fetch_vetoes.ts plus the
 * curated stated positions, so the coverage numbers printed here are the actual
 * numbers the results screen would have to display.
 *
 * Run: npx tsx evidence.smoke.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WORK_DIR } from './scripts/paths';
import type { Evidence } from './evidence';
import {
  TIER_OF,
  validateEvidence,
  assertComparable,
  coverageFor,
  describeCoverage,
  scoreableEvidence,
  findCollisions,
} from './evidence';
import {
  CANDIDATES, STANCES, PRIORITY_BILLS, KNOWN_GAPS, TOPICS,
  UNRESEARCHED_BALLOT_CANDIDATES,
} from './stated_positions';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
console.log('\n=== tier rules ===\n');

check('roll_call is tier vote', TIER_OF.roll_call === 'vote');
check('veto is tier act', TIER_OF.veto === 'act');
check('campaign_platform is tier stance', TIER_OF.campaign_platform === 'stance');

// A stance claiming a bill is a category error: it would be an act.
let threw = '';
try {
  validateEvidence({
    personId: 'x', kind: 'campaign_platform', position: 1,
    billId: 'HB 1', session: '89R', date: null, sourceUrl: 'https://example.org',
  });
} catch (e) { threw = (e as Error).message; }
check('stance with a billId is rejected', threw.includes('must not claim a billId'));

// An act without a bill cannot join to anything.
threw = '';
try {
  validateEvidence({
    personId: 'x', kind: 'veto', position: -1,
    billId: null, session: '89R', date: null, sourceUrl: 'https://example.org',
  });
} catch (e) { threw = (e as Error).message; }
check('act without a billId is rejected', threw.includes('requires a billId'));

// No unsourced evidence, any tier.
threw = '';
try {
  validateEvidence({
    personId: 'x', kind: 'roll_call', position: 1,
    billId: 'HB 1', session: '89R', date: null, sourceUrl: '',
  });
} catch (e) { threw = (e as Error).message; }
check('unsourced evidence is rejected', threw.includes('sourceUrl'));

const aVote: Evidence = { personId: 'a', kind: 'roll_call', position: 1, billId: 'HB 1',
  session: '89R', date: null, sourceUrl: 'https://x' };
const aVeto: Evidence = { personId: 'b', kind: 'veto', position: -1, billId: 'HB 1',
  session: '89R', date: null, sourceUrl: 'https://x' };
const aStance: Evidence = { personId: 'c', kind: 'campaign_platform', position: 1, billId: null,
  session: null, date: null, sourceUrl: 'https://x' };

threw = '';
try { assertComparable(aVote, aVeto); } catch (e) { threw = (e as Error).message; }
check('refuses to compare a roll call with a veto', threw.includes('refusing to compare'),
  threw.split('.')[0]);

threw = '';
try { assertComparable(aStance, aStance); } catch (e) { threw = (e as Error).message; }
check("refuses to score tier 'stance' at all", threw.includes("refusing to score tier 'stance'"));

check('comparing two roll calls is allowed', (() => {
  try { assertComparable(aVote, { ...aVote, personId: 'z' }); return true; } catch { return false; }
})());

// ---------------------------------------------------------------------------
console.log('\n=== curated data integrity ===\n');

check('every candidate has a unique id',
  new Set(CANDIDATES.map((c) => c.id)).size === CANDIDATES.length);
check('no ballot candidate left unresearched',
  UNRESEARCHED_BALLOT_CANDIDATES.length === 0,
  UNRESEARCHED_BALLOT_CANDIDATES.map((c) => c.name).join(', ') || 'none outstanding');
check('every race has at least two candidates covered', (() => {
  const byOffice = new Map<string, number>();
  for (const c of CANDIDATES) byOffice.set(c.office, (byOffice.get(c.office) ?? 0) + 1);
  return [...byOffice.values()].every((n) => n >= 2);
})(), [...new Set(CANDIDATES.map((c) => `${c.office}:${CANDIDATES.filter((x) => x.office === c.office).length}`))].join('  '));
check('the three Republicans have no overlapping vote sessions with the Democrats', (() => {
  const dem = new Set(CANDIDATES.filter((c) => c.party === 'D').flatMap((c) => c.voteSessions));
  const rep = CANDIDATES.filter((c) => c.party === 'R').flatMap((c) => c.voteSessions);
  return rep.every((s) => !dem.has(s));
})(), 'zero shared sessions — this is the structural finding');

check('every stance topic is in the controlled vocabulary',
  STANCES.every((s) => s.topic! in TOPICS));
check('every stance has a source', STANCES.every((s) => /^https?:\/\//.test(s.sourceUrl)));
check('no stance carries a billId', STANCES.every((s) => s.billId === null));
check('priority bills all carry a billId', PRIORITY_BILLS.every((p) => !!p.billId));
check('priority bills are all support (+1)', PRIORITY_BILLS.every((p) => p.position === 1));
check('known gaps are recorded', KNOWN_GAPS.length > 0, `${KNOWN_GAPS.length} logged`);

// Balance check: a topic with only one party's positions flatters that side.
const byTopic = new Map<string, Set<string>>();
for (const s of STANCES) {
  const party = CANDIDATES.find((c) => c.id === s.personId)!.party;
  if (!byTopic.has(s.topic!)) byTopic.set(s.topic!, new Set());
  byTopic.get(s.topic!)!.add(party);
}
const oneSidedTopics = [...byTopic.entries()].filter(([, ps]) => ps.size === 1).map(([t]) => t);
console.log(`\n  topics with both parties represented: ${
  [...byTopic.values()].filter((p) => p.size > 1).length} of ${byTopic.size}`);
console.log(`  single-party topics (${oneSidedTopics.length}): ${oneSidedTopics.join(', ')}`);
check('the single-party imbalance is measurable, not hidden', oneSidedTopics.length > 0,
  'expected — and KNOWN_GAPS says so out loud');

// ---------------------------------------------------------------------------
console.log('\n=== coverage against REAL veto data ===\n');

// Vetoes are a BUILD INPUT, not shipped output: they live in WORK_DIR. Keeping
// this path in sync with scripts/paths.ts matters — hardcoding the old ship dir
// made this suite silently skip the collision checks when the dirs were split.
const vetoPath = join(WORK_DIR, 'tx_evidence_vetoes.json');
if (!existsSync(vetoPath)) {
  console.log(`  (${vetoPath} missing — run scripts/fetch_vetoes.ts first)`);
} else {
  const vetoes: Evidence[] = JSON.parse(readFileSync(vetoPath, 'utf8'));
  vetoes.forEach(validateEvidence);
  check('all real veto records validate', true, `${vetoes.length} records`);
  check('every real veto is opposition', vetoes.every((v) => v.position === -1));

  const all = [...vetoes, ...PRIORITY_BILLS, ...STANCES];

  console.log('');
  let guarded = 0;
  for (const c of CANDIDATES) {
    // expectsVotes is true when the person actually sat in a chamber we score.
    const expects = c.voteSessions.some((s) => ['85R','86R','87R','88R','89R'].includes(s));
    const cov = coverageFor(c.id, all, expects);
    const tiers = `vote ${cov.byTier.vote} / act ${cov.byTier.act} / stance ${cov.byTier.stance}`;
    let line: string;
    try {
      line = `"${describeCoverage(cov)}"`;
    } catch (e) {
      guarded++;
      line = `BLOCKED: ${(e as Error).message.split('.')[0]}`;
    }
    console.log(`  ${c.name.padEnd(16)} ${tiers.padEnd(34)} sidedness ${cov.sidedness.toFixed(2)}${
      cov.oneSided ? '  ONE-SIDED' : ''}`);
    console.log(`  ${' '.repeat(16)} ${line}`);
  }
  check(
    'sitting legislators with no loaded votes are BLOCKED, not described',
    guarded === 3,
    `${guarded} of 3 Democrats blocked until the ingest runs`,
  );

  const abbott = coverageFor('tx-gov-abbott-greg', all, false);
  check('\n  Abbott has acts but no votes',
    abbott.byTier.act > 200 && abbott.byTier.vote === 0, `${abbott.byTier.act} acts`);
  check('  Abbott is flagged one-sided', abbott.oneSided,
    `sidedness ${abbott.sidedness.toFixed(2)}`);

  const patrick = coverageFor('tx-ltgov-patrick-dan', all, false);
  check('  Patrick is flagged one-sided', patrick.oneSided,
    `${patrick.byTier.act} priority bills, all +1`);

  const paxton = coverageFor('tx-ag-paxton-ken', all, false);
  check('  Paxton has no scoreable evidence at all', paxton.byTier.act === 0 &&
    paxton.byTier.vote === 0, `only ${paxton.byTier.stance} stances`);

  const scoreable = scoreableEvidence(all);
  const people = new Set(scoreable.map((e) => e.personId));
  check('  no Republican survives into the scoreable set', (() => {
    const reps = CANDIDATES.filter((c) => c.party === 'R').map((c) => c.id);
    return reps.every((r) => !people.has(r));
  })(), 'so no leaderboard can accidentally mix them in');
  check('  and no stance survives either',
    scoreable.every((e) => TIER_OF[e.kind] !== 'stance'));

  // Build a genuinely BALANCED record so the person is not dropped by the
  // one-sided rule — otherwise this check passes vacuously on an empty result.
  const lineItems = vetoes.filter((v) => v.kind === 'line_item_veto').slice(0, 3);
  const realVetoes = vetoes.filter((v) => v.kind === 'veto').slice(0, 4);
  const balanced: Evidence[] = [
    ...lineItems.map((v) => ({ ...v, personId: 'mixed' })),
    ...realVetoes.map((v) => ({ ...v, personId: 'mixed' })),
    ...Array.from({ length: 4 }, (_, i) => ({
      personId: 'mixed', kind: 'roll_call' as const, position: 1 as const,
      billId: `HB ${9000 + i}`, session: '89R', date: null, sourceUrl: 'https://x',
    })),
  ];
  const mixedCov = coverageFor('mixed', balanced, false);
  check('  fixture is genuinely balanced, so the next check is not vacuous',
    !mixedCov.oneSided, `sidedness ${mixedCov.sidedness.toFixed(2)}`);

  const kept = scoreableEvidence(balanced);
  check('  line-item vetoes excluded by kind even for a balanced record',
    kept.length > 0 && kept.every((e) => e.kind !== 'line_item_veto'),
    `${kept.length} kept of ${balanced.length}, ${lineItems.length} line-item dropped`);
}

// ---------------------------------------------------------------------------
console.log('\n=== collisions: opposite positions on an identical bill ===\n');

{
  const vetoes: Evidence[] = existsSync(vetoPath)
    ? JSON.parse(readFileSync(vetoPath, 'utf8'))
    : [];
  const collisions = findCollisions([...vetoes, ...PRIORITY_BILLS, ...STANCES]);
  const name = (id: string) => CANDIDATES.find((x) => x.id === id)?.name ?? id;
  for (const c of collisions) {
    console.log(`  ${c.session} ${c.billId}`);
    console.log(`    for:     ${c.supporters.map((s) => `${name(s.personId)} (${s.kind})`).join(', ')}`);
    console.log(`    against: ${c.opponents.map((o) => `${name(o.personId)} (${o.kind})`).join(', ')}`);
  }
  console.log('');
  check('SB 3 (89R) collision found: Patrick priority vs Abbott veto',
    collisions.some((c) => c.billId === 'SB 3' && c.session === '89R'),
    `${collisions.length} collision(s) total`);
  check('the SB 3 collision is between two Republicans', (() => {
    const c = collisions.find((x) => x.billId === 'SB 3');
    if (!c) return false;
    const parties = [...c.supporters, ...c.opponents]
      .map((p) => CANDIDATES.find((x) => x.id === p.personId)?.party);
    return parties.length === 2 && parties.every((p) => p === 'R');
  })(), 'an intra-party split on an identical bill — what a blind quiz can actually reveal');
  check('line-item vetoes never create a collision',
    !collisions.some((c) => c.billId === 'SB 1'),
    'SB 1 is both a Patrick priority and a line-item veto; correctly not a disagreement');
  check('no collision mixes in a stance',
    collisions.every((c) => [...c.supporters, ...c.opponents]
      .every((p) => TIER_OF[p.kind] !== 'stance')));
}

console.log(
  failures === 0 ? '\n=== all checks passed ===\n' : `\n=== ${failures} CHECK(S) FAILED ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
