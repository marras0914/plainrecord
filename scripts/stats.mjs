/**
 * PlainRecord — read the Web Analytics numbers from the terminal
 *
 *   npm run stats                 # last 7 days
 *   npm run stats -- --days 30
 *   npm run stats -- --since 2026-09-03 --until 2026-09-10
 *   npm run stats -- --json       # raw rows, for piping
 *
 * Answers the question this project actually has right now — did any of the
 * outreach land, and is anyone reading the Spanish — without opening a dashboard.
 *
 * NO TOKEN LIVES HERE. It shells out to `vercel api`, which signs the request
 * with the CLI's existing session. That means this script works for whoever is
 * logged in and stores no credential of its own, which is the right trade for a
 * repo that is shared and read.
 *
 * The project and team ids come from .vercel/project.json — the file `vercel
 * link` writes — so the script follows the linked project rather than hardcoding
 * an id that would silently read someone else's numbers.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const asJson = argv.includes('--json');

// ---------------------------------------------------------------------------
// Which project
// ---------------------------------------------------------------------------

let projectId;
let teamId;
try {
  const link = JSON.parse(readFileSync(resolve(ROOT, '.vercel/project.json'), 'utf8'));
  projectId = link.projectId;
  teamId = link.orgId;
} catch {
  console.error(
    '\n  .vercel/project.json not found — run `npx vercel link` first.\n' +
      '  (It is gitignored, so a fresh clone has to link once.)\n',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

const day = (d) => d.toISOString().slice(0, 10);
const days = Number(flag('days', '7'));
const until = flag('until', day(new Date(Date.now() + 86400e3)));
const since = flag('since', day(new Date(Date.now() - (days - 1) * 86400e3)));

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

function api(path) {
  const win = process.platform === 'win32';
  // The URL is QUOTED because cmd.exe treats an unquoted `&` in a query string
  // as a command separator — `...&until=2026-09-05` tried to run a program
  // called `until`. And it is one command STRING, not a command plus an args array. With shell:true node
  // deprecates the array form (DEP0190) because it concatenates without
  // escaping — which is exactly the hazard that ate the `&` here in the first
  // place. Passing the whole line, quoted, is the supported shape.
  const r = spawnSync(`${win ? 'npx.cmd' : 'npx'} vercel api "${path}"`, {
    cwd: ROOT, encoding: 'utf8', shell: true,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const brace = out.indexOf('{');
  if (brace < 0) {
    // A bare error rather than JSON: not logged in, analytics not enabled, or
    // the endpoint moved. Say which rather than printing an empty table.
    return { error: out.trim().split('\n').filter(Boolean).slice(-2).join(' ') || 'no response' };
  }
  // Slice to the LAST closing brace, not just from the first opening one. The
  // CLI prints its own lines around the payload (a timing line, sometimes a
  // trailing notice), and `JSON.parse` on first-brace-to-end fails on the text
  // that follows the object rather than on the object itself.
  const end = out.lastIndexOf('}');
  try {
    return JSON.parse(out.slice(brace, end + 1));
  } catch (e) {
    return { error: `unparseable response — ${e.message}` };
  }
}

const base =
  `teamId=${teamId}&projectId=${projectId}` +
  `&since=${since}&until=${until}`;

const total = api(`/v1/query/web-analytics/visits/count?${base}`);
if (total.error) {
  console.error(
    `\n  could not read analytics — ${total.error}\n\n` +
      '  Check in order:\n' +
      '    1. npx vercel whoami        (logged in?)\n' +
      '    2. Web Analytics enabled for the project in the dashboard\n' +
      '    3. /_vercel/insights/script.js returns 200 on the live site\n',
  );
  process.exit(1);
}

const DIMS = [
  ['day', 'By day'],
  ['requestPath', 'By page'],
  ['referrerHostname', 'By referrer'],
  ['deviceType', 'By device'],
  ['country', 'By country'],
];

const rows = {};
for (const [dim] of DIMS) {
  const r = api(`/v1/query/web-analytics/visits/aggregate?${base}&by=${dim}&limit=12`);
  rows[dim] = r.error ? { error: r.error } : (r.data ?? []);
}

if (asJson) {
  console.log(JSON.stringify({ since, until, total: total.data, rows }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

const n = (v) => String(v ?? 0).padStart(5);
console.log(`\n  rightnleft.com · ${since} → ${until}\n`);
console.log(`  ${n(total.data?.visitors)} visitors   ${n(total.data?.pageviews)} page views\n`);

for (const [dim, label] of DIMS) {
  const data = rows[dim];
  if (data?.error) { console.log(`  ${label}\n      (${data.error})\n`); continue; }
  const shown = data.filter((r) => (r.pageviews ?? 0) > 0);
  if (!shown.length) { console.log(`  ${label}\n      (nothing)\n`); continue; }
  console.log(`  ${label}`);
  for (const r of shown) {
    // A blank referrer means the visit had none — typed, bookmarked, or from an
    // app that strips it. Labelled rather than printed as an empty row, because
    // "direct" is a finding and a gap in the table is not.
    const raw = r[dim] ?? r.timestamp ?? '';
    const label2 = dim === 'day'
      ? String(raw).slice(0, 10)
      : (String(raw).trim() || '(direct / none)');
    console.log(`      ${label2.padEnd(34)} ${n(r.pageviews)} views  ${n(r.visitors)} visitors`);
  }
  console.log('');
}

// The one thing this project is watching for. Named explicitly so it does not
// have to be re-derived from the referrer table every time.
const refs = Array.isArray(rows.referrerHostname) ? rows.referrerHostname : [];
const WATCH = [
  ['texastribune.org', 'Texas Tribune'],
  ['lwvaustin.org', 'LWV Austin'],
  ['lwvtexas.org', 'LWV Texas'],
  ['vote411.org', 'VOTE411'],
  ['jolttx.org', 'Jolt'],
  ['joltinitiative.org', 'Jolt Initiative'],
];
const hits = WATCH.filter(([host]) =>
  refs.some((r) => String(r.referrerHostname ?? '').includes(host)));
console.log(
  hits.length
    ? `  Outreach referrals: ${hits.map(([, name]) => name).join(', ')}\n`
    : '  Outreach referrals: none yet from the Tribune, LWV or Jolt\n',
);
