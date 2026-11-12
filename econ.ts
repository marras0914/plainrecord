/**
 * PlainRecord: the economy module's arithmetic
 *
 * Pure: no I/O. It takes the FRED series (as committed under data/fred/ by
 * scripts/fetch_fred.ts) and the terms from econ_control.ts, and returns
 * numbers. Everything a page shows about the economy comes through here.
 *
 * ---------------------------------------------------------------------------
 * THE MEASUREMENT WINDOW, FROM THE PAPER, NOT CHOSEN HERE
 * ---------------------------------------------------------------------------
 * Blinder and Watson (NBER w20324): "In our main results, the first quarter
 * of each president's term is attributed to the previous president." Their
 * windows read "1949:Q2-1953Q1, 1953:Q2-1957:Q1". So a term's window is the
 * quarters from inauguration + `lag` up to (not including) the next
 * inauguration + `lag`, with `lag` in QUARTERS. The plan said years; the paper
 * says quarters, and the paper wins.
 *
 * THE LAG IS A KNOB, AND THE PAPER SAYS WHICH WAY IT TURNS. Its authors "did
 * repeat the calculation with lags of zero, two, three, and four quarters",
 * and "using lags of zero, two, three, and four quarters all lead to smaller
 * estimated D-R gaps". Their default of one quarter is the lag that shows the
 * largest gap. This file takes the lag as an argument and has no opinion; the
 * pages must show every lag from 0 to 4 and say which is the paper's.
 *
 * ---------------------------------------------------------------------------
 * DEFINITIONS (window = quarters [s, e))
 * ---------------------------------------------------------------------------
 *  gdpGrowth     annualized real GDP growth, level to level: GDPC1 in the
 *                quarter before the window to the window's last quarter.
 *  jobGrowth     annualized, PAYEMS, last month before the window to the
 *                window's last month.
 *  unemployment  UNRATE in the last month before the window, in the window's
 *                last month, and the change.
 *  inflation     annualized CPIAUCSL, endpoints as for jobs.
 *  deficit       mean of FYFSGDA188S over the fiscal years whose MIDPOINT is
 *                in the window (1 April for October-September fiscal years,
 *                from FY1977; 1 January for the July-June years before).
 *  income        annualized MEHOINUSA672N, from the calendar year of the
 *                quarter before the window to that of its last quarter. null
 *                before the series starts in 1984, never zero.
 *  recession     months in the window with USREC = 1 (NBER, counted from the
 *                month after the peak through the trough).
 *
 * A missing observation at an endpoint makes that metric null, with the
 * reason. October 2025 is missing from CPIAUCSL and UNRATE in FRED, and no
 * number is ever filled in for it.
 *
 * The inherited baseline is every metric over the four quarters before the
 * window, computed the same way.
 */

import { buildTerms, houseOn, senateOn, fedAppointingParty, type Party, type Term } from './econ_control';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface Obs { date: string; value: number | null }
export type SeriesId = 'GDPC1' | 'PAYEMS' | 'UNRATE' | 'CPIAUCSL' | 'FYFSGDA188S' | 'MEHOINUSA672N' | 'USREC';
export type SeriesSet = Record<SeriesId, Obs[]>;

/** The paper's main specification. Not a recommendation: see the header. */
export const PAPER_LAG_QUARTERS = 1;
export const LAGS = [0, 1, 2, 3, 4] as const;

// ---------------------------------------------------------------------------
// Calendar arithmetic. Quarters and months as integers, so windows are ranges.
// ---------------------------------------------------------------------------

export const quarterOf = (iso: string) => Number(iso.slice(0, 4)) * 4 + Math.floor((Number(iso.slice(5, 7)) - 1) / 3);
export const monthOf = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
export const quarterLabel = (q: number) => `${Math.floor(q / 4)}Q${(q % 4) + 1}`;
const yearOfQuarter = (q: number) => Math.floor(q / 4);
/** Middle of a quarter, as an ISO date, for asking who held office then. */
export const quarterMid = (q: number) => `${Math.floor(q / 4)}-${String((q % 4) * 3 + 2).padStart(2, '0')}-15`;

function indexBy(obs: Obs[], key: (iso: string) => number): Map<number, number | null> {
  return new Map(obs.map((o) => [key(o.date), o.value]));
}

