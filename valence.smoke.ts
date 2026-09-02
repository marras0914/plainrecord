/**
 * PlainRecord — smoke test for valence.ts
 *
 * Synthetic 150-member chamber (90 R / 60 D, Texas House shape) with four kinds
 * of item. Verifies:
 *
 *   1. valence sign and magnitude are right, and thin caucuses return null
 *   2. a MIXED voter and a MUTED voter produce the same netLean but different
 *      crossoverShare, partisanLoad, and headline  <-- the whole point
 *   3. three same-party candidates do NOT separate on chamber-split items
 *
 * Run: npx tsx valence.smoke.ts
 */

import type { VoteItem, VoteCast, Answer } from './scoring';
import { computeWeights, scoreLegislator, DEFAULT_OPTIONS, describeScore } from './scoring';
import {
  computeValences,
  buildProfile,
  describeProfile,
  itemValence,
  profileWeights,
  type PartyRoster,
  type PartisanProfile,
} from './valence';

// ---------------------------------------------------------------------------
// Synthetic chamber
// ---------------------------------------------------------------------------

const REPUBLICANS = Array.from({ length: 90 }, (_, i) => `R${i + 1}`);
const DEMOCRATS = Array.from({ length: 60 }, (_, i) => `D${i + 1}`);

// The three candidates, as Democrats in the same chamber.
const GOODWIN = 'D1';
const HINOJOSA = 'D2';
const TALARICO = 'D3';

const roster: PartyRoster = {};
for (const id of REPUBLICANS) roster[id] = 'R';
for (const id of DEMOCRATS) roster[id] = 'D';

function makeItem(
  id: string,
  billId: string,
  category: string,
  votes: Record<string, VoteCast>,
  substantive = true,
): VoteItem {
  let yeas = 0;
  let nays = 0;
  for (const v of Object.values(votes)) {
    if (v === 1) yeas++;
    else if (v === -1) nays++;
  }
  return {
    id,
    billId,
    session: '89R',
    category,
    voteType: 'final',
    substantive,
    yeas,
    nays,
    votes,
  };
}

/**
 * R side takes `rSide`, D side takes the opposite, with a few defectors each way.
 * Defectors are drawn from the END of each caucus so they are never D1/D2/D3 —
 * the three candidates must vote WITH their caucus here, which is the whole
 * point of the separation test below.
 */
function partyLine(
  id: string,
  billId: string,
  category: string,
  rSide: 1 | -1,
  variant = 0,
): VoteItem {
  // Vary the defector count per item so the party-line items are not perfectly
  // (anti)correlated with each other — real roll calls aren't.
  const rDefectors = 2 + (variant % 5);
  const dDefectors = 1 + (variant % 4);
  const votes: Record<string, VoteCast> = {};
  REPUBLICANS.forEach(
    (r, i) => (votes[r] = i >= 90 - rDefectors ? ((-rSide) as VoteCast) : rSide),
  );
  DEMOCRATS.forEach((d, i) => (votes[d] = i >= 60 - dDefectors ? rSide : ((-rSide) as VoteCast)));
  return makeItem(id, billId, category, votes);
}

/**
 * Chamber splits hard, but the split does not track party. High 4p(1-p), ~zero
 * valence. Each item gets its own deterministic pseudo-random split so the
 * cross-cutting items are uncorrelated with each other AND with party — an
 * `i % 2` pattern would make them all identical and cluster them spuriously.
 */
function crossCutting(id: string, billId: string, category: string, variant: number): VoteItem {
  // Mix the bits before taking the low one. The low bit of a plain linear
  // expression is determined by the parities of i and variant alone, which makes
  // every item a copy or mirror of every other — perfectly correlated, not random.
  const split = (i: number): VoteCast => {
    let t = (i * 374761393 + variant * 668265263) >>> 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177) >>> 0;
    t = (t ^ (t >>> 16)) >>> 0;
    return (t & 1) === 0 ? 1 : -1;
  };
  const votes: Record<string, VoteCast> = {};
  [...REPUBLICANS, ...DEMOCRATS].forEach((m, i) => (votes[m] = split(i)));
  return makeItem(id, billId, category, votes);
}

/** R mostly Yea; the D caucus splits. This is where same-party candidates diverge. */
function intraDemSplit(
  id: string,
  billId: string,
  category: string,
  candidateVotes: Record<string, VoteCast>,
): VoteItem {
  const votes: Record<string, VoteCast> = {};
  REPUBLICANS.forEach((r) => (votes[r] = 1));
  DEMOCRATS.forEach((d, i) => (votes[d] = i % 2 === 0 ? 1 : -1));
  Object.assign(votes, candidateVotes);
  return makeItem(id, billId, category, votes);
}

