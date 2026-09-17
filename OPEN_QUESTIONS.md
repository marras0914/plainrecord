# Open Questions

Roughly in order of how much they change the product.

**Reviewed 2026-09-15.** The measured answers below are unchanged and still
worth reading; what had rotted was their STATUS. Several things this file called
open had shipped weeks earlier, and question 2's "still open" items described a
ballot page the product does not have. A stale map of what is unfinished is
worse than no map, because it sends the next person to work that is either done
or impossible.

**What is genuinely open now is at the bottom, under "Open as of September".**
Read that first if you are picking up work.

---

## 1. Is the roll-call matrix effectively one-dimensional? — MEASURED, and no

**Run 2026-09-01 against real 89R data** (Open States Postgres dump, 587,927
individual votes, 2,259 eligible items, House items only):

| | share of variance |
| --- | --- |
| PC1 | **42.1%** |
| PC2 | 9.1% |
| PC3 | 2.3% |

Far below the ~85-90% alarm line this question was written around. One axis
dominates — PC1 is 4.6x PC2 — but it does not swallow the matrix, so an alignment
score over the Texas House is **not** merely re-deriving the party label.

**Caveat on the yardstick, which matters as much as the number.** The 85-90%
figure the legislative-scaling literature reports is usually *correct
classification* of individual votes by a one-dimensional model, not the variance
share of a mean-imputed covariance matrix. These are different quantities and the
second is routinely much lower. So 42.1% should not be read as "less
one-dimensional than Congress"; it should be read as "on this metric, one
component does not account for the data." Before leaning on it publicly, either
re-measure with a classification metric or restate the threshold in
`analyze_dimensions.ts` to match what it actually computes.

Corroborating evidence from a completely different direction: 51.5% of eligible
89R items have |valence| < 0.4, i.e. the two caucuses did *not* strongly divide on
half the record votes. A chamber whose votes were purely partisan could not
produce that.

**Consequence:** the up-weighting of PC2 items this question proposed is not
needed as a rescue. What replaced it is `selection.ts`'s `crossCuttingReserve`,
which keeps low-valence items on the quiz by rule rather than by tuning.

## 2. Opponents have no roll-call record — ANSWERED, and it is worse than written

**Resolved 2026-08-31.** This was filed as "challengers have no voting record."
The real situation in all three target races is that the *incumbent on the other
side* never had one.

| | Chamber | Sessions with recorded votes |
| --- | --- | --- |
| Hinojosa | TX House 49 | 85R–89R (2017–2025) |
| Goodwin | TX House 47 | 86R–89R (2019–2025) |
| Talarico | TX House 52/50 | 86R–89R (2019–2025) |
| Abbott | — | **none, ever** (judge → TX Supreme Court → AG → Governor) |
| Patrick | TX Senate 7 | 80R–83R (2007–2015) |
| Paxton | TX House 70, TX Senate 8 | 78R–83R (2003–2015) |

Paxton's last vote precedes Hinojosa's first by a full session. **Item overlap
between the Democrats and their opponents is zero bills.** No data source fixes
this; executives do not produce roll calls.

The chosen answer is the third option this question listed — substitute a
different signal — with the "unmissable distinction" requirement enforced in code
rather than in copy. See `evidence.ts`:

