/**
 * PlainRecord: the daily traffic report
 *
 *   npm run traffic            (Windows Task Scheduler runs it every morning)
 *
 * Asked for by Marco on 15 Nov 2026. Vercel Web Analytics keeps only about 15
 * days on the Hobby plan, so this saves each finished day to
 * data/traffic/<day>.json (gitignored) and the history outlives the limit.
 * Missed days are fetched on the next run, as long as they are still inside
 * the 15 days. Then it writes data/traffic/report.html from every saved day.
 *
 * Days are UTC (6 pm to 6 pm Central): the analytics API snaps any range to
 * UTC days, whatever times it is given.
 *
 * Needs VERCEL_TOKEN in .env.local: a token from vercel.com/account/tokens,
 * scoped to the team, with an expiry. Vercel tokens cannot be read-only; this
 * script only reads. The token is never printed.
 *
 * Read-only against the site: three GET requests per new day, nothing else.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data', 'traffic');
const PROJECT = 'prj_w3xZyp9HWugCGvsSXZfWZWmj90CW';
const TEAM = 'team_UfIvdWLkbaSbkEQRR3LSLd9z';
const RETENTION_DAYS = 14;   // stay inside the ~15-day window
const NEW_PAGE_DAYS = 30;

// ---------------------------------------------------------------------------
// Which space a path belongs to, and which language
// ---------------------------------------------------------------------------

/** As scripts/_site_nav.mjs sectionOf(), with the quiz and the front page split out. */
export function spaceOf(path) {
  if (path === '/' || path === '/es') return 'Front page';
  if (/^\/(quiz)(\/|$)/.test(path) || /^\/es\/cuestionario(\/|$)/.test(path)) return 'Quiz';
  if (/^\/(policy|politica|districts|distritos|district|distrito|bills|proyectos|bill|proyecto|race|contienda|charts|graficas)(\/|$)/.test(path)) return 'Policy';
  if (/^\/(faith|fe)(\/|$)/.test(path)) return 'Religion';
  if (/^\/(economy|economia)(\/|$)/.test(path)) return 'Economics';
  return 'Other';
}
export const SPACES = ['Front page', 'Quiz', 'Policy', 'Religion', 'Economics', 'Other'];

// contexto: the retired Spanish Context hub, which now redirects but still shows up.
const SPANISH = /^\/(es|fe|economia|politica|distritos|distrito|proyectos|proyecto|contienda|graficas|hoja|maestros|contexto)(\/|$)/;
export const isSpanish = (path) => SPANISH.test(path);

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

function token() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const env = join(ROOT, '.env.local');
  const line = existsSync(env) && readFileSync(env, 'utf8').split(/\r?\n/).find((l) => l.startsWith('VERCEL_TOKEN='));
  if (!line) throw new Error('traffic_report: no VERCEL_TOKEN in .env.local (create one at vercel.com/account/tokens, scoped to the team)');
  return line.slice('VERCEL_TOKEN='.length).trim().replace(/^"|"$/g, '');
}

