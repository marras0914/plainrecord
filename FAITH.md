# Faith module

**Status: live since 13 Nov 2026** (PR #21): `/faith`, `/fe`, a page per tradition and the methodology, labeled not yet reviewed. **Verses** (13 Nov, `npm run data:faith:verses`): every Bible reference in each statement shown in full, found by a program, never picked; see "Scripture" below. See [EXPANSION.md](EXPANSION.md) for how this fits the repo.

## Decisions made 12 November 2026

These override the plan below where they differ.

1. **Ship before reviewers are found, labeled.** Marco has not yet found
   reviewers and chose to publish without them, with every faith page saying
   plainly that its entries have not been reviewed by members of the
   traditions they describe. Reviewer sign-offs are added as reviewers come.
   This reverses the original launch gate ("nothing ships until reviewers ...
   have signed off").
2. **Five traditions:** Catholic (USCCB), Southern Baptist, United Methodist
   (chosen over the ELCA: larger in Texas, and its Social Principles were
   revised in 2024), African Methodist Episcopal (chosen over the National
   Baptist Convention: more formal positions to cite), and Assemblies of God.
3. **Every qualifying statement, newest first,** not just the latest. What
   qualifies is written per tradition in `TRADITIONS[].official` in
   `faith_positions.ts` and applies to every issue: the body that speaks for
   the tradition, not its staff, agencies or officers' columns. On immigration
   this shows the SBC's position moving across four resolutions (2011, 2018,
   2023, 2026).

Built so far: `faith_positions.ts` (rules, traditions, the immigration pilot:
ten statements and four planks), `faith.smoke.ts`, and
`npm run data:faith:quotes`, which checks every excerpt against the downloaded
source with a control that must fail. Qualifying documents not yet read are in
`TO_READ`, so a gap is listed rather than forgotten.

Readers pick a Christian tradition and see, issue by issue, what it officially
teaches next to what each party's platform says. **The site never decides what
"the Christian position" is.** It reports what each tradition officially says,
what each platform says, and which verses each side cites, and it lets the
reader close the gap.

The module launches with that tradition lens only. A blind round, where
readers match principles to unlabeled planks, is a later phase with its own
rules (see "Later phase: the blind round" below), because its principles
would be the site's own words.

---

## Why this module is the riskiest thing on the site

Sincere Christians land on opposite sides of immigration, abortion, welfare,
the death penalty, guns and the environment. Traditions disagree with each
other, and members disagree with their own church's official positions. A
page that ranked one party as "more Christian" would be the site taking the
side it promised not to take, on the most personal question it could ask.

So this module is built entirely from **reported positions**. The site writes
no interpretations of its own, and nothing ships until reviewers from several
traditions have signed off.

---

## Curation rules

These are the rules from `stated_positions.ts`, applied to a new kind of source:

1. **Every entry carries a public `sourceUrl`.** No unsourced positions.
2. **Controlled vocabulary.** Issues come from one fixed list, and both parties
   and every tradition are placed on the same issue. An issue that only appears
   for one side is a sign the issue was framed around that side.
3. **Direction only where a source states it.** If a tradition or a platform
   *emphasizes* an issue without taking a position, leave it out and list it in
   `KNOWN_GAPS`. Emphasis is not a position.
4. **"No official statement" is a valid entry,** and it's shown on the page.
   Leaving it blank would hide the gap.
5. **Excerpts stay under 15 words** and link to the full text. Summaries
   describe; they don't characterize.

---

## Scope at launch

### Issues (about 8)

Immigration, abortion, poverty and welfare, the death penalty, guns, creation
care and the environment, healthcare, criminal justice.

### Traditions (pick 5 to 6)

| Family | Example official source |
|---|---|
| Catholic | USCCB, *Forming Consciences for Faithful Citizenship* |
| Southern Baptist | SBC resolutions library |
| Mainline Protestant | ELCA social statements |
| Historically Black church | AME Church or National Baptist Convention statements |
| Pentecostal | Assemblies of God position papers |
| Optional | Lutheran Church–Missouri Synod, or a large non-denominational network if one publishes positions |

Check each source is current before citing it. Some denominations have
reorganized or revised their statements in recent years.

### Platforms

- **Texas:** the most recent Republican Party of Texas and Texas Democratic
  Party platforms. This fits the site's Texas identity best.
- **National:** the most recent RNC and DNC platforms.
- Every plank records its platform year and links to the full document. Planks
  stay in English with `lang="en"` on the Spanish page, for the same reason
  the official bill captions do.

### Scripture

- **English:** World English Bible (public domain).
- **Spanish:** Reina-Valera 1909 (public domain).
- A verse goes in only when a documented source on that side has cited it on
  that issue. The citation is stored with it.
- How that is applied (`scripts/extract_faith_verses.ts`, output committed as
  `data/faith/verses.json`): only statements shown in full count. A document
  the record cites for one issue counts whole; one cited for several issues
  counts only in the section holding that issue's excerpt (web-page headings
  and named anchors, numbered paragraphs in the 2019 USCCB guide, indented
  paragraphs in the 2023 note). Passages over eight verses and whole chapters
  are linked, not printed. References are shown as written (the SBC's 2006
  resolution cites Genesis 1:32, which does not exist, and the page says so);
  two PDF text-layer garbles are fixed in `FIXES` with reasons. Result, 13 Nov
  2026: 126 references in 16 of 34 statements; none in any of the four
  platforms; no Catholic statement cites a verse in its section on an issue.

