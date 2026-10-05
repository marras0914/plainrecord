/**
 * PlainRecord — which counties and towns each Texas House district's people live in
 *
 *   node scripts/build_district_places.mjs
 *
 * Writes data/district_places_2020.json, which build_district_pages.mjs reads.
 *
 * WHY. On 5 October 2026 Search Console reported the district pages as "Crawled,
 * currently not indexed": Google fetched them and declined. About three quarters
 * of a typical page was word for word the same as the other 149, and not one of
 * them named a place. People search "Frisco state representative", not "Texas
 * House District 106". The ZIP list was the only local thing on the page.
 *
 * HOW. Every figure is a sum of 2020 Census block populations, the same blocks
 * and the same counts build_zips.mjs uses:
 *   - block to district: 48_TX_SLDL22.txt, the Census 2022 equivalency file for
 *     the map the current members were elected on;
 *   - block to population: tx_block_pop.psv, from the 2020 redistricting file;
 *   - block to county: the first five digits of the block id;
 *   - block to town: BlockAssign_ST48_TX_INCPLACE_CDP.txt, the Census 2020 block
 *     assignment file for incorporated places and census-designated places, with
 *     names from st48_tx_place2020.txt.
 * Both Census files are fetched by hand into data/cache (see the end of this
 * header). Nothing is estimated and nothing comes from a geocoder.
 *
 * "Town" means a Census place: a city, town or village, or a census-designated
 * place (an unincorporated community the Census names, e.g. The Woodlands). The
 * output keeps the type so a page never calls a CDP a city.
 *
 * For each place it keeps two shares, because they answer different questions:
 *   shareOfDistrict  how much of the district lives there ("most of District 47
 *                    lives in Austin")
 *   shareOfPlace     how much of the place falls in this district ("part of
 *                    Austin" against "all of Lakeway")
 *
 * Places below 1% of the district are dropped, except that a place lying wholly
 * inside the district is kept from 1,000 residents up: a reader in a small town
 * should still find it named.
 *
 * It refuses to write unless every block in the district file has a population
 * row, the 150 districts sum to the 2020 Texas population, and every place code
 * resolves to a name.
 *
 * Inputs, if data/cache is empty:
 *   https://www2.census.gov/geo/docs/maps-data/data/baf2020/BlockAssign_ST48_TX.zip
 *     (unzip BlockAssign_ST48_TX_INCPLACE_CDP.txt)
 *   https://www2.census.gov/geo/docs/reference/codes2020/place/st48_tx_place2020.txt
 *   48_TX_SLDL22.txt and tx_block_pop.psv: run build_zips.mjs first.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, 'data/cache');
const OUT = resolve(ROOT, 'data/district_places_2020.json');

// The 2020 Census count for Texas. If the sum differs, a file is incomplete.
const TX_POP_2020 = 29145505;
const MIN_SHARE = 0.01;
const MIN_WHOLE_PLACE = 1000;

const lines = (f) => readFileSync(resolve(CACHE, f), 'utf8').split(/\r?\n/).filter(Boolean);
const fail = (msg) => { console.error(`\n  REFUSED: ${msg}\n`); process.exit(1); };

const pop = new Map();
for (const l of lines('tx_block_pop.psv')) {
  const [b, p] = l.split('|');
  pop.set(b, Number(p));
}

const place = new Map();
for (const l of lines('BlockAssign_ST48_TX_INCPLACE_CDP.txt').slice(1)) {
  const [b, fp] = l.split('|');
  if (fp) place.set(b, fp);
}

const placeName = new Map();
for (const l of lines('st48_tx_place2020.txt').slice(1)) {
  const [, , fp, , name, type] = l.split('|');
  placeName.set(fp, { name, type });
}

const countyName = new Map(
  JSON.parse(readFileSync(resolve(CACHE, 'counties.full.json'), 'utf8')).features
    .map((f) => [f.properties.GEOID, f.properties.NAME]),
);

// district -> { pop, counties: Map(fips -> pop), places: Map(fp -> pop) }
const districts = new Map();
const placeTotal = new Map();
let missingPop = 0;
for (const l of lines('48_TX_SLDL22.txt').slice(1)) {
  const [b, sld] = l.split(',');
  const d = Number(sld);
  const p = pop.get(b);
  if (p === undefined) { missingPop++; continue; }
  if (!districts.has(d)) districts.set(d, { pop: 0, counties: new Map(), places: new Map() });
  const row = districts.get(d);
  row.pop += p;
  const c = b.slice(0, 5);
  row.counties.set(c, (row.counties.get(c) ?? 0) + p);
  const fp = place.get(b);
  if (fp) {
    row.places.set(fp, (row.places.get(fp) ?? 0) + p);
    placeTotal.set(fp, (placeTotal.get(fp) ?? 0) + p);
  }
}

if (missingPop) fail(`${missingPop} blocks in the district file have no population row`);
if (districts.size !== 150) fail(`expected 150 districts, found ${districts.size}`);
const total = [...districts.values()].reduce((s, r) => s + r.pop, 0);
if (total !== TX_POP_2020) fail(`districts sum to ${total}, not the 2020 Texas count of ${TX_POP_2020}`);
for (const fp of placeTotal.keys()) if (!placeName.has(fp)) fail(`place code ${fp} has no name`);
for (const r of districts.values()) for (const c of r.counties.keys()) if (!countyName.has(c)) fail(`county ${c} has no name`);

const r4 = (x) => Math.round(x * 10000) / 10000;
// "Austin city" -> "Austin"; the type is kept separately.
const bare = (n) => n.replace(/ (city|town|village|CDP)$/, '');

const out = {
  _meta: {
    what: 'Population of each Texas House district (2022 map) by county and by Census place, from 2020 Census blocks',
    built: new Date().toISOString().slice(0, 10),
    source: 'Census 2020 PL 94-171 block populations; 2022 SLDL block equivalency; 2020 INCPLACE_CDP block assignment',
    rule: `places kept at ${MIN_SHARE * 100}% of the district or more, or wholly inside it with ${MIN_WHOLE_PLACE}+ residents`,
  },
  districts: {},
};

for (const [d, r] of [...districts].sort((a, b) => a[0] - b[0])) {
  const counties = [...r.counties]
    .sort((a, b) => b[1] - a[1])
    .map(([fips, p]) => ({ name: countyName.get(fips), fips, pop: p, shareOfDistrict: r4(p / r.pop) }));
  const places = [...r.places]
    .map(([fp, p]) => {
      const { name, type } = placeName.get(fp);
      return { name: bare(name), cdp: type !== 'INCORPORATED PLACE', fp, pop: p,
        shareOfDistrict: r4(p / r.pop), shareOfPlace: r4(p / placeTotal.get(fp)) };
    })
    .filter((x) => x.shareOfDistrict >= MIN_SHARE || (x.shareOfPlace === 1 && x.pop >= MIN_WHOLE_PLACE))
    .sort((a, b) => b.pop - a.pop);
  const inPlaces = [...r.places.values()].reduce((s, p) => s + p, 0);
  out.districts[d] = { pop: r.pop, outsideAnyPlace: r4(1 - inPlaces / r.pop), counties, places };
}

writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`  wrote ${OUT.replace(ROOT + '\\', '').replace(ROOT + '/', '')}: 150 districts, ${total.toLocaleString()} people`);
