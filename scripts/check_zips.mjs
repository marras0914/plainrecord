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
let badTriple = null, badLandSum = null, suspiciousHeads = null;
for (const [z, v] of entries) {
  if (typeof v !== 'number' && !Array.isArray(v)) { badType ??= z; continue; }
  const ds = districtsOf(v);
  if (ds.some((d) => !Number.isInteger(d) || d < 1 || d > 150)) badRange ??= z;
  if (new Set(ds).size !== ds.length) dupe ??= z;
  if (Array.isArray(v)) {
    if (v.some((e) => e.length !== 3)) badTriple ??= z;
    // Field 1 is a head count, so there is no 100 to sum to. What it must not
    // be is a percentage wearing a count's name: a ZIP whose "counts" total
    // about 100 is the shape of that mistake, and 100 residents spread over a
    // split ZIP is rare enough to be worth a look either way.
    const heads = v.reduce((a, e) => a + e[1], 0);
    if (!Number.isInteger(heads) || heads < 1) badSum ??= `${z} totals ${heads} people`;
    if (heads >= 98 && heads <= 102) suspiciousHeads ??= `${z} totals ${heads} people`;
    const landSum = v.reduce((a, e) => a + e[2], 0);
    if (Math.abs(landSum - 100) > 2) badLandSum ??= `${z} sums to ${landSum}`;
    for (let i = 1; i < v.length; i++) if (v[i][1] > v[i - 1][1]) unordered ??= z;
  }
}
say(!badType, 'each value is a district number or a list of pairs', badType ?? '');
say(!badRange, 'every district is between 1 and 150', badRange ?? '');
say(!dupe, 'no ZIP lists the same district twice', dupe ?? '');
say(!badTriple, 'every pair is [district, people, land]', badTriple ?? '');
say(!badSum, 'every split ZIP holds a whole number of people, and at least one', badSum ?? '');
say(!suspiciousHeads,
  'no split ZIP has head counts totalling about 100, which would suggest percentages',
  suspiciousHeads ?? '');
say(!badLandSum, 'land shares within a ZIP sum to 100', badLandSum ?? '');
say(!unordered, 'districts are ordered by population, most people first', unordered ?? '');

// -----------------------------------------------------------------------------
// The shares count people
//
// This is the field that says which number the panel is reading. A file
// without it is the pre-17-September crosswalk, whose one share was land; the
// client withholds the percentage entirely rather than relabel it, and a build
// must not ship it.

say(file.shares === 'population',
  'the file declares that its shares count people', file.shares ?? 'absent');

const prov = file.provenance ?? {};
say(prov.populationOfTexas === 29145505,
  'the population denominator is the published 2020 state total',
  String(prov.populationOfTexas ?? 'absent'));
say(prov.blocksWithoutPopulation === 0,
  'every joined block carried a population', String(prov.blocksWithoutPopulation ?? 'absent'));
say(prov.populationInZctas / prov.populationOfTexas > 0.999,
  'nearly every Texan lives in a ZCTA the crosswalk covers',
  `${(100 * prov.populationInZctas / prov.populationOfTexas).toFixed(2)}%`);

// Land and people disagree, and the file has to be able to show it. If these
// two ever matched it would mean the population join had silently fallen back
// to land, which is the failure this whole field exists to prevent — and it
// would be invisible in every other check here, because a land-weighted file
// passes all of them.
let flipped = 0;
for (const [, v] of entries) {
  if (!Array.isArray(v) || v.length < 2) continue;
  const topByLand = [...v].sort((a, b) => b[2] - a[2] || a[0] - b[0])[0][0];
  if (topByLand !== v[0][0]) flipped++;
}
// The builder publishes its own count, measured on the exact shares before
// rounding. Reading it back off the published percentages gives a few more,
// because rounding makes ties that the two orders break differently, so this
// checks that the two agree closely rather than exactly. What it is really
// asserting is that the number is not ZERO: a file whose population shares had
// silently fallen back to land would pass every other check on this page.
const claimed = prov.zipsWhereLandWouldLeadWithAnotherDistrict;
say(flipped > 0 && Number.isInteger(claimed) && Math.abs(flipped - claimed) <= 5,
  'the published count of ZIPs that land would mislead on matches the file',
  `${flipped} read back, ${claimed} claimed, of ${entries.filter(([, v]) => Array.isArray(v)).length} split ZIPs`);

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

// These used to read districtsOf(v)[0] — the FIRST district — which was the
// same thing as "the district this downtown is in" only while the list was
// ordered by land. It is now ordered by people, and downtown Houston moved:
// 77002 is 58% HD-147 by land, but 42% of the people in it live in HD-142, on
// 5% of the ground. HD-147 is still downtown Houston's district and Jones is
// still its member; the anchor was quietly asserting something narrower than
// the fact it was built from.
//
// So it asserts membership, which is the fact. That is weaker as a detector of
// a wrong district map, and the honest reason it can afford to be is that the
// map is no longer detected here at all: build_zips.mjs pins its sha256, which
// is exact where seven downtowns were only plausible. The comment at the top
// of this file records that six of those seven survived the wrong map anyway.
for (const [zip, want, place, surname] of ANCHORS) {
  const v = zips[zip];
  if (v === undefined) { say(false, `anchor ${zip} (${place}) is in the file`, 'absent'); continue; }
  const got = districtsOf(v);
  const m = members.members.find((x) => x.d === want);
  // Both halves must agree: that the ZIP reaches the district, and that the
  // members file puts the known member in it. Either being wrong is a wrong
  // answer on screen.
  say(got.includes(want) && Boolean(m) && m.n.includes(surname),
    `${zip} (${place}) reaches HD-${want}`,
    `HD-${got.join(', HD-')} — ${m ? m.n : 'no member in HD-' + want}`);
}

// One anchor kept at full strength, because the population join is what would
// break it. 77002 is the clearest case in Texas of the two weightings
// disagreeing, and it is checkable by hand: downtown Houston's land belongs
// mostly to HD-147 and its residents mostly to HD-142.
const downtown = zips['77002'];
say(Array.isArray(downtown) && downtown[0][0] === 142 && downtown[0][1] >= 40
  && downtown[0][2] <= 10,
  '77002 leads with HD-142, which holds most of downtown Houston on little of its land',
  Array.isArray(downtown)
    ? downtown.map(([d, pop, land]) => `HD-${d} ${pop}%/${land}%`).join('  ')
    : String(downtown));

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

say(prov.blocksUnmatched === 0,
  'every joined block had both a ZIP and a district', `${prov.blocksUnmatched} unmatched`);
say(prov.districtsInPlan === 150,
  'the district plan it joined against had 150 districts', String(prov.districtsInPlan));
say(prov.zipsInOneDistrict + prov.zipsSpanningDistricts === entries.length,
  'the ZIP tallies add up',
  `${prov.zipsInOneDistrict} + ${prov.zipsSpanningDistricts} = ${entries.length}`);
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