export interface Prepared {
  gdp: Map<number, number | null>;      // by quarter
  payems: Map<number, number | null>;   // by month
  unrate: Map<number, number | null>;
  cpi: Map<number, number | null>;
  usrec: Map<number, number | null>;
  deficit: Map<number, number | null>;  // by fiscal year
  income: Map<number, number | null>;   // by calendar year
  lastQuarter: number;
  lastMonth: Record<'payems' | 'unrate' | 'cpi' | 'usrec', number>;
}

export function prepare(s: SeriesSet): Prepared {
  const lastKey = (m: Map<number, number | null>) => Math.max(...[...m.keys()]);
  const p = {
    gdp: indexBy(s.GDPC1, quarterOf),
    payems: indexBy(s.PAYEMS, monthOf),
    unrate: indexBy(s.UNRATE, monthOf),
    cpi: indexBy(s.CPIAUCSL, monthOf),
    usrec: indexBy(s.USREC, monthOf),
    deficit: indexBy(s.FYFSGDA188S, (d) => Number(d.slice(0, 4))),
    income: indexBy(s.MEHOINUSA672N, (d) => Number(d.slice(0, 4))),
  };
  return {
    ...p,
    lastQuarter: lastKey(p.gdp),
    lastMonth: { payems: lastKey(p.payems), unrate: lastKey(p.unrate), cpi: lastKey(p.cpi), usrec: lastKey(p.usrec) },
  };
}

// ---------------------------------------------------------------------------
// Metrics over a window
// ---------------------------------------------------------------------------

/** A number, or null with the reason, never a zero standing in for "unknown". */
export type Value = { value: number; note?: string } | { value: null; note: string };

const pct = (x: number) => Math.round(x * 10000) / 100; // fraction to percent, 2 dp
const annualized = (from: number, to: number, periodsPerYear: number, periods: number) =>
  (to / from) ** (periodsPerYear / periods) - 1;

function levelToLevel(m: Map<number, number | null>, before: number, last: number, perYear: number, what: string): Value {
  if (last <= before) return { value: null, note: `${what}: window is empty` };
  const a = m.get(before);
  const b = m.get(last);
  if (a === undefined || b === undefined) return { value: null, note: `${what}: outside the series` };
  if (a === null || b === null) return { value: null, note: `${what}: an endpoint is missing in FRED` };
  return { value: pct(annualized(a, b, perYear, last - before)) };
}

export interface Metrics {
  gdpGrowth: Value;
  jobGrowth: Value;
  unemploymentStart: Value;
  unemploymentEnd: Value;
  unemploymentChange: Value;
  inflation: Value;
  deficit: Value;
  income: Value;
  recessionMonths: Value;
}

