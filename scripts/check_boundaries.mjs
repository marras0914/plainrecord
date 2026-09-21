/**
 * Does the shipped boundary file still answer the frozen points correctly?
 *
 *   npm run data:boundaries:check
 *
 * THE POINT OF THIS CHECK IS THAT THE ANSWERS CAME FROM SOMEWHERE ELSE.
 * data/district_points.fixture.json was sampled from the Census file at source
 * resolution, before any quantisation, so asking the shipped file about those
 * points compares two things rather than letting one agree with itself. A check
 * that regenerated its own expectations from the file under test would pass
 * whatever that file happened to contain.
 *
 * It also runs the SAME decoder and the SAME containment test the browser runs,
 * imported from src/districts.ts rather than reimplemented here. A second
 * implementation would be a second thing to get wrong, and the failure it hid
 * would be the one that matters: the page telling a reader they live somewhere
 * they do not.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { districtAt, countyAt, countyIfUnambiguous, _internals } from '../src/boundaries.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const TOPO = join(ROOT, 'public/data/boundaries_tx.topo.json');
const FIXTURE = join(ROOT, 'data/boundary_points.fixture.json');

/** Points within this of a boundary can legitimately fall either side once the
 *  coordinates are rounded to about 11 m. Measured at 0.04% when the file was
 *  built; the ceiling is set well above that so normal rebuilds do not trip it
 *  and a real regression still does. */
const TOLERANCE = 0.005;

let fails = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

console.log('\n  Texas House district boundaries\n');

const topo = JSON.parse(readFileSync(TOPO, 'utf8'));
const { points, countyPoints, countyNames } = JSON.parse(readFileSync(FIXTURE, 'utf8'));

const { districts, counties } = _internals.decode(topo);

check('150 districts decode', districts.length === 150, `${districts.length}`);

const ids = districts.map((d) => d.id).sort((a, b) => a - b);
check('numbered 1 to 150 with no gaps',
  ids.join() === Array.from({ length: 150 }, (_, i) => i + 1).join(),
  `${ids[0]}..${ids[ids.length - 1]}`);

check('every district has geometry',
  districts.every((d) => d.polygons.length > 0 && d.polygons.every((p) => p[0].length >= 4)),
  `${districts.reduce((n, d) => n + d.polygons.length, 0)} polygons`);

// Rings must close, or the ray cast is being run over an open path and will be
// wrong in ways no sample is guaranteed to reveal.
const open = districts.filter((d) => d.polygons.some((poly) => poly.some((ring) => {
  const a = ring[0];
  const b = ring[ring.length - 1];
  return Math.abs(a[0] - b[0]) > 1e-9 || Math.abs(a[1] - b[1]) > 1e-9;
})));
check('every ring closes', open.length === 0,
  open.length ? `open in districts ${open.map((d) => d.id).slice(0, 5).join(', ')}` : 'all closed');

// --- the fixture -----------------------------------------------------------

check('the fixture has points to check', points.length > 1000, `${points.length} points`);

let wrong = 0;
let missing = 0;
const worst = new Map();
for (const [lon, lat, want] of points) {
  const got = districtAt(districts, lon, lat);
  if (got === want) continue;
  if (got === null) missing++; else wrong++;
  worst.set(want, (worst.get(want) ?? 0) + 1);
}
const bad = wrong + missing;
const rate = bad / points.length;

check(`the shipped file agrees with the source geometry (under ${(TOLERANCE * 100).toFixed(1)}%)`,
  rate <= TOLERANCE,
  `${bad} of ${points.length} disagree (${(rate * 100).toFixed(3)}%), ` +
  `${wrong} wrong district, ${missing} no district`);

// A single district going badly wrong is the shape a real regression takes, and
// it can hide inside an acceptable overall rate.
const perDistrict = points.length / 150;
const concentrated = [...worst.entries()].filter(([, n]) => n > perDistrict * 0.25);
check('no single district is mostly wrong',
  concentrated.length === 0,
  concentrated.length
    ? concentrated.map(([d, n]) => `${d}:${n}/${perDistrict}`).slice(0, 5).join(', ')
    : `worst district off by ${Math.max(0, ...worst.values())} of ${perDistrict}`);

// --- a point that is deliberately outside ----------------------------------
//
// districtAt returning null has to be reachable, or "no district" is a branch
// nothing has ever exercised.
check('a point outside Texas is in no district',
  districtAt(districts, -97.0, 40.0) === null, 'Nebraska');
check('a point in the Gulf is in no district',
  districtAt(districts, -94.0, 27.0) === null, 'offshore');

// --- counties ---------------------------------------------------------------
//
// The county layer exists for a RULE rather than for a map: during early voting
// a registered Texan may vote at any early voting location in their county of
// residence. So the county name is the whole answer for that window, and a
// wrong name sends somebody to the wrong county's list.

check('254 counties decode', counties.length === 254, `${counties.length}`);

check('every county is named, since the name is what the page says',
  counties.every((c) => typeof c.name === 'string' && c.name.trim().length > 0),
  counties.filter((c) => !c.name).length + ' unnamed');

check('every county id is a Texas FIPS code',
  counties.every((c) => /^48\d{3}$/.test(String(c.id))),
  counties.filter((c) => !/^48\d{3}$/.test(String(c.id))).map((c) => c.id).slice(0, 4).join(', ')
    || '48xxx');

check('county names are distinct',
  new Set(counties.map((c) => c.name)).size === counties.length,
  `${new Set(counties.map((c) => c.name)).size} of ${counties.length}`);

check('the county fixture has points to check',
  Array.isArray(countyPoints) && countyPoints.length > 1000,
  `${countyPoints?.length ?? 0} points`);

