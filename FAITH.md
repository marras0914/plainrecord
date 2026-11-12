# Faith module

**Status: planning.** See [EXPANSION.md](EXPANSION.md) for how this fits the repo.

Readers weigh principles that Christian traditions teach, then see how those
principles line up with each party's platform. **The site never decides what
"the Christian position" is.** It reports what each tradition officially says,
what each platform says, and which verses each side cites, and it lets the
reader close the gap.

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

---

## Data

```
faith_positions.ts      issues, traditions, statements, planks, KNOWN_GAPS (hand-curated)
faith_verses.ts         verses with WEB and RV1909 text and their citedBy sources
scripts/export_faith.ts writes to SHIP_DIR:
  faith_blind.json      principles and unlabeled planks, opaque IDs only
  faith.json            the full labeled record (CC0, CORS-open)
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
- `faith_blind.json` contains no party or tradition fields.
- **`export_faith.ts` refuses to write** while any summary lacks reviewer
  sign-off, the same way the Spanish gate refuses unapproved strings.

---

## Pages: `scripts/build_faith_pages.mjs`

| English | Spanish | What's on it |
|---|---|---|
| `/faith` | `/fe` | Blind round. Needs `public/js/faith-blind.js` |
| `/faith/traditions` | `/fe/tradiciones` | Tradition lens. Static, works without JS |
| `/faith/methodology` | `/fe/metodologia` | Sources, curation rules, reviewers, known gaps |

### Blind round

1. Show a principle in neutral wording, such as "Societies have a duty to
   welcome people fleeing danger." Which traditions teach it stays hidden.
2. The reader rates how strongly it should shape policy, from 1 to 5.
3. The reader picks which of 2 to 4 unlabeled planks fits that principle best.
4. The reveal shows which party wrote each plank, which traditions teach the
   principle, and the verses each side cites.

### Tradition lens

Pick a tradition. For each issue, that tradition's own statement appears
alongside each party's plank. **No alignment score is computed.** The reader
draws the conclusion.

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
