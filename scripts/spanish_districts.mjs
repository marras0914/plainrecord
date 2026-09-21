/**
 * PlainRecord — where the Spanish page is actually needed
 *
 *   node scripts/spanish_districts.mjs            # ranked table
 *   node scripts/spanish_districts.mjs --json out.json
 *
 * Ranks all 150 Texas House districts by the number of people who speak Spanish
 * at home AND report speaking English less than "very well" — the readers the
 * Spanish side of this site exists for — and joins each district to its sitting
 * member.
 *
 * WHY THIS MEASURE AND NOT "HISPANIC POPULATION"
 *
 * Ethnicity is not language and using it as a proxy would be both wrong and
 * offensive: most Hispanic Texans speak English fluently, and a Spanish-language
 * civic page is not aimed at them. ACS table C16001 asks the question this plan
 * actually has — what language is spoken at home, and how well English is spoken
 * — so it is the one used. The narrow field, limited English, is the honest
 * definition of "needs this in Spanish"; the broader Spanish-at-home field is
 * reported beside it because a bilingual reader may still prefer Spanish.
 *
 * WHY THIS IS NOT POLITICAL TARGETING
 *
 * It is ranked on language need and nothing else. No party, no turnout, no vote
 * history, no modelling. The query is a public API call anyone can repeat, and
 * the member column is attached afterwards for context rather than used to sort.
 * If asked how the outreach list was built, the answer is this file.
 *
 *   C16001_001E  population 5 years and over
 *   C16001_003E  speaks Spanish at home
 *   C16001_005E  speaks Spanish at home, speaks English less than "very well"
 *
 * The key lives in private/.env as API_CENSUS_GOV_KEY. private/ is gitignored,
 * so the key is not committed and is not printed by this script.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = resolve(ROOT, 'private/.env');
const MEMBERS = resolve(ROOT, 'public/data/members_89R.json');

const jsonArg = process.argv.indexOf('--json');
const jsonOut = jsonArg > 0 ? process.argv[jsonArg + 1] : null;

if (!existsSync(ENV)) {
  console.error('\n  private/.env not found. It needs API_CENSUS_GOV_KEY=<key>.');
  console.error('  Free key: https://api.census.gov/data/key_signup.html\n');
  process.exit(1);
}
const key = Object.fromEntries(
  readFileSync(ENV, 'utf8').split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]),
).API_CENSUS_GOV_KEY;
if (!key) { console.error('\n  API_CENSUS_GOV_KEY is missing from private/.env\n'); process.exit(1); }

// ACS 5-year. The 5-year file is the right one at this geography: 1-year
// estimates are only published for areas above 65,000 and would drop the rural
// districts entirely, which is precisely where colonias and the Valley sit.
const YEAR = process.argv.includes('--year')
  ? process.argv[process.argv.indexOf('--year') + 1] : '2023';
const url = `https://api.census.gov/data/${YEAR}/acs/acs5`
  + '?get=NAME,C16001_001E,C16001_003E,C16001_005E'
  + '&for=state%20legislative%20district%20(lower%20chamber):*'
  + `&in=state:48&key=${key}`;

const res = await fetch(url);
const body = await res.text();
if (!res.ok || body.trim().startsWith('<')) {
  // Never echo the URL: it carries the key.
  console.error(`\n  Census API returned ${res.status} and not JSON.`);
  console.error('  ' + body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) + '\n');
  process.exit(1);
}
const rows = JSON.parse(body);
const head = rows[0];
const idx = Object.fromEntries(head.map((h, i) => [h, i]));

const members = JSON.parse(readFileSync(MEMBERS, 'utf8'));
const memberFor = (d) => members.members.find((m) => m.d === d);

const districts = rows.slice(1).map((r) => {
  const d = Number(r[idx['state legislative district (lower chamber)']]);
  const total = Number(r[idx.C16001_001E]);
  const spanish = Number(r[idx.C16001_003E]);
  const limited = Number(r[idx.C16001_005E]);
  const m = memberFor(d);
  return {
    d,
    total,
    spanish,
    limited,
    spanishPct: total ? (100 * spanish) / total : 0,
    limitedPct: total ? (100 * limited) / total : 0,
    member: m ? m.n : null,
    party: m ? m.p : null,
    voted: m ? m.voted : null,
  };
}).sort((a, b) => b.limited - a.limited);

const stateLimited = districts.reduce((a, x) => a + x.limited, 0);
const stateSpanish = districts.reduce((a, x) => a + x.spanish, 0);
const statePop = districts.reduce((a, x) => a + x.total, 0);

console.log(`\n  ACS ${YEAR} 5-year, table C16001, Texas House districts: ${districts.length}\n`);
console.log(`  Texas, 5 and over            ${statePop.toLocaleString()}`);
console.log(`  speaks Spanish at home       ${stateSpanish.toLocaleString()}  (${(100 * stateSpanish / statePop).toFixed(1)}%)`);
console.log(`  ...and limited English       ${stateLimited.toLocaleString()}  (${(100 * stateLimited / statePop).toFixed(1)}%)\n`);

console.log('  Ranked by people who speak Spanish at home and English less than "very well"\n');
console.log('   #   HD   limited-Eng   share   Spanish@home   member');
for (const [i, x] of districts.slice(0, 25).entries()) {
  console.log(
    `  ${String(i + 1).padStart(2)}  ${String(x.d).padStart(3)}   `
    + `${x.limited.toLocaleString().padStart(9)}   `
    + `${x.limitedPct.toFixed(1).padStart(5)}%   `
    + `${x.spanish.toLocaleString().padStart(9)}   `
    + `${x.member ?? '(vacant)'}${x.party ? ' (' + x.party + ')' : ''}`);
}

// How concentrated is the need? If the top 25 hold most of it, the outreach
// list is short and the plan is cheap. If it is spread evenly, it is not.
const top25 = districts.slice(0, 25).reduce((a, x) => a + x.limited, 0);
console.log(`\n  Top 25 districts hold ${((100 * top25) / stateLimited).toFixed(0)}% of the state's limited-English Spanish speakers.`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ source: `ACS ${YEAR} 5-year C16001`, districts }, null, 1));
  console.log(`  wrote ${jsonOut}`);
}
console.log('');
