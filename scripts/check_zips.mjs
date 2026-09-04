/**
 * PlainRecord — is the ZIP crosswalk pointing at the right districts?
 *
 *   npm run data:zips:check
 *
 * The crosswalk is derived, not downloaded, so its failure mode is quiet: a
 * plausible-looking file that assigns readers to the wrong representative. The
 * structural checks below (ranges, shares, coverage) would all pass against a
 * crosswalk built from the WRONG district map, because such a file is perfectly
 * well formed — it is just wrong about Texas.
 *
 * There are two defences, and the weaker one came first.
 *
 * The anchors are seven downtown ZIPs whose member is externally known:
 * downtown Austin is Gina Hinojosa's, downtown El Paso is Vince Perez's,
 * downtown San Antonio is Diego Bernal's. None of that is derived from the
 * crosswalk, so it cannot be circular, and it does catch a district pointing at
 * the wrong member.
 *
 * But it is a poor detector of the wrong MAP. Rebuilding the crosswalk from the
 * 2020 pre-redistricting Block Assignment File and running these same checks
 * failed exactly ONE anchor — downtown Dallas, HD-108 instead of HD-114 — even
 * though a third of Texas blocks sit in a different district between the two
 * maps. Redistricting preserves urban cores, which is precisely where the
 * recognisable anchors are. Six of seven passed on a map that was wrong about
 * a third of the state.
 *
 * So the map is pinned by hash. That is exact, and it fails loudly the moment
 * the join is fed anything but the 2022 plan.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];

let failures = 0;
const say = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

const load = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
let file, members;
try {
  file = load(arg ?? 'public/data/zips_89R.json');
} catch {
  console.error('\n  public/data/zips_89R.json not found — run `npm run data:zips`.\n');
  process.exit(1);
}
try {
  members = load('public/data/members_89R.json');
} catch {
  console.error('\n  public/data/members_89R.json not found — run `npm run data:members`.\n');
  process.exit(1);
}

console.log('');

const zips = file.zips ?? {};
const districtsOf = (v) => (typeof v === 'number' ? [v] : v.map((e) => e[0]));
const entries = Object.entries(zips);

// -----------------------------------------------------------------------------
// Shape

say(entries.length > 1900 && entries.length < 2100,
  'the ZIP count is in the right ballpark for Texas', `${entries.length} ZIPs`);

const badKey = entries.find(([z]) => !/^\d{5}$/.test(z));
say(!badKey, 'every key is a 5-digit ZIP', badKey ? badKey[0] : '');

let badRange = null, dupe = null, badSum = null, unordered = null, badType = null;
for (const [z, v] of entries) {
  if (typeof v !== 'number' && !Array.isArray(v)) { badType ??= z; continue; }
  const ds = districtsOf(v);
  if (ds.some((d) => !Number.isInteger(d) || d < 1 || d > 150)) badRange ??= z;
  if (new Set(ds).size !== ds.length) dupe ??= z;
  if (Array.isArray(v)) {
    const sum = v.reduce((a, e) => a + e[1], 0);
    if (Math.abs(sum - 100) > 2) badSum ??= `${z} sums to ${sum}`;
    for (let i = 1; i < v.length; i++) if (v[i][1] > v[i - 1][1]) unordered ??= z;
  }
}
say(!badType, 'each value is a district number or a list of pairs', badType ?? '');
say(!badRange, 'every district is between 1 and 150', badRange ?? '');
say(!dupe, 'no ZIP lists the same district twice', dupe ?? '');
say(!badSum, 'shares within a ZIP sum to 100', badSum ?? '');
say(!unordered, 'shares are ordered largest first', unordered ?? '');

// -----------------------------------------------------------------------------
// Coverage — a district no ZIP reaches is a district whose voters cannot use
// the lookup at all.

const reached = new Set();
for (const [, v] of entries) for (const d of districtsOf(v)) reached.add(d);
const missing = [];
for (let d = 1; d <= 150; d++) if (!reached.has(d)) missing.push(d);
say(missing.length === 0, 'all 150 districts are reachable by ZIP',
  missing.length ? `unreachable: ${missing.join(', ')}` : '150 of 150');

const seated = new Set(members.members.map((m) => m.d));
const seatless = [...reached].filter((d) => !seated.has(d));
say(seatless.length === 1 && seatless[0] === 93,
  'exactly one reachable district has no sitting member',
  seatless.length ? `HD-${seatless.join(', HD-')}` : 'none — expected HD-93');

const single = entries.filter(([, v]) => typeof v === 'number').length;
say(single > 900,
  'most Texas ZIPs resolve to a single district', `${single} of ${entries.length}`);

// -----------------------------------------------------------------------------
// The anchors. External facts, not derived from this file.
//
// Each is a downtown ZIP and the member who represents that downtown. If the
// crosswalk were built on the wrong district map these break; the structural
// checks above would not.

const ANCHORS = [
  ['78701', 49, 'downtown Austin', 'Hinojosa'],
  ['78205', 123, 'downtown San Antonio', 'Bernal'],
  ['79901', 77, 'downtown El Paso', 'Perez'],
  ['75201', 114, 'downtown Dallas', 'Bryant'],
  ['76102', 95, 'downtown Fort Worth', 'Collier'],
  ['77002', 147, 'downtown Houston', 'Jones'],
  ['79401', 84, 'Lubbock', 'Tepper'],
];

for (const [zip, want, place, surname] of ANCHORS) {
  const v = zips[zip];
  if (v === undefined) { say(false, `anchor ${zip} (${place}) is in the file`, 'absent'); continue; }
  const got = districtsOf(v)[0];
  const m = members.members.find((x) => x.d === got);
  // Both halves must agree: the district the ZIP points at, and the member the
  // members file puts in it. Either being wrong is a wrong answer on screen.
  say(got === want && Boolean(m) && m.n.includes(surname),
    `${zip} (${place}) resolves to HD-${want}`,
    `HD-${got} ${m ? m.n : 'no member'}`);
}

// Cross-metro exclusion: no downtown ZIP may touch a district five hundred
// miles away. A shifted or mismatched map shows up here even if an anchor
// happens to survive.
const FAR = { '78701': [77, 84, 147, 114], '79901': [49, 147, 114], '79401': [49, 123, 147] };
let bleed = null;
for (const [zip, forbidden] of Object.entries(FAR)) {
  const ds = zips[zip] ? districtsOf(zips[zip]) : [];
  const hit = ds.find((d) => forbidden.includes(d));
  if (hit) bleed ??= `${zip} touches HD-${hit}`;
}
say(!bleed, 'no downtown ZIP reaches another metro\'s district', bleed ?? '');

// -----------------------------------------------------------------------------
// Provenance and licence

const p = file.provenance ?? {};
say(p.blocksUnmatched === 0,
  'every joined block had both a ZIP and a district', `${p.blocksUnmatched} unmatched`);
say(p.districtsInPlan === 150,
  'the district plan it joined against had 150 districts', String(p.districtsInPlan));
say(p.zipsInOneDistrict + p.zipsSpanningDistricts === entries.length,
  'the ZIP tallies add up',
  `${p.zipsInOneDistrict} + ${p.zipsSpanningDistricts} = ${entries.length}`);
say(file._meta?.license === 'CC0-1.0', 'declares its licence', file._meta?.license ?? 'none');
say(/2022/.test(file.sources?.blockToDistrict ?? '') ||
    /2022/.test(file.sources?.blockToDistrictNote ?? ''),
  'records that it used the 2022 plan, not the 2020 assignment file');

// The exact bytes of 48_TX_SLDL22.txt from the Census 2022 state legislative
// block equivalency files. Anything else is a different map, and a different
// map means readers are told about the wrong representative.
const PLAN_SHA = '3ced8862861c1737d19d90ca41d5292da5570e238826bff36626b76127e72e30';
const gotSha = file.sources?.blockToDistrictSha256;
say(gotSha === PLAN_SHA,
  'the district map is the pinned 2022 plan, byte for byte',
  gotSha ? `${gotSha.slice(0, 16)}… ${gotSha === PLAN_SHA ? '' : '!= expected ' + PLAN_SHA.slice(0, 16) + '…'}` : 'no hash recorded');

console.log(
  failures === 0
    ? '\n  zip crosswalk agrees with the districts it claims\n'
    : `\n  ${failures} check(s) failed — the crosswalk may be built on the wrong map\n`,
);
process.exit(failures === 0 ? 0 : 1);
