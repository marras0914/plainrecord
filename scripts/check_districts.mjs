/**
 * Does the shipped boundary file still answer the frozen points correctly?
 *
 *   npm run data:districts:check
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
import { districtAt, _internals } from '../src/districts.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const TOPO = join(ROOT, 'public/data/districts_tx_house.topo.json');
const FIXTURE = join(ROOT, 'data/district_points.fixture.json');

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
const { points } = JSON.parse(readFileSync(FIXTURE, 'utf8'));

const districts = _internals.decode(topo);

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

console.log(fails
  ? `\n  ${fails} problem(s)\n`
  : '\n  boundaries agree with the source\n');
process.exit(fails ? 1 : 0);
