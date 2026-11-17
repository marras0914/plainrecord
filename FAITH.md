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

### Judaism (decided 15 Nov 2026)

Marco asked to add large faiths outside Christianity; Judaism's three U.S.
movements came first. His decisions that day:

- **Which bodies count: both, where two vote.** Reform = URJ (General
  Assembly or North American Board) and CCAR. Conservative = Rabbinical
  Assembly resolutions only (USCJ publishes none; RA "statements" and CJLS
  teshuvot excluded).
- **Orthodox = the Orthodox Union alone** (convention delegates or Board),
  Marco's follow-up the same day; the Rabbinical Council of America, a
  rabbis' association, was briefly included and dropped. Agudath Israel
  issues no voted resolutions. The page says the OU does not speak for all
  of Orthodoxy. Its standing positions cover the death penalty, guns and
  energy only, so the other five issues show "no official statement".
- **Citations listed, not printed.** WEB and RV1909 are Christian
  translations, so a Jewish statement's citations are listed as written,
  labeled by kind and linked to Sefaria (`npm run data:faith:citations`,
  output `data/faith/jewish_citations.json`). Sefaria's name API decides what
  is a reference; `ALIASES` holds the five spellings it does not know.

How it is applied:

- `npm run data:jewish` (`scripts/fetch_jewish_resolutions.ts`) lists every
  resolution of the URJ, CCAR and RA into
  `data/faith/jewish_resolutions.json` (committed) and saves the on-issue
  texts to `data/faith_sources/jewish/` (gitignored). The OU's standing
  positions are one PDF per convention, read by hand (2023 in full, 2017
  listed). Earlier statements are title matches, as for the SBC.
- **Current statement:** the newest on the issue that states a direction for
  law or government. A resolution about a movement's own investments or
  institutions is listed, not shown. Reproductive care is shown under
  abortion; healthcare shows the newest on care in general.
- Dates: CCAR from the text, its convention header or URL; RA from the
  resolution's closing "Passed by..." line where there is one (the page's own
  date is often the June 2011 posting date).
- Titles about another country's immigration ("Immigration to Israel",
  "Absorption of Ethiopian Immigrants", "Immigration to Canada") are not
  listed under immigration (Marco, 17 Nov 2026).
- Known costs, for Marco: the issue name "Creation care and the environment" is
  Christian wording. "Global warming" was added to the environment rule on
  16 Nov 2026 (Marco), which made the SBC's 2007 "On Global Warming" its
  current environment statement.

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
| `/faith/catholic/texas-house` | `/fe/catolica/camara-de-texas` | Texas House votes on the bills the Texas Catholic bishops took a side on |

### Tradition lens

Pick a tradition. For each issue, that tradition's own statement appears
alongside each party's plank. **No alignment score is computed.** The reader
draws the conclusion.

Every word in the lens belongs to a source except the neutral summaries, and
those are reviewed. No traditions-by-issue grid that could be read as a
scoreboard: one tradition at a time.

---

## The to-read list, worked through 14 Nov 2026

