/**
 * PlainRecord — test runner
 *
 *   npm test
 *
 * Runs every *.smoke.ts suite in a child process and aggregates the [PASS]/[FAIL]
 * lines they print. Each suite is self-contained and exits non-zero on failure;
 * this exists so `npm test` is one command and so a suite that CRASHES (rather
 * than failing a check) can't be mistaken for a pass — a crash produces no [FAIL]
 * line at all, which is exactly the failure a naive grep would miss.
 *
 * Suites that need build inputs from data/ (gitignored, 51 MB) degrade to fewer
 * checks rather than failing, so a fresh clone can still run the suite. The
 * report says so explicitly instead of quietly reporting a smaller number.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SUITES = [
  'valence.smoke.ts',
  'evidence.smoke.ts',
  'selection.smoke.ts',
  'scripts/ingest_legiscan.smoke.ts',
  'scripts/ingest_openstates.smoke.ts',
  'scripts/pipeline.smoke.ts',
  'api/tally.smoke.ts',
  'scripts/tally_report.smoke.ts',
  'src/share.smoke.ts',
  'src/compare.smoke.ts',
  'scripts/guards.smoke.ts',
];

// Suites that read real ingested data. Without it they run fewer checks.
const NEEDS_DATA = { 'evidence.smoke.ts': 'data/tx_evidence_vetoes.json' };

let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;
let crashed = 0;
const missingData = [];
const skipped = [];

console.log('');
for (const suite of SUITES) {
  const need = NEEDS_DATA[suite];
  if (need && !existsSync(join(ROOT, need))) missingData.push(`${suite} (no ${need})`);

  const r = spawnSync('npx', ['tsx', suite], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const pass = (out.match(/\[PASS\]/g) ?? []).length;
  const fail = (out.match(/\[FAIL\]/g) ?? []).length;
  // A skip is a check that could not run, usually because a build input is absent.
  // It counts as neither: calling it a pass overstates coverage, calling it a
  // failure blames the reader for a file they were never given.
  const skip = (out.match(/\[SKIP\]/g) ?? []).length;

  // A suite that printed no checks at all did not pass — it died.
  const died = r.status !== 0 && fail === 0;
  if (died) crashed++;
  totalPass += pass;
  totalFail += fail;
  totalSkip += skip;
  if (skip) skipped.push(...out.split('\n').filter((l) => l.includes('[SKIP]')).map((l) => l.trim()));

  const verdict = died ? 'CRASHED' : fail ? `${fail} FAIL` : skip ? `ok, ${skip} skipped` : 'ok';
  console.log(`  ${suite.padEnd(36)} ${String(pass).padStart(3)} pass  ${verdict}`);
  if (fail) for (const line of out.split('\n').filter((l) => l.includes('[FAIL]'))) console.log(`      ${line.trim()}`);
  if (died) console.log(out.split('\n').filter(Boolean).slice(-12).map((l) => `      ${l}`).join('\n'));
}

console.log(
  `\n  ${totalPass} checks passed, ${totalFail} failed` +
    (totalSkip ? `, ${totalSkip} skipped` : '') +
    `, ${crashed} suite(s) crashed`,
);
if (skipped.length) {
  console.log('\n  Not checked:');
  for (const s of skipped) console.log(`    ${s.replace(/^\[SKIP\]\s*/, '')}`);
}
if (missingData.length) {
  console.log(`\n  Reduced coverage — build inputs absent (run npm run data:* to restore):`);
  for (const m of missingData) console.log(`    ${m}`);
}
console.log('');
process.exit(totalFail === 0 && crashed === 0 ? 0 : 1);
