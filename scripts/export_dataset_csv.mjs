/**
 * PlainRecord — the published data as flat CSV, for dataset hubs
 *
 *   node scripts/export_dataset_csv.mjs <out-dir>
 *
 * Writes the tables that Kaggle and Hugging Face users expect, from the same
 * files the site publishes under /data, plus the place table the district pages
 * print. It reads only shipped or committed files, so anyone with the public
 * repository can rebuild the package and diff it.
 *
 * The site's own JSON packs each roll call's positions into one string (a
 * character per member). That is compact and exact, but it is not something a
 * person can open in a spreadsheet, which is why this exists. Nothing here is
 * new data: every value is a straight unpacking.
 *
 *   members.csv            one row per member who cast a vote
 *   roll_calls.csv         one row per recorded House floor vote (3,546)
 *   positions.csv          one row per yea or nay cast; no row means no vote recorded
 *   zip_to_district.csv    one row per ZIP and district it touches, with residents
 *   district_places.csv    one row per district and Census place its people live in
 *   district_counties.csv  one row per district and county
 *   votes_89R.json         the original, unchanged
 *
 * It refuses to write unless positions.csv carries exactly the votesCast total
 * the JSON states, and every roll call's yeas and nays unpack to its own
 * vYeas and vNays.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
if (!out) { console.error('usage: node scripts/export_dataset_csv.mjs <out-dir>'); process.exit(1); }
mkdirSync(out, { recursive: true });

const load = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const votes = load('public/data/votes_89R.json');
const zips = load('public/data/zips_89R.json');
const places = load('data/district_places_2020.json');

const fail = (msg) => { console.error(`\n  REFUSED: ${msg}\n`); process.exit(1); };
const cell = (x) => {
  if (x === null || x === undefined) return '';
  const s = String(x);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (name, header, rows) => {
  writeFileSync(resolve(out, name), [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n');
  console.log(`  ${name.padEnd(24)} ${rows.length.toLocaleString()} rows`);
};

// --- members -------------------------------------------------------------------
csv('members.csv', ['member_id', 'name', 'district', 'party'],
  votes.memberOrder.map((id) => {
    const m = votes.members[id] ?? {};
    return [id, m.n, m.d, m.p];
  }));

// --- roll calls and positions ---------------------------------------------------
const POS = { y: 'yea', n: 'nay' };
const positions = [];
const calls = votes.items.map((it) => {
  let y = 0; let n = 0;
  [...it.v].forEach((ch, i) => {
    if (!POS[ch]) return;
    if (ch === 'y') y++; else n++;
    positions.push([it.id, votes.memberOrder[i], POS[ch]]);
  });
  if (y !== it.vYeas || n !== it.vNays) fail(`${it.id} unpacks to ${y}/${n}, the file says ${it.vYeas}/${it.vNays}`);
  return [it.id, it.billId, it.category, it.voteType, it.substantive, it.yeas, it.nays, it.vYeas, it.vNays,
    it.src, it.journalRecord, it.rYea, it.dYea, it.valence, it.eligible];
});
if (positions.length !== votes.counts.votesCast) {
  fail(`${positions.length} positions, the file says votesCast is ${votes.counts.votesCast}`);
}
csv('roll_calls.csv', ['vote_id', 'bill_id', 'category', 'vote_type', 'substantive', 'yeas', 'nays',
  'named_yeas', 'named_nays', 'source', 'journal_record', 'republican_yea_share', 'democratic_yea_share',
  'valence', 'eligible'], calls);
csv('positions.csv', ['vote_id', 'member_id', 'position'], positions);

// --- ZIP to district ----------------------------------------------------------
const zrows = [];
for (const [zip, v] of Object.entries(zips.zips)) {
  if (typeof v === 'number') zrows.push([zip, v, '', 100]);
  else for (const [d, people, land] of v) zrows.push([zip, d, people, land]);
}
csv('zip_to_district.csv', ['zip', 'district', 'residents_2020', 'zip_land_pct'], zrows);

// --- places and counties --------------------------------------------------------
const prows = []; const crows = [];
for (const [d, p] of Object.entries(places.districts)) {
  for (const x of p.places) prows.push([d, x.name, x.cdp ? 'census-designated place' : 'city/town', x.pop, x.shareOfDistrict, x.shareOfPlace]);
  for (const c of p.counties) crows.push([d, c.name, c.fips, c.pop, c.shareOfDistrict]);
}
csv('district_places.csv', ['district', 'place', 'place_type', 'residents_2020', 'share_of_district', 'share_of_place'], prows);
csv('district_counties.csv', ['district', 'county', 'county_fips', 'residents_2020', 'share_of_district'], crows);

copyFileSync(resolve(ROOT, 'public/data/votes_89R.json'), resolve(out, 'votes_89R.json'));
console.log(`  votes_89R.json           copied unchanged\n\n  wrote ${out}`);
