/**
 * PlainRecord: smoke suite for the economy module's arithmetic (econ.ts)
 *
 *   npx tsx econ.smoke.ts
 *
 * Reads the committed FRED pulls in data/fred/. The anchor is the paper: with
 * its terms and its one-quarter lag, today's data has to land close to the
 * growth rates Blinder and Watson published (4.35% under Democratic presidents,
 * 2.54% under Republican, 1949:Q2 to 2013:Q1). Not exactly: BEA revises GDP
 * and the paper used an older vintage. A wrong window or a wrong formula
 * misses by much more than revision does.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeTerms, pooledGrowth, byPresident, byGovernment, byFedAppointer, metricsFor, prepare,
  quarterOf, termWindow, PAPER_LAG_QUARTERS, LAGS,
  type SeriesSet, type SeriesId,
} from './econ';
import { buildTerms } from './econ_control';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? '  — ' + detail : ''}`);
}

const IDS: SeriesId[] = ['GDPC1', 'PAYEMS', 'UNRATE', 'CPIAUCSL', 'FYFSGDA188S', 'MEHOINUSA672N', 'USREC'];
const series = Object.fromEntries(IDS.map((id) => [id,
  JSON.parse(readFileSync(join('data', 'fred', `${id}.json`), 'utf8')).observations])) as SeriesSet;

// --- the paper -------------------------------------------------------------

const PAPER_D = ['1949-truman', '1961-kennedy-johnson', '1965-johnson', '1977-carter', '1993-clinton-1', '1997-clinton-2', '2009-obama-1'];
const PAPER_R = ['1953-eisenhower-1', '1957-eisenhower-2', '1969-nixon', '1973-nixon-ford', '1981-reagan-1', '1985-reagan-2', '1989-bush', '2001-bush-1', '2005-bush-2'];
const allIds = new Set(buildTerms().map((t) => t.id));
check('the paper\'s 16 terms all exist here', [...PAPER_D, ...PAPER_R].every((id) => allIds.has(id)));

const paper = pooledGrowth(series, PAPER_LAG_QUARTERS, [...PAPER_D, ...PAPER_R], byPresident);
const d = paper.D;
const r = paper.R;
check('the paper\'s sample is 64 years: 256 quarters', (d?.quarters ?? 0) + (r?.quarters ?? 0) === 256,
  `${d?.quarters} D + ${r?.quarters} R`);
check('Democratic average lands near the paper\'s 4.35%', Math.abs(d.mean - 4.35) < 0.3, `${d.mean}%`);
check('Republican average lands near the paper\'s 2.54%', Math.abs(r.mean - 2.54) < 0.3, `${r.mean}%`);
check('the gap lands near the paper\'s 1.80 points', Math.abs(d.mean - r.mean - 1.80) < 0.3,
  `${Math.round((d.mean - r.mean) * 100) / 100} points`);

// The paper's own remark: every other lag from 0 to 4 gives a smaller gap.
const gapAt = (lag: number) => {
  const g = pooledGrowth(series, lag, [...PAPER_D, ...PAPER_R], byPresident);
  return g.D.mean - g.R.mean;
};
const gaps = LAGS.map((l) => Math.round(gapAt(l) * 100) / 100);
check('as the paper says, the one-quarter lag gives the largest gap of lags 0 to 4',
  LAGS.every((l) => l === PAPER_LAG_QUARTERS || gapAt(l) < gapAt(PAPER_LAG_QUARTERS)),
  LAGS.map((l, i) => `lag ${l}: ${gaps[i]}`).join(', '));

// --- windows ---------------------------------------------------------------

for (const lag of [0, 1, 4]) {
  const terms = buildTerms();
  const wins = terms.map((t) => termWindow(t, lag));
  const tiled = wins.every((w, i) => i === 0 || wins[i - 1].e === w.s);
  check(`lag ${lag}: every quarter falls in exactly one term's window`, tiled && wins[0].s === quarterOf(terms[0].start) + lag);
}
const w0 = termWindow(buildTerms().find((t) => t.id === '1981-reagan-1')!, 0);
const w1 = termWindow(buildTerms().find((t) => t.id === '1981-reagan-1')!, 1);
check('changing the lag shifts the window and nothing else', w1.s === w0.s + 1 && w1.e === w0.e + 1 && w1.e - w1.s === 16);

const res = computeTerms(series, 1);
const reagan = res.find((x) => x.term.id === '1981-reagan-1')!;
check('Reagan-1 at the paper\'s lag is 1981Q2 to 1985Q1, as the paper writes its windows',
  reagan.window.from === '1981Q2' && reagan.window.to === '1985Q1' && reagan.window.quarters === 16,
  `${reagan.window.from}-${reagan.window.to}`);

// --- recomputed by hand, from the raw observations -------------------------

const at = (id: SeriesId, date: string) => series[id].find((o) => o.date === date)!.value!;
const byHand = (Math.pow(at('GDPC1', '1985-01-01') / at('GDPC1', '1981-01-01'), 4 / 16) - 1) * 100;
check('Reagan-1 GDP growth matches a hand calculation from GDPC1',
  Math.abs((reagan.metrics.gdpGrowth.value ?? NaN) - byHand) < 0.01, `${reagan.metrics.gdpGrowth.value} vs ${byHand.toFixed(2)}`);
const clinton = res.find((x) => x.term.id === '1993-clinton-1')!;
const jobsByHand = (Math.pow(at('PAYEMS', '1997-03-01') / at('PAYEMS', '1993-03-01'), 12 / 48) - 1) * 100;
check('Clinton-1 job growth matches a hand calculation from PAYEMS',
  Math.abs((clinton.metrics.jobGrowth.value ?? NaN) - jobsByHand) < 0.01, `${clinton.metrics.jobGrowth.value} vs ${jobsByHand.toFixed(2)}`);
check('Reagan-1 unemployment runs March 1981 to March 1985',
  reagan.metrics.unemploymentStart.value === at('UNRATE', '1981-03-01') && reagan.metrics.unemploymentEnd.value === at('UNRATE', '1985-03-01'));
check('Reagan-1 counts the fiscal years whose midpoint is in the window (FY1981 to FY1984)',
  reagan.metrics.deficit.note === 'FY1981-FY1984', reagan.metrics.deficit.note ?? '');
const recByHand = series.USREC.filter((o) => o.date >= '1981-04-01' && o.date < '1985-04-01').reduce((s, o) => s + (o.value ?? 0), 0);
check('Reagan-1 recession months match a count of USREC', reagan.metrics.recessionMonths.value === recByHand, String(recByHand));

// --- nulls are never zeros -------------------------------------------------

const carter = res.find((x) => x.term.id === '1977-carter')!;
check('median income is null before the series starts in 1984, not zero',
  carter.metrics.income.value === null && /outside the series/.test(carter.metrics.income.note ?? ''), carter.metrics.income.note ?? '');
check('and present once it exists', clinton.metrics.income.value !== null, String(clinton.metrics.income.value));

const holed = { ...series, CPIAUCSL: series.CPIAUCSL.map((o) => (o.date === '1985-03-01' ? { ...o, value: null } : o)) };
const holedReagan = metricsFor(prepare(holed), w1.s, w1.e);
check('a missing endpoint makes the metric null, with the reason',
  holedReagan.inflation.value === null && /missing/.test(holedReagan.inflation.note ?? ''), holedReagan.inflation.note ?? '');
check('and leaves the other metrics alone', holedReagan.gdpGrowth.value === reagan.metrics.gdpGrowth.value);

const complete = res.filter((x) => x.term.complete);
const nullEndpoints = complete.flatMap((x) => Object.entries(x.metrics)
  .filter(([k, v]) => v.value === null && k !== 'income').map(([k]) => `${x.term.id}.${k}`));
check('every complete term has every metric except pre-1984 income', nullEndpoints.length === 0, nullEndpoints.join(', ') || `${complete.length} terms`);

// --- the term in progress --------------------------------------------------

check('the term in progress is marked partial, and only it',
  res.at(-1)!.partial && res.slice(0, -1).every((x) => !x.partial), `${res.at(-1)!.window.from}-${res.at(-1)!.window.to}`);

// --- groupings -------------------------------------------------------------

const gov = pooledGrowth(series, 1, [...PAPER_D, ...PAPER_R], byGovernment(1));
check('unified and divided government each get quarters', Object.keys(gov).length >= 3,
  Object.entries(gov).map(([k, v]) => `${k}: ${v.mean}% over ${v.quarters}q`).join('; '));
const fedAll = byFedAppointer(series, 1, [...PAPER_D, ...PAPER_R]);
// It refused until 14 Nov 2026, when the Federal Reserve Bulletin supplied the
// five pre-1977 redesignations (FED_DESIGNATIONS in econ_control.ts).
check('the Fed grouping answers over every term of the paper, both parties', fedAll.ok
  && Object.keys(fedAll.result).some((k) => /D$/.test(k)) && Object.keys(fedAll.result).some((k) => /R$/.test(k)),
  fedAll.ok ? Object.entries(fedAll.result).map(([k, v]) => `${k}: ${v.mean}% over ${v.quarters}q`).join('; ') : fedAll.reason.slice(0, 80));
const fedRecent = byFedAppointer(series, 1, ['1981-reagan-1', '1985-reagan-2', '1989-bush', '1993-clinton-1', '1997-clinton-2', '2001-bush-1', '2005-bush-2', '2009-obama-1']);
check('and answers where every appointment is sourced (1981 on)', fedRecent.ok,
  fedRecent.ok ? Object.entries(fedRecent.result).map(([k, v]) => `${k}: ${v.quarters}q`).join('; ') : fedRecent.reason);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