/** Every metric over quarters [s, e). */
export function metricsFor(p: Prepared, s: number, e: number): Metrics {
  const mBefore = s * 3 - 1;
  const mLast = e * 3 - 1;

  const u0 = p.unrate.get(mBefore);
  const u1 = p.unrate.get(mLast);
  const uStart: Value = u0 == null ? { value: null, note: 'unemployment: start month missing' } : { value: u0 };
  const uEnd: Value = u1 == null ? { value: null, note: 'unemployment: end month missing' } : { value: u1 };
  const uChange: Value = uStart.value !== null && uEnd.value !== null
    ? { value: Math.round((uEnd.value - uStart.value) * 100) / 100 }
    : { value: null, note: 'unemployment: an endpoint is missing' };

  // Fiscal years whose midpoint is in the window.
  const fyMid = (fy: number) => (fy >= 1977 ? fy * 12 + 3 : fy * 12);
  const fys = [...p.deficit.keys()].filter((fy) => fyMid(fy) >= s * 3 && fyMid(fy) < e * 3);
  const fyVals = fys.map((fy) => p.deficit.get(fy));
  const deficit: Value = fys.length === 0
    ? { value: null, note: 'deficit: no fiscal year has its midpoint in this window' }
    : fyVals.some((v) => v == null)
      ? { value: null, note: 'deficit: a fiscal year is missing' }
      : { value: Math.round((fyVals as number[]).reduce((a, b) => a + b, 0) / fyVals.length * 100) / 100, note: `FY${fys[0]}-FY${fys.at(-1)}` };

  const y0 = yearOfQuarter(s - 1);
  const y1 = yearOfQuarter(e - 1);
  const income: Value = y1 <= y0
    ? { value: null, note: 'income: window shorter than a year apart' }
    : levelToLevel(p.income, y0, y1, 1, 'income');

  let rec = 0;
  let recMissing = false;
  for (let m = s * 3; m < e * 3; m++) {
    const v = p.usrec.get(m);
    if (v == null) { recMissing = true; break; }
    rec += v;
  }

  return {
    gdpGrowth: levelToLevel(p.gdp, s - 1, e - 1, 4, 'GDP'),
    jobGrowth: levelToLevel(p.payems, mBefore, mLast, 12, 'jobs'),
    unemploymentStart: uStart,
    unemploymentEnd: uEnd,
    unemploymentChange: uChange,
    inflation: levelToLevel(p.cpi, mBefore, mLast, 12, 'inflation'),
    deficit,
    income,
    recessionMonths: recMissing ? { value: null, note: 'recession: a month is missing' } : { value: rec },
  };
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export interface TermResult {
  term: Term;
  lag: number;
  /** Quarters [s, e) actually measured, clipped to the data for the term in progress. */
  window: { from: string; to: string; quarters: number };
  /** True when the window ends before the term does (the term in progress). */
  partial: boolean;
  metrics: Metrics;
  baseline: Metrics;
}

export function termWindow(term: Term, lag: number): { s: number; e: number } {
  const s = quarterOf(term.start) + lag;
  const e = term.end === null ? Infinity : quarterOf(term.end) + lag;
  return { s, e };
}

export function computeTerms(series: SeriesSet, lag: number, today?: string): TermResult[] {
  const p = prepare(series);
  return buildTerms(today).map((term) => {
    const { s, e: full } = termWindow(term, lag);
    const e = Math.min(full, p.lastQuarter + 1);
    return {
      term,
      lag,
      window: { from: quarterLabel(s), to: quarterLabel(e - 1), quarters: e - s },
      partial: e < full,
      metrics: metricsFor(p, s, e),
      baseline: metricsFor(p, s - 4, s),
    };
  });
}

// ---------------------------------------------------------------------------
// Groupings. Shown only after the blind round, or on the labeled explorer.
// ---------------------------------------------------------------------------

/**
 * The paper's statistic: the mean, over every quarter in the given terms'
 * windows, of that quarter's annualized growth, grouped by a label for the
 * quarter. Pooled by quarter, not averaged by term, as the paper does it.
 */
export function pooledGrowth(
  series: SeriesSet, lag: number, termIds: string[], label: (q: number, term: Term) => string,
): Record<string, { mean: number; quarters: number }> {
  const p = prepare(series);
  const sums: Record<string, { total: number; n: number }> = {};
  for (const term of buildTerms().filter((t) => termIds.includes(t.id))) {
    const { s, e } = termWindow(term, lag);
    for (let q = s; q < Math.min(e, p.lastQuarter + 1); q++) {
      const a = p.gdp.get(q - 1);
      const b = p.gdp.get(q);
      if (a == null || b == null) continue;
      const k = label(q, term);
      sums[k] ??= { total: 0, n: 0 };
      sums[k].total += ((b / a) ** 4 - 1) * 100;
      sums[k].n += 1;
    }
  }
  return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, { mean: Math.round(v.total / v.n * 100) / 100, quarters: v.n }]));
}

/** By the president's party. */
export const byPresident = (_q: number, term: Term) => term.party;

/**
 * Unified or divided government in a quarter, read at the same lag as the
 * window: the quarter is charged to whoever held office `lag` quarters
 * earlier, so Congress is read then too.
 */
export const byGovernment = (lag: number) => (q: number, term: Term): string => {
  const at = quarterMid(q - lag);
  const h = houseOn(at);
  const s = senateOn(at).party;
  return h === term.party && s === term.party ? `unified ${term.party}` : 'divided';
};

/**
 * By the party of the president whose appointment of the Fed chair was in
 * force. Refuses, with the reason, if any quarter in the requested terms falls
 * where that is unsourced (see KNOWN_GAPS in econ_control.ts), rather than
 * quietly dropping those quarters and reporting the rest as if complete.
 */
export function byFedAppointer(series: SeriesSet, lag: number, termIds: string[]):
  { ok: true; result: Record<string, { mean: number; quarters: number }> } | { ok: false; reason: string } {
  try {
    const result = pooledGrowth(series, lag, termIds, (q) => `appointed by ${fedAppointingParty(quarterMid(q - lag)) ?? 'none (vacancy)'}`);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export type { Party };
