/**
 * PlainRecord: the economy module's raw series, from FRED
 *
 *   npm run data:fred
 *
 * Needs FRED_API_KEY in .env.local (free: fred.stlouisfed.org, My Account, API
 * Keys). ONLY this script needs it. The output is committed under data/fred/,
 * so the build never touches the network and never needs the key, and a deploy
 * cannot fail because FRED is down. Run it by hand when the data should move
 * forward, and review the diff like any other.
 *
 * Writes data/fred/<SERIES>.json per series: FRED's own metadata (title,
 * units, frequency, seasonal adjustment, notes, last updated), every
 * observation with "." turned into null, the public series URL, and when it
 * was fetched. The key is never written anywhere.
 *
 * REFUSES TO WRITE ANYTHING unless every series' metadata matches what the
 * plan (ECONOMY.md) expects: the frequency, and an observation start early
 * enough to cover the window. "Open each series page before shipping" is the
 * rule from outcomes.ts; this makes the parts of it a script can check fail
 * loudly, and prints the rest (units, notes, any copyright line) for a person.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORK_DIR } from './paths';

export const FRED_DIR = join(WORK_DIR, 'fred');

/** The plan's seven series, with what FRED must say about each. */
export const SERIES: { id: string; what: string; frequency: string; startBy: string; seasonal: string[] }[] = [
  { id: 'GDPC1', what: 'Real GDP', frequency: 'Quarterly', startBy: '1948-10-01', seasonal: ['SAAR'] },
  { id: 'PAYEMS', what: 'Nonfarm payrolls', frequency: 'Monthly', startBy: '1948-12-01', seasonal: ['SA'] },
  { id: 'UNRATE', what: 'Unemployment rate', frequency: 'Monthly', startBy: '1948-12-01', seasonal: ['SA'] },
  { id: 'CPIAUCSL', what: 'CPI, all items', frequency: 'Monthly', startBy: '1948-12-01', seasonal: ['SA'] },
  { id: 'FYFSGDA188S', what: 'Federal surplus or deficit, % of GDP', frequency: 'Annual', startBy: '1948-01-01', seasonal: ['NA', 'NSA'] },
  // Starts 1984 by the plan's own note; earlier terms show "no data", not zero.
  { id: 'MEHOINUSA672N', what: 'Real median household income', frequency: 'Annual', startBy: '1984-01-01', seasonal: ['NA', 'NSA'] },
  { id: 'USREC', what: 'NBER recession indicator', frequency: 'Monthly', startBy: '1948-12-01', seasonal: ['NSA'] },
];

function key(): string {
  if (process.env.FRED_API_KEY) return process.env.FRED_API_KEY.trim();
  if (!existsSync('.env.local')) throw new Error('FRED_API_KEY is not set and there is no .env.local');
  // Trimmed: a trailing space after the value is easy to paste and FRED
  // rejects the key outright with a 400 that does not say why.
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => /^\s*FRED_API_KEY\s*=/.test(l));
  if (!line) throw new Error('.env.local has no FRED_API_KEY (fred.stlouisfed.org, My Account, API Keys)');
  return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function fred(path: string, params: Record<string, string>, apiKey: string): Promise<any> {
  const qs = new URLSearchParams({ ...params, api_key: apiKey, file_type: 'json' });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`https://api.stlouisfed.org/fred/${path}?${qs}`);
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 1500 * attempt)); continue; }
    const body = await r.json().catch(() => ({}));
    // The URL carries the key, so it is never part of the message.
    throw new Error(`FRED ${path} ${params.series_id}: HTTP ${r.status} ${body.error_message ?? ''}`);
  }
  throw new Error(`FRED ${path} ${params.series_id}: gave up after retries`);
}

async function main(): Promise<void> {
  const apiKey = key();
  const fetched = new Date().toISOString();
  const out: { id: string; body: unknown }[] = [];
  const problems: string[] = [];

  console.log('\n  FRED series\n');
  for (const s of SERIES) {
    const meta = (await fred('series', { series_id: s.id }, apiKey)).seriess?.[0];
    if (!meta) { problems.push(`${s.id}: no metadata`); continue; }
    const obs = (await fred('series/observations', { series_id: s.id }, apiKey)).observations ?? [];

    const checks: [string, boolean, string][] = [
      ['frequency', meta.frequency === s.frequency, `${meta.frequency} (want ${s.frequency})`],
      ['starts early enough', meta.observation_start <= s.startBy, `${meta.observation_start} (want by ${s.startBy})`],
      ['seasonal adjustment', s.seasonal.includes(meta.seasonal_adjustment_short), `${meta.seasonal_adjustment_short} (want ${s.seasonal.join(' or ')})`],
      ['has observations', obs.length > 0, `${obs.length}`],
    ];
    for (const [label, ok, detail] of checks) {
      console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${s.id} ${label}  — ${detail}`);
      if (!ok) problems.push(`${s.id} ${label}: ${detail}`);
    }

    // Not a failure, a flag for a person: the plan's licence rule.
    const copyright = /copyright|©/i.test(meta.notes ?? '');
    console.log(`         ${meta.title} | ${meta.units} | ${meta.observation_start} to ${meta.observation_end}`
      + `${copyright ? ' | COPYRIGHT LINE IN NOTES, read before shipping' : ''}`);

    out.push({
      id: s.id,
      body: {
        id: s.id,
        what: s.what,
        title: meta.title,
        units: meta.units,
        frequency: meta.frequency,
        seasonalAdjustment: meta.seasonal_adjustment,
        observationStart: meta.observation_start,
        observationEnd: meta.observation_end,
        lastUpdated: meta.last_updated,
        notes: meta.notes ?? null,
        copyrightInNotes: copyright,
        sourceUrl: `https://fred.stlouisfed.org/series/${s.id}`,
        citation: `Federal Reserve Bank of St. Louis, FRED, series ${s.id}`,
        fetched,
        observations: obs.map((o: { date: string; value: string }) => ({
          date: o.date,
          value: o.value === '.' ? null : Number(o.value),
        })),
      },
    });
  }

  if (problems.length) {
    console.error(`\n  ${problems.length} problem(s); nothing written:\n    ${problems.join('\n    ')}\n`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(FRED_DIR, { recursive: true });
  for (const { id, body } of out) writeFileSync(join(FRED_DIR, `${id}.json`), JSON.stringify(body, null, 1) + '\n');
  console.log(`\n  wrote ${out.length} series to ${FRED_DIR}/\n`);
}

// Only when run, never on import: export_econ.ts imports SERIES and FRED_DIR
// from here, and an import must not call FRED.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\n  ${e.message}\n`); process.exitCode = 1; });
}
