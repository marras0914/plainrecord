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
 * THREE INPUTS, AND WHY EACH IS THE ONE IT IS
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
 * 3. tx2020.pl.zip, the Texas P.L. 94-171 file, gives block -> population.
 *    Added 17 September 2026, and it changed an answer rather than decorating
 *    one. See WHY THE SHARES COUNT PEOPLE below.
 *
 * WHY THE SHARES COUNT PEOPLE AND NOT LAND
 *
 * This file used to weight each (ZIP, district) pair by land area, because land
 * area is what the ZCTA relationship file hands you and because a share is a
 * share. The panel then listed the districts largest first, which is a claim:
 * the top row is where you probably are. Land does not support that claim. A
 * district can hold most of a ZIP's ground and almost none of its addresses.
 *
 * Measured over the 913 split ZIPs, ordering by land put a DIFFERENT district
 * at the top than ordering by people in 108 of them, 11.8%. The worst is 75148,
 * where the land-largest district holds 57% of the ground and 13% of the
 * people, while HD-4 holds 43% of the ground and 87% of the people. Downtown
 * Houston is another: 77002 is 58% HD-147 by land, but HD-142 holds 42% of the
 * people on 5% of the land, and it sorted third.
 *
 * So the shares are population shares, the order is by population, and the land
 * share is kept beside it rather than thrown away — it is what the file claimed
 * for two weeks, and a pair with a lot of land and no people is worth being
 * able to see.
 *
 * NO SLIVER PRUNING, ON PURPOSE
 *
 * Every (ZIP, district) pair the join produces is kept. Dropping pairs below a
 * land-area share was tried and rejected: at a 0.5% floor it removes 115 of
 * 3,268 pairs and drops no ZIP entirely, so it buys almost nothing, and land
 * area is a poor proxy for where people live — half a percent of a dense ZIP's
 * area can be an apartment block. That last sentence was written as an argument
 * against pruning and turned out to be an argument against the whole weighting;
 * see above. The panel shows the reader every district their ZIP touches and
 * asks them to pick, so a surplus row costs a glance while a missing row tells
 * someone the wrong representative. Shares are kept so the list can be ordered
 * and so "nearly all of this ZIP" reads differently from a genuine split.
 *
 * 102 pairs hold no 2020 population at all inside a populated ZIP. They stay,
 * for the same reason: nobody lived in that piece at the census, which is not
 * the same as nobody living there now, and the panel labels them rather than
 * hiding them.
 *
 * Usage:  npm run data:zips        (add --refresh to re-download the inputs)
 */

