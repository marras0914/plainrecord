/**
 * PlainRecord — smoke test for the LegiScan ingest
 *
 * Builds a fake extracted archive in a temp dir and runs the real ingest over it.
 * Exercises the CSV parser (quoted fields, embedded commas and newlines, BOM),
 * the vote/party decoders, the procedural classifier, second-reading suppression,
 * and the author-against-own-bill flag.
 *
 * Run: npx tsx scripts/ingest_legiscan.smoke.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingest, parseCsv, decodeVote, decodeParty, classify } from './ingest_legiscan';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
console.log('\n=== CSV parser ===\n');

const tricky = parseCsv(
  'a,b,c\n1,"has, comma",3\n4,"has ""quotes""",6\n7,"has\nnewline",9\n',
);
check('row count', tricky.length === 4, `${tricky.length}`);
check('embedded comma', tricky[1][1] === 'has, comma', JSON.stringify(tricky[1][1]));
check('escaped quotes', tricky[2][1] === 'has "quotes"', JSON.stringify(tricky[2][1]));
check('embedded newline', tricky[3][1] === 'has\nnewline', JSON.stringify(tricky[3][1]));

const bom = parseCsv('﻿header_one,header_two\n1,2\n');
check('BOM stripped from first header', bom[0][0] === 'header_one', JSON.stringify(bom[0][0]));

// ---------------------------------------------------------------------------
console.log('\n=== decoders ===\n');

check('1 -> Yea', decodeVote('1') === 1);
check('2 -> Nay', decodeVote('2') === -1);
check('3 (NV) -> null, not Nay', decodeVote('3') === null);
check('4 (absent) -> null', decodeVote('4') === null);
check('party D', decodeParty('Democrat') === 'D');
check('party R', decodeParty('R') === 'R');
check('independent -> O', decodeParty('I') === 'O');

// ---------------------------------------------------------------------------
console.log('\n=== procedural classifier ===\n');

const cases: [string, boolean][] = [
  ['Motion to table failed', false],
  ['Suspend the rules', false],
  ['Local & Consent Calendar', false],
  ['Motion to reconsider', false],
  ['Third Reading & Final Passage', true],
  ['Second Reading', true],
  ['Amendment No. 3 by Goodwin', true],
  ['Conference Committee Report adopted', true],
  ['Something nobody has seen before', false],
];
for (const [desc, wantSubstantive] of cases) {
  const got = classify(desc);
  check(
    `"${desc}"`,
    got.substantive === wantSubstantive,
    `${got.voteType} / substantive=${got.substantive}`,
  );
}

// ---------------------------------------------------------------------------
console.log('\n=== full ingest over a fake archive ===\n');

const root = mkdtempSync(join(tmpdir(), 'legiscan-fixture-'));
const csvDir = join(root, 'csv');
mkdirSync(csvDir, { recursive: true });

// 4 members: 2 R, 2 D. Small on purpose — eligibility floors are scoring's job.
writeFileSync(
  join(csvDir, 'people.csv'),
  'people_id,name,party,district,role\n' +
    '101,"Doe, Jane",R,HD-1,Rep\n' +
    '102,"Roe, Richard",R,HD-2,Rep\n' +
    '103,"Poe, Paula",D,HD-3,Rep\n' +
    '104,"Coe, Chris",I,HD-4,Rep\n',
);

writeFileSync(
  join(csvDir, 'bills.csv'),
  'bill_id,bill_number,title\n' +
    '9001,HB 1,"An act relating to schools, funding, and other matters"\n' +
    '9002,HB 2,"An act relating to water"\n' +
    '9003,HB 3,"An act relating to taxes"\n',
);

// HB 1 gets both a second and a third reading -> the second must be dropped.
// HB 2 gets a motion to table -> procedural, dropped.
// HB 3 gets a final passage where its own author votes Nay -> review flag.
writeFileSync(
  join(csvDir, 'rollcalls.csv'),
  'roll_call_id,bill_id,date,description,yea,nay\n' +
    '5001,9001,2025-04-01,"Second Reading",3,1\n' +
    '5002,9001,2025-04-02,"Third Reading & Final Passage",3,1\n' +
    '5003,9002,2025-04-03,"Motion to table",2,2\n' +
    '5004,9003,2025-04-04,"Passage",2,2\n',
);

writeFileSync(
  join(csvDir, 'votes.csv'),
  'roll_call_id,people_id,vote\n' +
    // HB1 second reading
    '5001,101,1\n5001,102,1\n5001,103,2\n5001,104,1\n' +
    // HB1 third reading
    '5002,101,1\n5002,102,1\n5002,103,2\n5002,104,1\n' +
    // HB2 motion to table
    '5003,101,1\n5003,102,1\n5003,103,2\n5003,104,2\n' +
    // HB3 passage — 103 is the author and votes Nay; 104 is absent (code 4)
    '5004,101,1\n5004,102,1\n5004,103,2\n5004,104,4\n',
);

writeFileSync(
  join(csvDir, 'sponsors.csv'),
  'bill_id,people_id,position\n' + '9003,103,1\n' + '9001,101,1\n',
);

const res = ingest(root, '89R');

check('roster built from session people.csv', Object.keys(res.roster).length === 4);
check('party snapshot correct', res.roster['101'] === 'R' && res.roster['103'] === 'D');
check('independent mapped to O', res.roster['104'] === 'O');
check('name with embedded comma survived', res.people['101'].name === 'Doe, Jane',
  JSON.stringify(res.people['101'].name));

const ids = res.items.map((i) => i.id);
check('procedural motion-to-table dropped', !ids.includes('5003'), `items: ${ids.join(',')}`);
check('superseded second reading dropped', !ids.includes('5001'));
check('third reading kept', ids.includes('5002'));
check('final passage kept', ids.includes('5004'));
check('exactly 2 items emitted', res.items.length === 2, `${res.items.length}`);

const hb1 = res.items.find((i) => i.id === '5002')!;
check('billId resolved to bill_number', hb1.billId === 'HB 1', hb1.billId);
check('session label applied', hb1.session === '89R');
check('votes decoded', hb1.votes['101'] === 1 && hb1.votes['103'] === -1);

const hb3 = res.items.find((i) => i.id === '5004')!;
check('absent member is null, not Nay', hb3.votes['104'] === null);

check(
  'author-against-own-bill flagged for manual review',
  res.reviewFlags.some((f) => f.personId === '103' && f.billId === 'HB 3'),
  JSON.stringify(res.reviewFlags),
);
check(
  'author who voted FOR own bill not flagged',
  !res.reviewFlags.some((f) => f.personId === '101'),
);
check('categories left empty for a later pass', res.items.every((i) => i.category === ''));

// A missing expected column must fail loudly with the real headers, not silently.
const badDir = mkdtempSync(join(tmpdir(), 'legiscan-bad-'));
mkdirSync(join(badDir, 'csv'), { recursive: true });
writeFileSync(join(badDir, 'csv', 'people.csv'), 'wrong,headers\n1,2\n');
let threw = '';
try { ingest(badDir, '89R'); } catch (e) { threw = (e as Error).message; }
check(
  'missing column fails loudly and prints actual headers',
  threw.includes('headers present') && threw.includes('wrong'),
  threw.split('\n')[0],
);

rmSync(root, { recursive: true, force: true });
rmSync(badDir, { recursive: true, force: true });

console.log(
  failures === 0 ? '\n=== all checks passed ===\n' : `\n=== ${failures} CHECK(S) FAILED ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
