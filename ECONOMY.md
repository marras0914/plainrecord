# Economy module

**Status: planning.** See [EXPANSION.md](EXPANSION.md) for how this fits the repo.

Readers judge stretches of the economy without labels, then see who held the
White House, the House, the Senate and the Fed. The module reports the data
and what the research says about it. It never says which party is better for
the economy, because the research doesn't support that claim either.

---

## What the research supports, and what it doesn't

The best-known study is Blinder and Watson, "Presidents and the US Economy: An
Econometric Exploration," *American Economic Review* 106(4), 2016
(<https://nber.org/papers/w20324>). Over 1949 to 2012:

- Real GDP grew about 1.8 points a year faster under Democratic presidents
  (roughly 4.3% vs 2.5%).
- About half of that gap is explained by things presidents don't control,
  mainly oil price shocks and productivity. The authors call the rest
  unexplained.
- Fiscal and monetary policy don't explain it. Neither does which party
  controlled Congress.

The page has to carry all three of those points together. Quoting the first
without the second is the economy version of the causal claim that
`outcomes.ts` exists to prevent.

---

## Data

### Fetched: `scripts/fetch_fred.ts`

Writes raw observations to `data/fred/<SERIES>.json`, each with the series
metadata, its notes and a fetch timestamp. Needs `FRED_API_KEY` in
`.env.local`. Only this script needs the key; the build doesn't.

| Metric | FRED ID | Frequency | Notes |
|---|---|---|---|
| Real GDP | `GDPC1` | Quarterly | Annualized growth per term |
| Nonfarm payrolls | `PAYEMS` | Monthly | Annualized job growth |
| Unemployment rate | `UNRATE` | Monthly | Level at start and end, and the change |
| CPI, all items | `CPIAUCSL` | Monthly | Annualized inflation |
| Federal surplus or deficit, % of GDP | `FYFSGDA188S` | Annual, fiscal year | Average per term |
| Real median household income | `MEHOINUSA672N` | Annual | **Starts 1984.** Earlier terms show "no data," not zero |
| NBER recession indicator | `USREC` | Monthly | Recession months per term |

Endpoint: `https://api.stlouisfed.org/fred/series/observations?series_id=<ID>&api_key=<KEY>&file_type=json`

**Before shipping:** open each series page on FRED and confirm the ID, units,
start date and copyright line. Don't add a series you haven't opened, the same
rule `outcomes.ts` sets.

### Hand-curated: `econ_control.ts`

Who held each office, one record per presidential term, from Truman's elected
term (1949) to the present. Typed, at the root, and sourced line by line, like
`stated_positions.ts`.

```ts
export interface Term {
  id: string;                     // '1981-reagan-1'
  start: string;                  // inauguration date, ISO
  end: string;
  president: { name: string; party: 'D' | 'R' };
  congresses: {
    number: number;
    start: string;
    house: 'D' | 'R';
    senate: 'D' | 'R';
    sourceUrl: string;            // history.house.gov / senate.gov party divisions
  }[];
  fedChairs: {
    name: string;
    start: string;
    appointedBy: 'D' | 'R';       // party of the appointing president
    sourceUrl: string;            // federalreserve.gov history
  }[];
}
```

Every party flip and chair change is checked against the official page before
it goes in. Recent entries need the most care, so mark the file with a
`Last reviewed:` date the same way `stated_positions.ts` does.

### Hand-curated: `econ_context.ts`

One short, neutral, sourced note per major outside shock: the 1973 oil
embargo, the 1979 oil shock, the 2001 recession, the 2008 financial crisis,
COVID-19 and so on. **Say what happened, not who was at fault.** The notes
show on the blind cards because the research says those shocks explain a
large share of the gap.

---

## Computation: `econ.ts`

Pure, with no I/O, in the same spirit as `scoring.ts`.

- **Measurement window.** Blinder and Watson count growth from the first
  quarter after inauguration to the quarter of the next inauguration.
  Document the convention in the module header and use it everywhere.
- **Lag:** 0, 1 or 2 years, defaulting to 0. Shifts every term's window. The
  explorer renders all three, so the reader can see how much the picture
  depends on this choice.
- **Per term:** annualized real GDP growth, annualized job growth, change in
  unemployment, average inflation, average deficit, change in median income
  (where available), and recession months.
- **Inherited baseline:** each metric over the four quarters before the term,
  shown beside the term's own figure.
- **Groupings:** by president's party, by unified versus divided government,
  and by which party appointed the Fed chair. All are computed, but **only
  shown after a reader has finished the blind round** (or on the explorer page,
  which says up front that it's labeled).

### `econ.smoke.ts` checks

- Every quarter from 1949 to the latest data falls in exactly one term.
- Every term has a president, at least one Congress and at least one Fed chair.
- Annualized growth recomputed by hand for two fixed terms matches.
- Changing the lag moves the windows and changes nothing else.
- Median income is `null` (not `0`) before 1984, and the page renders that as "no data."
- The export contains no party field in the blind payload.

---

## Payload: `scripts/export_econ.ts`

Writes two files to `SHIP_DIR`:

- `econ_blind.json` contains each term's metrics, baseline and shock notes,
  keyed by an opaque ID (`term-a`). No years, names or parties.
- `econ_terms.json` contains the full labeled record, for the reveal and the
  explorer. CC0, served CORS-open like `quiz_89R.json`.

---

## Pages: `scripts/build_economy_pages.mjs`

| English | Spanish | What's on it |
|---|---|---|
| `/economy` | `/economia` | Blind round. Needs `public/js/econ-blind.js` |
| `/economy/explore` | `/economia/explorar` | Labeled timeline. Static SVG, works without JS |
| `/economy/methodology` | `/economia/metodologia` | Sources, window convention, lag, what's excluded and why |

### Blind round

1. Show 8 to 10 terms, picked to cover both parties and a range of outcomes.
   **The selection rule is written on the methodology page and enforced in a
   smoke test,** the same way `selection.ts` governs the quiz items.
2. Each card reads "Term A": its metrics, its inherited baseline, and any shock
   note. No years, because years give the answer away.
3. The reader rates each term from 1 to 5. Before starting, they can optionally
   predict which party ran the economy better. Like the quiz's guess step, it's
   skippable and isn't counted until the marker moves.
4. The reveal shows who held each office, then compares the reader's ratings
   (and prediction, if given) with the record, and gives the research summary
   above.

### Explorer

- Terms drawn on a timeline, with a band for the president's party and lanes
  for House, Senate and Fed chair.
- A switcher for each metric. All three lag versions are pre-rendered as SVG;
  JS toggles between them, and without JS the page shows lag 0.
- Party colors use the same tokens as the quiz strip, with equal visual weight.

### `verify_site.mjs` additions

- `/economy` doesn't request `econ_terms.json` until the last rating is in.
- No text on the blind cards matches a year, a president's name or a party name.
- `/economy/explore` renders a chart with JS disabled.
- No off-origin requests, as on every other page.

---

## Guardrails

- No party scoreboard on any landing page or share card.
- Every metric is shown, including the ones that cut against each side.
  Deficits and inflation stay in.
- No causal wording. Use "during" or "while X held office," never "under X the
  economy grew because…".
- Every figure links to its FRED series or official source.
- The unexplained half of the gap is stated as plainly as the gap itself.

## Definition of done

- [ ] FRED pulls committed. Every series opened and checked by hand
- [ ] `econ_control.ts` checked against official sources, with a `Last reviewed:` date
- [ ] `npm test` passes with `econ.smoke.ts` registered
- [ ] Blind round, reveal and explorer pass `npm run verify` under the production CSP
- [ ] Spanish approved in `i18n/economy.json`
- [ ] Copy read for neutrality by one reader from each side
