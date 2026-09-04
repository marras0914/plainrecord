# PlainRecord — rightnleft.com

A blind quiz on **real Texas House roll calls**. You answer bills without being
told which party took which side; only afterwards does the page show where you
landed, which legislators you actually agree with, and where Texas ranks on the
outcomes tied to those categories.

Every question is a vote that happened. Every number on the screen traces to a
roll call, a veto, or a cited statistic. Nothing is generated to fill a gap.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 176 checks across 6 suites
npm run build        # -> dist/  (~154 KB)
npm run preview      # serve the build on :4173
```

`npm run build` runs `tsc --noEmit` first, so a type error fails the build rather
than shipping.

## What ships, and what doesn't

The site is fully static — no server, no API, no database at runtime.

```
public/data/quiz_89R.json        53 KB   the entire quiz payload. SHIPPED.
data/tx_evidence_vetoes.json    117 KB   279 Abbott vetoes, 84R-89R, each with
                                         its LRL source URL. COMMITTED but not
                                         shipped — npm test needs it.
data/tx_bills_89R.json           35 MB   \
data/tx_reconcile_89R.json       16 MB    > bulk build inputs. GITIGNORED.
data/tx_roster_89R.json, ...            /
```

`scripts/paths.ts` is the single source of truth for that split (`WORK_DIR` vs
`SHIP_DIR`). It exists because Vite copies `public/` verbatim: with the working
files in there, `dist/` was 52 MB of data nobody downloads. Anything a script
writes as an intermediate goes in `WORK_DIR`. Only `export_quiz_data.ts` writes
to `SHIP_DIR`.

The payload is served CORS-open at `/data/quiz_89R.json` on purpose. A civic tool
that asks you to trust its numbers should let you take them.

## Licence

**Data and prose: CC0.** **Code: MIT.** See [LICENSE](LICENSE).

The split exists because the repo holds two different kinds of thing. CC0 covers
the payloads, `i18n/copy.json`, and the parts of them that are original work
rather than public record: the plain-language bill descriptions, the outcome
caveats, the causal note, the computed valences, the selection rule. MIT covers
the site, the estimator and the pipeline.

Two things CC0 is *not* doing. The official bill captions were copied verbatim
from the Texas House record and were never this project's to license, and the
roll-call votes are facts, which carry thin-to-no copyright in the US anyway
(*Feist v. Rural Telephone*). CC0 removes doubt about the layer that is original;
it does not claim the layer that was already free.

And the one thing no licence can do: every outcome figure ships with a caveat
because most of them need one. CC0 means a figure can be reused without the
sentence that qualifies it. The LICENSE asks that it isn't, and the page asks
too — a request, not a condition, because CC0 cannot make it one and saying
otherwise would misdescribe the licence.

## Deploying

Two configs are here; **use one, not both**.

### Vercel

```bash
npx vercel            # first run links the project
npx vercel --prod
```

`vercel.json` sets the build command, `dist` as output, long-lived immutable
caching on the fingerprinted `/assets/*`, and a CSP.

### Netlify

```bash
npx netlify deploy --prod
```

`netlify.toml` is the equivalent, pinned to Node 22.

### The CSP is tight on purpose

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';
form-action 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'
```

Google Fonts is the only third party the page touches. `script-src 'self'` with
no `unsafe-inline` means an analytics snippet or embed pasted in later will fail
loudly in the console instead of quietly shipping a tracker on a page about
public records. If you *want* one, widen the policy deliberately.

The build is verified against these exact headers, not just against `vite
preview` — see [Verifying a build](#verifying-a-build).

### One-file share build

```bash
npm run build:artifact     # -> share/artifact.html  (~91 KB, no external assets)
```

Flattens `dist/` into a single self-contained page **outside `dist/`**: the stylesheet becomes a
`<style>`, the module bundle an inline `<script>`. It is a *transform of the real
build*, never a separate copy — hand-maintaining a second inline version is how a
copy rewrite once landed in the shared page and not in the site. Two rewrites are
deliberate and logged by the script: the payload link becomes absolute (the
single file has no `/data/` next to it) and the `— PlainRecord` title suffix is
dropped so republishing never renames the artifact.

The shareable copy lives at
<https://claude.ai/code/artifact/8d8b86ed-6170-4dd3-9da8-7d9ebb8126a9> (private
until shared from that page). Republish to **that URL** rather than creating a
new one, or the link you have already handed out goes stale.

### The share card

```bash
npm run build:og                      # both cards
node scripts/build_og.mjs --locale es # just the Spanish one
#   -> public/og.png     1200x630, ~61 KB  (English)
#   -> public/og.es.png  1200x630, ~74 KB  (Spanish)
```

`public/og.png` is committed, and **not** wired into `npm run build` on purpose:
the card is rendered by headless Chromium and pulls IBM Plex from Google Fonts,
so putting it in the build path would make every Vercel deploy depend on
Playwright browsers and on a font CDN. It only needs re-running when the payload
numbers change — after `npm run data:export`.

Every figure on the card is read out of `public/data/quiz_89R.json` at build
time, never typed into the template, because a share card is the most
screenshotted surface here and a stale number on it outlives any correction made
on the page. The script fails rather than warns on the two mistakes that are
invisible in review: a missing webfont (Chromium silently falls back to
system-ui) and an off-spec canvas (anything but 1.91:1 gets re-cropped by
Facebook and LinkedIn).

Both cards are rendered from one template, with every word from `i18n/copy.json`
and every figure from the payload. The Spanish page points `og:image` at
`og.es.png`: a rendered image cannot have a translated caption, and a Spanish
`og:title` over a picture reading "The Purple Strip" is a half-translation that
is invisible on the page and only shows up when somebody shares the link.

**The axis labels are measured, not eyeballed.** All three sit at fixed x
positions on a 1072px axis, and "COINCIDIÓ CON LOS REPUBLICANOS" is 30
characters where "AGREED WITH REPUBLICANS" is 23. The script asserts the
rendered boxes do not touch — English clears by 215/191px, Spanish by 108/84px,
and nothing in the copy file would have shown that.

The dots are spread evenly across the whole axis, poles included. That is a
constraint, not a placeholder — a scatter bunched at the centre would be the card
asserting "Texas is purple" before the reader has answered anything, which is the
one conclusion this project does not hand out for free.

## Spanish

```bash
npm run i18n:review        # copy.json -> i18n/review.html, the reviewer's sheet
npm run i18n:gen           # copy.json -> src/copy.gen.ts (typed keys)
npm run i18n:check         # structure, staleness, and sidecar coverage
npm run i18n:sidecar       # just the payload sidecar
```

English is `/`, Spanish is `/es`. Both are static HTML emitted from one
template by `scripts/build_locales.mjs`, which runs as part of `npm run build`.

**Copy lives in two places, split by what owns it.** `i18n/copy.json` holds the
site's own words — 190 keys, both locales, with per-string context and the
placeholder contract. `public/data/quiz_89R.es.json` holds the prose the
*payload* carries: outcome labels and caveats, the comparator rule, why each
headline bill was chosen, an opponent's reason for having no votes. That split
exists because the second set is keyed by item and cannot live in a flat table,
and because keeping it out of `quiz_89R.json` leaves the English payload
byte-identical — the page promises it is "the exact file this page loaded".

### The official captions stay in English

All 67 of them, on both pages, carrying `lang="en"` so a screen reader switches
voice. The page promises every question is the bill's official summary copied
word for word, and a Spanish translation of an official English caption **is not
the official caption** — it is a paraphrase by an interested party, on the one
page whose value is that it does not paraphrase. `captions` in the sidecar is
asserted empty by `npm run i18n:sidecar`. The Spanish page says so on screen.

### What is checked, and why each check exists

| Check | Catches |
|---|---|
| placeholder sets | a translator renaming or dropping `{n}`, which renders a literal brace to a reader. Position is free — Spanish word order moves them |
| diacritics | the first draft had none at all; `campana` is a bell, `senal` is not a word |
| `copy.gen.ts` staleness | editing copy.json and shipping yesterday's wording |
| sidecar coverage, both ways | payload prose with no Spanish, and Spanish for a label the payload no longer has |
| figures carried across | `$13,189` surviving translation unchanged — the one error a reader cannot detect |
| English-chrome leak on `/es` | a render path that was missed |
| the leak phrases themselves | the leak test going vacuous. `innerText` applies CSS `text-transform`, so six of nine phrases were absent from the *English* page too until the comparison was made case-insensitive |
| typed, not filled | the district panel rebuilding its own input on every keystroke. Focus went to `BODY` after one digit, so only districts 1-9 were reachable. Playwright `fill()` sets a value in one action and passed against that build; `keyboard.type()` plus an `activeElement` assertion fails against it |
| exact labels, not substrings | a negative assertion that cannot fail. `!/\b0% of this ZIP/` never matches inside "100% of this ZIP" because there is no word boundary mid-number, so the check passed against a card that rendered both labels. It now compares the share strings exactly |

### Gates

`build_locales.mjs` will not emit `/es` unless every string is approved and the
sidecar exists. Spanish headings over English payload sentences read as machine
output on a site whose whole argument is that it is careful, so half-translated
is treated as worse than English-only. `--force` overrides it for local review.

A missing sidecar is reported but does **not** fail the build: it blocks Spanish,
it does not make the English page wrong.

### Known follow-ups

Spanish *aid* renderings for the 67 captions — shown beside the English record,
never instead of it — are an enhancement nobody is blocked on.

### One bundle per language

`npm run build` runs vite **twice**, once per locale, and each bundle carries
only its own strings. Measured:

| | raw | gzip |
|---|---|---|
| both languages in one bundle | 170.2 KB | 51.3 KB |
| English only | 128.8 KB | **36.0 KB** |
| Spanish only | 152.2 KB | **45.5 KB** |

The Spanish bundle is larger because it carries the 22.5 KB payload sidecar,
which the English one now drops entirely.

**Two separate exports, not one `{ en, es }` object.** Rollup drops an
unreferenced top-level const whose initialiser is a pure object literal; it
cannot drop a *property* of an object that is itself referenced. `copy.gen.ts`
therefore emits `EN` and `ES` as independent bindings and `src/i18n.ts` picks
between them on `__BUILD_LOCALE__`, which vite folds. The same trick gates the
sidecar import in `src/payload-i18n.ts`.

`__BUILD_LOCALE__` is read through a `typeof` guard because `npm test` and the
CLI report scripts import these modules **outside vite**, where a bare read is a
ReferenceError — it crashed two suites before the guard went in. vite replaces
the identifier textually, so the guard folds away and costs no tree-shaking.

The Spanish build goes to a temporary `.locale-es/` because `emptyOutDir` would
otherwise have it wipe the English one; its assets are then merged into
`dist/assets/`, which is safe only because filenames are content-hashed. Three
checks guard the result: that the two pages load *different* bundles, and that
neither contains a phrase from the other language. A shared bundle would render
both pages correctly and buy nothing, which is exactly the kind of failure that
survives review.

## Pointing rightnleft.com at it

The domain is **registered at Squarespace**. You are moving DNS only; the
registration stays put.

### Vercel

1. Vercel → project → **Settings → Domains → Add** → `rightnleft.com`.
   Add `www.rightnleft.com` too, but leave its **Redirect to** field alone —
   the `www` → apex redirect lives in `vercel.json`, not in the dashboard.
   See [The www redirect](#the-www-redirect).
2. Vercel shows the target records. Squarespace → **Domains →
   rightnleft.com → DNS → DNS Settings**.
3. Delete the Squarespace parking/default records for `@` and `www`
   (Squarespace points these at its own site by default — leaving them means
   intermittent resolution to the wrong host), then add:

   | Host  | Type | Value          |
   |-------|------|----------------|
   | `@`   | A    | `76.76.21.21`  |
   | `www` | A    | `76.76.21.21`  |

   Both are A records. Vercel used to hand out `CNAME www -> cname.vercel-dns.com`
   and much of the internet still says so; what it actually printed for this
   project was an A record for `www` as well. Take the values from
   `vercel domains inspect rightnleft.com`, not from memory or from a blog post.

   **Do not** take the "change your nameservers to `ns1/ns2.vercel-dns.com`"
   option unless you have checked the domain's MX records first. That moves *all*
   DNS off Squarespace, email included, and any mail on the domain stops.
   The two A records leave everything else where it is.
4. Back in Vercel, wait for **Valid Configuration**. TLS is issued automatically
   once DNS resolves.

### The www redirect

Both hostnames resolve to Vercel and both serve the site, so without a redirect
the same page answers on two URLs and every share splits its canonical address.
The rule is in `vercel.json`:

```json
"redirects": [
  {
    "source": "/(.*)",
    "has": [{ "type": "host", "value": "www.rightnleft.com" }],
    "destination": "https://rightnleft.com/$1",
    "permanent": true
  }
]
```

It is here rather than in **Settings → Domains → www → Redirect to** on purpose.
The dashboard field was set three times and never took effect — the edge kept
returning `404` from the static router on `www`, with no `Location` header at
all, while the dashboard appeared to show the redirect. In `vercel.json` the rule
is in git, is reviewable, ships atomically with the deploy that needs it, and
cannot silently revert to a state nobody can read back. The CLI cannot inspect
the dashboard field (`vercel domains inspect` and `vercel project inspect` both
omit it), which is what made the failure so expensive to diagnose.

**`source` is `/(.*)` and not `/:path*`.** This is the whole ballgame. `:path*`
compiles to `^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?$`, whose leading slash sits
*inside* the optional group — so it needs at least one path segment and does not
match `/`. The homepage, the most-shared URL on the site, would have fallen
through and gone on answering `200` on `www` while every sub-path redirected
correctly. `/(.*)` compiles to `^(?:/(.*))$` and matches `/` with an empty
capture.

Verify the compiled route rather than the source, because the source looks right
in both cases:

```bash
npx vercel build --yes
node -e 'console.log(JSON.stringify(require("./.vercel/output/config.json").routes.filter(r=>JSON.stringify(r).includes("www.")),null,2))'
```

Trailing-slash and `.html` URLs on `www` take two hops: `cleanUrls`/
`trailingSlash` normalise first and stay on `www`, then this rule moves to the
apex. The final destination is correct either way.

Once deployed, test it on a path that has never existed:

```bash
curl -sI "https://www.rightnleft.com/zz-$RANDOM" | head -1     # want: 308
```

Do **not** test `https://www.rightnleft.com/`. The homepage is a cache `HIT` with
an `Age` in the thousands, and a query string will not bust it — Vercel drops
query params from the cache key for static files, so `?cb=123` returns the same
stale `200` and reads as a failed redirect.

### Netlify

Same shape: `@` → A `75.2.60.5`, `www` → CNAME `<site>.netlify.app`. Or move the
nameservers to Netlify DNS and skip the records entirely.

### Checking it took

```bash
npm run dns:check                                  # rightnleft.com
node scripts/check_domain.mjs --domain other.com   # anything else
```

Do not judge this by a status code. While the domain still points at Squarespace's
parking page, `curl -o /dev/null -w '%{http_code}' https://rightnleft.com` returns
**200** — valid TLS, no errors, and completely wrong, because it is someone else's
"Coming Soon" page. `dns:check` reports *who* is answering: the resolved A records,
the `Server` header, the `x-vercel-id`, our own CSP, and the page title compared
against the known-good origin.

Propagation is usually minutes, but Squarespace's TTL can hold the old answer for
up to 48 hours. A stale parked page is cached DNS, not a failed deploy — confirm
with `dns:check` before changing anything.

## Verifying a build

`npm test` covers the data pipeline, scoring, valence, selection, and evidence
rules. It does **not** cover the rendered page, so there is a second pass:

```bash
npm run build
npm run preview                              # in another shell
node scripts/verify_site.mjs                 # against vite preview
node scripts/verify_site.mjs --with-headers  # against dist + the real vercel.json headers
```

The second form matters: a CSP that blocks your own page looks fine under
`preview` and breaks only in production. It asserts, in a real browser:

- the page boots in 7-issue mode on SB 2, with the reason for the pick shown
- outcome statistics stay hidden until something is answered (showing a state
  ranking before the vote would steer the answer)
- the three demo presets each produce the profile they exist to demonstrate
- switching to full mode rescopes the provenance footer to all 67 items
- indicators link to a live source URL, and the table view exposes the
  R-Yea / D-Yea / valence columns
- **zero console errors**, which is also how a CSP violation surfaces

Preset assertions test *properties*, not captured digits — the item count moves
legitimately when a headline bill is force-added, and pinning an exact lean
turned a correct build red once already.

## Rebuilding the data

Only needed to add a session or refresh vetoes; the shipped payload is committed.

```bash
npm run data:vetoes      # LRL veto lists -> data/tx_evidence_vetoes.json
npm run data:ingest      # Open States bulk -> data/tx_bills_89R.json + roster
npm run data:reconcile   # cross-check against the House Journal
npm run data:backfill    # recover member votes the bulk export dropped
npm run data:export      # -> public/data/quiz_89R.json   (the only shipped file)
npm run data:acts        # add opponent actions to an already-built payload
npm run data:report      # coverage + provenance summary
npm run data:members     # -> public/data/members_89R.json  (the district lookup)
npm run data:zips        # -> public/data/zips_89R.json     (ZIP -> districts)
```

`data:export` takes arguments the npm script does not supply — it needs the
LegiScan people/bills CSVs, which are gitignored and not in the repo:

```bash
npx tsx scripts/export_quiz_data.ts 89R <bills.csv> <people.csv>
```

`DATA_PIPELINE.md` documents each stage and the failures that shaped it — the
5.27% of 89R votes Open States loses to truncated names, the em dash in the
Journal's member lists, the surname collision that overwrote a real member's
record. Read it before touching an ingest.


### The district lookup

`npm run data:members` builds `public/data/members_89R.json` — every 89R House
member, their district and party, and how each voted on the same 67 items the
quiz asks about. 30.4 KB raw, 10.7 KB gzipped, fetched only when a reader types
in the panel, never on page load.

Votes are stored **positionally**: one character per item, `y` / `n` / `.`,
aligned to the payload's `itemOrder`. That is what makes the file small enough
to ship, and also what makes it fragile — a reordered `itemOrder` silently
reassigns every vote to the wrong bill. So `npm run data:members` refuses to
write unless the order matches the shipped payload exactly, and
`scripts/check_members.mjs` re-asserts it on every `i18n:check`.

The check that earns the most trust is the overlap one: the payload already
carries full roll calls for 9 members, so 603 individual votes can be compared
between the two files. They agree. And because district 47 is Vikki Goodwin, who
is also one of the three candidates, `verify_site.mjs` scores her through both
code paths and asserts the same number comes out — the district panel and the
candidate cards make the same claim or the build fails.

Four members who cast votes in 89R are **excluded**: they are in the roll calls
but not in Open States' *current* roster, and the retired roster 403s. The panel
says so on screen rather than quietly rounding 149 up to 150.

A member with zero of the 67 votes reports an absence, not a band. Without that,
the estimator files them under "no clearer than chance", which reads as a
finding about the member instead of missing data.

### ZIP codes, and why they cannot give one answer

`npm run data:zips` builds `public/data/zips_89R.json` — 1,992 Texas ZIPs mapped
to the House districts they touch. 38.9 KB raw, 12.4 KB gzipped, fetched only
when a reader types five digits.

**ZIP codes and House districts do not nest, in either direction.** 54% of Texas
ZIPs sit inside one district and get a straight answer; the other 46% span two
to five, because a district boundary runs down a street somewhere in the ZIP. So
the panel does not pick the largest share and present it as the answer — for a
ZIP like 78704, split 52/48 between HD-49 and HD-51, that would be wrong for
nearly half the people who live there. It lists every district the ZIP touches
with its share and asks the reader to choose, and points at the state's
address-level lookup for an exact answer.

Nothing official maps a ZIP to a state legislative district. The Census
publishes ZCTA-to-congressional-district, and district-to-county and
district-to-tract, but not this pair. It is derived through 2020 Census
tabulation blocks, which nest inside both a ZCTA and a district — so it is an ID
join, not a polygon intersection, and cannot produce boundary slivers at all. A
spatial intersect would report every district whose edge merely grazes a ZIP,
indistinguishably from real overlap.

Two things guard it, and the weaker one came first:

- **Anchors.** Seven downtown ZIPs whose member is externally known — 78701 is
  Gina Hinojosa's, 79901 is Vince Perez's, 78205 is Diego Bernal's. Nothing
  derived from the crosswalk, so it cannot be circular.
- **The map, pinned by hash.** The anchors turned out to be a poor detector of
  the thing most likely to go wrong. Rebuilt on the 2020 pre-redistricting
  assignment file, the crosswalk failed exactly **one** anchor — downtown
  Dallas, HD-108 instead of HD-114 — even though a third of Texas blocks sit in
  a different district between the two maps. Redistricting preserves urban
  cores, which is exactly where the recognisable anchors are. So
  `check_zips.mjs` pins the sha256 of the district file, which is exact.

There are two plausible Texas SLDL files and only one is right. The 2020 Block
Assignment File carries the pre-redistricting map; 89R ran on the 2021-enacted
one, published as the 2022 block equivalency file. (Texas's 2025 mid-decade
redistricting was **congressional** — the House map is unchanged.) Getting this
wrong misassigns a third of the state while every structural check still passes,
which is why it is the hash rather than the anchors that stands guard.



### One re-export is pending

`crossCuttingOf` is emitted by the exporter but is **not in the committed
payload**, which predates it. It is typed optional for that reason. The next
`data:export` fills it in; nothing on the page reads it either way.

It exists because `crossCuttingShare` is computed inside `selectItems()` over
`sel.selected`, and `export_quiz_data.ts` then *mutates that same array* by
appending the hand-picked headline bills. So the shipped share is `19/60` while
`items` holds 67 — and `provenance.selectedJournalSourced`, in the same object,
is counted after the push and is over all 67. Two denominators, one payload,
nothing labelling either.

Recomputing the share over 67 would be the wrong repair. It is a diagnostic on
the *selection rule* — `partisanByConstruction` trips below
`PARTISAN_BY_CONSTRUCTION_THRESHOLD` — and the headline bills are hand-picked
precisely because they are the big fights, six of the seven splitting the parties
sharply. Folding them in would drag the share down and report the rule as
partisan-by-construction on the strength of items the rule never chose. So the
number stays and the denominator ships beside it, the exporter throws before
writing if the two drift, and the console line prints the ratio rather than a
bare percentage.

## Ground rules this codebase enforces in code, not just in prose

- **Votes are never fabricated.** No position is attributed to a named person
  without a roll call, a veto, or a cited act behind it.
- **Stances are never scored.** A campaign platform is `tier: stance` and is
  displayed as text. `assertComparable()` throws on a cross-tier comparison.
- **One-sided records can't become agreement scores.** A veto list is all
  opposition; `Coverage.oneSided` refuses to turn it into a match percentage. The
  page shows Patrick's and Abbott's action on a *named bill* and never a rate over
  their lists — a priority list contains only bills its author wanted passed, so a
  percentage over it would measure the press release, not the positions.
- **Absence is not a position.** Texas governors let bills become law unsigned,
  so the lack of a veto is never read as support.
- **No causal claims.** Outcome indicators show a ranking, a recorded act, and a
  tenure length, side by side. `CAUSAL_NOTE` states plainly that the page is not
  asserting one caused the other, and `DELIBERATE_OMISSIONS` records the
  categories left blank rather than filled with a weak proxy.
- **Hand curation is logged with a reason.** `selection.ts` `Override` throws if
  constructed without one.

## Known gaps

- Only the **89th regular session** is loaded. Hinojosa's 85R record and
  everything before 86R is missing.
- Six categories have no outcome indicator yet (Public Safety, State & Local
  Government, Military & Veterans, Arts). Transportation and Religion are
  deliberately blank — see `DELIBERATE_OMISSIONS`.
- No `og:image`, so shares render as a text card.
- Importance multipliers are plumbed (`ImportanceMap`) but nothing sets them.
  See `OPEN_QUESTIONS.md` #4.
