/**
 * Texas House district boundaries, for locating a reader from their device.
 *
 *   npm run data:districts            # dry run: says what it would write
 *   npm run data:districts -- --write
 *
 * Output: public/data/districts_tx_house.topo.json, plus a frozen fixture of
 * sample points that scripts/check_districts.mjs asserts the shipped file still
 * answers correctly.
 *
 * WHY THE BOUNDARIES AND NOT THE ZIP TABLE WE ALREADY SHIP
 *
 * zips_89R.json answers "which districts overlap this ZIP", and 46% of Texas
 * ZIPs overlap two to five, so it can only ever offer the reader a choice. A
 * point either is or is not inside a district, so a coordinate answers the
 * question the ZIP cannot.
 *
 * NO SIMPLIFICATION, AND THIS IS THE WHOLE DESIGN DECISION
 *
 * Simplifying looked like the obvious way to make this small. It was measured
 * rather than assumed, by sampling 400 points inside each of the 150 districts
 * at full resolution and asking what a simplified file says about the same
 * points:
 *
 *   simplify  2%   13 KB gzip    9.88% of points land in the wrong district
 *   simplify  5%   26 KB gzip    4.40%
 *   simplify 10%   49 KB gzip    2.05%
 *   simplify 20%   91 KB gzip    0.81%
 *   none, 1e-4    122 KB gzip    0.04%
 *
 * Every vertex is kept and only the coordinates are rounded, to about 11 m.
 * The 0.04% that still disagree are points within that distance of a boundary,
 * where no method is certain. Trading 73 KB for a fiftyfold increase in wrong
 * answers would be a bad deal anywhere, and on a page whose argument is that
 * you can check the record it is the wrong kind of cheap.
 *
 * TOPOJSON, NOT GEOJSON
 *
 * The same geometry is 396 KB gzipped as GeoJSON and 122 KB as TopoJSON,
 * because districts share their borders and TopoJSON stores each shared border
 * once. 80% of this site's traffic is mobile, so that difference is the
 * difference between a usable feature and one nobody waits for. src/districts.ts
 * carries the decoder; it is 40 lines and needs no library.
 *
 * VINTAGE: 2024, AND WHY THAT IS SAFE
 *
 * build_zips.mjs records the trap that the 2020 Block Assignment File carries
 * the pre-redistricting map and misplaces a third of Texas. The equivalent risk
 * here is picking a boundary year from a different plan than the ZIP table was
 * built from. Measured the same way: the 2022 and 2024 cartographic files
 * disagree on 5 of 60,000 sampled points, 0.01%, so they are the same map and
 * the newer one is used.
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CACHE = join(ROOT, 'data/cache');
const OUT = join(ROOT, 'public/data/districts_tx_house.topo.json');
const FIXTURE = join(ROOT, 'data/district_points.fixture.json');

const VINTAGE = '2024';
const SOURCE =
  `https://www2.census.gov/geo/tiger/GENZ${VINTAGE}/shp/cb_${VINTAGE}_48_sldl_500k.zip`;
const ZIP = join(CACHE, `cb_${VINTAGE}_48_sldl_500k.zip`);

/** ~11 m. See the note above for what this costs and what it buys. */
const PRECISION = 0.0001;
/** Enough to catch a gross regression (the wrong map, a broken decoder, one
 *  district inverted) without committing a megabyte of fixture. It is not
 *  trying to measure the 0.04% precisely; build_districts measured that once,
 *  against 60,000 points, and wrote the number down above. */
const POINTS_PER_DISTRICT = 15;

const write = process.argv.includes('--write');
const say = (s) => console.log('  ' + s);

async function fetchCached() {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  if (existsSync(ZIP)) { say(`cached ${ZIP.replace(ROOT, '.')}`); return; }
  say(`downloading ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`census returned ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(ZIP));
  say(`downloaded ${(readFileSync(ZIP).length / 1024).toFixed(0)} KB`);
}

/** mapshaper is invoked through npx and is deliberately NOT a dependency: this
 *  script is run by hand when the map changes, like data:zips, and its output is
 *  committed. Nothing in `npm run build` needs it. */
