/**
 * PlainRecord — smoke test for the Open States ingest
 *
 * The fixture uses the REAL column names and vocabulary, taken from source:
 *   - CSV layout / columns: openstates.org/bulk/management/commands/bulk_export.py
 *   - PersonVote, VoteCount fields: openstates-core/openstates/data/models/vote.py
 *   - VOTE_OPTION_CHOICES + VOTE_CLASSIFICATION_CHOICES:
 *     openstates-core/openstates/data/common.py
 *
 * Run: npx tsx scripts/ingest_openstates.smoke.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ingestOpenStates,
  decodeOption,
  decodeParty,
  unwrapClassification,
  classifyOpenStates,
} from './ingest_openstates';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
console.log('\n=== vote options (real Open States vocabulary) ===\n');

check('yes -> +1', decodeOption('yes') === 1);
check('no -> -1', decodeOption('no') === -1);
check('absent -> null', decodeOption('absent') === null);
check('abstain -> null', decodeOption('abstain') === null);
check('"not voting" -> null, not Nay', decodeOption('not voting') === null);
check('excused -> null', decodeOption('excused') === null);
check('paired -> null (an offset, not a position)', decodeOption('paired') === null);
check('other -> null', decodeOption('other') === null);
let threw = '';
try { decodeOption('probably'); } catch (e) { threw = (e as Error).message; }
check('unknown option throws rather than guessing', threw.includes('unrecognized'));

check('party Democratic -> D', decodeParty('Democratic') === 'D');
check('party Republican -> R', decodeParty('Republican') === 'R');
check('party Independent -> O', decodeParty('Independent') === 'O');

// ---------------------------------------------------------------------------
console.log('\n=== ArrayField unwrapping + classification ===\n');

check("['passage'] unwraps", unwrapClassification("['passage']") === 'passage',
  unwrapClassification("['passage']"));
check('empty array unwraps to empty', unwrapClassification('[]') === '');
check('multi-value unwraps', unwrapClassification("['reading-3', 'passage']") === 'reading-3 passage');

check('reading-3 is substantive third_reading',
  classifyOpenStates('', "['reading-3']").voteType === 'third_reading');
check('amendment is substantive',
  classifyOpenStates('', "['amendment']").substantive === true);
check('committee-passage is NOT substantive (floor votes only)',
  classifyOpenStates('', "['committee-passage']").substantive === false);
check('reading-1 is NOT substantive',
  classifyOpenStates('', "['reading-1']").substantive === false);
check('empty classification falls back to prose classifier',
  classifyOpenStates('Motion to table', '[]').substantive === false);
check('prose fallback still recognizes final passage',
  classifyOpenStates('Third Reading & Final Passage', '[]').voteType === 'third_reading');

// Real 89R motion text. Open States labels these {passage, reading-3}; the prose
// says they are rule suspensions. The prose must win. All 1,069 of them in the
// real session were previously scored as substantive third readings.
const REAL_SUSPENSION =
  'Senate Rule 7.18 and the Constitutional Rule requiring bills to be read on ' +
  'three several days be suspended and that CSHB 114 be placed on its third ' +
  'reading and final passage.';
check('REAL Texas rule-suspension text is procedural despite {passage,reading-3}',
  classifyOpenStates(REAL_SUSPENSION, "['passage', 'reading-3']").substantive === false,
  classifyOpenStates(REAL_SUSPENSION, "['passage', 'reading-3']").voteType);
check('a genuine third reading is still substantive',
  classifyOpenStates('passage', "['passage', 'reading-3']").substantive === true);

// ---------------------------------------------------------------------------
console.log('\n=== full ingest over a fake Open States export ===\n');

const root = mkdtempSync(join(tmpdir(), 'openstates-fixture-'));
const dir = join(root, 'tx', '89');
mkdirSync(dir, { recursive: true });

const P = (n: string) => `ocd-person/0000000${n}-0000-0000-0000-000000000000`;
const B = (n: string) => `ocd-bill/0000000${n}-0000-0000-0000-000000000000`;
const V = (n: string) => `ocd-vote/0000000${n}-0000-0000-0000-000000000000`;

writeFileSync(
  join(dir, 'tx_89_bills.csv'),
  'id,identifier,title,classification,subject,session_identifier,jurisdiction,organization_classification\n' +
    `${B('1')},HB 1,"Relating to schools, funding","['bill']","[]",89,Texas,lower\n` +
    `${B('2')},HB 2,"Relating to water","['bill']","[]",89,Texas,lower\n` +
    `${B('3')},SB 3,"Relating to THC","['bill']","[]",89,Texas,upper\n`,
);

// HB1: second reading + third reading -> second must drop.
// HB2: committee-passage -> not a floor vote, drops.
// SB3: passage, author votes no -> review flag; one member "not voting".
writeFileSync(
  join(dir, 'tx_89_votes.csv'),
  'id,identifier,motion_text,motion_classification,start_date,result,organization_id,bill_id,bill_action_id,jurisdiction,session_identifier\n' +
    `${V('1')},,"Second Reading","['reading-2']",2025-04-01,pass,ocd-organization/x,${B('1')},,Texas,89\n` +
    `${V('2')},,"Third Reading & Final Passage","['reading-3', 'passage']",2025-04-02,pass,ocd-organization/x,${B('1')},,Texas,89\n` +
    `${V('3')},,"Committee report adopted","['committee-passage']",2025-04-03,pass,ocd-organization/x,${B('2')},,Texas,89\n` +
    `${V('4')},,"Passage","['passage']",2025-04-04,pass,ocd-organization/x,${B('3')},,Texas,89\n`,
);

writeFileSync(
  join(dir, 'tx_89_vote_people.csv'),
  'id,vote_event_id,option,voter_name,voter_id,note\n' +
    // HB1 2nd
    `1,${V('1')},yes,"Doe, Jane",${P('1')},\n2,${V('1')},yes,"Roe, Rick",${P('2')},\n` +
    `3,${V('1')},no,"Poe, Paula",${P('3')},\n` +
    // HB1 3rd
    `4,${V('2')},yes,"Doe, Jane",${P('1')},\n5,${V('2')},yes,"Roe, Rick",${P('2')},\n` +
    `6,${V('2')},no,"Poe, Paula",${P('3')},\n` +
    // HB2 committee
    `7,${V('3')},yes,"Doe, Jane",${P('1')},\n8,${V('3')},no,"Poe, Paula",${P('3')},\n` +
    // SB3 passage: P3 is the author and votes no; P4 not voting; unresolved row
    `9,${V('4')},yes,"Doe, Jane",${P('1')},\n10,${V('4')},yes,"Roe, Rick",${P('2')},\n` +
    `11,${V('4')},no,"Poe, Paula",${P('3')},\n` +
    `12,${V('4')},not voting,"Coe, Chris",${P('4')},\n` +
    `13,${V('4')},yes,"Unmatched Person",,\n`,
);

writeFileSync(
  join(dir, 'tx_89_vote_counts.csv'),
  'id,vote_event_id,option,value\n' +
    `1,${V('2')},yes,2\n2,${V('2')},no,1\n` +
    `3,${V('4')},yes,97\n4,${V('4')},no,50\n5,${V('4')},not voting,3\n`,
);

writeFileSync(
  join(dir, 'tx_89_bill_sponsorships.csv'),
  'id,bill_id,name,entity_type,organization_id,person_id,primary,classification\n' +
    `1,${B('3')},"Poe, Paula",person,,${P('3')},True,primary\n` +
    `2,${B('1')},"Doe, Jane",person,,${P('1')},True,primary\n` +
    `3,${B('3')},"Roe, Rick",person,,${P('2')},False,cosponsor\n`,
);

// --- roster refusal: current_party must not be accepted silently ---
const currentPeople = join(root, 'tx_current.csv');
writeFileSync(
  currentPeople,
  'id,name,current_party,current_district,current_chamber\n' +
    `${P('1')},Jane Doe,Republican,1,lower\n` +
    `${P('2')},Rick Roe,Republican,2,lower\n` +
    `${P('3')},Paula Poe,Democratic,3,lower\n` +
    `${P('4')},Chris Coe,Independent,4,lower\n`,
);

threw = '';
try {
  ingestOpenStates(root, '89R', { peopleCsv: currentPeople });
} catch (e) { threw = (e as Error).message; }
check('current_party roster is REFUSED without the explicit flag',
  threw.includes('current_party') && threw.includes('DATA_PIPELINE'),
  threw.split('\n')[0].slice(0, 90));

const withFlag = ingestOpenStates(root, '89R', {
  peopleCsv: currentPeople,
  allowCurrentParty: true,
});
check('with --allow-current-party it proceeds and records the compromise',
  withFlag.rosterIsCurrentParty === true);

// --- session-scoped roster is accepted with no flag ---
const sessionPeople = join(root, 'tx_people_89.csv');
writeFileSync(
  sessionPeople,
  'id,name,party,party_start_date,party_end_date\n' +
    `${P('1')},Jane Doe,Republican,2003-01-01,\n` +
    `${P('2')},Rick Roe,Republican,2011-01-01,\n` +
    `${P('3')},Paula Poe,Democratic,2017-01-01,\n` +
    `${P('4')},Chris Coe,Independent,2019-01-01,\n`,
);

const res = ingestOpenStates(root, '89R', { peopleCsv: sessionPeople });
check('session-scoped roster needs no flag', res.rosterIsCurrentParty === false);
check('roster built', Object.keys(res.roster).length === 4);
check('party decoded from full words', res.roster[P('3')] === 'D' && res.roster[P('1')] === 'R');

const ids = res.items.map((i) => i.id);
check('committee-passage dropped', !ids.includes(V('3')), `items: ${ids.length}`);
check('superseded second reading dropped', !ids.includes(V('1')));
check('third reading kept', ids.includes(V('2')));
check('floor passage kept', ids.includes(V('4')));
check('exactly 2 items emitted', res.items.length === 2, `${res.items.length}`);

const hb1 = res.items.find((i) => i.id === V('2'))!;
check('bill_id resolved to identifier', hb1.billId === 'HB 1', hb1.billId);
check('session label is the PlainRecord label, not "89"', hb1.session === '89R');
check('votes keyed by ocd-person id', hb1.votes[P('1')] === 1 && hb1.votes[P('3')] === -1);

const sb3 = res.items.find((i) => i.id === V('4'))!;
check('"not voting" stored as null', sb3.votes[P('4')] === null);
check('published tally preferred over counting rows',
  sb3.yeas === 97 && sb3.nays === 50, `${sb3.yeas}/${sb3.nays}`);
check('tally falls back to counting when counts are absent',
  res.items.every((i) => i.yeas + i.nays > 0));
check('unresolved voter rows dropped, not merged under a name key',
  res.stats.unresolvedVoterRows === 1 && !Object.keys(sb3.votes).includes('Unmatched Person'),
  `${res.stats.unresolvedVoterRows} dropped`);

check('primary author voting against own bill flagged',
  res.reviewFlags.some((f) => f.personId === P('3') && f.billId === 'SB 3'),
  JSON.stringify(res.reviewFlags.map((f) => f.billId)));
check('non-primary cosponsor not flagged',
  !res.reviewFlags.some((f) => f.personId === P('2')));

// --- no roster at all is allowed, and says so ---
const noRoster = ingestOpenStates(root, '89R');
check('ingest works with no roster (valence simply unavailable)',
  noRoster.items.length === 2 && Object.keys(noRoster.roster).length === 0);

// --- the same defensive column failure as the LegiScan adapter ---
const bad = mkdtempSync(join(tmpdir(), 'openstates-bad-'));
mkdirSync(join(bad, 'tx', '89'), { recursive: true });
writeFileSync(join(bad, 'tx', '89', 'tx_89_bills.csv'), 'nope,nada\n1,2\n');
threw = '';
try { ingestOpenStates(bad, '89R'); } catch (e) { threw = (e as Error).message; }
check('missing column fails loudly with real headers',
  threw.includes('headers present') || threw.includes('none of'),
  threw.split('\n')[0].slice(0, 80));

rmSync(root, { recursive: true, force: true });
rmSync(bad, { recursive: true, force: true });

console.log(
  failures === 0 ? '\n=== all checks passed ===\n' : `\n=== ${failures} CHECK(S) FAILED ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
