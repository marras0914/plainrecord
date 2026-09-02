# Data Pipeline

Covers ingest, source reconciliation, and the item-selection rule. Consumed by
`scripts/fetch_legiscan.ts` and the scoring module.

---

## Item schema

```ts
interface VoteItem {
  id: string;          // LegiScan roll_call_id, stringified
  billId: string;
  session: string;     // "89R", "89-1" — see session naming below
  category: string;
  voteType: 'final' | 'third_reading' | 'second_reading' | 'amendment' | 'procedural';
  substantive: boolean;
  yeas: number;
  nays: number;
  votes: Record<LegislatorId, 1 | -1 | null>;
}
```

`voteType` and `substantive` must be assigned **at ingest**, not patched in
afterward. The scoring module trusts them.

`scripts/ingest_legiscan.ts` **drops** non-substantive roll calls rather than
carrying them with `substantive: false`. Carrying them means one flip of
`substantiveOnly` silently poisons every score, and they bloat a payload a static
site ships to the browser. An unrecognized roll-call description is classified
procedural, never substantive — silence beats a guess the scoring module will
then trust.

Positions held by people who are **not** legislators (a governor's veto, a
lieutenant governor's priority designation, a campaign platform) do not fit this
schema and must not be forced into it. They live in `evidence.ts` under an
explicit tier, and join to roll calls on `billId` only. See OPEN_QUESTIONS #2.

---

## Session naming

Texas legislates biennially. There is no regular 2026 session — 2025 is the 89th
Regular plus any specials. Key data files by session (`tx_bills_89R.json`,
`tx_bills_89-1.json`), never by year range. `tx_bills_2025_2026.json` will become
wrong and confusing the moment a special session is added.

---

## Sources

### LegiScan

**Access is manual only.** Verified 2026-09-01: `legiscan.com` sits behind
Cloudflare bot protection. A plain HTTPS fetch and a full headless Chromium with a
real browser user-agent both return `HTTP 403 / "Performing security
verification"`. No script can download from it, and the API documentation cannot
be read programmatically either. Log in with a real browser, download the session
archive by hand, unzip it, and point `scripts/ingest_legiscan.ts` at the folder —
that adapter takes a local directory precisely because nothing else is possible.

- Free public API tier requires a key (registration is free) and allows 30,000
  queries per month.
- Weekly bulk session archives are published as JSON/CSV snapshots. **Prefer bulk
  over pull for a static build** — a full session's roll calls burned through the
  pull interface wastes the monthly budget for no benefit.
- Vote encoding in the CSV exports: `1 = Yea, 2 = Nay, 3 = NV/Abstain, 4 =
  Absent/Excused`. Map 3 and 4 to `null`; do not conflate NV with Nay.
- **Person records reflect current status.** A legislator viewed in a prior
  session's context may show a different party, district, or role than they held
  at the time of the vote. Snapshot party/district per session at ingest rather
  than joining live.
- `change_hash` on bills and `person_hash` on people are the intended mechanism
  for detecting what needs re-fetching.

### Legislative Reference Library (lrl.texas.gov)

Two things the LRL provides that nothing else does:

- **Vetoes by session**, at `legis/vetoes/vetoesBySession.cfm?legSession=89-0`
  (`{leg}-0` is the regular session). A clean `table#tableToSort` of Bill /
  Caption, with line-item vetoes marked by a "Line item veto" suffix appended to
  the caption rather than a column — filter on that. `scripts/fetch_vetoes.ts`
  parses it and refuses to report zero vetoes when the table is simply missing,
  so a layout change fails loudly instead of silently emptying the dataset.
- **Official bill captions**, in that same table. These are neutral by
  construction and are a better starting point for item summaries than anything
  generated. See § Neutral summaries below.

Member profiles (`legeLeaders/members/memberdisplay.cfm?memberID=`) give sessions,
committees, and authored bills, but **not voting records** — do not plan around
them as a vote source.

### Open States (open.pluralpolicy.com)

The route that can actually be automated. Two feeds, both handled by
`scripts/ingest_openstates.ts`:

**A. Monthly Postgres dump — no account, no Cloudflare.**
`https://data.openstates.org/postgres/monthly/YYYY-MM-public.pgdump` (~10 GB;
the companion `postgres/schema/YYYY-MM-schema.pgdump` is 0.7 MB). Verified public,
`HTTP 200`. Restore it and run `scripts/openstates_extract.sql`, which emits CSVs
in the same shape as feed B so one adapter serves both.

**B. Per-session CSV export — free account.**
`open.pluralpolicy.com/data/session-csv/` (login required; free signup at
`/accounts/signup/`). Zip layout is `{state}/{session}/{state}_{session}_*.csv`.
Columns are defined by `openstates.org/bulk/management/commands/bulk_export.py`;
the vote vocabulary (`yes, no, absent, abstain, not voting, paired, excused,
other`) and the motion classifications come from
`openstates-core/openstates/data/common.py`. `paired` maps to `null` — a pair is
an offsetting agreement, not a position on the merits.

**Texas coverage differs between the two feeds.** Verified against the restored
dump: the Postgres dump carries 24 Texas sessions, 81st (2009) through 89th
(2025) including `85` (85th Legislature, 2017-01-13 .. 2017-06-01) — so
Hinojosa's first session IS reachable by route A. The session-CSV listing offers
only the 2017 *1st Called Session*, so route B is the one with the 85R gap.

**Session identifiers are inconsistent and must never be guessed.** Regular
sessions are bare numbers (`85`, `86`, `87`, `88`) but the 89th Regular is
`89R`; called sessions are `891`, `892`. `openstates_extract.sql` prints the
list and hard-fails on an unknown identifier for this reason.

**Known upstream date bug.** Session `87` (87th Legislature, 2021) carries
`start_date = 2019-01-08`, wrong by two years. The party-roster query tests
membership overlap against session dates, so this would yield a wrong roster.
The SQL asserts a session spans at most 200 days and refuses to continue
otherwise — a Texas regular session runs 140 days.

**The party gap.** Open States session exports contain **no party at all**.
`vote_people.csv` has `voter_id` and `voter_name`; `organizations.csv` describes
chambers and committees, not caucuses. So a roster must be supplied separately,
and `data.openstates.org/people/current/tx.csv` (public, no auth) carries
`current_party` — present-day party, which the snapshot rule below forbids
relying on. `ingest_openstates.ts` **refuses** a `current_party` roster unless
`--allow-current-party` is passed, and stamps `rosterIsCurrentParty: true` into
the output when it is. The clean fix is feed A: `openstates_extract.sql` resolves
party from `opencivicdata_membership` date ranges as of the session, and reports
any member with more than one overlapping party membership for manual review.

Either way, Open States is a scraper — a strong second opinion, never the
authority. The Journal reconciliation below still applies.

Note the roster does not need to come from here at all: a LegiScan session
archive's own `people.csv` is already scoped to that session, which is exactly the
snapshot-per-session requirement below.

### Texas Legislature Online (capitol.texas.gov)

The House and Senate Journals are **authoritative**. Texas members routinely file
statements correcting how a vote was recorded, and those corrections appear in the
Journal, not necessarily in third-party mirrors.

**Reconciliation is not optional.** Implemented: `journal.ts` parses the Journals,
`scripts/reconcile.ts` diffs them against the ingest and exits non-zero on any
unexplained member-level mismatch.

Journals are at
`journals.house.texas.gov/hjrnl/{session}/pdf/{SESSION}DAY{N}FINAL.PDF`. Extract
with **`pdftotext -layout -enc UTF-8`** — without `-enc UTF-8` every accented
surname is mangled (Anchía, Gómez, Muñoz, Rodríguez Ramos, González) and will not
resolve. Two further extraction quirks: the thin space in bill references renders
as the letter `i` (`HBi126`), and the member-list separator is an **em dash**
(U+2014), which a terminal displays as `--`.

### What the first run established (16 days of 89R, 903 record votes)

**The Journal is not a second opinion — it is the repair.** Zero
`member-vote-differs`: there is no case where both sources hold a position for a
named person and disagree. The scrape's problem is *omission*, not corruption.

**Open States loses 5.27% of all 89R person-votes** — `voter_id` is null across
176 distinct unresolved name forms against 175 resolved people. Causes, all
upstream scraper bugs:

- surnames truncated by one character: `Talaric` (248 votes), `Virdel`, `Simmon`,
  `Smithe`, `Wall`, `Goodwi`, `Hinojos`
- `Rodríguez Ramos` (3,518 votes) resolves to nobody, so a sitting member's entire
  record is absent from the ingest
- `Fischer` split off Martinez Fischer — **his whole record is missing** (851
  journal positions absent across 16 days alone)
- chair markers left glued on: `Harris(C`, `Vasut(C`, `Landgraf(C`
- list labels ingested as voters: `Present`, `Absent`, `Excused`, `Speaker`

James Talarico, one of the three covered candidates, is missing 122 positions
across those 16 days. This is why his coverage in `report_session.ts` was the
lowest of the three (67.6%) — it was a scraper artifact, not absenteeism.

### Statements of vote are common, and they are not corrections to apply

2,831 statements across 16 days. They are real and often blanket: on day 53
(147 record votes) Rep. Holt was excused for family illness and filed a statement
on 126 of them. Day 43, Record 162 (HB 126) has **Gina Hinojosa** recorded Nay
with a statement that she intended Yea.

`journal.ts` never rewrites a vote from a statement. The recorded vote is the
official act and stays the vote; the statement is attached so the UI can show
both. Flipping it silently would be inventing a record — the same failure as
getting it wrong, only flattering.

### Joining without a record-vote number

Open States carries **no** RV identifier for Texas: 0 of 6,471 events have an
`identifier` or a `bill_action_id`. So the join key is (bill, tally) — and a
tally is **not unique**. 26 of 1,778 bills have two or more House items with
identical Yea/Nay counts (SB 14 has two at 97Y/51N, second and third reading).
Taking the first match produced five bogus `member-vote-differs` on one record
that looked exactly like the worst-case finding but were purely a join artifact.
The reconciler now disambiguates on member-level agreement and emits
`ambiguous-match` — refusing to diff — when no candidate clearly wins.

### Backfill: the Journal as the source of member votes

`scripts/backfill_journal.ts` replaces member positions with Journal-sourced ones
wherever a record vote matches, and stamps `voteSource` on every item so an
unreconciled item can never pass for a reconciled one. Final 89R result:

| | |
| --- | --- |
| House items Journal-sourced | 3,454 of 3,546 (**97.4%**) |
| positions recovered | **28,250** |
| Yea/Nay flips vs the scrape | **1** (logged for review) |
| statements attached (never applied) | 9,320 |

**Four members had no record at all in the scrape and now have one:**
Trey Martinez Fischer 0 → 2,787, Ana-Maria Rodriguez Ramos 0 → 3,359,
Ann Johnson 0 → 3,008, Ken King 0 → 2,914.

After backfill, reconciliation reports **zero `member-missing` and zero
`member-vote-differs`**. What remains is the refuse-rather-than-guess category:
22 journal votes with no matching item, 7 unresolved names (all bill-prose
fragments, no people), 2 ambiguous matches. The single Yea/Nay disagreement —
Ana Hernandez on HB 127, Record 4094 — is written to `tx_flips_<session>.json`
for manual review rather than reported only as a count.

### Parsing the Journal: three traps that each cost a third of the data

**Anchor on the record marker, not the sentence.** Requiring
`"<bill> was <action> by (Record N)"` parsed only 2,755 of 4,169 record numbers.
It could not see `", as amended, was passed to engrossment by (Record N)"` (513
occurrences — the comma breaks `<bill> was`), `"The motion to table prevailed
by (Record N)"` (144, no "was"), or `"failed of adoption by (Record N)"` (78).
Matching `by (Record N): X Yeas, Y Nays` and then reading backwards for the bill
reference gets 4,041 with **zero tally mismatches** — the printed tally agrees
with the printed member list on every single record, which is the strongest
available check that the parse is right.

**The thin space renders as the letter `i`.** Not just in bill references
(`HBi126`) but inside member names: `"Perez, M."` becomes `"Perez,iM"`, which
resolves to nobody and silently costs Mary Ann Perez her vote.

**The member-list separator is an em dash**, which a terminal shows as `--`.
Matching ASCII hyphens produced eight record votes with perfect tallies and
completely empty member lists.

### Name resolution must refuse rather than guess

`resolveJournalNames()` matches journal surnames to roster ids and returns
unresolved names instead of guessing. It needs a **chamber filter**: Texas has
both a Rep. Gina Hinojosa and a Sen. Adam Hinojosa, and both a Rep. Ward Johnson
and a Sen. Nathan Johnson, so House Journal names must resolve against House
members only. Indexing is subtler than it looks, and getting it wrong caused the worst bug in
this whole pipeline. A three-token name is ambiguous on its face: "Charlene Ward
Johnson" has the compound surname *Ward Johnson*, while "Mary Ann Perez" has the
middle name *Ann* and the surname *Perez*. Nothing in the name distinguishes them.

An early version filed multi-word surnames under their last word as a fallback.
Because the journal prints **both** "Johnson" and "Ward Johnson", bare "Johnson"
fell back to Charlene and overwrote her real position with another member's vote
on 43 records — a wrong vote attributed to a named person, produced by the very
code meant to prevent that.

The fix uses the journal as evidence rather than a heuristic: index every
plausible surname form, then exclude a member from a short form when the journal
itself identifies them by a longer one. `Ward Johnson` resolves to Charlene;
bare `Johnson` refuses (Ann and Jarvis Johnson are both plausible); `Perez, M.`
resolves to Mary Ann.

A second tie-break helps where both candidates share one surname: prefer the
member the scrape observed voting this session. That resolves `Dutton` (Harold,
sitting, vs Jill, departed) and `Thompson` (Senfronia vs Ed). It must be paired
with the longer-form rule — on its own it was what mis-assigned `Johnson`.

**Build the roster from membership at the session MIDPOINT, not from overlap
with its edges.** This removed the need for any hand-curated alias. Open States
records 89R as starting 2025-01-10, but the House convened 2025-01-14 — and
Jarvis Johnson's and Tracy King's memberships both ended 2025-01-13. An
edge-overlap test admitted both, which made `Johnson` and `King` ambiguous and
cost two *sitting* members (Ann Johnson, Ken King) every vote in the session.
Testing membership at the midpoint yields exactly **150 lower + 31 upper = 181**,
the true size of the Texas Legislature, and both names then resolve uniquely.

The remaining duplicate surnames are genuine pairs the Journal disambiguates
itself, by initial (`Bell, C.` / `Bell, K.`) or by longer form (`Ward Johnson`,
`Garcia Hernandez`).

Every item's `id` should resolve to a public capitol.texas.gov roll-call URL for
`VoteBreakdown`.

---

## Procedural noise

The following will poison the signal if ingested as substantive:

- motions to table
- votes to suspend the rules
- local & consent calendar
- second reading where third reading also exists on the same bill
- members voting against their own bill to preserve reconsideration rights

The last one is not detectable from vote data alone. Where a bill's author votes
against it on final passage, flag for manual review rather than scoring it.

---

## Item selection

**Selection is where bias actually lives** — not in summary adjectives. Curating
30 bills authors the result no matter how neutral the prose is.

Implemented in `selection.ts` as a versioned literal, `SelectionRule`. Changing
selection means bumping `rule.version` and publishing the diff, not quietly
editing a threshold. `selectItems()` returns an `auditLog` — a line per category
with counts and per-item reasons for every hand edit — and that log is the
artifact to publish beside the item set. An `Override` without a `reason` throws.

`assertFloorsAgree()` checks the rule's eligibility floor against
`ScoringOptions`. They duplicate each other and must not drift: an item selected
for the quiz but dropped by the scorer is asked and then not counted, which
silently shrinks every score.

### The reserve, and why it is not a tuning knob

Ranking candidates by how much the chamber divided picks almost entirely
party-line votes, because those are the most divisive ones. Measured on a
synthetic 150-member chamber:

| `crossCuttingReserve` | cross-cutting share | marks at \|coordinate\| > 0.6 |
| --- | --- | --- |
| 0 | 0.0% | **100%** |
| 1/3 (default) | 33.3% | 67% |

With no reserve every answer lands at a pole and the blue/red plot is bimodal
*whatever anyone answers*. A voter with genuinely mixed, low-salience views
cannot read as purple, because no low-valence item was ever on the quiz. So the
reserve holds back a share of each category's slots for items where the chamber
divided but the parties did not.

This is the same failure as the flattering-purple problem in `valence.ts`,
arriving one stage earlier: there the risk was a summary that *invented* a middle,
here it is an item set that *forecloses* one.

When the reserve cannot be filled — a category with few cross-cutting votes — the
shortfall is reported per category and the slots are backfilled with partisan
items, with the backfill named in the audit log. If the whole set falls below 15%
cross-cutting, `partisanByConstruction` is set and **that belongs on the results
screen**: the quiz is then measuring the party axis and must not claim to have
looked for a middle.

Items whose valence cannot be computed (a caucus too thin to judge) are scoreable
but cannot be placed on the blue/red axis, so they fill slots last rather than
being mixed in silently.

## Neutral summaries

Describe legislative function, mechanism, and fiscal impact. No loaded adjectives.

If summaries are generated rather than hand-written, publish the generation prompt
and the diffs alongside the output, and accept PRs against summary text. The
process being inspectable matters more than any individual summary being perfect.