function mapshaper(args) {
  // NEITHER `npx` NOR `shell: true`, on purpose, because on Windows both are
  // dead ends. Spawning npx.cmd without a shell fails EINVAL, since Node
  // stopped allowing .cmd through execFile for CVE-2024-27980; adding
  // shell:true then concatenates the argument array instead of escaping it,
  // which Node warns about and which would matter the first time one of these
  // paths contained a space. Running npm's own npx entry point under this same
  // node avoids the shell entirely and behaves identically on every platform.
  const npxCli = join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
  const [bin, lead] = existsSync(npxCli) ? [process.execPath, [npxCli]] : ['npx', []];
  return execFileSync(bin, [...lead, '-y', 'mapshaper@0.6.102', ...args], {
    cwd: CACHE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

console.log('\n  Texas House district boundaries\n');
await fetchCached();

const topoPath = join(CACHE, 'districts.topo.json');
const fullPath = join(CACHE, 'districts.full.json');

say('converting to TopoJSON at full topology');
mapshaper(['-i', ZIP, '-filter-fields', 'SLDLST',
  '-o', `precision=${PRECISION}`, 'format=topojson', topoPath]);

say('converting to GeoJSON at source resolution, for the fixture');
mapshaper(['-i', ZIP, '-filter-fields', 'SLDLST',
  '-o', 'precision=0.000001', 'format=geojson', fullPath]);

// --- verify before writing anything ----------------------------------------

const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
const layer = Object.keys(topo.objects)[0];
const geoms = topo.objects[layer].geometries;

const ids = geoms.map((g) => Number(g.properties.SLDLST)).sort((a, b) => a - b);
const expected = Array.from({ length: 150 }, (_, i) => i + 1);
if (ids.join() !== expected.join()) {
  throw new Error(`expected districts 1-150, got ${ids.length}: ${ids.slice(0, 8).join(',')}...`);
}
say(`150 districts, numbered 1 to 150`);

const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;
// Texas, generously bounded. A file for the wrong state would pass every other
// check in here.
if (tx < -107 || tx > -93 || ty < 25 || ty > 37) {
  throw new Error(`translate ${tx},${ty} is not in Texas`);
}
say(`origin ${tx.toFixed(3)}, ${ty.toFixed(3)} is inside Texas`);

// --- the fixture: sample points, answered at SOURCE resolution --------------
//
// Frozen from the unsimplified file, so checking the shipped file against them
// is a real comparison rather than the file agreeing with itself.

const full = JSON.parse(readFileSync(fullPath, 'utf8'));

const inRing = (pt, ring) => {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inPoly = (pt, rings) => {
  if (!inRing(pt, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(pt, rings[i])) return false;
  return true;
};
const inGeom = (pt, g) => (g.type === 'Polygon'
  ? inPoly(pt, g.coordinates)
  : g.coordinates.some((p) => inPoly(pt, p)));

const bboxOf = (g) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const poly of (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)) {
    for (const [x, y] of poly[0]) {
      if (x < a) a = x; if (x > c) c = x;
      if (y < b) b = y; if (y > d) d = y;
    }
  }
  return [a, b, c, d];
};

// Deterministic, so rebuilding does not churn the fixture.
let seed = 20260912;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const points = [];
for (const f of full.features) {
  const d = Number(f.properties.SLDLST);
  const [a, b, c, e] = bboxOf(f.geometry);
  let got = 0, tries = 0;
  while (got < POINTS_PER_DISTRICT && tries < POINTS_PER_DISTRICT * 500) {
    tries++;
    const pt = [
      Number((a + rnd() * (c - a)).toFixed(6)),
      Number((b + rnd() * (e - b)).toFixed(6)),
    ];
    if (!inGeom(pt, f.geometry)) continue;
    points.push([pt[0], pt[1], d]);
    got++;
  }
  if (got < POINTS_PER_DISTRICT) throw new Error(`could not sample district ${d}`);
}
say(`${points.length} fixture points sampled at source resolution`);

const out = JSON.stringify(topo);
say(`output ${(out.length / 1024).toFixed(0)} KB raw`);

if (!write) {
  console.log('\n  dry run - nothing written. Add --write to apply.\n');
  process.exit(0);
}

writeFileSync(OUT, out, 'utf8');
writeFileSync(FIXTURE, JSON.stringify({
  _meta: {
    what: 'Sample points with the district that contains them, answered at Census source resolution.',
    why: 'scripts/check_districts.mjs asserts the shipped, quantised file still answers these. Frozen from the unsimplified geometry so the check is a comparison, not a tautology.',
    source: SOURCE,
    vintage: VINTAGE,
    perDistrict: POINTS_PER_DISTRICT,
  },
  points,
}), 'utf8');

console.log(`\n  wrote ${OUT.replace(ROOT, '.')}`);
console.log(`  wrote ${FIXTURE.replace(ROOT, '.')}\n`);