- **Tier 1 `vote`** — a roll call on a specific bill.
- **Tier 2 `act`** — an official action on a specific bill. Joins on `billId`
  exactly as a roll call does. Abbott: 279 vetoes, 84R–89R, 272 non-line-item
  (230 inside Hinojosa's tenure, 180 inside Goodwin's and Talarico's). Patrick:
  25 designated priority bills for 89R.
- **Tier 3 `stance`** — a stated campaign position. No bill, never scored.

`assertComparable()` throws on any cross-tier comparison and on any attempt to
score tier 3 at all. `coverageFor()` reports `sidedness`, and both tier-2 records
are **fully one-sided by construction** — a governor only vetoes what he opposes,
and only designates priorities he supports — so `scoreableEvidence()` drops all
three Republicans rather than producing a flattering number from a one-sided
sample.

**Both of this question's former "still open" items are MOOT, closed 2026-09-15.**
They asked whether Paxton should appear on the ballot page, and said Mike
Collier needed researching before a race could be covered two-thirds. **There is
no ballot page.** No opponent is named anywhere in the shipped copy — grep
`Abbott`, `Patrick` or `Paxton` in `i18n/copy.json` and each returns zero.
(The OFFICE appears: some `why` lines end "Lt. Gov. priority bill", which is
why those lines are gated behind the answer. An office is not a candidate,
and a reader who infers the holder has inferred it, not been told it.) The
evidence-tier design was built and then solved in prose instead:

- `method.bothSides` puts sitting members of both caucuses under every question,
  scored on the same items as the candidates.
- The opponent's tier-2 mark appears per question where one exists: "On {acts}
  of the {items} there is a recorded action on the exact bill: a veto, or a bill
  named a must-pass priority. We show it under that question and we never add it
  to a tally."
- The authorship card states the asymmetry outright: "Their opponents cannot be,
  so this page gives them no score at all rather than an invented one."

So the bias this question worried about is disclosed rather than designed
around. Reopen it only if a ballot page is ever built; until then there is no
race being covered two-thirds, because no race is being covered at all.

(The only `Collier` in the shipped data is Nicole Collier, the sitting member
for HD-95. Not the same person.)

## 3. What the score is called in the UI — MOSTLY ANSWERED

`describeScore()` returns phrase bands rather than percentages, deliberately.

**The half this question asked for is shipped.** The bands carry their own
meaning and the middle one is explicit: `score.chance` reads "No clearer than
chance either way", which is exactly the "0 means chance, not never agreed" this
asked for. The six bands run `almostAlways`, `moreOften`, `leansToward`,
`chance`, `leansAgainst`, `againstAlways`.

**Still missing, and it is small:** nothing states plainly WHY the result is not
a percentage. `axis.alignment` labels the axis ("how much does this legislator
vote with you") without explaining that a percentage would imply a precision the
estimator does not have. One sentence, and it needs a Spanish review like
anything else.

## 4. Importance multipliers

`ImportanceMap` is plumbed through the estimator but nothing in the UI sets it.
Open: does the user weight categories, individual items, or nothing at all?
Per-item weighting adds friction to a quiz whose main virtue is that it's fast.

## 5. Redundancy threshold is unvalidated — PARTLY ANSWERED

**Measured 2026-08-31** on a synthetic 150-member chamber, before real data: at
threshold 0.9, **single-link clustering merges the entire partisan dimension into
one cluster.** Party-line votes genuinely correlate above 0.9 with *each other* —
they are all the same latent axis (question 1) — so all 10 test items merged and
each fell from a discrimination of 0.97 to a weight of **0.097**, while an
uncorrelated cross-cutting item kept **0.998**. A single off-axis vote outweighed
a party-line vote 10 to 1.

For the alignment score that dilution is arguably defensible. For the red/blue
profile it is fatal — it suppresses exactly the answers carrying partisan signal
and pushes every profile toward a falsely purple reading. `valence.profileWeights()`
therefore narrows the correction to its original intent, near-duplicate roll calls
**on the same bill**, and leaves cross-bill correlation alone. Dimensional
structure is signal, not redundancy.

Still to check against real 89R data: whether obvious second/third-reading pairs
actually clear 0.72, and whether unrelated bills merge.

## 6. Bill categories — ANSWERED

**Built 2026-09-01** in `categorize.ts`, derived from a published scheme as this
question asked rather than invented: the **Texas Legislative Reference Library
subject index**, which Open States carries verbatim on every bill. All 11,503 89R
bills carry subject terms.

The index distinguishes term types by code. `I####` terms are subjects
(`"Education--School Districts (I0220)"`); `V####` are the agencies involved
(`"COMPTROLLER OF PUBLIC ACCOUNTS (V2608)"`). Only I-coded terms are used — an
agency says who administers a bill, not what it is about. Taking the segment
before the first `--` collapses to **107 roots**, mapped to **20 categories** by a
versioned table, with **100% of root occurrences covered** and any unmapped root
reported rather than swept into "Other".

Two decisions worth knowing:

- **Ceremonial bills are excluded.** `Resolutions` is the largest single root in
  89R (2,445 bills), and a congratulatory resolution is not a position on
  anything. Left in, the quiz's biggest category would have been ceremonial.
- **Rarest-category-wins** when a bill carries several. Preferring the most common
  would push everything into the big buckets — an education funding bill that
  amends a district's authority would land under State & Local Government instead
  of Education. The rarer category is the one a reader would name.

Resulting 89R distribution is broad: Energy & Environment 983, Health & Human
Services 971, Education 855, Families & Children 757, Criminal Justice 611, down
to Abortion 94. Abortion and Guns are deliberately their own categories rather
than folded into Health and Criminal Justice — a per-category cap would otherwise
make the most salient axes in Texas politics unreachable.

---

## 7. Does the item set foreclose the result? — ANSWERED, and it is a design constraint

**Measured 2026-09-01.** Selection ranked purely by chamber division picks almost
entirely party-line votes, and then 100% of a user's marks sit at
|coordinate| > 0.6 — the blue/red plot is bimodal regardless of how anyone
answers, and "purple" is impossible by construction rather than absent by
measurement. With the default one-third cross-cutting reserve that drops to 67%.

`selection.ts` implements the mechanical rule `DATA_PIPELINE.md` asked for, with
`crossCuttingReserve` as the load-bearing parameter, an audit log as the published
artifact, mandatory reasons on hand overrides, and a `partisanByConstruction` flag
for when the reserve cannot be filled.

Open: the default numbers (`maxPerCategory` 6, reserve 1/3, partisan threshold
0.4) are judgement calls, not derived from data. Re-tune once 89R is loaded, and
in particular find out whether the 89th produced enough cross-cutting record votes
to fill the reserve at all. If it did not, that is the finding, and the results
copy has to change rather than the threshold.

---

## Settled

- Scoring estimator — see `SCORING.md`. Implemented, typechecked, smoke-tested.
- Skips drop items from both sides of the ratio; absences drop per-legislator.
- Session-based file naming (`89R`), not year ranges.
- Bulk LegiScan archives over pull API for static builds.
- Journal reconciliation required before publish.

---

# Open as of September

Added 2026-09-15. These are the live ones. Everything above is either answered
or is a tuning note on something that shipped.

## 8. The tally restarted at zero and cannot speak yet

Counters are namespaced by `DEFAULT_RULE.version` and the 14 September vote
correction bumped it to `sel-2026-09-14.b`, so production began again from zero
on 15 September. The previous 96 readings are frozen under
`t:production:sel-2026-09-01.a:*`, readable by key, and **not comparable**: SB 17
carried the opposite sign in that set and SB 6, which is in the seven-item short
set, had roughly double the valence it has now.

`tally_report.ts` withholds every sentence below n=100 on the right denominator.
So there is no quotable aggregate, and there will not be until 100 readable
readings accumulate on the new rule.

**Worth knowing before the gate ever trips.** In the frozen set, Texas ran
L 91% / R 5%, and only 2 of 96 were full-set readings. The short quiz is
six-sevenths party-line by construction and cannot produce a crossover result at
all, so even an uncontaminated sample of that shape would have been a fact about
where the site was posted rather than about Texas. Whatever the new counter
says, check the mode split before quoting it.

**The rule to keep:** bump `DEFAULT_RULE.version` whenever a change moves which
roll call an item points at. It is the identity of the instrument.

## 9. Selection defaults are still judgement calls

Carried over from question 7 and still true. `maxPerCategory` 3, reserve 1/3,
partisan threshold 0.4. The current payload comes out at a cross-cutting share
of 0.317 over 60 rule-selected items, with `partisanByConstruction` false, and
21 of the 67 shipped items sit below |valence| 0.4. Nothing here is derived from
data; it is a set of numbers that produced a defensible spread on one session.

## 10. Internal consistency cannot catch the wrong vote

The lesson from the SB 17 bug, written down because it generalises. Every check
the project had asked whether the payload was internally consistent, and it was:
a real roll call, correctly counted, attributed and weighted. It simply was not
the vote the question was about. `check_vote_selection.mjs` now compares the
payload against the full published corpus, because a bill's OTHER roll calls are
the only place that class of error is visible.

**Open:** the source carries no motion text, so the rule still cannot distinguish
a second reading from a third. It lands one record number from the one the
reader named. Same side, same magnitude, no scoring effect, unresolved.

## 11. Nobody has listened to the page

`check_a11y_tree.mjs` proves the accessibility tree is well formed, that focus
moves on every transition, and that no party word reaches the tree before an
answer is locked in. It cannot tell you whether the result READS well aloud.
The result view now carries one h1 and twelve h2s; whether that is a usable
outline or a thicket is a question for ears, and no screen reader has been run
against this site.

## 12. The i18n gate does not check that a string is used

`build_locales.mjs` fails the build on any string with `status !== 'ok'`. It has
nothing to say about an approved string the code never calls. `stmt.heading` and
`stmt.note` sat translated and approved for weeks while `renderStatements()`
assembled its own English inline, and the Spanish page showed that card wholly in
English.

**An unused-string check is tempting and the obvious version is vacuous.**
Scanning `src`, `scripts` and `api` leaves 42 keys unreferenced, nearly all of
them legitimately built at runtime (`verdict.${v}.headline`, `score.*`, `og.*`).
Adding `i18n/` collapses that to 2, because the review tooling enumerates every
key — the check would pass by reading the list of the things it is checking. If
this is built: exclude `i18n/`, and enumerate the dynamic families explicitly.

## 13. Voting guidance stops where the data stops

The dates block is live and states four dates from the state, plus a line saying
election day does not work like early voting. It publishes **no polling places**,
and that is a finding rather than a gap.

Which Texas counties run vote centres on election day is decided per election by
each commissioners' court. The Secretary of State's Countywide Polling Place
Program list currently covers the **May 2026 runoff**, there is no November list,
and a county designated Successful is **not required to seek approval** to use
the programme — so the list says who MAY run vote centres, not who WILL. Dallas
and Williamson both dropped countywide voting for March 2026. There is no single
authoritative source to be right from, so the site links the state's finder and
says so.

**Blocked, not open:** `vote-county` carries the county lookup and the
early-voting any-location rule, finished and unmerged, pending an answer from
the Texas Ethics Commission on whether the site is political advertising under
Election Code chapter 255. Sent 15 September.

## 14. The split-ZIP list was ordered by land — ANSWERED, and it was wrong 108 times

Raised and answered 17 September 2026, out of a removed r/houston post.

The split-ZIP pick list has always been sorted by share descending, and the
share was **land area** — `zips_89R.json` said so in both its `method` and
`format` fields — while `rep.zipShare` rendered an unqualified "{pct}% of this
ZIP". Nothing reader-facing named the unit, so the natural reading of the top
entry was "this is where most people in my ZIP live".

The first fix was to label it. That was not enough, because **a list sorted
largest-first makes the claim before any label on it is read**, and the label
would then have been disowning the order directly above it.

So the number changed instead. The crosswalk now joins 2020 census block
population from the Texas P.L. 94-171 file, and the list is ordered by people.

**Ordering by land put a different district at the top in 108 of the 913 split
ZIPs, 11.8%.** The worst is 75148, where the land-largest district holds 57% of
the ground and 13% of the people while HD-4 holds 87% of the people. Downtown
Houston was another: 77002 is 58% HD-147 by land, but 42% of its residents live
in HD-142, on 5% of the land, and it sorted third of four.

Three things worth keeping:

- **The payload stores head counts, not percentages.** Rounded to a percent, a
  district holding 0.4% of a ZIP's people and a district holding nobody are both
  "0", and the panel would tell the first group that nobody lives where they
  live. 77002 has exactly that case: HD-134, 71 people. Counts separate them and
  the client divides.
- **102 pairs hold no 2020 population at all** and are still listed, labelled
  "nobody lived in this part in 2020". Empty in 2020 is not empty now, and the
  panel's standing rule is that a surplus row costs a glance while a missing row
  names the wrong representative.
- **One anchor in `check_zips.mjs` got weaker on purpose.** The anchors read the
  FIRST district, which meant "the district this downtown is in" only while the
  order was land. They now assert that the ZIP reaches the known district. The
  map itself is pinned by sha256 in the builder, which is exact where seven
  downtowns were only plausible — six of the seven survived a wrong map once.

**Still open, and smaller:** the population is 2020 and the district map is
2022. A ZIP that has been built out since the census is described by who lived
there then. There is no more recent block-level count, so this is the best
available rather than a thing to fix.