/** Everyone agrees. Should be dropped by the eligibility floor. */
function consensus(id: string, billId: string, category: string): VoteItem {
  const votes: Record<string, VoteCast> = {};
  for (const id2 of [...REPUBLICANS, ...DEMOCRATS]) votes[id2] = 1;
  return makeItem(id, billId, category, votes);
}

const CATEGORIES = ['education', 'health', 'taxes', 'energy', 'courts'];

const items: VoteItem[] = [
  // 10 party-line items, alternating which side Yea sits on so a user answering
  // "Yea to everything" cannot accidentally look partisan.
  ...Array.from({ length: 10 }, (_, i) =>
    partyLine(`pl${i + 1}`, `HB${100 + i}`, CATEGORIES[i % 5], i % 2 === 0 ? 1 : -1, i),
  ),
  // 6 cross-cutting items: chamber divided, parties not.
  ...Array.from({ length: 6 }, (_, i) =>
    crossCutting(`cc${i + 1}`, `HB${200 + i}`, CATEGORIES[i % 5], i + 1),
  ),
  // 4 intra-Democratic splits, where the three candidates actually differ.
  intraDemSplit('id1', 'HB301', 'energy', {
    [GOODWIN]: 1,
    [HINOJOSA]: -1,
    [TALARICO]: -1,
  }),
  intraDemSplit('id2', 'HB302', 'taxes', {
    [GOODWIN]: 1,
    [HINOJOSA]: 1,
    [TALARICO]: -1,
  }),
  intraDemSplit('id3', 'HB303', 'courts', {
    [GOODWIN]: -1,
    [HINOJOSA]: 1,
    [TALARICO]: -1,
  }),
  intraDemSplit('id4', 'HB304', 'education', {
    [GOODWIN]: -1,
    [HINOJOSA]: -1,
    [TALARICO]: 1,
  }),
  // 2 consensus items — must be dropped.
  consensus('cn1', 'HB401', 'health'),
  consensus('cn2', 'HB402', 'energy'),
];

const valences = computeValences(items, roster);
// Alignment scores use scoring.ts weights; the red/blue profile uses the
// narrower same-bill-only redundancy correction. See profileWeights().
const weights = computeWeights(items, DEFAULT_OPTIONS);
const pWeights = profileWeights(items, DEFAULT_OPTIONS);

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

