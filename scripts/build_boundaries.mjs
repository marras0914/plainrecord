/**
 * Texas House district AND county boundaries, for locating a reader from their
 * device.
 *
 *   npm run data:boundaries            # dry run: says what it would write
 *   npm run data:boundaries -- --write
 *
 * Output: public/data/boundaries_tx.topo.json, plus a frozen fixture of sample
 * points that scripts/check_boundaries.mjs asserts the shipped file still
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
 * TOPOJSON, NOT GEOJSON, AND BOTH LAYERS IN ONE TOPOLOGY
 *
 * The same geometry is 396 KB gzipped as GeoJSON and 122 KB as TopoJSON,
 * because a shared border is stored once. 80% of this site's traffic is mobile,
 * so that difference is the difference between a usable feature and one nobody
 * waits for. src/boundaries.ts carries the decoder; it is 40 lines and needs no
 * library.
 *
 * Counties ride in the SAME topology rather than a second file, and that is
 * measured too: 161 KB gzipped together against 122 + 115 = 237 KB apart. The
 * saving is real because many Texas district lines follow county lines, so the
 * two layers share arcs and each shared run of boundary is stored once for
 * both. A reader who asks to be located gets both answers for 39 KB more than
 * the districts alone used to cost.
 *
 * Counties matter because of a rule rather than a dataset: during early voting a
 * registered Texan may vote at ANY early voting location in their county of
 * residence. So the county is the whole answer to "where can I vote" for that
 * window, with no precinct assignment involved. Election day is different and
 * depends on the Countywide Polling Place Program, whose approvals are published
 * per election, which is why this ships no polling places.
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
const OUT = join(ROOT, 'public/data/boundaries_tx.topo.json');
const FIXTURE = join(ROOT, 'data/boundary_points.fixture.json');

const VINTAGE = '2024';
const SOURCE =
  `https://www2.census.gov/geo/tiger/GENZ${VINTAGE}/shp/cb_${VINTAGE}_48_sldl_500k.zip`;
const ZIP = join(CACHE, `cb_${VINTAGE}_48_sldl_500k.zip`);

// Counties are published nationally only; there is no per-state edition, so the
// 11.6 MB file is fetched once, cached, and filtered to Texas on the way past.
const COUNTY_SOURCE =
  `https://www2.census.gov/geo/tiger/GENZ${VINTAGE}/shp/cb_${VINTAGE}_us_county_500k.zip`;
const COUNTY_ZIP = join(CACHE, `cb_${VINTAGE}_us_county_500k.zip`);
const TX_FIPS = '48';

/** ~11 m. See the note above for what this costs and what it buys. */
const PRECISION = 0.0001;
/** Enough to catch a gross regression (the wrong map, a broken decoder, one
 *  district inverted) without committing a megabyte of fixture. It is not
 *  trying to measure the 0.04% precisely; build_districts measured that once,
 *  against 60,000 points, and wrote the number down above. */
const POINTS_PER_DISTRICT = 15;

const write = process.argv.includes('--write');
const say = (s) => console.log('  ' + s);

