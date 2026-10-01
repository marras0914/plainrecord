/**
 * PlainRecord — who is on the 3 November 2026 ballot for each Texas House seat
 *
 *   node scripts/fetch_ballot.mjs
 *
 * Writes data/ballot_2026_house.json, which build_district_pages.mjs reads.
 *
 * THE SOURCE IS THE SECRETARY OF STATE, and only the Secretary of State. Their
 * public candidate portal (goelect.txelections.civixapps.com, linked from
 * sos.state.tx.us/elections/candidates) is an Angular app over a JSON API that
 * needs no key. These are the same three calls the portal makes when a visitor
 * picks "2026 NOVEMBER GENERAL ELECTION" and searches.
 *
 * WHO COUNTS AS ON THE BALLOT. Filing status CG ("Candidate in the General
 * Election") AND declaration status A ("Accepted"). Both code tables come from
 * the portal's own getCandidateStatus and getDeclarationStatus. On 30 September
 * 2026 that rule left out three filings: one declared ineligible and two
 * rejected independent filings, one of which was then accepted as a write-in.
 *
 * WHAT IS KEPT. District, ballot name, party, and whether the candidate is a
 * declared write-in. The API also returns each candidate's mailing address,
 * email and occupation. None of that is stored: the page does not need it, and
 * a copy of a stranger's home address in a public repository is a liability
 * whoever's it is.
 *
 * It refuses to write a file that does not cover all 150 seats, because a
 * district page saying "no candidates" would be wrong in a way a reader cannot
 * check.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://goelect.txelections.civixapps.com/api-ivis-cbp/api/cbp';
const PORTAL = 'https://goelect.txelections.civixapps.com/ivis-cbp-ui/candidate-information';
const ELECTION_NAME = '2026 NOVEMBER GENERAL ELECTION';

async function call(path, body) {
  const res = await fetch(`${API}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const elections = await call('getElectionsByYear/2026');
const election = elections.find((e) => e.txElectionName?.trim() === ELECTION_NAME);
if (!election) throw new Error(`no "${ELECTION_NAME}" in getElectionsByYear/2026`);
if (election.dtElectionDate !== '2026-11-03') {
  throw new Error(`${ELECTION_NAME} is dated ${election.dtElectionDate}, expected 2026-11-03`);
}

const offices = await call(`getOfficeByElectionAndType/${election.idElection}/SR`);
const districtOf = new Map();
for (const o of offices) {
  const m = /^STATE REPRESENTATIVE DISTRICT (\d+)$/.exec(o.txOfficeName ?? '');
  if (m) districtOf.set(o.idOffice, Number(m[1]));
}
if (districtOf.size !== 150) throw new Error(`expected 150 State Representative offices, got ${districtOf.size}`);

// countyId null is statewide; the portal's form requires a county but the API does not.
const all = await call('findQualifiedCandidates', {
  electionYear: 2026, electionId: election.idElection, countyId: null, source: 'TX',
});

const house = all.filter((c) => districtOf.has(c.idOffice));
const onBallot = house.filter((c) => c.cdFilingStatus === 'CG' && c.cdDeclarationStatus === 'A');
const left = house.filter((c) => !onBallot.includes(c));

const KNOWN_PARTIES = new Set(['R', 'D', 'L', 'G', 'I', 'W']);
const seats = {};
for (const c of onBallot) {
  if (!KNOWN_PARTIES.has(c.cdParty)) throw new Error(`unknown party code ${c.cdParty} for ${c.txFullNameBallot}`);
  const d = districtOf.get(c.idOffice);
  (seats[d] ??= []).push({
    name: c.txFullNameBallot.trim(),
    party: c.cdParty,
    writeIn: c.cdCandType === 'WRTIN' || c.cdParty === 'W',
  });
}
for (let d = 1; d <= 150; d++) {
  if (!seats[d]?.length) throw new Error(`HD-${d} has no candidate on the ballot; refusing to write`);
  const parties = seats[d].filter((c) => !c.writeIn).map((c) => c.party);
  if (new Set(parties).size !== parties.length) throw new Error(`HD-${d} has two nominees from one party`);
}

const out = {
  _meta: {
    what: 'Candidates on the 3 November 2026 general election ballot for each Texas House seat.',
    source: PORTAL,
    api: `${API}/findQualifiedCandidates`,
    electionId: election.idElection,
    rule: 'Filing status CG (candidate in the general election) and declaration status A (accepted). Write-ins are declared write-in candidates, whose names are not printed on the ballot.',
    // Texas time, not UTC: a 7pm Central fetch is already tomorrow in UTC.
    fetched: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }),
    excluded: left.map((c) => ({
      district: districtOf.get(c.idOffice), name: c.txFullNameBallot.trim(),
      filing: c.cdFilingStatus ?? null, declaration: c.cdDeclarationStatus ?? null,
    })),
  },
  seats,
};

writeFileSync(resolve(ROOT, 'data/ballot_2026_house.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');

const counts = Object.values(seats).map((s) => s.filter((c) => !c.writeIn).length);
console.log(`  ${onBallot.length} candidates across 150 seats, ${left.length} filings left out`);
console.log(`  seats with one candidate: ${counts.filter((n) => n === 1).length}, two: ${counts.filter((n) => n === 2).length}, three: ${counts.filter((n) => n === 3).length}`);
for (const x of out._meta.excluded) console.log(`  left out: HD-${x.district} ${x.name} (filing ${x.filing}, declaration ${x.declaration})`);