import {
  createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync,
  openSync, readSync, closeSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { inflateRawSync, createInflateRaw } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

const CACHE = 'data/cache';
const ZCTA_SLICE = `${CACHE}/tx_block_zcta.psv`;
const BEF_ZIP = `${CACHE}/sldl_2022.zip`;
const BEF_TXT_DEFAULT = `${CACHE}/48_TX_SLDL22.txt`;
const PL_ZIP = `${CACHE}/tx2020.pl.zip`;
const POP_SLICE = `${CACHE}/tx_block_pop.psv`;
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
const PL_URL =
  'https://www2.census.gov/programs-surveys/decennial/2020/data/' +
  '01-Redistricting_File--PL_94-171/Texas/tx2020.pl.zip';
/** The whole state, from the Census 2020 count. The population slice must total this. */
const TX_POPULATION_2020 = 29145505;

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

/**
 * The same walk as readZipEntry, but it never holds a member in memory.
 *
 * readZipEntry inflates into a Buffer, which is right for the 14 MB
 * equivalency file and impossible for this one: the P.L. geographic header
 * inflates to 362 MB and segment 1 to 306 MB. Both are read once, line by
 * line, so they are streamed instead and only the central directory is read
 * into memory. Returns { entries, stream(name), close() }.
 */
function openZip(zipPath) {
  const size = statSync(zipPath).size;
  const fd = openSync(zipPath, 'r');
  const tailLen = Math.min(66000, size);
  const tail = Buffer.alloc(tailLen);
  readSync(fd, tail, 0, tailLen, size - tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) { closeSync(fd); throw new Error(`${zipPath}: no end-of-central-directory record`); }
  const count = tail.readUInt16LE(eocd + 10);
  const cd = Buffer.alloc(tail.readUInt32LE(eocd + 12));
  readSync(fd, cd, 0, cd.length, tail.readUInt32LE(eocd + 16));

  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) { closeSync(fd); throw new Error('bad central directory entry'); }
    const nameLen = cd.readUInt16LE(p + 28);
    entries.push({
      name: cd.slice(p + 46, p + 46 + nameLen).toString('latin1'),
      method: cd.readUInt16LE(p + 10),
      compSize: cd.readUInt32LE(p + 20),
      localOff: cd.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
  }

  return {
    entries,
    stream(name) {
      const e = entries.find((x) => x.name === name);
      if (!e) throw new Error(`${zipPath}: no entry named ${name}`);
      // The local header's name and extra lengths can differ from the central
      // copy, so the data offset is read from the local header, not computed.
      const lh = Buffer.alloc(30);
      readSync(fd, lh, 0, 30, e.localOff);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('bad local header');
      const start = e.localOff + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const raw = createReadStream(zipPath, { start, end: start + e.compSize - 1 });
      return e.method === 0 ? raw : raw.pipe(createInflateRaw());
    },
    close() { closeSync(fd); },
  };
}

/**
 * Block -> 2020 population, from the P.L. 94-171 file, cached as a 12 MB slice.
 *
 * The file is two tables joined on LOGRECNO, a sequence number that means
 * nothing outside this one download:
 *
 *   txgeo2020.pl     97 fields.  SUMLEV is 3, LOGRECNO is 8, GEOCODE is 10.
 *                    SUMLEV 750 is the block level, and its GEOCODE is the same
 *                    15-digit block identifier the other two inputs key on.
 *   tx000012020.pl   LOGRECNO is 5, P0010001 — total population — is 6.
 *
 * Segment 1 is read first into an Int32Array indexed by LOGRECNO, because 944k
 * four-byte slots cost 3.8 MB where a Map of them costs sixty times that. The
 * geographic header is then streamed once and emits a line per block.
 *
 * The total is checked against the published state population. A join that
 * slipped a row would still produce a plausible file, and this is the one
 * number that would catch it.
 */
async function fetchPopSlice() {
  if (existsSync(POP_SLICE) && !refresh) {
    log(`  cached  ${POP_SLICE}  (${(statSync(POP_SLICE).size / 1e6).toFixed(1)} MB)`);
    return;
  }
  if (!existsSync(PL_ZIP) || refresh) {
    log(`  downloading ${PL_URL}`);
    log('  99.6 MB, the Texas P.L. 94-171 redistricting file');
    const res = await fetch(PL_URL);
    if (!res.ok) throw new Error(`P.L. 94-171 file: HTTP ${res.status}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(PL_ZIP, Buffer.from(await res.arrayBuffer()));
  }

  const zip = openZip(PL_ZIP);
  try {
    let maxLog = 0;
    const seq = [];
    for await (const l of createInterface({ input: zip.stream('tx000012020.pl'), crlfDelay: Infinity })) {
      if (!l) continue;
      const f = l.split('|');
      const lr = Number(f[4]);
      seq.push(lr, Number(f[5]));
      if (lr > maxLog) maxLog = lr;
    }
    const pop = new Int32Array(maxLog + 1);
    for (let i = 0; i < seq.length; i += 2) pop[seq[i]] = seq[i + 1];
    seq.length = 0;

    const out = [];
    let total = 0;
    for await (const l of createInterface({ input: zip.stream('txgeo2020.pl'), crlfDelay: Infinity })) {
      if (!l) continue;
      const f = l.split('|');
      if (f[2] !== '750') continue;
      const v = pop[Number(f[7])];
      out.push(`${f[9]}|${v}`);
      total += v;
    }
    if (total !== TX_POPULATION_2020) {
      throw new Error(
        `block populations total ${total.toLocaleString()}, not the published ` +
        `${TX_POPULATION_2020.toLocaleString()} — the LOGRECNO join is wrong`);
    }
    writeFileSync(POP_SLICE, out.join('\n') + '\n', 'latin1');
    log(`  ${out.length.toLocaleString()} blocks, ${total.toLocaleString()} people — matches the published state total`);
  } finally {
    zip.close();
  }
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
  await fetchPopSlice();

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

  // block -> people
  const pop = new Map();
  for await (const l of lines(POP_SLICE)) {
    if (!l) continue;
    const i = l.indexOf('|');
    pop.set(l.slice(0, i), Number(l.slice(i + 1)));
  }
  log(`  ${pop.size.toLocaleString()} blocks carry a population`);

  // (ZIP, district) -> land area, people, block count
  const pairs = new Map();
  const zipArea = new Map();
  const zipPop = new Map();
  const zipBlocks = new Map();
  let unmatched = 0, popUnmatched = 0, rows = 0, peopleJoined = 0;
  for await (const l of lines(ZCTA_SLICE)) {
    if (!l) continue;
    rows++;
    const [block, zip, areaS] = l.split('|');
    const d = dist.get(block);
    if (d === undefined) { unmatched++; continue; }
    const area = Number(areaS) || 0;
    const known = pop.get(block);
    if (known === undefined) popUnmatched++;
    const people = known ?? 0;
    peopleJoined += people;
    const k = `${zip}:${d}`;
    const cur = pairs.get(k);
    if (cur) { cur.area += area; cur.people += people; cur.blocks++; }
    else pairs.set(k, { zip, d, area, people, blocks: 1 });
    zipArea.set(zip, (zipArea.get(zip) ?? 0) + area);
    zipPop.set(zip, (zipPop.get(zip) ?? 0) + people);
    zipBlocks.set(zip, (zipBlocks.get(zip) ?? 0) + 1);
  }
  log(`  ${rows.toLocaleString()} block rows joined; ${pairs.size.toLocaleString()} (ZIP, district) pairs across ${zipArea.size.toLocaleString()} ZIPs`);
  log(`  ${peopleJoined.toLocaleString()} people live in a ZCTA, ${(100 * peopleJoined / TX_POPULATION_2020).toFixed(1)}% of Texas`);

  // Group by ZIP, ordered by POPULATION descending. The order is the claim the
  // panel makes — the top row is read as "this is probably you" — so it has to
  // be weighted by the thing the reader is one of.
  const byZip = new Map();
  for (const p of pairs.values()) {
    const totalArea = zipArea.get(p.zip) ?? 0;
    const totalPop = zipPop.get(p.zip) ?? 0;
    // A ZCTA that is all water has no land to weight by; fall back to block
    // count so the pair still gets a defensible share rather than a zero.
    const land = totalArea > 0
      ? p.area / totalArea
      : p.blocks / (zipBlocks.get(p.zip) || 1);
    // A ZIP with no 2020 population has no population share to give. Nine
    // exist and every one of them is a single district, so the panel never
    // shows a share for any of them; the check below refuses to ship a split
    // one rather than inventing a denominator for it.
    const share = totalPop > 0 ? p.people / totalPop : null;
    const list = byZip.get(p.zip) ?? [];
    list.push({ d: p.d, share, people: p.people, land, blocks: p.blocks });
    byZip.set(p.zip, list);
  }

  // How often the old weighting would have led with the wrong district. This is
  // measured on the exact shares, before rounding, and published so the claim in
  // the method note is checkable rather than remembered. Reading it back off the
  // rounded percentages gives a slightly larger number, because rounding creates
  // ties that the two orders break differently.
  let landWouldMislead = 0;
  for (const list of byZip.values()) {
    if (list.length < 2) continue;
    const topByLand = [...list].sort((a, b) => b.land - a.land || a.d - b.d)[0];
    const topByPeople = [...list].sort((a, b) => b.people - a.people || a.d - b.d)[0];
    if (topByLand.d !== topByPeople.d) landWouldMislead++;
  }

  const zips = {};
  let multi = 0, emptyPairs = 0;
  for (const [zip, list] of [...byZip.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // Land breaks a population tie, and it is the only order available at all
    // for an unpopulated ZIP.
    list.sort((a, b) => b.people - a.people || b.land - a.land || a.d - b.d);
    if (list.length === 1) {
      // The common case — 54% of Texas ZIPs — stored as a bare number, which
      // halves the file. The client narrows on typeof.
      zips[zip] = list[0].d;
    } else {
      multi++;
      if (list.some((e) => e.share === null)) {
        throw new Error(
          `ZIP ${zip} spans ${list.length} districts and had no 2020 population — ` +
          'there is no honest share to show, so the panel must not be asked to show one');
      }
      for (const e of list) if (e.people === 0) emptyPairs++;
      // The PEOPLE figure is a head count, not a percent, and that is the whole
      // reason it is one. Rounded to a percent, a district holding 0.4% of a
      // ZIP's residents and a district holding nobody at all are both "0", and
      // the panel would tell the first group's readers that nobody lives where
      // they live. A count separates them exactly, and the client divides.
      zips[zip] = list.map((e) => [e.d, e.people, Math.round(e.land * 100)]);
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
  if (popUnmatched !== 0) {
    throw new Error(`${popUnmatched} blocks are in a ZCTA but have no population record — the two files disagree`);
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
      for (const e of v) {
        if (e.length !== 3) throw new Error(`ZIP ${zip}: a pair is not [district, people, land]`);
      }
      // Both are checked, against their own denominators. Head counts that did
      // not add up to the ZIP's population, or land shares that did not reach
      // 100, would mean the two were computed over different pair sets — the
      // shape of a join that silently dropped rows.
      const heads = v.reduce((a, e) => a + e[1], 0);
      if (heads !== (zipPop.get(zip) ?? 0)) {
        throw new Error(`ZIP ${zip}: head counts total ${heads}, ZIP holds ${zipPop.get(zip)}`);
      }
      const landSum = v.reduce((a, e) => a + e[2], 0);
      if (Math.abs(landSum - 100) > 2) throw new Error(`ZIP ${zip}: land shares sum to ${landSum}`);
      // The order is the claim. If it is not sorted by people, the panel's top
      // row is not the likeliest district and the label lies about the list.
      for (let i = 1; i < v.length; i++) {
        if (v[i][1] > v[i - 1][1]) throw new Error(`ZIP ${zip}: not ordered by population`);
      }
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
      'Where a ZIP spans districts, every district it touches is listed with its share of the ZIP POPULATION ' +
      'at the 2020 census, most people first, and its share of the ZIP land area beside it. ' +
      'Ordering by land instead put a different district first in 108 of the 913 split ZIPs. ' +
      'Nothing is pruned — the reader picks from the list, so a surplus entry is cheaper than a missing one.',
    shares: 'population',
    sources: {
      zctaToBlock: ZCTA_URL,
      blockToDistrict: BEF_URL,
      blockToDistrictNote:
        '2022 plan, not the 2020 Block Assignment File: 33% of Texas blocks changed district between them.',
      blockToDistrictSha256: planSha,
      blockToPopulation: PL_URL,
      blockToPopulationNote:
        'P.L. 94-171 table P1, field P0010001, joined to the geographic header on LOGRECNO at SUMLEV 750. ' +
        'The block populations total the published state figure of 29,145,505.',
    },
    provenance: {
      blocksJoined: rows,
      blocksUnmatched: unmatched,
      blocksWithoutPopulation: popUnmatched,
      districtsInPlan: districts.size,
      zips: Object.keys(zips).length,
      pairs: pairs.size,
      zipsInOneDistrict: Object.keys(zips).length - multi,
      zipsSpanningDistricts: multi,
      populationInZctas: peopleJoined,
      populationOfTexas: TX_POPULATION_2020,
      pairsWithNoPopulation: emptyPairs,
      zipsWhereLandWouldLeadWithAnotherDistrict: landWouldMislead,
      districtWithoutMember: seatless[0] ?? null,
    },
    format:
      'zips[zip] is a district number when the ZIP lies in one district, or an array of ' +
      '[district, people, percent of ZIP land area] triples, most people first. ' +
      'PEOPLE IS A HEAD COUNT, not a percent: its 2020 census residents of the part of this ZIP ' +
      'inside that district, and the counts for a ZIP sum to its population. A count rather than a ' +
      'share so that nobody-lives-there and almost-nobody-lives-there stay distinguishable. ' +
      'The land percent is published for audit, not for ranking.',
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
