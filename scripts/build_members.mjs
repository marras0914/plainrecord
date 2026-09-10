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

const named = new Set(roster.map((r) => r[ix.id]));

/**
 * HOUSE ROLL CALLS ONLY, and this filter is the whole point of the block.
 *
 * `data/tx_bills_89R.json` holds every roll call the ingest saw, 4,554 of them,
 * Senate included. Every other consumer filters before counting; this one did
 * not, and the consequences were published:
 *
 *   - `votersInSession` read 180, which is the House plus the Senate.
 *   - `unnamedVoters` read 4. Three of those were SENATORS, and the _meta note
 *     described all four as people who had "left the House", which they had
 *     not, having never sat in it. That note ships in a CC0 file offered to
 *     other people as a public resource.
 *   - Even the one genuine former member had the wrong total: 3,352 rather than
 *     3,283, because 69 Senate roll calls were credited to him.
 *
 * The rule is `scripts/export_bulk_votes.mjs`'s, deliberately identical: an
 * item is a House item when more than 60 of the people who voted on it sit in
 * the House. Not a test on the bill, because a Senate bill gets a House vote
 * too. Restating it here rather than sharing it is the lesser evil only because
 * that script reads the shipped payload and this one builds it; the assertion
 * below is what keeps the two honest.
 */
const HOUSE_QUORUM_HINT = 60;
const houseItems = ingest.filter(
  (it) => Object.keys(it.votes ?? {}).filter((id) => named.has(id)).length > HOUSE_QUORUM_HINT,
);
say(houseItems.length > 0 && houseItems.length < ingest.length,
  'filtered the ingest to House roll calls',
  `${houseItems.length} of ${ingest.length}, ${ingest.length - houseItems.length} excluded`);

// Every id that cast a real vote on a HOUSE item, so the unnamed ones can be
// counted rather than quietly dropped, and so a senator is not counted at all.
const voteCount = new Map();
for (const it of houseItems) {
  for (const [id, v] of Object.entries(it.votes ?? {})) {
    if (v === 1 || v === -1) voteCount.set(id, (voteCount.get(id) ?? 0) + 1);
  }
}

const unnamed = [...voteCount.keys()].filter((id) => !named.has(id));

/**
 * Name the former members, from the retired roster in openstates/people.
 *
 * `data.openstates.org` returns 403 for anything retired and
 * /people/current/tx.csv is current-only, which is why an earlier build of this
 * file said naming them "would need another source". Jesse Mortenson at Open
 * States pointed out the source on 10 September 2026: the people repository
 * carries data/tx/retired/, 348 records for Texas, named
 * `<Name>-<uuid>.yml` with the same ocd-person uuid this pipeline already has.
 *
 * TYPE IS ASSERTED, not assumed, and that is the whole reason this function is
 * careful. Before the chamber filter above existed, three of the four
 * "former House members" were senators. A retired record whose `type` is not
 * `lower` is refused rather than named, so the same mistake cannot be made
 * again from the other direction.
 *
 * Degrades rather than fails. Without the network the members file is built
 * exactly as before, with the count and no names, and says which happened.
 */
const RETIRED_DIR =
  'https://api.github.com/repos/openstates/people/contents/data/tx/retired';
const RETIRED_RAW =
  'https://raw.githubusercontent.com/openstates/people/main/data/tx/retired';

