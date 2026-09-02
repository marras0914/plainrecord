# Scoring Specification

Reference implementation: `src/utils/scoring.ts`. This document explains *why* the
estimator looks the way it does, so future changes don't quietly undo a correction.

---

## The problem with naive matching

The obvious approach — count how often the user's answer equals the legislator's
vote, divide by the number of questions — fails on real roll-call data for three
independent reasons:

1. **Most record votes are lopsided.** A chamber that passes the majority of what
   reaches the floor produces items where nearly everyone votes the same way.
   Weighted equally, these swamp the handful of votes that actually distinguish
   members, and every voter matches every legislator at roughly the same high rate.
2. **The same position gets counted repeatedly.** Second reading, third reading,
   and amendments on one bill are near-duplicate columns. A user who cares about
   one bill silently gets three votes on it.
3. **Agreement is inflated by base rates.** A member who votes Yea on everything
   scores well against any user who answered Yea to anything, because most bills
   that reach a record vote pass. Raw agreement measures the base rate as much as
   it measures alignment.

Each of the three corrections below addresses exactly one of these.

---

## Notation

| Symbol | Meaning |
| --- | --- |
| $i$ | an item (one roll call) |
| $j$ | a legislator |
| $u_i \in \{+1, -1\}$ | user's answer (0 = skip, excluded) |
| $v_{ij} \in \{+1, -1, \varnothing\}$ | legislator's vote ($\varnothing$ = absent / not seated) |
| $p_i$ | share of **voting** members who voted Yea |
| $w_i$ | item weight |
| $m_i$ | user's importance multiplier (default 1) |
| $a_{ij}$ | 1 if $u_i = v_{ij}$, else 0 |

---

## 1. Discrimination weight

$$w_i^{\text{raw}} = 4p_i(1-p_i)$$

Zero at unanimity, 1 at a 50/50 split. Entropy is the softer alternative; at a
90/10 split variance gives 0.36 against entropy's 0.47. The harsher curve is the
right choice here — lopsided votes should approach irrelevance, not merely be
discounted.

**Eligibility floor.** Weighting alone isn't enough; near-unanimous items are
noise, not weak signal. An item is excluded outright unless:

- it is flagged `substantive` (see `DATA_PIPELINE.md`), **and**
- the losing side has at least 10 members, **and**
- the losing side is at least 5% of those voting.

## 2. Redundancy correction

Items are clustered by absolute Pearson correlation of their chamber vote
vectors, computed over members who voted on both (minimum overlap 20). Single-link
greedy union-find; threshold 0.9, relaxed to 0.72 when two items share a `billId`.

$$w_i = \frac{w_i^{\text{raw}}}{|\text{cluster}(i)|}$$

This is cheap and it fixes a bias nobody notices until they read the source.

## 3. Chance correction

Expected agreement given the chamber split and the side the user took:

$$e_i = \begin{cases} p_i & u_i = +1 \\ 1 - p_i & u_i = -1 \end{cases}$$

$$S_j = \frac{\sum_i w_i m_i (a_{ij} - e_i)}{\sum_i w_i m_i (1 - e_i)}$$

This is a weighted Cohen's-kappa variant.

- $S = 1$ — voted with the user on every eligible item.
- $S = 0$ — agreed no more than an arbitrary member would have.
- $S < 0$ — agreed *less* than chance. Real, meaningful, and displayable.

## 4. Missing data and shrinkage

A skip removes the item from **both** sides of the ratio. It is neither a
disagreement nor a silent denominator shrink.

An absence removes the item **for that legislator only**, so every candidate has
their own $N_j$. A 0.72 built on 6 items is not the same object as a 0.72 built on
40, so the displayed value is shrunk:

$$\tilde{S}_j = S_j \cdot \frac{N_j}{N_j + k}, \qquad k = 5$$

Category subscores use the identical estimator on a subset and are shrunk the same
way — small $N$ bites hardest there, so `VoteBreakdown` should show the count next
to every subscore.

## 5. Uncertainty

A percentile bootstrap resamples the user's answered items with replacement
(400 replicates, seeded per legislator via FNV-1a so results are reproducible
across builds) and reports a 95% interval on $S_j$. Suppressed below $N_j = 5$.

The interval answers the question that matters for a tool like this: *how much
does this ranking depend on which bills happened to be included?*

---

## Display rules

**Do not render the score as a percentage.** The chance correction is wasted the
moment "0.72" becomes "72% match," and users will read 0 as "never agreed" rather
than "no better than chance."

`describeScore()` returns phrase bands instead:

| Range | Phrase |
| --- | --- |
| ≥ 0.75 | Votes with you almost always |
| ≥ 0.40 | Votes with you more often than not |
| ≥ 0.15 | Leans toward your positions |
| > −0.15 | No clearer than chance either way |
| > −0.50 | Leans against your positions |
| else | Votes against you almost always |

Whatever replaces this, the legend must state that 0 means chance.

---

## Verified behavior

Smoke-tested against a synthetic 100-member chamber (60/40 blocs plus crossovers):

- unanimous and 96/4 items dropped by the eligibility floor
- two readings of one bill clustered; weight halved, 0.64 → 0.32
- score range symmetric, −1.00 … 1.00
- agreement on all 4 eligible items yields 0.44 after shrinkage, not 1.0

Compiles clean under `tsc --strict`. The module is deterministic — no
`Math.random`, no `Date`, no I/O — so it is safe for SSG and unit tests.
