/**
 * PlainRecord — session QA report
 *
 *   npx tsx scripts/report_session.ts 89R
 *
 * Reads the ingested items + roster and reports what the session actually
 * contains: eligibility, chamber split, valence distribution, per-candidate
 * coverage, the selection rule's output, and the PC1 dominance check that
 * OPEN_QUESTIONS #1 says must be run before trusting any alignment score.
 *
 * Read-only. Prints; writes nothing.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { VoteItem } from '../scoring';
import { WORK_DIR } from './paths';
import { isEligible, discrimination, DEFAULT_OPTIONS, scoreLegislator, scoreBand } from '../scoring';
import { renderVerdict, renderScoreBand } from '../src/verdict';
import type { Answer } from '../scoring';
import { computeValences, profileWeights, buildProfile, describeProfile } from '../valence';
import type { PartyRoster } from '../valence';
import { selectItems, DEFAULT_RULE } from '../selection';

const session = process.argv[2] ?? '89R';
const dataDir = process.argv[3] ?? WORK_DIR;

const itemsPath = join(dataDir, `tx_bills_${session}.json`);
const rosterPath = join(dataDir, `tx_roster_${session}.json`);
if (!existsSync(itemsPath)) throw new Error(`missing ${itemsPath} — run an ingest first`);

const items: VoteItem[] = JSON.parse(readFileSync(itemsPath, 'utf8'));
const rosterFile = existsSync(rosterPath) ? JSON.parse(readFileSync(rosterPath, 'utf8')) : null;
const roster: PartyRoster = rosterFile?.party ?? {};

const pct = (n: number, d: number) => (d === 0 ? '  0.0%' : `${((100 * n) / d).toFixed(1)}%`.padStart(6));
const f = (n: number, d = 2) => n.toFixed(d).padStart(d + 4);

console.log(`\n${'='.repeat(72)}`);
console.log(`  session ${session}   ${items.length} ingested items   roster ${Object.keys(roster).length} members`);
if (rosterFile?.rosterIsCurrentParty) {
  console.log('  WARNING: roster is CURRENT party, not a session snapshot.');
}
console.log('='.repeat(72));

// ---------------------------------------------------------------------------
// 1. Eligibility
// ---------------------------------------------------------------------------
const eligible = items.filter((it) => isEligible(it, DEFAULT_OPTIONS));
console.log(`\n1. ELIGIBILITY`);
console.log(`   ingested          ${String(items.length).padStart(6)}`);
console.log(`   pass the floor    ${String(eligible.length).padStart(6)}   ${pct(eligible.length, items.length)}`);
console.log(`   dropped           ${String(items.length - eligible.length).padStart(6)}   (too lopsided to carry signal)`);

const byType = new Map<string, number>();
for (const it of items) byType.set(it.voteType, (byType.get(it.voteType) ?? 0) + 1);
console.log(`   voteType mix      ${[...byType.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`);

// ---------------------------------------------------------------------------
// 2. Chamber. The three candidates are House members; a Senate vote gives them
//    no position at all, so a set dominated by Senate items would quietly starve
//    every candidate score.
// ---------------------------------------------------------------------------
const houseMembers = new Set<string>();
const senateMembers = new Set<string>();
for (const it of eligible) {
  const voters = Object.keys(it.votes).length;
  // Texas House has 150 seats, Senate 31. Roll size separates them cleanly.
  for (const id of Object.keys(it.votes)) (voters > 60 ? houseMembers : senateMembers).add(id);
}
const houseItems = eligible.filter((it) => Object.keys(it.votes).length > 60);
const senateItems = eligible.filter((it) => Object.keys(it.votes).length <= 60);
console.log(`\n2. CHAMBER (inferred from roll size)`);
console.log(`   House items       ${String(houseItems.length).padStart(6)}   ${pct(houseItems.length, eligible.length)}`);
console.log(`   Senate items      ${String(senateItems.length).padStart(6)}   ${pct(senateItems.length, eligible.length)}`);
console.log(`   distinct voters   House ${houseMembers.size}   Senate ${senateMembers.size}`);

// ---------------------------------------------------------------------------
// 3. Valence
// ---------------------------------------------------------------------------
const valences = computeValences(items, roster);
const withV = eligible.filter((it) => valences.get(it.id)?.valence !== null && valences.get(it.id) !== undefined);
const absV = withV.map((it) => Math.abs(valences.get(it.id)!.valence!)).sort((a, b) => a - b);
const median = absV.length ? absV[Math.floor(absV.length / 2)] : 0;
const bands = [0, 0.1, 0.2, 0.4, 0.6, 0.8, 1.01];
console.log(`\n3. PARTISAN VALENCE  (eligible items only)`);
console.log(`   computable        ${String(withV.length).padStart(6)}   ${pct(withV.length, eligible.length)}`);
console.log(`   uncomputable      ${String(eligible.length - withV.length).padStart(6)}   (a caucus too thin to judge)`);
console.log(`   median |valence|  ${f(median)}`);
for (let i = 0; i < bands.length - 1; i++) {
  const n = absV.filter((v) => v >= bands[i] && v < bands[i + 1]).length;
  const bar = '#'.repeat(Math.round((60 * n) / Math.max(1, absV.length)));
  console.log(`     |v| ${bands[i].toFixed(1)}-${bands[i + 1] > 1 ? '1.0' : bands[i + 1].toFixed(1)}  ${String(n).padStart(5)} ${pct(n, absV.length)} ${bar}`);
}
const crossCutting = absV.filter((v) => v < DEFAULT_RULE.partisanValenceThreshold).length;
console.log(`   cross-cutting (|v| < ${DEFAULT_RULE.partisanValenceThreshold})  ${crossCutting}  ${pct(crossCutting, absV.length)}`);
console.log(`   -> ${crossCutting < absV.length * 0.15
  ? 'THIN. The selection reserve will struggle; purple may be unreachable.'
  : 'enough cross-cutting material to fill a selection reserve.'}`);

// ---------------------------------------------------------------------------
// 4. Candidates
// ---------------------------------------------------------------------------
const NAMES = ['Vikki Goodwin', 'Gina Hinojosa', 'James Talarico'];
const peopleCsv = process.argv[4];
const nameToId = new Map<string, string>();
if (peopleCsv && existsSync(peopleCsv)) {
  const lines = readFileSync(peopleCsv, 'utf8').split('\n').slice(1);
  for (const line of lines) {
    const m = /^([^,]+),("([^"]*)"|[^,]*),/.exec(line);
    if (!m) continue;
    const nm = (m[3] ?? m[2]).trim();
    if (NAMES.includes(nm)) nameToId.set(nm, m[1].trim());
  }
}
console.log(`\n4. CANDIDATES`);
if (nameToId.size === 0) {
  console.log('   (pass the people CSV as argv[4] to resolve candidate ids)');
} else {
  for (const nm of NAMES) {
    const id = nameToId.get(nm);
    if (!id) { console.log(`   ${nm.padEnd(16)} NOT FOUND in roster`); continue; }
    const voted = eligible.filter((it) => it.votes[id] === 1 || it.votes[id] === -1).length;
    const absent = eligible.filter((it) => it.id in it.votes === false || it.votes[id] === null).length;
    console.log(
      `   ${nm.padEnd(16)} party=${roster[id] ?? '?'}  voted on ${String(voted).padStart(5)} of ` +
        `${eligible.length} eligible  (${pct(voted, eligible.length)})`,
    );
    void absent;
  }
}

// ---------------------------------------------------------------------------
// 5. Selection rule on real data
// ---------------------------------------------------------------------------
console.log(`\n5. SELECTION RULE`);
const sel = selectItems(items, valences, DEFAULT_RULE);
sel.auditLog.slice(0, 6).forEach((l) => console.log('   ' + l.trim()));
console.log(`   categories        ${sel.byCategory.length}`);
console.log(`   selected          ${sel.selected.length}`);
console.log(`   cross-cutting     ${(sel.crossCuttingShare * 100).toFixed(1)}%`);
console.log(`   partisanByConstruction: ${sel.partisanByConstruction}`);

// ---------------------------------------------------------------------------
// 6. PC1 dominance — OPEN_QUESTIONS #1
// ---------------------------------------------------------------------------
console.log(`\n6. DIMENSIONALITY  (House items only, the chamber the candidates sit in)`);
{
  const pool = houseItems.slice(0, 400); // covariance is O(items^2); cap for tractability
  const members = [...new Set(pool.flatMap((it) => Object.keys(it.votes)))].sort();
  const idx = new Map(members.map((m, i) => [m, i]));
  const data = members.map(() => new Array(pool.length).fill(0));
  pool.forEach((item, j) => {
    const cast: number[] = [];
    for (const v of Object.values(item.votes)) if (v != null) cast.push(v);
    const mean = cast.length ? cast.reduce((s, v) => s + v, 0) / cast.length : 0;
    for (const [id, v] of Object.entries(item.votes)) {
      const i = idx.get(id);
      if (i === undefined) continue;
      data[i][j] = v == null ? 0 : v - mean;
    }
  });
  const n = pool.length;
  const C: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let a = 0; a < n; a++) {
    for (let b = a; b < n; b++) {
      let s = 0;
      for (let i = 0; i < members.length; i++) s += data[i][a] * data[i][b];
      const v = s / Math.max(1, members.length - 1);
      C[a][b] = v; C[b][a] = v;
    }
  }
  const total = C.reduce((s, row, i) => s + row[i], 0);
  const work = C.map((r) => [...r]);
  const shares: number[] = [];
  for (let c = 0; c < 3; c++) {
    let v = new Array(n).fill(0).map((_, i) => Math.sin(i + 1 + c));
    let lambda = 0;
    for (let iter = 0; iter < 300; iter++) {
      const next = new Array(n).fill(0);
      for (let a = 0; a < n; a++) {
        let s = 0;
        for (let b = 0; b < n; b++) s += work[a][b] * v[b];
        next[a] = s;
      }
      const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-12) break;
      const nv = next.map((x) => x / norm);
      const delta = nv.reduce((s, x, i) => s + Math.abs(x - v[i]), 0);
      v = nv; lambda = norm;
      if (delta < 1e-10) break;
    }
    shares.push((100 * lambda) / total);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) work[a][b] -= lambda * v[a] * v[b];
  }
  console.log(`   items in matrix   ${n}   members ${members.length}`);
  shares.forEach((s, i) => console.log(`   PC${i + 1}                ${s.toFixed(1)}% of variance`));
  console.log(
    shares[0] >= 85
      ? '   -> PC1 DOMINATES. The score is effectively a one-dimensional party\n' +
        '      detector; the honest claim is "where you sit on the axis the\n' +
        '      legislature actually votes on", not "find your match".'
      : `   -> PC1 is ${shares[0].toFixed(0)}%, below the 85% alarm line. More than one\n` +
        '      dimension is in play, so a blind quiz can say something a party\n' +
        '      label cannot.',
  );
}

// ---------------------------------------------------------------------------
// 7. A worked profile
// ---------------------------------------------------------------------------
console.log(`\n7. WORKED PROFILE  (answering Yea to every selected item)`);
{
  const pw = profileWeights(sel.selected, DEFAULT_OPTIONS);
  const answers: Record<string, Answer> = {};
  for (const it of sel.selected) answers[it.id] = 1;
  const p = buildProfile(sel.selected, answers, valences, pw);
  const d = describeProfile(p);
  console.log(`   n=${p.n}  netLean=${f(p.netLean)}  crossover=${f(p.crossoverShare)}  load=${f(p.partisanLoad)}`);
  const rv = renderVerdict(d);
  console.log(`   [${d.verdict}${d.side ? '/' + d.side : ''}] "${rv.headline}"`);
  console.log(`   caveat: ${rv.caveat}`);
  if (nameToId.size) {
    const sw = new Map<string, number>();
    for (const it of sel.selected) sw.set(it.id, discrimination(it));
    for (const nm of NAMES) {
      const id = nameToId.get(nm);
      if (!id) continue;
      const r = scoreLegislator(id, sel.selected, answers, sw);
      console.log(`   ${nm.padEnd(16)} adjusted=${f(r.adjustedScore)}  n=${String(r.n).padStart(3)}  "${renderScoreBand(scoreBand(r.adjustedScore))}"`);
    }
  }
}
console.log('');
