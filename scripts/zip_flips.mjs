/**
 * The 108 ZIPs where land area and people disagree about which Texas House
 * district a ZIP "is in".
 *
 * WHY THIS DOES THE JOIN AGAIN INSTEAD OF READING THE SHIPPED FILE
 *
 * The payload publishes each land share rounded to a whole percent, and the
 * headline cannot be recovered from it. Reading the rounded file back gives 111,
 * not 108: rounding pushes three ZIPs — 76103, 76930 and 79103 — into an exact
 * 50/50 tie that the two orderings then break differently, inventing a
 * disagreement that the underlying areas do not contain. build_zips.mjs measures
 * the headline before that rounding and says so in a comment.
 *
 * So this repeats the block join against the same cached Census inputs
 * build_zips.mjs uses, applies the same two orderings, and reproduces 108 on the
 * nose. The rounded recount is kept below and printed beside it, so the gap is
 * named and attributed rather than discovered again by whoever reads the map and
 * tries to check it against the published file.
 *
 * THE TWO ORDERINGS, both taken verbatim from build_zips.mjs so that a change
 * there shows up here as a failed assertion rather than as a quietly different
 * map:
 *
 *   by land   — descending land area, ties to the lower district number
 *   by people — descending head count, ties to the lower district number
 *
 * A flip is a ZIP where those two pick different districts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { openZip } from './lib/zipfile.mjs';

const CACHE = 'data/cache';
const ZCTA_SLICE = `${CACHE}/tx_block_zcta.psv`;   // block | ZCTA | land area
const SLDL = `${CACHE}/48_TX_SLDL22.txt`;          // GEOID,SLDLST
// THE 2024 EDITION, NOT THE 2020 ONE. The file named 2020_Gaz_zcta_national.txt
// still carries 2010 ZCTAs — 33,144 of them — and 65 Texas ZIPs in the
// relationship file have no row in it, including populated ones in Frisco and
// the Texas A&M campus. The 2024 gazetteer carries the 2020 ZCTAs, all 33,791,
// and covers every ZIP in the payload. Every centroid below is asserted present,
// so picking the wrong vintage again fails the build rather than thinning the map.
const GAZ_ZIP = `${CACHE}/gaz_zcta_2024.zip`;
const GAZ_ENTRY = '2024_Gaz_zcta_national.txt';
const PAYLOAD = 'public/data/zips_89R.json';
const OUT = 'private/zip_flips.json';

/** Texas, wide enough for every Texas ZCTA and nothing else. */
const TX_BOX = { lon: [-107.0, -93.4], lat: [25.7, 36.6] };

const lines = (path) => createInterface({ input: createReadStream(path), crlfDelay: Infinity });

/** Descending by `key`, ties to the lower district number. */
const topBy = (list, key) => [...list].sort((a, b) => b[key] - a[key] || a.d - b.d)[0];

function flipsIn(byZip) {
  const out = [];
  for (const [zip, list] of byZip) {
    if (list.length < 2) continue;
    const byLand = topBy(list, 'area');
    const byPeople = topBy(list, 'people');
    if (byLand.d === byPeople.d) continue;
    out.push({ zip, byLand, byPeople, parts: list.length });
  }
  return out;
}

async function blockJoin() {
  const dist = new Map();
  let header = true;
  for await (const l of lines(SLDL)) {
    if (header) { header = false; continue; }
    if (!l) continue;
    const [geoid, sldl] = l.split(',');
    dist.set(geoid, Number(sldl));
  }

  const pairs = new Map();
  for await (const l of lines(ZCTA_SLICE)) {
    if (!l) continue;
    const [block, zip, areaS] = l.split('|');
    const d = dist.get(block);
    if (d === undefined) continue; // outside the plan; build_zips.mjs counts these
    const k = `${zip}:${d}`;
    const cur = pairs.get(k);
    if (cur) cur.area += Number(areaS) || 0;
    else pairs.set(k, { zip, d, area: Number(areaS) || 0, people: 0 });
  }

  // The head counts already live in the shipped payload, exact and unrounded —
  // only the LAND share is rounded there — so the 100 MB P.L. 94-171 file does
  // not need re-reading to get them.
  const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
  for (const [zip, v] of Object.entries(payload.zips)) {
    if (!Array.isArray(v)) continue;
    for (const [d, people] of v) {
      const p = pairs.get(`${zip}:${d}`);
      if (!p) throw new Error(`payload has ${zip} in district ${d}, the block join does not`);
      p.people = people;
    }
  }

  const byZip = new Map();
  for (const p of pairs.values()) {
    const list = byZip.get(p.zip) ?? [];
    list.push(p);
    byZip.set(p.zip, list);
  }
  return { byZip, payload };
}

/** The same rule read off the payload's ROUNDED land percents, for comparison. */
function flipsFromRounded(payload) {
  const byZip = new Map();
  for (const [zip, v] of Object.entries(payload.zips)) {
    if (!Array.isArray(v)) continue;
    byZip.set(zip, v.map(([d, people, area]) => ({ zip, d, people, area })));
  }
  return flipsIn(byZip);
}

