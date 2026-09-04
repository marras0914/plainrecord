/**
 * ZIP code -> Texas House districts, for the district lookup on the page.
 *
 * WHY THIS IS NOT A ONE-LINE DOWNLOAD
 *
 * There is no ZIP-to-state-legislative-district file. The Census publishes
 * ZCTA-to-congressional-district and it publishes state-legislative-district
 * relationships to counties, tracts and places, but not the pair this needs.
 * Nothing official maps a ZIP to a Texas House district.
 *
 * So it is derived. 2020 Census tabulation blocks nest inside both a ZCTA and a
 * district, which makes the block the common denominator, and the join is a
 * plain ID join rather than a spatial one. That matters: intersecting ZIP and
 * district polygons would report every district whose boundary merely grazes a
 * ZIP, and there is no way to tell those slivers from real overlap afterwards.
 * Joining on blocks cannot produce that artifact at all — a block is either in
 * the district or it is not.
 *
 * TWO INPUTS, AND WHY EACH IS THE ONE IT IS
 *
 * 1. tab20_zcta520_tabblock20_natl.txt (1.06 GB) gives block -> ZCTA. It is
 *    national and there is no Texas-only edition, so it is streamed and
 *    filtered to state 48 on the way past; the cached Texas slice is 18 MB.
 *    Its leading rows have empty ZCTA columns — those are blocks in no ZCTA,
 *    which is normal for 2020 — so rows without one are skipped, not treated
 *    as an error.
 *
 * 2. sldl_2022.zip gives block -> district. It has to be the 2022 file, NOT the
 *    2020 Block Assignment File, which also contains a Texas SLDL table and
 *    looks equally plausible. The 2020 BAF carries the pre-redistricting map:
 *    33% of Texas blocks sit in a different district between the two. Using it
 *    would have misassigned a third of the state while every internal check
 *    still passed. verify below re-derives that 150-district count, and
 *    check_zips.mjs spot-checks districts against counties whose members are
 *    known, which is what would actually catch the wrong map.
 *
 * NO SLIVER PRUNING, ON PURPOSE
 *
 * Every (ZIP, district) pair the join produces is kept. Dropping pairs below a
 * land-area share was tried and rejected: at a 0.5% floor it removes 115 of
 * 3,268 pairs and drops no ZIP entirely, so it buys almost nothing, and land
 * area is a poor proxy for where people live — half a percent of a dense ZIP's
 * area can be an apartment block. The panel shows the reader every district
 * their ZIP touches and asks them to pick, so a surplus row costs a glance
 * while a missing row tells someone the wrong representative. Shares are kept
 * so the list can be ordered and so "nearly all of this ZIP" reads differently
 * from a genuine split.
 *
 * Usage:  npm run data:zips        (add --refresh to re-download the inputs)
 */

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

const CACHE = 'data/cache';
const ZCTA_SLICE = `${CACHE}/tx_block_zcta.psv`;
const BEF_ZIP = `${CACHE}/sldl_2022.zip`;
const BEF_TXT_DEFAULT = `${CACHE}/48_TX_SLDL22.txt`;
// Both are overridable so the crosswalk can be rebuilt against a DIFFERENT
// district map and compared. That is not a hypothetical: it is how the claim
// "the 2020 assignment file would have been wrong" was actually tested, and
// how check_zips.mjs's anchors were shown to be capable of failing.
//   node scripts/build_zips.mjs --bef <file> --out <file>
const flag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = flag('out', 'public/data/zips_89R.json');
const BEF_TXT = flag('bef', BEF_TXT_DEFAULT);
const MEMBERS = 'public/data/members_89R.json';

const ZCTA_URL =
  'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_tabblock20_natl.txt';
const BEF_URL =
  'https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2023/2022-state-legislative-bef/sldl_2022.zip';

const refresh = process.argv.includes('--refresh');
const log = (s) => console.log(s);

// -----------------------------------------------------------------------------
// Inputs

/**
 * Stream the national ZCTA-to-block file and keep only Texas.
 *
 * Held in a cache because it is a gigabyte over the wire; the filtered slice is
 * 18 MB and the join reads it in a second. data/* is gitignored, so nothing
 * here is committed.
 */
