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

**Their numbers and ours stay apart.** The paper stops at 2012, and the site
covers terms after that. Figures from the paper are quoted as the paper's,
with its window. Figures we compute, including any party average that reaches
past 2012, are labeled as the site's own arithmetic and never presented as
extending the paper's finding.

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

**Pulled 12 Nov 2026** (`npm run data:fred`, committed under `data/fred/`).
The script refuses to write unless FRED's metadata matches the table above on
frequency, start date and seasonal adjustment; all seven passed, and none has
a copyright line in its notes. Two things the computation has to handle:

- **October 2025 is missing** from both CPIAUCSL and UNRATE (FRED returns "."
  for that month, stored as `null`). FRED's notes give no reason. `econ.ts`
  must treat it as missing, never as zero, and the methodology page should
  explain it from a BLS source rather than from memory.
- **USREC marks recessions from the month after the peak through the trough**
  (its FRED title says so). Recession months per term are counted on that
  convention, and the methodology page says which one it is.

### Hand-curated: `econ_control.ts`

**Built 12 Nov 2026.** Who held each office from Truman's elected term (1949)
to the present. Typed, at the root, and sourced line by line, like
`stated_positions.ts`.

It holds four base tables, each transcribed from one official page, and
derives the per-term view from them with `buildTerms()`, so nothing is typed
twice:

| Table | Source |
|---|---|
| `PRESIDENCIES` | House Historian, presidents and coinciding Congresses |
| `HOUSE` (majority by Congress) | House Historian, party divisions |
| `SENATE` (stretches of control) | Senate Historical Office, majority and minority leaders, with its footnotes |
| `FED_CHAIRS`, `FED_VACANCIES` | Federal Reserve Board, board membership, 1914 to present |

```ts
export interface Term {
  id: string;                     // '1981-reagan-1', '1973-nixon-ford'
  start: string;                  // inauguration date, ISO
  end: string | null;             // exclusive; null for the term in progress
  presidents: { name: string; party: 'D' | 'R'; start: string }[];  // two when the office changed hands
  party: 'D' | 'R';
  control: { start: string; end: string | null; house: 'D' | 'R'; senate: 'D' | 'R'; note: string | null }[];
  fedChairs: { name: string; start: string; end: string | null }[];
  complete: boolean;
}
```

Senate control is taken from who organized the chamber (the majority leader's
party), not from seat counts. In the 83rd Congress Democrats at times held more
seats while Republicans kept control, and the header order on the Senate's own
party-division page does not reliably list the majority first.

**The appointing-party grouping, partly built.** A chair's first appointment
is derived (the president in office on the day the chair took office). Every
appointment from 1981 on is in `FED_APPOINTMENTS`, read from congress.gov's
nomination records: who sent it (the president in office on the day the
Senate received it) and when the Senate confirmed it, which is when it counts
as in force. That settles the cross-party renewals: Volcker by Reagan (1983),
Greenspan by Clinton (1996, 2000) and Bush (1992, 2004), Bernanke by Obama
(2010), Powell by Biden (2022). Two renewals before 1981 are still unsourced,
Martin from April 1955 and Burns from February 1974, and
`fedAppointingParty()` throws for dates after either until they are.

Two cases the obvious shape gets wrong:

- **Control can change mid-Congress.** The Senate went from R to D in June
  2001 when Jeffords left the Republican caucus. So control is recorded as
  stretches with start and end dates, not one row per Congress. A 50-50
  Senate is assigned to the Vice President's party, and the `note` says so,
  because that's a fact a reader might dispute.
- **Fed chairs are reappointed across party lines.** Greenspan was first
  appointed by Reagan and reappointed by Clinton; Bernanke by Bush, then
  Obama; Powell by Trump, then Biden. "The party that appointed the chair"
  means the most recent appointment in force on a given date, and the record
  keeps every appointment so the grouping can be audited. (These examples are
  from memory and are exactly what still needs a primary source; see above.)
- **The Fed chair can be empty.** The Board's table shows four gaps inside the
  window, the longest from 1 February to 7 March 1978 between Burns and Miller.
  They are listed in `FED_VACANCIES` and the smoke test fails if the table and
  the list disagree.

Every party flip and chair change is checked against the official page before
it goes in. Recent entries need the most care, so mark the file with a
`Last reviewed:` date the same way `stated_positions.ts` does.

### Hand-curated: `econ_context.ts`

One short, neutral, sourced note per major outside shock: the 1973 oil
embargo, the 1979 oil shock, the 2001 recession, the 2008 financial crisis,
COVID-19 and so on. **Say what happened, not who was at fault.** The notes
show on the blind cards because the research says those shocks explain a
large share of the gap.

On a blind card a note is worded by kind, not by name or date ("an oil
supply shock", "a global pandemic"). That doesn't make the card anonymous:
"a global pandemic" points at one term, and so do double-digit inflation and
unemployment together. **The blind round can't be fully blind for a reader
who knows the history, and the page says so** rather than claiming otherwise
(see the blind round below).

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
  and by the party of the Fed chair's most recent appointment, date by date.
  All are computed, but **only
  shown after a reader has finished the blind round** (or on the explorer page,
  which says up front that it's labeled).

### `econ.smoke.ts` checks

- Every quarter from 1949 to the latest data falls in exactly one term.
- Every term has a president, at least one control stretch and at least one Fed chair.
- Control stretches and chair tenures tile each term with no gaps or overlaps.
- The blind payload contains every completed term and no others: none dropped,
  and the term in progress left out.
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

1. **Show every completed term since 1949, about 19 of them.** No selection,
   so there's no choice to defend and none that could tilt the reveal. A term
   that changed hands mid-way within one party (Kennedy to Johnson, Nixon to
   Ford) counts as one term and the reveal names both presidents. Check how
   Blinder and Watson split those two terms, and if we differ, say so on the
   methodology page. The term in progress is left out until it ends;
   the explorer shows it, labeled as incomplete.
2. Cards come in a random order for each reader, so a reader who stops early
   hasn't seen only one era. The reveal covers the terms they rated and says
   how many that was.
3. Each card reads "Term A": its metrics, its inherited baseline, and any shock
   note. No years, because years give the answer away.
4. Each card has an optional "I think I know which term this is" box. The
   reveal reports ratings for recognized and unrecognized terms separately,
   because a rating given to a term the reader recognized isn't a blind
   judgment.
5. The reader rates each term from 1 to 5. Before starting, they can optionally
   predict which party ran the economy better. Like the quiz's guess step, it's
   skippable and isn't counted until the marker moves.
6. The reveal shows who held each office, then compares the reader's ratings
   (and prediction, if given) with the record, and gives the research summary
   above.

### Explorer

- Terms drawn on a timeline, with a band for the president's party and lanes
  for House, Senate and Fed chair.
- A switcher for each metric. All three lag versions are pre-rendered as SVG;
  JS toggles between them, and without JS the page shows lag 0.
- Party colors use the same tokens as the quiz strip, with equal visual weight.

### `verify_site.mjs` additions

- `/economy` doesn't request `econ_terms.json` until the reader asks for the reveal.
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
