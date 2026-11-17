/**
 * PlainRecord: what changed in data/faith/floor_votes.json since the last commit
 *
 *   node scripts/floor_votes_diff.mjs
 *
 * Run by .github/workflows/floor-votes.yml after `npm run data:faith:votes`.
 * Prints a Markdown summary, and writes changed=true|false to $GITHUB_OUTPUT.
 * "Changed" means the votes themselves: a new vote, or a different split or
 * result. New roll calls on other bills only move the page's count, so they
 * are reported but do not open an issue on their own.
 */

import { execSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';

const FILE = 'data/faith/floor_votes.json';
const before = JSON.parse(execSync(`git show HEAD:${FILE}`, { encoding: 'utf8' }));
const after = JSON.parse(readFileSync(FILE, 'utf8'));

const id = (v) => `${v.billId} ${v.chamber} ${v.measure} ${v.date}`;
const show = (v) => `${id(v)}: ${v.result}, R ${v.parties.R.join('-')}, D ${v.parties.D.join('-')}${v.parties.I ? `, I ${v.parties.I.join('-')}` : ''}`;
const old = new Map(before.votes.map((v) => [id(v), JSON.stringify(v)]));
const now = new Map(after.votes.map((v) => [id(v), JSON.stringify(v)]));

const lines = [];
for (const v of after.votes) {
  if (!old.has(id(v))) lines.push(`- New vote: ${show(v)}`);
  else if (old.get(id(v)) !== now.get(id(v))) lines.push(`- Changed: ${show(v)}`);
}
for (const v of before.votes) if (!now.has(id(v))) lines.push(`- No longer found: ${show(v)}`);
const changed = lines.length > 0;

const count = (d) => d.houseRollCalls + d.senateRollCalls;
lines.push(`- Roll calls in this Congress: ${count(before).toLocaleString('en-US')} at the last commit, ${count(after).toLocaleString('en-US')} now${count(after) === count(before) ? '' : ' (the page\'s count is out of date until the next refresh)'}.`);

console.log(lines.join('\n'));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