// THE NAMES COME FROM THE CENSUS FILE, NOT FROM THE FILE UNDER TEST.
//
// This check used to build its expected names with
//   new Map(counties.map((c) => [String(c.id), c.name]))
// which reads the id-to-name mapping out of the very file it is checking. The
// header above says a check that regenerates its expectations from the file
// under test "would pass whatever that file happened to contain", and that is
// exactly what it did for the one field the reader actually sees.
//
// Demonstrated on 21 September 2026: swapping the NAME properties of Harris and
// Dallas in the shipped topojson made countyAt answer "Dallas" for downtown
// Houston, and this suite reported 0 of 3810 disagreeing, 0 wrong county. Every
// other county check passed too, because names stayed non-empty and distinct.
// A reader in Houston would have been told to use Dallas County's early voting
// locations.
//
// So the expected names now live in the fixture, captured from
// cb_2024_us_county_500k at build time, and a shipped name that drifts from the
// Census name fails here rather than reaching a voter.
check('the fixture carries Census county names to check against',
  countyNames && Object.keys(countyNames).length === 254,
  `${countyNames ? Object.keys(countyNames).length : 0} of 254`);

{
  const drifted = counties.filter((c) => countyNames[String(c.id)] !== c.name);
  check('every shipped county name matches the Census name for its FIPS id',
    drifted.length === 0,
    drifted.slice(0, 4).map((c) => `${c.id} ships "${c.name}", Census says "${countyNames[String(c.id)]}"`).join('; ')
      || '254 of 254');
}

{
  let wrong = 0;
  let missing = 0;
  const byCounty = new Map();
  const nameOf = new Map(Object.entries(countyNames));
  for (const [lon, lat, id] of countyPoints) {
    const got = countyAt(counties, lon, lat);
    const want = nameOf.get(String(id));
    if (got === want) continue;
    if (got === null) missing++; else wrong++;
    byCounty.set(want, (byCounty.get(want) ?? 0) + 1);
  }
  const bad = wrong + missing;
  const rate = bad / countyPoints.length;
  check(`counties agree with the source geometry (under ${(TOLERANCE * 100).toFixed(1)}%)`,
    rate <= TOLERANCE,
    `${bad} of ${countyPoints.length} disagree (${(rate * 100).toFixed(3)}%), `
    + `${wrong} wrong county, ${missing} no county`);

  const per = countyPoints.length / 254;
  const concentrated = [...byCounty.entries()].filter(([, n]) => n > per * 0.25);
  check('no single county is mostly wrong',
    concentrated.length === 0,
    concentrated.map(([c, n]) => `${c}:${n}`).slice(0, 4).join(', ')
      || `worst off by ${Math.max(0, ...byCounty.values())} of ${per}`);
}

// --- the borderline guard ---------------------------------------------------
//
// countyIfUnambiguous refuses to answer within about 78m of a county line,
// because that is where the quantised geometry disagrees with the Census source
// (1.30% wrong at 56m, measured) and the sentence it feeds tells somebody which
// county's early voting locations they may use.
//
// BOTH DIRECTIONS ARE ASSERTED ON PURPOSE. A guard that never fires is the same
// failure as a check that cannot fail, and a guard that always fires silently
// removes the feature. So: a downtown point must still get an answer, and a
// point sitting on a real county-line vertex must not.
{
  const interior = [
    ['Houston City Hall', -95.3698, 29.7604, 'Harris'],
    ['Dallas City Hall', -96.7970, 32.7767, 'Dallas'],
    ['Texas Capitol', -97.7404, 30.2747, 'Travis'],
    ['The Alamo', -98.4861, 29.4260, 'Bexar'],
    ['El Paso downtown', -106.4850, 31.7619, 'El Paso'],
  ];
  const missed = interior.filter(([, lon, lat, want]) =>
    countyIfUnambiguous(counties, lon, lat) !== want);
  check('the guard still answers well inside a county',
    missed.length === 0,
    missed.map(([n]) => n).join(', ') || `${interior.length} landmarks answered`);

  // Vertices of the shipped county rings ARE the line, so a point on one is as
  // borderline as it gets. If the guard lets these through it is not working.
  const onTheLine = [];
  for (const c of counties.slice(0, 40)) {
    const ring = c.rings?.[0] ?? c.polygons?.[0]?.[0] ?? null;
    if (ring && ring.length) onTheLine.push(ring[0]);
  }
  const answered = onTheLine.filter(([lon, lat]) =>
    countyIfUnambiguous(counties, lon, lat) !== null);
  check('the guard declines on points sitting on a county line',
    onTheLine.length > 10 && answered.length === 0,
    `${onTheLine.length} line points, ${answered.length} answered`);

  // AND IT MUST DECLINE FOR THE RIGHT REASON. A vertex can come back null from
  // countyAt itself, since a point exactly on a ring can fall either side of a
  // ray cast, and then the guard's own logic never ran. Counting only the cases
  // where countyAt WAS confident and the guard overrode it keeps this from
  // passing on an accident. 37 of 40 when written.
  const overridden = onTheLine.filter(([lon, lat]) =>
    countyAt(counties, lon, lat) !== null
    && countyIfUnambiguous(counties, lon, lat) === null);
  check('the guard, not a null from the ray cast, is what silences them',
    overridden.length > onTheLine.length / 2,
    `${overridden.length} of ${onTheLine.length} were confident answers the guard overrode`);
}

check('a point outside Texas is in no county',
  countyAt(counties, -97.0, 40.0) === null, 'Nebraska');

console.log(fails
  ? `\n  ${fails} problem(s)\n`
  : '\n  boundaries agree with the source\n');
process.exit(fails ? 1 : 0);
