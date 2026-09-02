# Open Questions

Unresolved as of 2026-08-31. Roughly in order of how much they change the product.

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

**Still open:** whether Paxton appears on the ballot page at all. He has zero
tier-1 and zero tier-2 evidence. Options are a separate quiz built from
2003–2015 bills (a different product), or shown unscored with the reason stated.

**Also open:** Mike Collier is on the Lieutenant Governor ballot as an
Independent and is not yet researched. A ballot page covering two of three
candidates in a race is its own bias.

## 3. What the score is called in the UI

`describeScore()` returns phrase bands rather than percentages, deliberately. But
`ResultsSummary` still needs a legend explaining that 0 means chance, not "never
agreed," and ideally a one-line plain-English account of why it isn't a
percentage. Not yet written.

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