---

## Data

```
faith_positions.ts      issues, traditions, statements, planks, KNOWN_GAPS (hand-curated)
faith_verses.ts         verses with WEB and RV1909 text and their citedBy sources
scripts/export_faith.ts writes to SHIP_DIR:
  faith.json            the full labeled record (CC0, CORS-open)
                        (faith_blind.json arrives with the blind round, later)
```

```ts
interface Statement {
  traditionId: string;
  issueId: IssueId;
  summary: string;                // neutral, the site's words
  excerpt: string | null;         // under 15 words, the source's words
  sourceUrl: string;
  sourceDate: string;
  review: { reviewerId: string; date: string }[];
}

interface Plank {
  party: 'D' | 'R';
  level: 'texas' | 'national';
  platformYear: number;
  issueId: IssueId;
  summary: string;
  sourceUrl: string;
  review: { reviewerId: string; date: string }[];
}
```

### `faith.smoke.ts` checks

- Every issue has a plank (or a `KNOWN_GAPS` entry) for **both** parties at every level.
- Every tradition has a statement or an explicit "no official statement" for every issue.
- Every entry has a `sourceUrl`, and every excerpt is under 15 words.
- Every verse has at least one `citedBy` with a URL.
- **`export_faith.ts` refuses to write** while any summary lacks reviewer
  sign-off, the same way the Spanish gate refuses unapproved strings.

---

## Pages: `scripts/build_faith_pages.mjs`

| English | Spanish | What's on it |
|---|---|---|
| `/faith` | `/fe` | Tradition lens. Static, works without JS |
| `/faith/methodology` | `/fe/metodologia` | Sources, curation rules, reviewers, known gaps |

### Tradition lens

Pick a tradition. For each issue, that tradition's own statement appears
alongside each party's plank. **No alignment score is computed.** The reader
draws the conclusion.

Every word in the lens belongs to a source except the neutral summaries, and
those are reviewed. No traditions-by-issue grid that could be read as a
scoreboard: one tradition at a time.

---

## Later phase: the blind round

Not part of the launch. The original design was:

1. Show a principle in neutral wording, such as "Societies have a duty to
   welcome people fleeing danger." Which traditions teach it stays hidden.
2. The reader rates how strongly it should shape policy, from 1 to 5.
3. The reader picks which of 2 to 4 unlabeled planks fits that principle best.
4. The reveal shows which party wrote each plank, which traditions teach the
   principle, and the verses each side cites.

**Why it waits.** The principles in step 1 are the site's paraphrase, and the
reader's result is decided by which principles we write and how. Put "welcome
the stranger" on the immigration card and leave out a tradition's teaching on
the rule of law, and the reader matches one party. That's the "more Christian"
score this module forbids, computed in the reader's head and steered by our
choices. The quiz has the same problem with item selection and solves it with
a written rule; this needs one too.

**Rules it must meet before it ships:**

- A principle is an official statement's own excerpt, not our paraphrase.
- Principles are chosen by rule, not by us: for each issue, one from every
  launch tradition with a statement on it. If traditions pull in different
  directions on an issue, the round shows that.
- Each card shows every plank both parties have on that issue at that level,
  not a subset we picked.
- The reviewers sign off on the round as a whole, not just the entries in it,
  because a set of individually fair cards can still add up to a slant.
- `faith_blind.json` contains no party or tradition fields, and the page
  doesn't request `faith.json` until the reveal.

---

## Reviewers (the launch gate)

- 3 to 4 reviewers from different traditions. Include people from
  conservative and progressive congregations, not just different
  denominations.
- Each reviewer confirms that their own tradition is represented fairly and
  that the issue summaries are neutral.
- Reviewers are named on the methodology page, unless they ask not to be.
- Corrections from readers go in a public changelog, the same way a wrong
  position in `stated_positions.ts` is fixed with a PR and a better source.

## Guardrails

- No "which party is more Christian" score anywhere: not on the page, not on a
  share card, not in the payload.
- Where traditions disagree with each other, the page shows the disagreement.
- The methodology page says plainly that individual believers in every
  tradition hold a range of views.
- The site writes no interpretations of scripture.

## Definition of done

- [ ] All issues covered for both parties and every launch tradition, or listed in `KNOWN_GAPS`
- [ ] `npm test` passes with `faith.smoke.ts` registered
- [ ] Reviewer sign-off on every summary, and `export_faith.ts` writes without refusing
- [ ] Spanish approved in `i18n/faith.json`, scripture from RV1909
- [ ] Methodology page published with reviewers and known gaps
- [ ] The blind round is not part of this list; it gets its own when it's scheduled