async function nameRetired(ids) {
  if (ids.length === 0) return [];
  let listing;
  try {
    const r = await fetch(RETIRED_DIR, { headers: { accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    listing = await r.json();
  } catch (err) {
    say(true, 'retired roster not reached, names omitted', String(err.message ?? err));
    return [];
  }

  const files = new Map();
  for (const entry of listing) {
    const m = /^(.+)-([0-9a-f-]{36})\.yml$/.exec(entry.name ?? '');
    if (m) files.set(m[2], entry.name);
  }
  say(files.size > 100, 'read the retired roster', `${files.size} Texas records`);

  const out = [];
  for (const id of ids) {
    const uuid = id.replace('ocd-person/', '');
    const file = files.get(uuid);
    if (!file) {
      say(false, `no retired record for ${uuid}`);
      continue;
    }
    let text;
    try {
      const r = await fetch(`${RETIRED_RAW}/${encodeURIComponent(file)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      text = await r.text();
    } catch (err) {
      say(false, `could not read ${file}`, String(err.message ?? err));
      continue;
    }

    // Four fields off a known shape, each validated rather than trusted. A
    // regex over YAML is only acceptable because of the assertions below.
    const name = (/^name:\s*(.+?)\s*$/m.exec(text) ?? [])[1];
    const roles = [...text.matchAll(/type:\s*(lower|upper)[\s\S]{0,240}?district:\s*'?([0-9]+)'?[\s\S]{0,240}?end_date:\s*'?([0-9-]+)'?/g)];
    const lower = roles.filter((r) => r[1] === 'lower');

    if (!name) { say(false, `${file} has no name field`); continue; }
    if (lower.length === 0) {
      // The guard that matters. A senator is not a former House member.
      say(false, `${name} is not a former House member, refusing to name them`,
        roles.map((r) => r[1]).join(', ') || 'no role found');
      continue;
    }
    // The most recent lower-chamber role is the one that ended.
    const role = lower.sort((a, b) => String(b[3]).localeCompare(String(a[3])))[0];
    out.push({ id, name, district: Number(role[2]), until: role[3], voted: voteCount.get(id) ?? 0 });
  }

  out.sort((a, b) => b.voted - a.voted);
  say(out.length === ids.length, 'named every former member who voted',
    `${out.length} of ${ids.length}`);
  return out;
}

const retired = await nameRetired(unnamed);
for (const r of retired) {
  console.log(`  ${r.name} · HD ${r.district} · ${r.voted} votes · left ${r.until}`);
}

// The check that would have caught this. A House chamber is 150 seats, so the
// number of distinct people casting House votes in one session cannot be far
// above that: 180 was the Senate leaking in and nothing said so.
say(voteCount.size <= 165, 'session voters are a House-sized group',
  `${voteCount.size} distinct voters, chamber is ${roster.filter((r) => r[ix.district]).length ? '150 seats' : '150 seats'}`);

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
    // Written for one or for many, because the count is data rather than a
    // constant and a note reading "1 person ... are absent" is the kind of
    // seam that tells a reader the file was generated and not checked.
    unnamed: (() => {
      const n = unnamed.length;
      const most = Math.max(...unnamed.map((id) => voteCount.get(id)), 0);
      const who = n === 1
        ? '1 person cast House votes in this session but is absent from the current roster, having left the House since. They are NOT in this file because they hold no current district.'
        : `${n} people cast House votes in this session but are absent from the current roster, having left the House since. They are NOT in this file because they hold no current district.`;
      const scale = n === 1
        ? `That person cast ${most} votes, so their district will show its current member with a partial record.`
        : `The largest cast ${most} votes, so a district whose seat changed hands will show its current member with a partial record.`;
      const named = retired.length
        ? ` They are named in \`retired\`: ${retired.map((r) => `${r.name} (HD ${r.district}, left ${r.until})`).join('; ')}.`
        : ' Names come from the retired roster in the openstates/people repository; this build could not reach it.';
      return `${who} ${scale}${named} That is accurate rather than missing data.`;
    })(),
    unnamedCorrection:
      'An earlier build of this file reported four such people and described all ' +
      'four as having left the House. Three were SENATORS and had never sat in ' +
      'it: this file counted voters across every roll call the ingest saw rather ' +
      'than across House roll calls only, so the Senate was included. The count ' +
      'of the one genuine former member was also overstated, because Senate votes ' +
      'were credited to him. Corrected 10 September 2026.',
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
    ingestItemsTotal: ingest.length,
    sessionVotesTotal: houseItems.length,
    chamberFilter:
      'House roll calls only: more than 60 of the people voting sit in the House. ' +
      'The same rule scripts/export_bulk_votes.mjs applies.',
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
  /**
   * Former House members who voted this session and hold no current district.
   *
   * Deliberately NOT in `members`: the lookup answers "who represents this
   * district now", and a district whose seat changed hands has a current
   * holder. This block is what lets the page say who cast the rest of that
   * district's votes instead of only that somebody did.
   */
  retired,
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
