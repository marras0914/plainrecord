/**
 * PlainRecord — end-to-end pipeline test
 *
 * Generates a realistically-sized Open States export (150 members), runs the real
 * ingest over it, then feeds the output through the real scoring and valence
 * modules. Catches the failure the unit tests cannot: an ingest that produces
 * well-formed files the rest of the app can't actually consume.
 *
 * Run: npx tsx scripts/pipeline.smoke.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingestOpenStates } from './ingest_openstates';
import { computeWeights, scoreLegislator, DEFAULT_OPTIONS, describeScore } from '../scoring';
import type { Answer } from '../scoring';
import { computeValences, profileWeights, buildProfile, describeProfile } from '../valence';
import type { PartyRoster } from '../valence';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
}
const f = (n: number, d = 2) => n.toFixed(d).padStart(d + 3);

// ---------------------------------------------------------------------------
// Generate a 150-member Texas House export in Open States shape
// ---------------------------------------------------------------------------

const NR = 88;
const ND = 62;
const pid = (i: number) => `ocd-person/${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`;
const REPS = Array.from({ length: NR }, (_, i) => pid(i + 1));
const DEMS = Array.from({ length: ND }, (_, i) => pid(100 + i + 1));

// Three Democrats standing in for the real candidates.
const [GOODWIN, HINOJOSA, TALARICO] = [DEMS[0], DEMS[1], DEMS[2]];

const root = mkdtempSync(join(tmpdir(), 'pipeline-'));
const dir = join(root, 'tx', '89');
mkdirSync(dir, { recursive: true });

interface Gen { billNo: number; motion: string; cls: string; votes: Record<string, string>; }
const gens: Gen[] = [];

// 14 party-line floor votes, alternating which side "yes" sits on.
for (let k = 0; k < 14; k++) {
  const yesIsR = k % 2 === 0;
  const rDef = 2 + (k % 5);
  const dDef = 1 + (k % 4);
  const votes: Record<string, string> = {};
  REPS.forEach((p, i) => (votes[p] = (i >= NR - rDef) !== yesIsR ? 'yes' : 'no'));
  DEMS.forEach((p, i) => (votes[p] = (i >= ND - dDef) === yesIsR ? 'yes' : 'no'));
  gens.push({ billNo: 100 + k, motion: 'Third Reading & Final Passage', cls: "['reading-3', 'passage']", votes });
}

// 6 cross-cutting floor votes: chamber splits, parties don't.
for (let k = 0; k < 6; k++) {
  const votes: Record<string, string> = {};
  [...REPS, ...DEMS].forEach((p, i) => {
    let t = (i * 374761393 + (k + 1) * 668265263) >>> 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177) >>> 0;
    t = (t ^ (t >>> 16)) >>> 0;
    votes[p] = (t & 1) === 0 ? 'yes' : 'no';
  });
  gens.push({ billNo: 200 + k, motion: 'Passage', cls: "['passage']", votes });
}

// 4 intra-Democratic splits: R solid yes, D caucus divided, candidates differ.
const CAND_PATTERN: [string, string, string][] = [
  ['yes', 'no', 'no'], ['yes', 'yes', 'no'], ['no', 'yes', 'no'], ['no', 'no', 'yes'],
];
for (let k = 0; k < 4; k++) {
  const votes: Record<string, string> = {};
  REPS.forEach((p) => (votes[p] = 'yes'));
  DEMS.forEach((p, i) => (votes[p] = i % 2 === 0 ? 'yes' : 'no'));
  [votes[GOODWIN], votes[HINOJOSA], votes[TALARICO]] = CAND_PATTERN[k];
  gens.push({ billNo: 300 + k, motion: 'Passage', cls: "['passage']", votes });
}

// Noise that must be filtered: a committee vote and a superseded second reading.
gens.push({
  billNo: 100, motion: 'Second Reading', cls: "['reading-2']",
  votes: Object.fromEntries([...REPS, ...DEMS].map((p) => [p, 'yes'])),
});
gens.push({
  billNo: 400, motion: 'Committee report adopted', cls: "['committee-passage']",
  votes: Object.fromEntries([...REPS.slice(0, 5), ...DEMS.slice(0, 4)].map((p) => [p, 'yes'])),
});

const bills = new Map<number, string>();
gens.forEach((g) => bills.set(g.billNo, `ocd-bill/${String(g.billNo).padStart(8, '0')}-0000-0000-0000-000000000000`));

writeFileSync(
  join(dir, 'tx_89_bills.csv'),
  'id,identifier,title,classification,subject,session_identifier,jurisdiction,organization_classification\n' +
    [...bills.entries()].map(([no, id]) =>
      `${id},HB ${no},"Placeholder bill ${no}","['bill']","[]",89,Texas,lower`).join('\n') + '\n',
);

writeFileSync(
  join(dir, 'tx_89_votes.csv'),
  'id,identifier,motion_text,motion_classification,start_date,result,organization_id,bill_id,bill_action_id,jurisdiction,session_identifier\n' +
    gens.map((g, i) =>
      `ocd-vote/${String(i + 1).padStart(8, '0')}-0000-0000-0000-000000000000,,"${g.motion}","${g.cls}",2025-04-01,pass,ocd-organization/x,${bills.get(g.billNo)},,Texas,89`,
    ).join('\n') + '\n',
);

const pvRows: string[] = [];
const vcRows: string[] = [];
let pvId = 0;
let vcId = 0;
gens.forEach((g, i) => {
  const ev = `ocd-vote/${String(i + 1).padStart(8, '0')}-0000-0000-0000-000000000000`;
  let y = 0;
  let n = 0;
  for (const [p, opt] of Object.entries(g.votes)) {
    pvRows.push(`${++pvId},${ev},${opt},"Member ${p.slice(-4)}",${p},`);
    if (opt === 'yes') y++;
    else if (opt === 'no') n++;
  }
  vcRows.push(`${++vcId},${ev},yes,${y}`);
  vcRows.push(`${++vcId},${ev},no,${n}`);
});
writeFileSync(join(dir, 'tx_89_vote_people.csv'),
  'id,vote_event_id,option,voter_name,voter_id,note\n' + pvRows.join('\n') + '\n');
writeFileSync(join(dir, 'tx_89_vote_counts.csv'),
  'id,vote_event_id,option,value\n' + vcRows.join('\n') + '\n');

const peopleCsv = join(root, 'tx_people_89.csv');
writeFileSync(
  peopleCsv,
  'id,name,party,party_start_date,party_end_date\n' +
    REPS.map((p) => `${p},Member ${p.slice(-4)},Republican,2019-01-01,`).join('\n') + '\n' +
    DEMS.map((p) => `${p},Member ${p.slice(-4)},Democratic,2019-01-01,`).join('\n') + '\n',
);

// ---------------------------------------------------------------------------
// 1. Ingest
// ---------------------------------------------------------------------------
console.log('\n=== 1. ingest ===\n');

const ing = ingestOpenStates(root, '89R', { peopleCsv });
console.log(`  ${gens.length} vote events in export -> ${ing.items.length} items emitted`);
check('committee + superseded second reading filtered', ing.items.length === 24,
  `${ing.items.length} (expected 14 party-line + 6 cross-cutting + 4 intra)`);
check('roster covers the whole chamber', Object.keys(ing.roster).length === NR + ND);
check('roster is session-scoped', ing.rosterIsCurrentParty === false);
check('every voter matched to a party',
  ing.stats.votersMatchedToParty === ing.stats.distinctVoters,
  `${ing.stats.votersMatchedToParty}/${ing.stats.distinctVoters}`);

// ---------------------------------------------------------------------------
// 2. The ingest output must be consumable by scoring.ts unchanged
// ---------------------------------------------------------------------------
console.log('\n=== 2. scoring on ingested items ===\n');

const sWeights = computeWeights(ing.items, DEFAULT_OPTIONS);
check('scoring finds eligible items in ingested data', sWeights.size > 0, `${sWeights.size} eligible`);

const roster: PartyRoster = ing.roster;
const valences = computeValences(ing.items, roster);
const withValence = [...valences.values()].filter((v) => v.valence !== null).length;
check('valence computable for ingested items', withValence === ing.items.length,
  `${withValence}/${ing.items.length}`);

// Party-line items should read as strongly partisan; cross-cutting as ~zero.
const plItem = ing.items.find((i) => i.billId === 'HB 100')!;
const ccItem = ing.items.find((i) => i.billId === 'HB 200')!;
check('party-line item has high |valence|',
  Math.abs(valences.get(plItem.id)!.valence!) > 0.85,
  `${f(valences.get(plItem.id)!.valence!)}`);
check('cross-cutting item has ~zero valence',
  Math.abs(valences.get(ccItem.id)!.valence!) < 0.15,
  `${f(valences.get(ccItem.id)!.valence!)}`);

// ---------------------------------------------------------------------------
// 3. Full profile, the way the app would build it
// ---------------------------------------------------------------------------
console.log('\n=== 3. profile ===\n');

const pWeights = profileWeights(ing.items, DEFAULT_OPTIONS);
check('profileWeights keeps the partisan dimension intact',
  pWeights.get(plItem.id)! > 0.8, `HB 100 weight ${f(pWeights.get(plItem.id)!, 3)}`);
check('computeWeights dilutes it (the documented difference)',
  sWeights.get(plItem.id)! < pWeights.get(plItem.id)! / 2,
  `${f(sWeights.get(plItem.id)!, 3)} vs ${f(pWeights.get(plItem.id)!, 3)}`);

// A voter who takes the Democratic-coded side on every party-line item.
const answers: Record<string, Answer> = {};
for (const item of ing.items) {
  if (!/^HB 1\d\d$/.test(item.billId)) continue;
  const v = valences.get(item.id)!.valence!;
  answers[item.id] = ((-Math.sign(v)) || 1) as Answer;
}
const profile = buildProfile(ing.items, answers, valences, pWeights);
const desc = describeProfile(profile);
console.log(`  n=${profile.n}  netLean=${f(profile.netLean)}  crossover=${f(profile.crossoverShare)}  load=${f(profile.partisanLoad)}`);
console.log(`  "${desc.headline}"`);
check('consistent D voter reads as a clear Democratic lean',
  profile.netLean < -0.8 && profile.crossoverShare < 0.05);
// describeProfile's copy is plain-language, so assert on the party word rather
// than the adjective: "You line up with Democrats nearly every time".
check('headline names the Democratic side',
  /Democrat/i.test(desc.headline), desc.headline);

// ---------------------------------------------------------------------------
// 4. The three candidates, through the real estimator
// ---------------------------------------------------------------------------
console.log('\n=== 4. candidates ===\n');

const CANDS: [string, string][] = [[GOODWIN, 'Goodwin'], [HINOJOSA, 'Hinojosa'], [TALARICO, 'Talarico']];
const plScores = CANDS.map(([id, name]) => {
  const r = scoreLegislator(id, ing.items, answers, sWeights);
  console.log(`  ${name.padEnd(9)} adjusted=${f(r.adjustedScore)}  n=${r.n}  "${describeScore(r.adjustedScore)}"`);
  return r.adjustedScore;
});
const plSpread = Math.max(...plScores) - Math.min(...plScores);

const intra: Record<string, Answer> = {};
ing.items.filter((i) => /^HB 3\d\d$/.test(i.billId)).forEach((i, k) => {
  intra[i.id] = (k % 2 === 0 ? 1 : -1) as Answer;
});
console.log('\n  on intra-caucus splits only:');
const intraScores = CANDS.map(([id, name]) => {
  const r = scoreLegislator(id, ing.items, intra, sWeights);
  console.log(`  ${name.padEnd(9)} adjusted=${f(r.adjustedScore)}  n=${r.n}`);
  return r.adjustedScore;
});
const intraSpread = Math.max(...intraScores) - Math.min(...intraScores);

console.log('');
check('party-line votes leave the three nearly tied', plSpread < 0.05, `spread ${f(plSpread, 3)}`);
check('intra-caucus votes separate them', intraSpread > 0.2, `spread ${f(intraSpread, 3)}`);

rmSync(root, { recursive: true, force: true });
console.log(
  failures === 0 ? '\n=== all checks passed ===\n' : `\n=== ${failures} CHECK(S) FAILED ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