- **UMC, done.** The immigration entry now quotes the 2024 Social Principles
  themselves (The Political Community, section G, "Migrants, Immigrants and
  Refugees"), not the church's explainer page. The section adds family
  separation and for-profit detention to the summary. Book of Resolutions 4271,
  4273 and 4275 and "The United Methodist Church Is a Sanctuary Church" were
  read in full and are listed under it. 4275 is printed whole only on the
  explainer page, so that page is its link. The section cites no scripture,
  so the entry now shows no verses.
- **Catholic, partly.** The search found the 2025 Special Pastoral Message on
  Immigration: its own text says "approved by the general membership of
  bishops" (vote 216-5-3). It is the newest full-body statement and is shown
  in full. It is read from its PDF with `pdftotext -enc UTF-8` (not
  `-layout`), with a FIXES entry for "Luke 10:30-37", which the PDF breaks
  across lines. *Strangers No Longer* (2003) and *Welcoming the Stranger Among
  Us* (2000) were held back because usccb.org returns 403 to scripts and to
  the fetch tool, so their approval notes were unseen.
- **Catholic, done 15 Nov 2026.** Both approval notes were read in Marco's
  browser. *Strangers No Longer* was "approved simultaneously by the full
  bodies" of the U.S. and Mexican bishops at their November 2002 meetings;
  *Welcoming the Stranger Among Us* was "approved by the full body of bishops"
  in November 2000. Both are listed under the 2025 message as earlier
  statements.
- **AME, still open.** No General Conference resolution on immigration has
  been found online. The *Christian Recorder*'s summary of the 2024 General
  Conference legislation names none.

## Texas House votes on bills a church took a side on

`/faith/catholic/texas-house`, `/fe/catolica/camara-de-texas`. Marco asked on
13 Nov 2026 to "align a party's actions with whether or not they are
Christian values". There is no single "Christian values" yardstick, so that
question can't be answered, and building one would make the site the judge.
What can be answered without our judgment is narrower, and it's what was
built. **Decided 13 Nov 2026:**

1. **Only bills the church itself took a side on.** The site never decides
   which way a church's teaching points on a bill. In Texas, only the Catholic
   bishops publish a bill-by-bill list. No list was found for the other four
   churches, and their pages say so.
2. **The Texas Catholic Conference of Bishops (TCCB) counts as Catholic,** and
   is labeled TCCB, not USCCB.
3. **The vote is the House's recorded vote on final passage** (third reading),
   as the bill's history on Texas Legislature Online lists it.
4. **A per-bill list plus a count per party** ("voted the bishops' way" = the
   party's majority of yea/nay voters did what the bishops asked). It covers
   one church only, is never combined across churches, and is never a
   "Christian" score. This is the one count on the faith pages, and
   `me.not` says so.

Pipeline, each step writing a committed file:

- `npm run data:faith:tccb` (`extract_tccb_positions.ts`) reads the bishops'
  two bill-position pages and the Sine Die Report, all three saved in
  `data/faith_sources/`. It writes `data/faith/tccb_89_positions.json`. Where
  the bishops' documents disagree, the bill is a **conflict**: it isn't
  counted, and the page lists it with the bishops' own words. The causes
  found: icon vs sentence, a link pointing to a different bill than its text,
  the pages vs the report, or one source giving both positions.
- `npm run data:faith:passage` (`fetch_house_passage.ts`) reads each bill's
  TLO history (cached in `data/cache/history/`) and writes
  `data/faith/house_passage_89R.json`.
- `faith_house_votes.ts` joins those to `public/data/votes_89R.json` by bill
  and House Journal record number, inside `npm run data:faith`.

Traps found on the way:

- About 225 of the bishops' links are lowercase (`sB00256`).
- Ten point to `HB 0`, so the written bill number is the one used.
- The Sine Die Report names numbers that don't exist in 89(R) (TLO: "The bill
  number does not exist").
- `votes_89R.json` has no motion text, which is why each bill's history is
  read.

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

## Which side each church takes (decided 15 Nov 2026)

Marco asked for a grid of what each church actually lines up with, issue by
issue, without saying what it "should" do. `/faith/sides` and `/fe/posturas`,
from `SIDE_POINTS` in `faith_positions.ts`:

- The question on each issue is one where the D and R platforms at a level
  take opposite sides in their own words, so the parties set it, not us. A
  level where they don't is not compared; criminal justice has no such point
  and is not compared at all (`NO_SIDE_POINT`).
- A church is placed only where one of its statements shown in full takes a
  side in its own words, with that quote shown. Otherwise "Doesn't say".
- Every quote is checked against its source by `data:faith:quotes`.
- **No total**, on the page or in the data: which issues are listed would
  decide it. `faith.smoke.ts` and `verify_site.mjs` both check this.
- Three judgment calls (SBC environment: doesn't say; UMC healthcare: widen;
  Catholic environment: act) were Marco's, and the page lists them. On
  16 Nov 2026 the SBC's 2007 "On Global Warming" became current; it asks
  Congress to "reject government-mandated reductions", so it is placed with
  opposing climate measures.
- For the Jewish movements (16 Nov 2026), Marco's rule: where the text
  doesn't take the side, it is "doesn't say"; no lean is inferred.

This replaces the earlier "one tradition at a time, no grid" rule. The
guardrail below against a "which party is more Christian" score stands.

## Guardrails

- No "which party is more Christian" score anywhere: not on the page, not on a
  share card, not in the payload. The House-votes count (above) is one
  church's own bill positions against one chamber's votes, and is never
  combined or presented as more than that.
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
