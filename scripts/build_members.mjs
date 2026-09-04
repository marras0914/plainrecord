/**
 * PlainRecord — build the per-district member record
 *
 *   npm run data:members
 *
 * Emits public/data/members_89R.json: for each of the 149 sitting Texas House
 * members, how they voted on the SAME 67 items the quiz asks about, as one
 * character per vote.
 *
 * WHY THIS EXISTS. The site could say how three statewide candidates voted and
 * not how the reader's own representative voted, because the shipped payload
 * carries per-member votes for nine people. Carrying all 150 members across all
 * 4,554 session votes would be 668 KB raw / 135 KB gzipped. Restricted to the 67
 * items already on the page it is 16 KB raw / 4.2 KB gzipped, and the page can
 * score a member with the same estimator it already uses for the candidates.
 *
 * WHY IT IS A SEPARATE SCRIPT rather than part of export_quiz_data.ts. That
 * export needs the LegiScan bills and people CSVs, which are not in the repo, so
 * it cannot be run on a fresh clone. This needs only the ingest that IS on disk
 * plus a roster it downloads, so the member file can be rebuilt without the
 * blocked pipeline. It reads the shipped payload for the item order, so it can
 * never disagree with the questions the page actually asks.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROSTER_URL = 'https://data.openstates.org/people/current/tx.csv';

const argv = process.argv.slice(2);
const rosterFile = argv.includes('--roster') ? argv[argv.indexOf('--roster') + 1] : null;

let failures = 0;
const say = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

console.log('');

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const ingest = JSON.parse(
  readFileSync(resolve(ROOT, 'data/tx_bills_89R.json'), 'utf8'),
);
const payload = JSON.parse(
  readFileSync(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'),
);
say(Array.isArray(ingest) && ingest.length > 0, 'read the session ingest',
  `${ingest.length} items`);

// The item ORDER comes from the shipped payload, so a vote string is always
// aligned to the questions the page asks. It is written into the output too, and
// scripts/check_members.mjs asserts the two still match — a re-export that
// reorders items would otherwise silently shift every member's votes.
const itemOrder = payload.items.map((i) => i.id);
say(itemOrder.length > 0, 'read the quiz item order from the payload',
  `${itemOrder.length} items`);

/** Minimal RFC4180-ish CSV: the roster has quoted fields (biography, links). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (const ch of text) {
    if (quoted) {
      if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rosterText = rosterFile
  ? readFileSync(resolve(ROOT, rosterFile), 'utf8')
  : await (async () => {
    const r = await fetch(ROSTER_URL);
    if (!r.ok) {
      console.error(
        `\n  could not fetch the roster (${r.status}) from ${ROSTER_URL}\n` +
          '  Pass a local copy instead:  npm run data:members -- --roster path/to/tx.csv\n',
      );
      process.exit(1);
    }
    return r.text();
  })();

const rows = parseCsv(rosterText);
const ix = Object.fromEntries(rows[0].map((c, i) => [c, i]));
for (const col of ['id', 'name', 'current_party', 'current_district', 'current_chamber']) {
  if (!(col in ix)) {
    console.error(`\n  roster is missing the "${col}" column — its format changed.\n`);
    process.exit(1);
  }
}
const roster = rows.slice(1).filter((r) => r[ix.id]);
say(roster.length > 0, 'read the roster', `${roster.length} people`);

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

const byItemId = new Map(ingest.map((i) => [i.id, i]));

// Every id that cast a real vote anywhere in the session, so the unnamed ones
// can be counted rather than quietly dropped.
const voteCount = new Map();
for (const it of ingest) {
  for (const [id, v] of Object.entries(it.votes ?? {})) {
    if (v === 1 || v === -1) voteCount.set(id, (voteCount.get(id) ?? 0) + 1);
  }
}

const named = new Set(roster.map((r) => r[ix.id]));
const unnamed = [...voteCount.keys()].filter((id) => !named.has(id));

const house = roster
  .filter((r) => r[ix.current_chamber] === 'lower')
  .map((r) => ({
    id: r[ix.id],
    name: r[ix.name],
    district: Number(r[ix.current_district]),
    party: (r[ix.current_party] || '?').charAt(0).toUpperCase(),
  }))
  .filter((m) => Number.isFinite(m.district))
  .sort((a, b) => a.district - b.district);

say(house.length > 100, 'found the sitting House', `${house.length} members`);

// One character per vote. `.` is "no vote recorded", which is a real and common
// state: only 13 of 149 members voted on all 67. The estimator already drops a
// missed vote for that member alone rather than counting it against them, and
// `voted` below is what the page shows so a thin record cannot masquerade as a
// complete one.
const encode = (v) => (v === 1 ? 'y' : v === -1 ? 'n' : '.');

const members = house.map((m) => {
  const v = itemOrder.map((itemId) => encode(byItemId.get(itemId)?.votes?.[m.id])).join('');
  return {
    d: m.district,
    n: m.name,
    p: m.party,
    id: m.id,
    v,
    voted: [...v].filter((c) => c !== '.').length,
  };
});

const districts = new Set(members.map((m) => m.d));
say(districts.size === members.length, 'one member per district',
  `${districts.size} districts, ${members.length} members`);

const full = members.filter((m) => m.voted === itemOrder.length).length;
const coverage = members.map((m) => m.voted).sort((a, b) => a - b);
const median = coverage[Math.floor(coverage.length / 2)];

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const out = {
  _meta: {
    purpose:
      'How each sitting Texas House member voted on the same 67 items the quiz ' +
      'at rightnleft.com asks about. Built by scripts/build_members.mjs; do not ' +
      'hand-edit.',
    votes:
      'Each member\'s `v` is one character per item, in `itemOrder`: y = voted ' +
      'Yea, n = voted Nay, . = no vote recorded. `voted` counts the non-dot ' +
      'characters. A dot is an absence, not a neutral position, and only ' +
      `${full} of ${members.length} members voted on all ${itemOrder.length}.`,
    unnamed:
      `${unnamed.length} people cast votes in this session but are absent from ` +
      'the current roster, having left the House since. They are NOT in this ' +
      'file because they hold no current district. One of them cast ' +
      `${Math.max(...unnamed.map((id) => voteCount.get(id)), 0)} votes, a full ` +
      'session, so a district whose seat changed hands will show its current ' +
      'member with a partial record. That is accurate rather than missing data. ' +
      'data.openstates.org publishes no retired roster for Texas (403), so ' +
      'naming them would need another source.',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    licenseNote:
      'Names, districts and parties come from the Open States current roster. ' +
      'The votes are Texas public record. CC0 covers this compilation.',
  },
  session: payload.session,
  generated: 'static build',
  rosterSource: rosterFile ?? ROSTER_URL,
  provenance: {
    sessionVotesTotal: ingest.length,
    quizItems: itemOrder.length,
    votersInSession: voteCount.size,
    namedFromRoster: voteCount.size - unnamed.length,
    unnamedVoters: unnamed.length,
    unnamedVoteCounts: unnamed.map((id) => voteCount.get(id)).sort((a, b) => b - a),
    sittingHouseMembers: members.length,
    membersVotingOnAllItems: full,
    medianItemsVoted: median,
  },
  itemOrder,
  members,
};

const target = resolve(ROOT, 'public/data/members_89R.json');
const json = JSON.stringify(out);
writeFileSync(target, json + '\n', 'utf8');

say(true, 'wrote public/data/members_89R.json', `${(json.length / 1024).toFixed(1)} KB raw`);
console.log('');
console.log(`  ${members.length} members · ${districts.size} districts · ` +
  `${full} with all ${itemOrder.length} votes · median ${median}`);
console.log(`  ${unnamed.length} session voters excluded as no longer sitting ` +
  `(${out.provenance.unnamedVoteCounts.join(', ')} votes)`);
console.log(failures === 0 ? '\n  member record built\n' : `\n  ${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