let failures = 0;
function check(label: string, condition: boolean, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? '  — ' + detail : ''}`);
}

function f(n: number, d = 2): string {
  return n.toFixed(d).padStart(d + 3);
}

/** ASCII version of the dot strip, so the shape is visible in the terminal. */
function strip(p: PartisanProfile, width = 61): string {
  const row = new Array(width).fill(' ');
  const mid = Math.floor(width / 2);
  row[mid] = '|';
  for (const m of p.marks) {
    const col = Math.round(mid + m.coordinate * mid);
    const c = Math.max(0, Math.min(width - 1, col));
    row[c] = row[c] === ' ' || row[c] === '|' ? '*' : ':';
  }
  return `blue ${row.join('')} red`;
}

function report(name: string, p: PartisanProfile) {
  const d = describeProfile(p);
  console.log(`\n  ${name}`);
  console.log(`  ${strip(p)}`);
  console.log(
    `  n=${p.n}  netLean=${f(p.netLean)}  crossover=${f(p.crossoverShare)}  ` +
      `load=${f(p.partisanLoad)}  colorless=${p.colorlessCount}`,
  );
  console.log(`  "${d.headline}"`);
  if (d.caveat) console.log(`  caveat: ${d.caveat}`);
}

// ---------------------------------------------------------------------------
// 1. Valence mechanics
// ---------------------------------------------------------------------------

console.log('\n=== 1. Valence mechanics ===\n');

const plYea = valences.get('pl1')!; // Yea is the R side
const plNay = valences.get('pl2')!; // Yea is the D side
const cc = valences.get('cc1')!;

check('party-line (Yea = R side) has positive valence', (plYea.valence ?? 0) > 0.9, `${f(plYea.valence!)}`);
check('party-line (Yea = D side) has negative valence', (plNay.valence ?? 0) < -0.9, `${f(plNay.valence!)}`);
check(
  'cross-cutting item has ~zero valence despite a 50/50 chamber',
  Math.abs(cc.valence ?? 1) < 0.05,
  `valence=${f(cc.valence!)}  but 4p(1-p) is near 1`,
);
check(
  'valence receipt is reportable',
  plYea.rYeaShare !== null && plYea.dYeaShare !== null,
  `R ${Math.round(plYea.rYeaShare! * 100)}% Yea vs D ${Math.round(plYea.dYeaShare! * 100)}% Yea`,
);

// Thin caucus -> null.
const thinVotes: Record<string, VoteCast> = {};
REPUBLICANS.forEach((r) => (thinVotes[r] = 1));
DEMOCRATS.forEach((d, i) => (thinVotes[d] = i < 4 ? -1 : null));
const thin = itemValence(makeItem('thin', 'HB999', 'health', thinVotes), roster);
check('thin caucus returns null valence rather than a confident hue', thin.valence === null);

// Eligibility floor still behaves.
check('consensus items dropped by the eligibility floor', !weights.has('cn1') && !weights.has('cn2'));
check('cross-cutting items survive the floor', weights.has('cc1'));

// ---------------------------------------------------------------------------
// 2. MIXED vs MUTED — the reason the profile is not one blended color
// ---------------------------------------------------------------------------

console.log('\n=== 2. MIXED vs MUTED ===');

/** Takes the R-coded side on half the party-line items, the D-coded side on the rest. */
const mixedAnswers: Record<string, Answer> = {};
for (let i = 0; i < 10; i++) {
  const id = `pl${i + 1}`;
  const v = valences.get(id)!.valence!;
  // First five: take the Republican-coded side. Last five: the Democratic-coded side.
  const wantRed = i < 5;
  mixedAnswers[id] = ((wantRed ? Math.sign(v) : -Math.sign(v)) || 1) as Answer;
}

/** Answers only cross-cutting items — chamber divided, parties not. */
const mutedAnswers: Record<string, Answer> = {};
for (let i = 0; i < 6; i++) mutedAnswers[`cc${i + 1}`] = 1;
// Pad to the same answer count with more cross-cutting-style noise.
for (let i = 0; i < 4; i++) mutedAnswers[`id${i + 1}`] = i % 2 === 0 ? 1 : -1;

/** Consistently takes the Democratic-coded side on party-line items. */
const consistentAnswers: Record<string, Answer> = {};
for (let i = 0; i < 10; i++) {
  const id = `pl${i + 1}`;
  const v = valences.get(id)!.valence!;
  consistentAnswers[id] = ((-Math.sign(v)) || 1) as Answer;
}

const mixed = buildProfile(items, mixedAnswers, valences, pWeights);
const muted = buildProfile(items, mutedAnswers, valences, pWeights);
const consistent = buildProfile(items, consistentAnswers, valences, pWeights);

report('MIXED  — straddles both coalitions', mixed);
report('MUTED  — only low-valence questions', muted);
report('CONSISTENT — one side of party-line votes', consistent);

console.log('');
check(
  'MIXED and MUTED have indistinguishable netLean',
  Math.abs(mixed.netLean - muted.netLean) < 0.2,
  `${f(mixed.netLean)} vs ${f(muted.netLean)} — a single blended color would show the same purple`,
);
check(
  'MIXED has far higher partisan load than MUTED',
  mixed.partisanLoad > muted.partisanLoad * 3,
  `${f(mixed.partisanLoad)} vs ${f(muted.partisanLoad)}`,
);
check(
  'MIXED has real crossover mass',
  mixed.crossoverShare > 0.35,
  `${f(mixed.crossoverShare)}`,
);
check(
  'the two get DIFFERENT headlines',
  describeProfile(mixed).headline !== describeProfile(muted).headline,
);
check('MUTED reading is flagged as weak', describeProfile(muted).caveat !== null);
check(
  'CONSISTENT reads as a clear lean, not purple',
  Math.abs(consistent.netLean) > 0.8 && consistent.crossoverShare < 0.05,
  `netLean=${f(consistent.netLean)}  crossover=${f(consistent.crossoverShare)}`,
);
check(
  'coordinate is bounded to [-1, 1]',
  [...mixed.marks, ...muted.marks].every((m) => m.coordinate >= -1 && m.coordinate <= 1),
);

// ---------------------------------------------------------------------------
// 3. Do the three candidates separate?
// ---------------------------------------------------------------------------

console.log('\n=== 3. Do the three candidates separate? ===\n');

const CANDIDATES: [string, string][] = [
  [GOODWIN, 'Goodwin'],
  [HINOJOSA, 'Hinojosa'],
  [TALARICO, 'Talarico'],
];

// A user answering only party-line items — the naive item set.
console.log('  Item set = party-line votes only (what the current eligibility floor favors):');
const plOnly: Record<string, Answer> = consistentAnswers;
const plScores = CANDIDATES.map(([id, name]) => {
  const r = scoreLegislator(id, items, plOnly, weights);
  console.log(
    `    ${name.padEnd(9)} score=${f(r.score)}  adjusted=${f(r.adjustedScore)}  n=${r.n}  ` +
      `"${describeScore(r.adjustedScore)}"`,
  );
  return r.adjustedScore;
});
const plSpread = Math.max(...plScores) - Math.min(...plScores);

// The same user, scored only on items where the D caucus actually split.
console.log('\n  Item set = intra-Democratic splits only:');
const intraAnswers: Record<string, Answer> = { id1: 1, id2: 1, id3: -1, id4: -1 };
const intraScores = CANDIDATES.map(([id, name]) => {
  const r = scoreLegislator(id, items, intraAnswers, weights);
  console.log(
    `    ${name.padEnd(9)} score=${f(r.score)}  adjusted=${f(r.adjustedScore)}  n=${r.n}  ` +
      `"${describeScore(r.adjustedScore)}"`,
  );
  return r.adjustedScore;
});
const intraSpread = Math.max(...intraScores) - Math.min(...intraScores);

console.log('');
check(
  'party-line items leave the three candidates effectively tied',
  plSpread < 0.05,
  `spread = ${f(plSpread, 3)}`,
);
check(
  'intra-caucus items separate them',
  intraSpread > plSpread * 3,
  `spread = ${f(intraSpread, 3)} vs ${f(plSpread, 3)}`,
);

// ---------------------------------------------------------------------------
// 4. Does redundancy clustering swallow the whole partisan dimension?
//
// The 0.9 threshold was designed to merge 2nd/3rd reading duplicates. But
// party-line votes genuinely correlate above 0.9 with EACH OTHER, because they
// are all the same latent axis (OPEN_QUESTIONS.md #1). If single-link clustering
// merges them all, the entire partisan dimension collapses to one item's worth
// of weight, while a cross-cutting item keeps a full 1.0 — inverting the
// intended emphasis. This section measures it rather than assuming either way.
// ---------------------------------------------------------------------------

console.log('\n=== 4. Redundancy clustering vs the partisan dimension ===\n');

import { clusterItems, itemCorrelation, discrimination } from './scoring';

const eligible = items.filter((it) => weights.has(it.id));
const clusters = clusterItems(eligible, DEFAULT_OPTIONS.redundancyThreshold);
const sizes = new Map<number, string[]>();
for (const it of eligible) {
  const c = clusters.get(it.id)!;
  if (!sizes.has(c)) sizes.set(c, []);
  sizes.get(c)!.push(it.id);
}

for (const [, members] of sizes) {
  const tag = members.length > 1 ? `CLUSTER of ${members.length}` : 'singleton';
  console.log(`    ${tag.padEnd(15)} ${members.join(', ')}`);
}

console.log(
  `\n    correlation pl1~pl3 (same side):   ${f(itemCorrelation(items[0], items[2]), 3)}`,
);
console.log(
  `    correlation pl1~pl2 (opposite):    ${f(itemCorrelation(items[0], items[1]), 3)}`,
);
console.log(
  `    correlation pl1~cc1 (cross-cut):   ${f(itemCorrelation(items[0], items[10]), 3)}`,
);

const plWeight = weights.get('pl1')!;
const ccWeight = weights.get('cc1')!;
console.log(
  `\n    pl1: discrimination ${f(discrimination(items[0]))} -> final weight ${f(plWeight, 3)}`,
);
console.log(
  `    cc1: discrimination ${f(discrimination(items[10]))} -> final weight ${f(ccWeight, 3)}`,
);

const plCluster = sizes.get(clusters.get('pl1')!)!;
console.log('');
check(
  'party-line items collapse into one cluster at threshold 0.9',
  plCluster.length >= 8,
  `${plCluster.length} of 10 party-line items merged`,
);
check(
  'the partisan dimension is diluted ~10x by its own cluster size',
  plWeight < discrimination(items[0]) / 8,
  `discrimination ${f(discrimination(items[0]))} -> weight ${f(plWeight, 3)}`,
);
check(
  'a single cross-cutting vote now outweighs a party-line vote',
  ccWeight > plWeight * 3,
  `cc1 ${f(ccWeight, 3)} vs pl1 ${f(plWeight, 3)} — the emphasis is inverted`,
);

// profileWeights() is the fix: same-bill duplicates still merge, cross-bill
// dimensional correlation does not.
console.log('');
check(
  'profileWeights keeps the partisan dimension at full weight',
  pWeights.get('pl1')! > 0.9,
  `pl1 ${f(pWeights.get('pl1')!, 3)} under profileWeights vs ${f(plWeight, 3)} under computeWeights`,
);
check(
  'profileWeights no longer inverts party-line vs cross-cutting',
  Math.abs(pWeights.get('pl1')! - pWeights.get('cc1')!) < 0.1,
  `pl1 ${f(pWeights.get('pl1')!, 3)} vs cc1 ${f(pWeights.get('cc1')!, 3)}`,
);

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? '\n=== all checks passed ===\n'
    : `\n=== ${failures} CHECK(S) FAILED ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