async function fetchZctaSlice() {
  if (existsSync(ZCTA_SLICE) && !refresh) {
    log(`  cached  ${ZCTA_SLICE}  (${(statSync(ZCTA_SLICE).size / 1e6).toFixed(1)} MB)`);
    return;
  }
  log(`  streaming ${ZCTA_URL}`);
  log('  1.06 GB national file, filtered to state 48 as it arrives');
  const res = await fetch(ZCTA_URL);
  if (!res.ok) throw new Error(`ZCTA relationship file: HTTP ${res.status}`);
  mkdirSync(CACHE, { recursive: true });

  const out = [];
  let kept = 0, seen = 0, mb = 0, bytes = 0;
  let tail = '';
  for await (const chunk of Readable.fromWeb(res.body)) {
    bytes += chunk.length;
    if (bytes / 1e8 > mb) { mb = Math.floor(bytes / 1e8) + 1; process.stdout.write('.'); }
    const text = tail + chunk.toString('latin1');
    const lines = text.split('\n');
    tail = lines.pop() ?? '';
    for (const l of lines) {
      seen++;
      // GEOID_ZCTA5_20 is field 2, GEOID_TABBLOCK_20 field 10, AREALAND_PART 16.
      const f = l.split('|');
      if (f.length < 16) continue;
      if (f[9].slice(0, 2) !== '48' || f[1] === '') continue;
      out.push(`${f[9]}|${f[1]}|${f[15]}`);
      kept++;
    }
  }
  process.stdout.write('\n');
  writeFileSync(ZCTA_SLICE, out.join('\n') + '\n', 'latin1');
  log(`  ${seen.toLocaleString()} rows scanned, ${kept.toLocaleString()} Texas rows kept`);
}

/**
 * Pull one entry out of a zip without shelling out to `unzip`.
 *
 * The script has to run on Windows as well as CI, and a build that depends on
 * whichever unzip happens to be on PATH is a build that breaks on someone
 * else's machine. Only one member is needed, so: walk the central directory,
 * find it, inflate it.
 */
function readZipEntry(zipPath, entryName) {
  const buf = readFileSync(zipPath);
  // End of central directory: signature 0x06054b50, scanned from the back.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${zipPath}: no end-of-central-directory record`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('latin1');

    if (name === entryName) {
      // Local header: name and extra lengths can differ from the central copy.
      if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('bad local header');
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.slice(start, start + compSize);
      return method === 0 ? raw : inflateRawSync(raw);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${zipPath}: no entry named ${entryName}`);
}

async function fetchBef() {
  if (existsSync(BEF_TXT) && !refresh) {
    log(`  cached  ${BEF_TXT}  (${(statSync(BEF_TXT).size / 1e6).toFixed(1)} MB)`);
    return;
  }
  if (!existsSync(BEF_ZIP) || refresh) {
    log(`  downloading ${BEF_URL}`);
    const res = await fetch(BEF_URL);
    if (!res.ok) throw new Error(`SLDL block equivalency: HTTP ${res.status}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(BEF_ZIP, Buffer.from(await res.arrayBuffer()));
  }
  writeFileSync(BEF_TXT, readZipEntry(BEF_ZIP, '48_TX_SLDL22.txt'));
  log(`  extracted 48_TX_SLDL22.txt  (${(statSync(BEF_TXT).size / 1e6).toFixed(1)} MB)`);
}

// -----------------------------------------------------------------------------
// Join

const lines = (p) => createInterface({ input: createReadStream(p), crlfDelay: Infinity });