async function fetchCached(url, to) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  if (existsSync(to)) { say(`cached ${to.replace(ROOT, '.')}`); return; }
  say(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`census returned ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(to));
  say(`downloaded ${(readFileSync(to).length / 1024).toFixed(0)} KB`);
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

console.log('\n  Texas district and county boundaries\n');
await fetchCached(SOURCE, ZIP);
await fetchCached(COUNTY_SOURCE, COUNTY_ZIP);

const topoPath = join(CACHE, 'boundaries.topo.json');
const fullPath = join(CACHE, 'districts.full.json');
const countyFullPath = join(CACHE, 'counties.full.json');
const dLayer = join(CACHE, 'layer_districts.json');
const cLayer = join(CACHE, 'layer_counties.json');

// Each layer is normalised to its own file first, then the two are combined so
// mapshaper builds ONE topology across both and every shared run of boundary is
// stored once. That is what makes counties cost 39 KB rather than 115.
say('normalising the district layer');
mapshaper(['-i', ZIP, '-filter-fields', 'SLDLST', '-o', dLayer]);

say('normalising the county layer, filtered to Texas');
mapshaper(['-i', COUNTY_ZIP, '-filter', `STATEFP === "${TX_FIPS}"`,
  '-filter-fields', 'NAME,GEOID', '-o', cLayer]);

say('combining into one topology');
mapshaper(['-i', dLayer, cLayer, 'combine-files',
  '-o', `precision=${PRECISION}`, 'format=topojson', topoPath]);

say('converting both at source resolution, for the fixtures');
mapshaper(['-i', ZIP, '-filter-fields', 'SLDLST',
  '-o', 'precision=0.000001', 'format=geojson', fullPath]);
mapshaper(['-i', COUNTY_ZIP, '-filter', `STATEFP === "${TX_FIPS}"`,
  '-filter-fields', 'NAME,GEOID', '-o', 'precision=0.000001', 'format=geojson', countyFullPath]);

// --- verify before writing anything ----------------------------------------

const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
const layerNames = Object.keys(topo.objects);
if (!layerNames.includes('layer_districts') || !layerNames.includes('layer_counties')) {
  throw new Error(`expected both layers, got ${layerNames.join(', ')}`);
}
// Renamed to what the page calls them, so the decoder is not reading a
// mapshaper input filename out of a shipped file.
topo.objects.districts = topo.objects.layer_districts;
topo.objects.counties = topo.objects.layer_counties;
delete topo.objects.layer_districts;
delete topo.objects.layer_counties;

const geoms = topo.objects.districts.geometries;
const ids = geoms.map((g) => Number(g.properties.SLDLST)).sort((a, b) => a - b);
const expected = Array.from({ length: 150 }, (_, i) => i + 1);
if (ids.join() !== expected.join()) {
  throw new Error(`expected districts 1-150, got ${ids.length}: ${ids.slice(0, 8).join(',')}...`);
}
say(`150 districts, numbered 1 to 150`);

// 254 is not a round number anyone would reach by accident, which makes it a
// good assertion: a filter that silently matched nothing, or matched the whole
// country, fails here rather than shipping.
const counties = topo.objects.counties.geometries;
if (counties.length !== 254) {
  throw new Error(`Texas has 254 counties, got ${counties.length}`);
}
const outOfState = counties.filter((g) => !String(g.properties.GEOID ?? '').startsWith(TX_FIPS));
if (outOfState.length) {
  throw new Error(`${outOfState.length} county/counties outside Texas survived the filter`);
}
if (counties.some((g) => !String(g.properties.NAME ?? '').trim())) {
  throw new Error('a county came through with no name, and the name is what the page shows');
}
say(`254 counties, all in state ${TX_FIPS}, all named`);

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

/** Points inside each feature, with the id that contains them, at SOURCE
 *  resolution. Frozen so the check compares the shipped file against something
 *  else rather than against itself. */
function sample(features, idOf, what) {
  const out = [];
  for (const f of features) {
    const id = idOf(f);
    const [a, b, c, e] = bboxOf(f.geometry);
    let got = 0, tries = 0;
    while (got < POINTS_PER_DISTRICT && tries < POINTS_PER_DISTRICT * 500) {
      tries++;
      const pt = [
        Number((a + rnd() * (c - a)).toFixed(6)),
        Number((b + rnd() * (e - b)).toFixed(6)),
      ];
      if (!inGeom(pt, f.geometry)) continue;
      out.push([pt[0], pt[1], id]);
      got++;
    }
    if (got < POINTS_PER_DISTRICT) throw new Error(`could not sample ${what} ${id}`);
  }
  return out;
}

const points = sample(full.features, (f) => Number(f.properties.SLDLST), 'district');
say(`${points.length} district fixture points sampled at source resolution`);

const countyFull = JSON.parse(readFileSync(countyFullPath, 'utf8'));
const countyPoints = sample(countyFull.features, (f) => String(f.properties.GEOID), 'county');
say(`${countyPoints.length} county fixture points sampled at source resolution`);

const out = JSON.stringify(topo);
say(`output ${(out.length / 1024).toFixed(0)} KB raw`);

if (!write) {
  console.log('\n  dry run - nothing written. Add --write to apply.\n');
  process.exit(0);
}

writeFileSync(OUT, out, 'utf8');
writeFileSync(FIXTURE, JSON.stringify({
  _meta: {
    what: 'Sample points with the district and the county that contain them, answered at Census source resolution.',
    why: 'scripts/check_boundaries.mjs asserts the shipped, quantised file still answers these. Frozen from the unsimplified geometry so the check is a comparison, not a tautology.',
    sources: [SOURCE, COUNTY_SOURCE],
    vintage: VINTAGE,
    perFeature: POINTS_PER_DISTRICT,
  },
  points,
  countyPoints,
  // The Census id-to-name mapping, frozen alongside the points and for the same
  // reason. The page prints the county NAME, so that is the field a reader acts
  // on, and until 21 September 2026 nothing checked it: check_boundaries.mjs
  // built its expected names from the shipped file, so swapping two NAME
  // properties in the topojson sent downtown Houston to "Dallas" while the
  // suite reported 0 of 3810 wrong. Freezing the names here makes that a
  // comparison against the Census rather than the file agreeing with itself.
  //
  // Sorted by id so a rebuild does not churn the diff.
  countyNames: Object.fromEntries(
    countyFull.features
      .filter((f) => String(f.properties.GEOID).startsWith('48'))
      .map((f) => [String(f.properties.GEOID), f.properties.NAME])
      .sort((a, b) => a[0].localeCompare(b[0])),
  ),
}), 'utf8');

console.log(`\n  wrote ${OUT.replace(ROOT, '.')}`);
console.log(`  wrote ${FIXTURE.replace(ROOT, '.')}\n`);
