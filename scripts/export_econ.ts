/**
 * PlainRecord: the economy module's shipped files
 *
 *   npm run data:econ
 *
 * Reads data/fred/ (committed by fetch_fred.ts) and writes two files to
 * SHIP_DIR, both CC0 and served CORS-open like quiz_89R.json:
 *
 *   econ_blind.json   what the blind round loads. Each complete term's metrics
 *                     and inherited baseline at the PAPER'S LAG, under an
 *                     opaque key ("term-k"), and nothing else: no years, no
 *                     names, no parties, no fiscal-year labels, no shock
 *                     notes. Decided 12 Nov 2026: pages lead with the
 *                     authors' one-quarter lag, labeled as theirs, and the
 *                     shock notes appear on the reveal only, never a blind card.
 *   econ_terms.json   the labeled record for the reveal and the explorer:
 *                     who held each office, the shock notes with their
 *                     sources, every metric at every lag from 0 to 4, the
 *                     groupings, and the key that maps "term-k" back to a term.
 *
 * WHAT "BLIND" MEANS HERE. The blind file carries no label, and the page asks
 * for econ_terms.json only after the last rating (verify_site.mjs asserts
 * that). It is not secrecy: the key is public, and the numbers themselves let
 * a reader who knows the history recognise some terms (double-digit inflation,
 * a pandemic quarter). Income is null before 1984, which dates those cards to
 * before 1984. The page says all of this.
 *
 * The order of the blind terms is a fixed shuffle (a hash of each term's id),
 * so the file does not list them in date order. The page shuffles again per
 * reader. The term in progress is never in the blind file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  computeTerms, pooledGrowth, byPresident, byGovernment, byFedAppointer,
  PAPER_LAG_QUARTERS, LAGS, type SeriesSet, type SeriesId, type Metrics, type Value,
} from '../econ';
import { SENATE, HOUSE_SOURCE, FED_CHAIRS, KNOWN_GAPS } from '../econ_control';
import { CONTEXT, notesForTerm } from '../econ_context';
import { SHIP_DIR } from './paths';
import { FRED_DIR, SERIES } from './fetch_fred';

export const BLIND_SALT = 'econ-blind-v1';
const PAPER_URL = 'https://www.nber.org/papers/w20324';

/** The paper's sample, for the one grouping that reproduces its finding. */
export const PAPER_TERMS = [
  '1949-truman', '1953-eisenhower-1', '1957-eisenhower-2', '1961-kennedy-johnson', '1965-johnson',
  '1969-nixon', '1973-nixon-ford', '1977-carter', '1981-reagan-1', '1985-reagan-2', '1989-bush',
  '1993-clinton-1', '1997-clinton-2', '2001-bush-1', '2005-bush-2', '2009-obama-1',
];

const values = (m: Metrics) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (v as Value).value]));

export interface FredMeta { id: string; title: string; units: string; sourceUrl: string; lastUpdated: string; observationEnd: string }

export function buildEconPayloads(series: SeriesSet, meta: FredMeta[], today?: string) {
  const byLag = Object.fromEntries(LAGS.map((lag) => [lag, computeTerms(series, lag, today)]));
  const paperLag = byLag[PAPER_LAG_QUARTERS];

  // Fixed shuffle for the blind keys.
  const complete = paperLag.filter((r) => r.term.complete);
  const hashed = complete
    .map((r) => ({ r, h: createHash('sha256').update(`${BLIND_SALT}:${r.term.id}`).digest('hex') }))
    .sort((a, b) => a.h.localeCompare(b.h));
  const key = (i: number) => `term-${String.fromCharCode(97 + i)}`;
  const blindKey: Record<string, string> = Object.fromEntries(hashed.map(({ r }, i) => [key(i), r.term.id]));

  const blind = {
    about: 'Each complete term since 1949, without labels. The key that names them is in econ_terms.json. CC0.',
    lagQuarters: PAPER_LAG_QUARTERS,
    terms: hashed.map(({ r }, i) => ({ key: key(i), metrics: values(r.metrics), baseline: values(r.baseline) })),
  };

  const completeIds = complete.map((r) => r.term.id);
  const groupings = Object.fromEntries(LAGS.map((lag) => [lag, {
    paperSample: pooledGrowth(series, lag, PAPER_TERMS, byPresident),
    allComplete: pooledGrowth(series, lag, completeIds, byPresident),
    government: pooledGrowth(series, lag, completeIds, byGovernment(lag)),
    fedAppointer: byFedAppointer(series, lag, completeIds),
  }]));

  const terms = {
    about: 'Who held each office in each term since 1949, the economy during it at every lag from 0 to 4 quarters, and the sources. CC0.',
    paperLagQuarters: PAPER_LAG_QUARTERS,
    lags: [...LAGS],
    paper: { url: PAPER_URL, note: 'The paper charges the first quarter of each term to the previous president (a one-quarter lag), and reports that every other lag from 0 to 4 quarters gives a smaller gap.' },
    blindKey,
    sources: {
      fred: meta,
      house: HOUSE_SOURCE,
      senate: [...new Set(SENATE.map((s) => s.sourceUrl))],
      fed: [...new Set(FED_CHAIRS.map((c) => c.sourceUrl))],
    },
    knownGaps: KNOWN_GAPS,
    terms: paperLag.map((r) => ({
      id: r.term.id,
      start: r.term.start,
      end: r.term.end,
      complete: r.term.complete,
      party: r.term.party,
      presidents: r.term.presidents,
      control: r.term.control,
      fedChairs: r.term.fedChairs,
      notes: notesForTerm(Number(r.term.start.slice(0, 4)), r.term.end ? Number(r.term.end.slice(0, 4)) : null)
        .map((n) => ({ id: n.id, kind: n.kind, text: n.full, source: n.source })),
      byLag: Object.fromEntries(LAGS.map((lag) => {
        const x = byLag[lag].find((y) => y.term.id === r.term.id)!;
        return [lag, { window: x.window, partial: x.partial, metrics: x.metrics, baseline: x.baseline }];
      })),
    })),
    groupings,
    contextRule: 'A note for every outside shock Blinder and Watson name, and for every NBER recession after their sample ends in 2012. See econ_context.ts.',
    contextCount: CONTEXT.length,
  };

  return { blind, terms };
}

export function loadFred(): { series: SeriesSet; meta: FredMeta[] } {
  const files = SERIES.map((s) => JSON.parse(readFileSync(join(FRED_DIR, `${s.id}.json`), 'utf8')));
  return {
    series: Object.fromEntries(files.map((f) => [f.id, f.observations])) as SeriesSet,
    meta: files.map((f) => ({
      id: f.id as SeriesId, title: f.title, units: f.units, sourceUrl: f.sourceUrl,
      lastUpdated: f.lastUpdated, observationEnd: f.observationEnd,
    })),
  };
}

function main(): void {
  const { series, meta } = loadFred();
  const { blind, terms } = buildEconPayloads(series, meta);
  writeFileSync(join(SHIP_DIR, 'econ_blind.json'), JSON.stringify(blind));
  writeFileSync(join(SHIP_DIR, 'econ_terms.json'), JSON.stringify(terms));
  const kb = (o: unknown) => (JSON.stringify(o).length / 1024).toFixed(1);
  console.log(`\n  econ_blind.json  ${blind.terms.length} terms, ${kb(blind)} KB`);
  console.log(`  econ_terms.json  ${terms.terms.length} terms, ${kb(terms)} KB\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