async function query(kind, params) {
  const qs = new URLSearchParams({ projectId: PROJECT, teamId: TEAM, environment: 'production', ...params });
  const res = await fetch(`https://api.vercel.com/v1/query/web-analytics/visits/${kind}?${qs}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(`traffic_report: ${kind} ${params.by ?? ''} returned ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data;
}

const dayStr = (d) => d.toISOString().slice(0, 10);
const nextDay = (s) => dayStr(new Date(Date.parse(`${s}T00:00:00Z`) + 86400000));

async function fetchDay(day) {
  // `until` is inclusive, and the API stretches it: next-day 00:00 came back as
  // next-day 01:00 (15 Nov 2026). The day's last millisecond keeps it in the day.
  const range = { since: `${day}T00:00:00.000Z`, until: `${day}T23:59:59.999Z` };
  const [total, paths, referrers] = await Promise.all([
    query('count', range),
    query('aggregate', { ...range, by: 'requestPath', limit: '100' }),
    query('aggregate', { ...range, by: 'referrerHostname', limit: '25' }),
  ]);
  return { day, total, paths, referrers, fetchedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Pages first published in the last 30 days, from git
// ---------------------------------------------------------------------------

function newPages() {
  let out = '';
  try {
    out = execFileSync('git', ['log', `--since=${NEW_PAGE_DAYS}.days`, '--diff-filter=A', '--name-only', '--format=@%cs', '--', 'public'], { cwd: ROOT, encoding: 'utf8' });
  } catch { return new Map(); }
  const pages = new Map();
  let date = '';
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('@')) { date = line.slice(1); continue; }
    const m = line.match(/^public\/(.+)\/index\.html$/);
    if (m) pages.set(`/${m[1]}`, date);   // git log is newest first, so this keeps the first publication
  }
  return pages;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sum = (a) => a.reduce((s, x) => s + x, 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const fmt1 = (n) => (Math.round(n * 10) / 10).toString();
function delta(now, before) {
  if (before === undefined) return '';
  const d = now - before;
  return `<span class="${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '+' : ''}${d}</span>`;
}

/** Page views by space for one saved day. "Others" (past the top 100 paths) is kept apart, not guessed. */
export function bySpace(snap) {
  const out = Object.fromEntries(SPACES.map((s) => [s, 0]));
  let others = 0;
  for (const p of snap.paths) {
    if (p.requestPath === 'Others') { others += p.pageviews; continue; }
    out[spaceOf(p.requestPath)] += p.pageviews;
  }
  return { out, others };
}

function langSplit(snap) {
  let es = 0, en = 0;
  for (const p of snap.paths) if (p.requestPath !== 'Others') (isSpanish(p.requestPath) ? (es += p.pageviews) : (en += p.pageviews));
  return { es, en };
}

function report(snaps, launched) {
  const last = snaps[snaps.length - 1];
  const prev = snaps[snaps.length - 2];
  const week = snaps.slice(-8, -1);    // the 7 days before the latest
  const sp = bySpace(last);
  const spPrev = prev && bySpace(prev).out;
  const spWeek = SPACES.map((s) => avg(week.map((w) => bySpace(w).out[s])));
  const lang = langSplit(last);
  const langWeek = week.map(langSplit);

  const spaceRows = SPACES.map((s, i) => `<tr><th>${s}</th><td>${sp.out[s]}</td><td>${delta(sp.out[s], spPrev?.[s])}</td><td>${fmt1(spWeek[i])}</td></tr>`).join('');

  const refRows = last.referrers.map((r) => `<tr><th>${esc(r.referrerHostname || '(direct or none)')}</th><td>${r.visitors}</td><td>${r.pageviews}</td></tr>`).join('');

  const viewsOn = (snap, path) => snap.paths.find((p) => p.requestPath === path)?.pageviews ?? 0;
  const newRows = [...launched].sort((a, b) => b[1].localeCompare(a[1])).map(([path, date]) => {
    const since = snaps.filter((s) => s.day >= date);
    const total = sum(since.map((s) => viewsOn(s, path)));
    return `<tr><th>${esc(path)}</th><td>${date}</td><td>${viewsOn(last, path)}</td><td>${total}</td></tr>`;
  }).join('');

  const topRows = last.paths.slice(0, 20).map((p) => `<tr><th>${esc(p.requestPath)}</th><td>${p.visitors}</td><td>${p.pageviews}</td><td>${p.requestPath === 'Others' ? '' : spaceOf(p.requestPath)}</td></tr>`).join('');

  const histRows = [...snaps].reverse().map((s) => {
    const b = bySpace(s).out;
    const l = langSplit(s);
    return `<tr><th>${s.day}</th><td>${s.total.visitors}</td><td>${s.total.pageviews}</td>${SPACES.map((x) => `<td>${b[x]}</td>`).join('')}<td>${l.es}</td></tr>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>rightnleft traffic</title>
<style>
:root{--bg:#faf7f1;--ink:#1a1714;--muted:#6f6a62;--rule:#cabfae;--up:#1f7a3a;--down:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#121211;--ink:#f2f0ea;--muted:#a19d95;--rule:#3a3936;--up:#5cc27c;--down:#ef7d75}}
body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:980px;padding:16px}
h1{font-size:1.5rem;margin:8px 0 2px}h2{font-size:1.1rem;margin:28px 0 6px}
p.note{color:var(--muted);font-size:13.5px;margin:2px 0 10px}
.big{display:flex;gap:28px;flex-wrap:wrap;margin:10px 0}.big div{min-width:120px}.big b{display:block;font-size:2rem;line-height:1.1}
.wrap{overflow-x:auto}table{border-collapse:collapse;font-size:14px;min-width:100%}
th,td{padding:5px 10px;border-bottom:1px solid var(--rule);text-align:right;white-space:nowrap}
th:first-child,thead th:first-child{text-align:left}thead th{font-weight:600;color:var(--muted)}
td,th{font-variant-numeric:tabular-nums}tbody th{font-weight:500}
.up{color:var(--up)}.down{color:var(--down)}.flat{color:var(--muted)}
</style></head><body>
<h1>rightnleft traffic, ${last.day}</h1>
<p class="note">Days run midnight to midnight UTC (6 pm to 6 pm Central). Saved days: ${snaps.length}, from ${snaps[0].day}. Fetched ${esc(last.fetchedAt.slice(0, 16).replace('T', ' '))} UTC.</p>
<div class="big"><div><b>${last.total.visitors}</b>visitors ${delta(last.total.visitors, prev?.total.visitors)}</div><div><b>${last.total.pageviews}</b>page views ${delta(last.total.pageviews, prev?.total.pageviews)}</div><div><b>${fmt1(avg(week.map((w) => w.total.pageviews)))}</b>views a day, prior 7-day average</div></div>

<h2>By space</h2>
<p class="note">Page views. Change is against the day before; the average is over the 7 days before.${sp.others ? ` ${sp.others} views were on paths past the top 100 and are not placed in a space.` : ''}</p>
<div class="wrap"><table><thead><tr><th>Space</th><th>Views</th><th>Change</th><th>7-day avg</th></tr></thead><tbody>${spaceRows}</tbody></table></div>

<h2>Spanish and English</h2>
<p class="note">Page views on Spanish paths (/es, /fe, /economia, /politica, /distritos and the rest) against everything else.</p>
<div class="wrap"><table><thead><tr><th></th><th>Views</th><th>7-day avg</th></tr></thead><tbody>
<tr><th>Spanish</th><td>${lang.es}</td><td>${fmt1(avg(langWeek.map((l) => l.es)))}</td></tr>
<tr><th>English</th><td>${lang.en}</td><td>${fmt1(avg(langWeek.map((l) => l.en)))}</td></tr>
</tbody></table></div>

<h2>Where visitors came from</h2>
<div class="wrap"><table><thead><tr><th>Referrer</th><th>Visitors</th><th>Views</th></tr></thead><tbody>${refRows || '<tr><th>No visits</th><td></td><td></td></tr>'}</tbody></table></div>

<h2>New pages</h2>
<p class="note">Pages first committed in the last ${NEW_PAGE_DAYS} days. "Since launch" counts only days saved here.</p>
<div class="wrap"><table><thead><tr><th>Page</th><th>Launched</th><th>Views</th><th>Since launch</th></tr></thead><tbody>${newRows || '<tr><th>None</th><td></td><td></td><td></td></tr>'}</tbody></table></div>

<h2>Top pages</h2>
<div class="wrap"><table><thead><tr><th>Page</th><th>Visitors</th><th>Views</th><th>Space</th></tr></thead><tbody>${topRows}</tbody></table></div>

<h2>Every saved day</h2>
<p class="note">Views by space, and Spanish views, per day. This history is the point of saving: Vercel keeps about 15 days.</p>
<div class="wrap"><table><thead><tr><th>Day</th><th>Visitors</th><th>Views</th>${SPACES.map((s) => `<th>${s}</th>`).join('')}<th>Spanish</th></tr></thead><tbody>${histRows}</tbody></table></div>
</body></html>
`;
}

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(DIR, { recursive: true });
  const today = dayStr(new Date());
  const wanted = [];
  for (let d = RETENTION_DAYS; d >= 1; d--) wanted.push(dayStr(new Date(Date.parse(`${today}T00:00:00Z`) - d * 86400000)));
  // --offline: rebuild the report from the saved days without fetching.
  const missing = process.argv.includes('--offline') ? [] : wanted.filter((d) => !existsSync(join(DIR, `${d}.json`)));
  for (const day of missing) {
    const snap = await fetchDay(day);
    writeFileSync(join(DIR, `${day}.json`), JSON.stringify(snap, null, 1));
  }
  const snaps = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')));
  const file = join(DIR, 'report.html');
  writeFileSync(file, report(snaps, newPages()));
  const last = snaps[snaps.length - 1];
  console.log(`  traffic: fetched ${missing.length} day(s); ${snaps.length} saved; ${last.day}: ${last.total.visitors} visitors, ${last.total.pageviews} views`);
  console.log(`  report: ${file}`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('traffic_report.mjs')) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