async function build() {
  mkdirSync(CACHE, { recursive: true });
  await fetchZctaSlice();
  await fetchBef();

  // The exact bytes of the district map this build used.
  //
  // The anchors in check_zips.mjs turned out to be a weak detector: rebuilt on
  // the 2020 pre-redistricting map, only ONE of seven downtown anchors moved,
  // because redistricting preserves urban cores even while a third of the
  // state's blocks change district. So the map is pinned by hash instead. It is
  // an exact test rather than a plausible one.
  const planSha = createHash('sha256').update(readFileSync(BEF_TXT)).digest('hex');
  log(`  district map sha256 ${planSha.slice(0, 16)}…`);

  // block -> district
  const dist = new Map();
  for await (const l of lines(BEF_TXT)) {
    if (!l || l.startsWith('GEOID')) continue;
    const c = l.indexOf(',');
    if (c < 0) continue;
    dist.set(l.slice(0, c), parseInt(l.slice(c + 1), 10));
  }
  const districts = new Set(dist.values());
  log(`  ${dist.size.toLocaleString()} blocks carry a district; ${districts.size} distinct districts`);

  // (ZIP, district) -> land area and block count
  const pairs = new Map();
  const zipArea = new Map();
  const zipBlocks = new Map();
  let unmatched = 0, rows = 0;
  for await (const l of lines(ZCTA_SLICE)) {
    if (!l) continue;
    rows++;
    const [block, zip, areaS] = l.split('|');
    const d = dist.get(block);
    if (d === undefined) { unmatched++; continue; }
    const area = Number(areaS) || 0;
    const k = `${zip}:${d}`;
    const cur = pairs.get(k);
    if (cur) { cur.area += area; cur.blocks++; }
    else pairs.set(k, { zip, d, area, blocks: 1 });
    zipArea.set(zip, (zipArea.get(zip) ?? 0) + area);
    zipBlocks.set(zip, (zipBlocks.get(zip) ?? 0) + 1);
  }
  log(`  ${rows.toLocaleString()} block rows joined; ${pairs.size.toLocaleString()} (ZIP, district) pairs across ${zipArea.size.toLocaleString()} ZIPs`);

  // Group by ZIP, ordered by share descending.
  const byZip = new Map();
  for (const p of pairs.values()) {
    const totalArea = zipArea.get(p.zip) ?? 0;
    // A ZCTA that is all water has no land to weight by; fall back to block
    // count so the pair still gets a defensible share rather than a zero.
    const share = totalArea > 0
      ? p.area / totalArea
      : p.blocks / (zipBlocks.get(p.zip) || 1);
    const list = byZip.get(p.zip) ?? [];
    list.push({ d: p.d, share, blocks: p.blocks });
    byZip.set(p.zip, list);
  }

  const zips = {};
  let multi = 0;
  for (const [zip, list] of [...byZip.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => b.share - a.share || a.d - b.d);
    if (list.length === 1) {
      // The common case — 54% of Texas ZIPs — stored as a bare number, which
      // halves the file. The client narrows on typeof.
      zips[zip] = list[0].d;
    } else {
      multi++;
      zips[zip] = list.map((e) => [e.d, Math.round(e.share * 100)]);
    }
  }

  // ---------------------------------------------------------------------------
  // Verify before writing. Every throw here is a failure that would otherwise
  // ship a file that looks right.

  const members = JSON.parse(readFileSync(MEMBERS, 'utf8'));
  const seated = new Set(members.members.map((m) => m.d));

  if (unmatched !== 0) {
    throw new Error(`${unmatched} blocks are in a ZCTA but have no district — the two files disagree`);
  }
  if (districts.size !== 150) {
    throw new Error(`expected 150 House districts in the equivalency file, got ${districts.size}`);
  }
  const emitted = new Set();
  for (const [zip, v] of Object.entries(zips)) {
    if (!/^\d{5}$/.test(zip)) throw new Error(`not a 5-digit ZIP: ${zip}`);
    const ds = typeof v === 'number' ? [v] : v.map((e) => e[0]);
    for (const d of ds) {
      if (!Number.isInteger(d) || d < 1 || d > 150) throw new Error(`ZIP ${zip}: district ${d} out of range`);
      emitted.add(d);
    }
    if (typeof v !== 'number') {
      const sum = v.reduce((a, e) => a + e[1], 0);
      if (Math.abs(sum - 100) > 2) throw new Error(`ZIP ${zip}: shares sum to ${sum}`);
      if (new Set(ds).size !== ds.length) throw new Error(`ZIP ${zip}: a district appears twice`);
    }
  }
  // Every district must be reachable by ZIP, or some readers can never find
  // their own member.
  const unreachable = [...districts].filter((d) => !emitted.has(d));
  if (unreachable.length) {
    throw new Error(`districts no ZIP maps to: ${unreachable.join(', ')}`);
  }
  // A district with no sitting member is legitimate (93 is vacant) but must be
  // the one the members file already accounts for, not a join artifact.
  const seatless = [...emitted].filter((d) => !seated.has(d));
  if (seatless.length > 1 || (seatless.length === 1 && seatless[0] !== 93)) {
    throw new Error(`unexpected districts with no member: ${seatless.join(', ')}`);
  }

  const out = {
    _meta: {
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      note: 'Derived from US Census Bureau public domain files. No rights reserved.',
    },
    session: members.session,
    generated: new Date().toISOString().slice(0, 10),
    method:
      'ZIP (2020 ZCTA) to Texas House district, joined through 2020 Census tabulation blocks. ' +
      'Blocks nest inside both, so this is an ID join, not a polygon intersection: no boundary slivers. ' +
      'Where a ZIP spans districts, every district it touches is listed with its share of the ZIP land area, ' +
      'largest first. Nothing is pruned — the reader picks from the list, so a surplus entry is cheaper ' +
      'than a missing one.',
    sources: {
      zctaToBlock: ZCTA_URL,
      blockToDistrict: BEF_URL,
      blockToDistrictNote:
        '2022 plan, not the 2020 Block Assignment File: 33% of Texas blocks changed district between them.',
      blockToDistrictSha256: planSha,
    },
    provenance: {
      blocksJoined: rows,
      blocksUnmatched: unmatched,
      districtsInPlan: districts.size,
      zips: Object.keys(zips).length,
      pairs: pairs.size,
      zipsInOneDistrict: Object.keys(zips).length - multi,
      zipsSpanningDistricts: multi,
      districtWithoutMember: seatless[0] ?? null,
    },
    format:
      'zips[zip] is a district number when the ZIP lies in one district, ' +
      'or an array of [district, percent of ZIP land area] pairs, largest first.',
    zips,
  };

  writeFileSync(OUT, JSON.stringify(out));
  const kb = (statSync(OUT).size / 1024).toFixed(1);
  log('');
  log(`  ${OUT}  ${kb} KB`);
  log(`  ${out.provenance.zipsInOneDistrict} ZIPs resolve to a single district, ${multi} span more than one`);
  log('');
  log('  zip crosswalk built');
}

await build();