async function centroids(wanted) {
  const zip = openZip(GAZ_ZIP);
  const at = new Map();
  try {
    let header = true;
    for await (const line of lines0(zip.stream(GAZ_ENTRY))) {
      if (header) { header = false; continue; }
      if (!line) continue;
      const f = line.split('\t');
      const geoid = f[0].trim();
      if (!wanted.has(geoid)) continue;
      // The last two columns are the internal point, which the Census
      // guarantees lies inside the area. A bounding-box centre would not.
      const lat = Number(f[f.length - 2]);
      const lon = Number(f[f.length - 1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) at.set(geoid, [lon, lat]);
    }
  } finally {
    zip.close();
  }
  return at;
}
const lines0 = (stream) => createInterface({ input: stream, crlfDelay: Infinity });

// ---------------------------------------------------------------------------

const { byZip, payload } = await blockJoin();
const flips = flipsIn(byZip);
const split = [...byZip.values()].filter((l) => l.length > 1).length;

// ASSERT THE PRECONDITION, AND PROVE THE ASSERT CAN FIRE.
const claimed = payload.provenance.zipsWhereLandWouldLeadWithAnotherDistrict;
const claimedSplit = payload.provenance.zipsSpanningDistricts;
if (split !== claimedSplit) throw new Error(`split ZIPs: counted ${split}, payload says ${claimedSplit}`);
if (flips.length !== claimed) throw new Error(`flips: counted ${flips.length}, payload says ${claimed}`);
{
  // The rule against a ZIP built to flip, one built not to, and one where land
  // ties — so a rule that had collapsed into "return nothing" cannot pass the
  // two counts above by coincidence.
  const probe = (list) => flipsIn(new Map([['x', list]])).length;
  if (probe([{ d: 1, people: 900, area: 10 }, { d: 2, people: 100, area: 90 }]) !== 1) throw new Error('flip rule fails to detect a flip');
  if (probe([{ d: 1, people: 900, area: 90 }, { d: 2, people: 100, area: 10 }]) !== 0) throw new Error('flip rule invents a flip');
  if (probe([{ d: 1, people: 900, area: 50 }, { d: 2, people: 100, area: 50 }]) !== 0) throw new Error('a tie must not flip');
}

const rounded = flipsFromRounded(payload);
const roundedSet = new Set(rounded.map((r) => r.zip));
const exactSet = new Set(flips.map((f) => f.zip));
const onlyRounded = rounded.filter((r) => !exactSet.has(r.zip)).map((r) => r.zip);
const onlyExact = flips.filter((f) => !roundedSet.has(f.zip)).map((f) => f.zip);
console.log(`  exact land shares: ${flips.length} flips in ${split} split ZIPs`);
console.log(`  payload's rounded percents: ${rounded.length} — rounding to whole percent invents ${onlyRounded.length} (${onlyRounded.join(', ') || 'none'}) and loses ${onlyExact.length} (${onlyExact.join(', ') || 'none'})`);
console.log('  the map uses the exact shares, which is the number the site publishes');

// Every split ZIP gets a dot, not just the flips: the point of the picture is
// the proportion, and a map of only the 108 would assert it instead of showing it.
const splitZips = [...byZip].filter(([, l]) => l.length > 1).map(([z]) => z);
const at = await centroids(new Set(splitZips));

const missing = splitZips.filter((z) => !at.has(z));
if (missing.length) throw new Error(`no gazetteer centroid for ${missing.length} ZIPs: ${missing.slice(0, 5).join(', ')}`);
const outside = splitZips.filter((z) => {
  const [lon, lat] = at.get(z);
  return lon < TX_BOX.lon[0] || lon > TX_BOX.lon[1] || lat < TX_BOX.lat[0] || lat > TX_BOX.lat[1];
});
if (outside.length) throw new Error(`${outside.length} centroids fall outside Texas: ${outside.slice(0, 5).join(', ')}`);

const flipSet = new Set(flips.map((f) => f.zip));
if (!existsSync('private')) mkdirSync('private');
writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  source: PAYLOAD,
  sourceGenerated: payload.generated,
  centroids: 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip',
  counts: { split, flips: flips.length, flipsFromRoundedPercents: rounded.length },
  flips: flips.map((f) => ({
    zip: f.zip,
    parts: f.parts,
    people: { d: f.byPeople.d, people: f.byPeople.people, landPct: 100 * f.byPeople.area / byZip.get(f.zip).reduce((s, r) => s + r.area, 0) },
    land: { d: f.byLand.d, people: f.byLand.people, landPct: 100 * f.byLand.area / byZip.get(f.zip).reduce((s, r) => s + r.area, 0) },
    total: byZip.get(f.zip).reduce((s, r) => s + r.people, 0),
  })),
  points: splitZips.map((z) => ({ zip: z, at: at.get(z), flip: flipSet.has(z) })),
}, null, 1));

console.log(`  ${OUT}`);
