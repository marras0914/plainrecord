/**
 * PlainRecord — does the member record still line up with the payload?
 *
 *   npm run data:members:check
 *
 * members_89R.json stores each member's votes as a STRING positionally aligned
 * to the quiz's item order. That is what makes it 4 KB instead of 130 KB, and it
 * is also the one thing that can go silently and catastrophically wrong: a
 * re-export that reorders, adds or drops an item shifts every member's votes by
 * one and the page shows real names attached to the wrong votes. Nothing about
 * that is visible on screen.
 *
 * So the alignment is asserted, not assumed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const say = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

const payload = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
let members;
try {
  members = JSON.parse(readFileSync(resolve(ROOT, 'public/data/members_89R.json'), 'utf8'));
} catch {
  console.error('\n  public/data/members_89R.json not found — run `npm run data:members`.\n');
  process.exit(1);
}

console.log('');

// The alignment, which is the whole point of this file existing.
const want = payload.items.map((i) => i.id);
const got = members.itemOrder ?? [];
const same = want.length === got.length && want.every((id, i) => id === got[i]);
say(same, 'itemOrder matches the payload exactly',
  same
    ? `${want.length} items, same order`
    : `payload has ${want.length}, member file has ${got.length}` +
      (want.length === got.length ? ' — same length, DIFFERENT ORDER' : ''));

say(members.session === payload.session, 'same session',
  `${members.session} vs ${payload.session}`);

// Every vote string must be exactly as long as the item order, or a member's
// votes are offset from the questions.
const wrongLength = members.members.filter((m) => m.v.length !== got.length);
say(wrongLength.length === 0, 'every vote string is itemOrder long',
  wrongLength.length ? `${wrongLength.length} wrong, e.g. ${wrongLength[0].n}` : `${got.length} chars`);

const badChars = members.members.filter((m) => /[^yn.]/.test(m.v));
say(badChars.length === 0, 'vote strings use only y, n and .',
  badChars.length ? `${badChars[0].n}: ${badChars[0].v.slice(0, 20)}` : '');

const miscounted = members.members.filter(
  (m) => m.voted !== [...m.v].filter((c) => c !== '.').length,
);
say(miscounted.length === 0, 'the voted count matches the string',
  miscounted.length ? `${miscounted.length} wrong` : '');

// Districts: one member each, no duplicates, all in range.
const districts = members.members.map((m) => m.d);
const dupes = districts.filter((d, i) => districts.indexOf(d) !== i);
say(dupes.length === 0, 'no district appears twice', dupes.length ? `dupes: ${dupes}` : '');
const outOfRange = districts.filter((d) => !Number.isInteger(d) || d < 1 || d > 150);
say(outOfRange.length === 0, 'districts are 1 to 150', outOfRange.join(', '));

// Cross-check against the payload for the nine members it already carries. If
// the two disagree about a vote, one of them is wrong and the page would show
// a different answer depending on which panel you looked at.
{
  const known = [...payload.candidates, ...payload.comparators];
  const byId = new Map(members.members.map((m) => [m.id, m]));
  const enc = (v) => (v === 1 ? 'y' : v === -1 ? 'n' : '.');
  let compared = 0;
  const conflicts = [];
  for (const k of known) {
    const m = byId.get(k.id);
    if (!m) continue;
    for (const [i, item] of payload.items.entries()) {
      const fromPayload = enc(item.votes[k.id]);
      if (fromPayload !== m.v[i]) {
        conflicts.push(`${k.name} on ${item.billId}: payload ${fromPayload}, member file ${m.v[i]}`);
      }
      compared++;
    }
  }
  say(conflicts.length === 0, 'agrees with the payload where they overlap',
    conflicts.length ? conflicts[0] : `${compared} votes compared across ${
      known.filter((k) => byId.has(k.id)).length} members`);
}

// Provenance and licence travel with the file, as they do for the payload.
say(members._meta?.license === 'CC0-1.0', 'declares its licence',
  members._meta?.license ?? '(none)');
say(Number.isInteger(members.provenance?.unnamedVoters),
  'records how many session voters it excludes',
  `${members.provenance?.unnamedVoters} excluded, ${
    (members.provenance?.unnamedVoteCounts ?? []).join(', ')} votes`);

console.log(
  failures === 0
    ? '\n  member record lines up with the payload\n'
    : `\n  ${failures} check(s) failed — the member file and the payload disagree\n`,
);
process.exit(failures === 0 ? 0 : 1);
