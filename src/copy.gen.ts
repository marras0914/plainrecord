/**
 * GENERATED FILE — do not edit.
 *
 * Source: i18n/copy.json
 * Regenerate: npm run i18n:gen
 *
 * Edits here are lost on the next run, and `npm run i18n:check` fails while
 * this file disagrees with copy.json.
 */

/** Every copy key on the site. A typo is a compile error, not a blank space. */
export type CopyKey =
  | "verdict.fewMarks.headline"
  | "verdict.fewMarks.caveat"
  | "verdict.weakLoad.headline"
  | "verdict.weakLoad.caveat"
  | "verdict.balanced.headline"
  | "verdict.balanced.caveat"
  | "verdict.crossover.headline"
  | "verdict.crossover.caveat"
  | "verdict.consistent.headline"
  | "verdict.consistent.caveat"
  | "verdict.nearMiddle.headline"
  | "verdict.nearMiddle.caveat"
  | "score.almostAlways"
  | "score.moreOften"
  | "score.leansToward"
  | "score.chance"
  | "score.leansAgainst"
  | "score.againstAlways"
  | "axis.alignment"
  | "axis.load"
  | "intro.h1"
  | "q.skipQuiz"
  | "rep.answerForScore"
  | "result.checkRep"
  | "how.close"
  | "how.full"
  | "q.resultNow"
  | "result.keepGoing"
  | "start.lede"
  | "start.begin"
  | "start.fine"
  | "start.how"
  | "start.hide"
  | "vote.yes"
  | "vote.no"
  | "q.prompt"
  | "q.next"
  | "q.seeResult"
  | "q.showOfficial"
  | "q.hideOfficial"
  | "q.officialNote"
  | "q.askedAs"
  | "q.youSaid"
  | "result.restart"
  | "result.tryAll"
  | "theme.toDark"
  | "theme.toLight"
  | "intro.p1"
  | "intro.p2"
  | "intro.p3"
  | "intro.p4"
  | "intro.fine"
  | "bias.heading"
  | "bias.p1"
  | "bias.p2"
  | "bias.p3"
  | "bias.p3b"
  | "bias.p4"
  | "bias.fine"
  | "author.heading"
  | "author.built"
  | "author.donation"
  | "author.job"
  | "author.races"
  | "author.why"
  | "author.contact"
  | "mode.short"
  | "mode.full"
  | "mode.shortDesc"
  | "mode.fullDesc"
  | "cand.note"
  | "stmt.heading"
  | "stmt.note"
  | "preset.heading"
  | "preset.mixed"
  | "preset.muted"
  | "preset.consistent"
  | "preset.reset"
  | "preset.note"
  | "ui.showTable"
  | "ui.hideTable"
  | "ui.methodHeading"
  | "ui.officialCaption"
  | "ui.translationNotice"
  | "noun.vote.one"
  | "noun.vote.many"
  | "party.D"
  | "party.R"
  | "verdict.mildLean.headline"
  | "verdict.mildLean.caveat"
  | "hdr.eyebrow"
  | "prov.questions.label"
  | "prov.questions.short"
  | "prov.questions.full"
  | "prov.record.label"
  | "prov.record.hint"
  | "prov.agreed.label"
  | "prov.agreed.mostlyParty"
  | "prov.agreed.notAFight"
  | "prov.picked.label"
  | "prov.picked.hand"
  | "prov.picked.rule"
  | "prov.picked.handHint"
  | "prov.picked.ruleHint"
  | "stats.lean.label"
  | "stats.lean.towardD"
  | "stats.lean.towardR"
  | "stats.lean.middle"
  | "stats.lean.empty"
  | "stats.cross.label"
  | "stats.cross.hint"
  | "stats.load.label"
  | "stats.load.low"
  | "stats.load.hint"
  | "strip.noContent"
  | "strip.empty"
  | "strip.candidateRecords"
  | "strip.dotLabel"
  | "strip.title"
  | "strip.legendYours"
  | "strip.legendCands"
  | "vote.yea"
  | "vote.nay"
  | "vote.none"
  | "q.blind"
  | "q.caption"
  | "q.plainTag"
  | "q.plainNote"
  | "q.whyThis"
  | "q.skip"
  | "q.showReceipt"
  | "q.hideReceipt"
  | "q.receiptHead"
  | "q.receiptBody"
  | "q.rYea"
  | "q.dYea"
  | "q.doneEyebrow"
  | "q.doneCaption"
  | "q.doneSub"
  | "q.startOver"
  | "rev.threeRaces"
  | "rev.noneVoted"
  | "rev.agreedCount"
  | "rev.missingOne"
  | "rev.missingMany"
  | "rev.youSaid"
  | "rev.partyVote"
  | "rev.compareSummary"
  | "rev.compareHint"
  | "rev.repsHead"
  | "rev.demsHead"
  | "rev.compareNote"
  | "rev.oppHead"
  | "rev.oppVetoed"
  | "rev.oppSigned"
  | "rev.oppUnsigned"
  | "rev.oppNoSide"
  | "rev.oppSignedNote"
  | "rev.oppPriority"
  | "rev.oppNote"
  | "rev.outcomeHead"
  | "rev.sameSide"
  | "rev.oppositeSide"
  | "rev.source"
  | "outc.leftBlank"
  | "outc.incumbent"
  | "table.empty"
  | "table.bill"
  | "table.caption"
  | "table.category"
  | "table.you"
  | "table.rYea"
  | "table.dYea"
  | "table.valence"
  | "table.position"
  | "table.source"
  | "sec.howMany"
  | "sec.yourAnswers"
  | "sec.netLean"
  | "sec.candidates"
  | "sec.outcomes"
  | "method.where.lead"
  | "method.where.body"
  | "method.notFights.lead"
  | "method.notFights.body"
  | "method.who.lead"
  | "method.seven.lead"
  | "method.seven.body"
  | "method.words.lead"
  | "method.words.body"
  | "method.check.lead"
  | "method.check.body"
  | "readout.answered"
  | "bias.clearestCase"
  | "bias.authorLinkText"
  | "q.counter"
  | "q.valenceRow"
  | "outc.rankAria"
  | "rev.voted"
  | "rev.sameAsYou"
  | "rev.oppositeToYou"
  | "rev.youSaidVote"
  | "rev.reps"
  | "rev.dems"
  | "rev.yeaShare"
  | "tip.youAnswered"
  | "tip.rYea"
  | "tip.dYea"
  | "tip.position"
  | "tip.chamber"
  | "page.title"
  | "page.description"
  | "page.langSwitch"
  | "page.translationNotice"
  | "strip.legendRamp"
  | "prov.record.value"
  | "strip.poleD"
  | "strip.poleR"
  | "strip.poleDShort"
  | "strip.poleRShort"
  | "og.eyebrow"
  | "og.deck"
  | "og.axisD"
  | "og.axisMid"
  | "og.axisR"
  | "og.prov"
  | "og.imageAlt"
  | "method.denominator.lead"
  | "method.denominator.body"
  | "method.labels.lead"
  | "method.labels.body"
  | "privacy.lead"
  | "privacy.body"
  | "intro.subhead"
  | "rep.heading"
  | "rep.lede"
  | "rep.districtLabel"
  | "rep.districtPlaceholder"
  | "rep.findDistrict"
  | "rep.findDistrictLinkText"
  | "rep.noSuchDistrict"
  | "rep.outOfRange"
  | "rep.noVotes"
  | "rep.answerFirst"
  | "rep.coverage"
  | "rep.thin"
  | "rep.loadFailed"
  | "rep.excluded"
  | "rep.excludedOne"
  | "rep.district"
  | "rep.zipLabel"
  | "rep.zipPlaceholder"
  | "rep.zipWhole"
  | "rep.zipSpans"
  | "rep.zipShare"
  | "rep.zipShareSmall"
  | "rep.zipUnknown"
  | "rep.zipFailed"
  | "guess.heading"
  | "guess.body"
  | "guess.hint"
  | "guess.continue"
  | "guess.skip"
  | "guess.unplaced"
  | "guess.at"
  | "guess.label.farD"
  | "guess.label.nearD"
  | "guess.label.middle"
  | "guess.label.nearR"
  | "guess.label.farR"
  | "strip.legendGuess"
  | "result.guessLine"
  | "result.guessExact"
  | "share.button"
  | "share.what"
  | "share.sending"
  | "share.done"
  | "share.already"
  | "share.failed"
  | "share.link"
  | "share.linkNote"
  | "share.copy"
  | "share.copied"
  | "share.copyFailed"
  | "share.text"
  | "shared.intro"
  | "compare.heading"
  | "compare.agreed"
  | "compare.allAgreed"
  | "compare.noneShared"
  | "compare.positions"
  | "compare.same"
  | "strip.legendThem"
  | "compare.again";

export type Locale = 'en' | 'es';

/**
 * TWO SEPARATE BINDINGS, not one `{ en, es }` object, and that is the whole
 * reason this file is shaped the way it is.
 *
 * Rollup drops an unreferenced top-level const whose initialiser is a pure
 * object literal. It cannot drop a PROPERTY of an object that is itself
 * referenced — so when these two tables lived as `COPY.en` and `COPY.es`, every
 * English reader downloaded the Spanish strings and every Spanish reader
 * downloaded the English ones. Measured: 51.1 KB gzipped with both, 36.2 KB with
 * one.
 *
 * src/i18n.ts picks between them on `__BUILD_LOCALE__`, a value vite folds at
 * build time, so exactly one of these survives into each locale's bundle.
 */
export const EN: Record<CopyKey, string> = {
  "verdict.fewMarks.headline": "Answer a few more and we can tell you something",
  "verdict.fewMarks.caveat": "So far you have answered {n} {votes}. We need at least {min}.",
  "verdict.weakLoad.headline": "These votes can't really place you",
  "verdict.weakLoad.caveat": "On the ones you answered, Republicans and Democrats mostly voted the same way. So your answers do not say much about which party you are closer to — whichever way they fell.",
  "verdict.balanced.headline": "You are split right down the middle",
  "verdict.balanced.caveat": "About as many of your answers matched Republicans as matched Democrats. This is the purple result.",
  "verdict.crossover.headline": "You lean toward {party}, but you cross over a lot",
  "verdict.crossover.caveat": "Most of your answers matched {party}, but a big share matched {other} instead.",
  "verdict.consistent.headline": "You line up with {party} nearly every time",
  "verdict.consistent.caveat": "Almost all of your answers matched the same party.",
  "verdict.nearMiddle.headline": "You sit near the middle",
  "verdict.nearMiddle.caveat": "Not because you split between the parties — the votes you answered mostly fell close to the line between them anyway.",
  "score.almostAlways": "Votes with you almost always",
  "score.moreOften": "Votes with you more often than not",
  "score.leansToward": "Leans toward your positions",
  "score.chance": "No clearer than chance either way",
  "score.leansAgainst": "Leans against your positions",
  "score.againstAlways": "Votes against you almost always",
  "axis.alignment": "how much does this legislator vote with you",
  "axis.load": "how partisan-coded are your own positions?",
  "intro.h1": "The Purple Strip",
  "q.skipQuiz": "Skip the quiz and look around",
  "rep.answerForScore": "Answer a few votes and this will show how closely {name} matches you.",
  "result.checkRep": "How did my own representative vote?",
  "how.close": "Close",
  "how.full": "The full method, the data, and who made this",
  "q.resultNow": "See my result so far",
  "result.keepGoing": "Keep answering — {left} left",
  "start.lede": "Seven votes your Texas House actually took in 2025. We hid who voted which way. Where do you land?",
  "start.begin": "Start",
  "start.fine": "About two minutes · no sign-up · nothing leaves this device unless you ask it to",
  "start.how": "How this works",
  "start.hide": "Hide",
  "vote.yes": "For",
  "vote.no": "Against",
  "q.prompt": "Would you vote for this bill?",
  "q.next": "Next",
  "q.seeResult": "See where you landed",
  "q.showOfficial": "Official wording",
  "q.hideOfficial": "Hide official wording",
  "q.officialNote": "The question above is our plain-language summary. This is the bill's official caption, word for word. The House voted {yeas} yes, {nays} no.",
  "q.askedAs": "This one has no plain-language version yet, so it is asked in the official wording.",
  "q.youSaid": "You voted {vote}.",
  "result.restart": "Start over",
  "result.tryAll": "Answer all 67 votes",
  "theme.toDark": "Dark",
  "theme.toLight": "Light",
  "intro.p1": "<b>Texas lawmakers vote yes or no on new laws.</b> We took real votes from 2025 and hid who voted which way. Now you vote.",
  "intro.p2": "For each one we count how many Republicans said yes, and how many Democrats said yes. Mostly Republicans? We colour it <span class=\"sw-r\">red</span>. Mostly Democrats? <span class=\"sw-b\">Blue</span>. Both parties agreed? <span class=\"sw-g\">Grey</span> — that vote doesn't tell us much about sides.",
  "intro.p3": "Every answer you give becomes one dot. Dots on the left mean you agreed with Democrats. Dots on the right mean you agreed with Republicans. <b>If your dots land on both sides, you don't fit neatly in one party.</b> That's the purple part.",
  "intro.p4": "Then we show you <b>what these areas actually look like in Texas today</b> — school funding, health coverage, and so on — with the source for every number.",
  "intro.fine": "Nobody's opinion decides the colours. They come from the actual vote counts, and you can check them on every question. The outcome numbers are real too, but a state ranking has many causes — we show you the numbers and the votes, and leave the connecting to you.",
  "bias.heading": "Doesn't this favour the people who have voting records?",
  "bias.p1": "It would, if we scored anyone else. So we don't. A score here needs one thing — the same bills, voted on by both of you. Only members of the Texas House have that. All {n} candidates above sit in the Texas House. Every one of the people they are running against does not:",
  "bias.p2": "So they get no number at all — not a low one, not an estimate. Any score we printed for them would be votes we made up.",
  "bias.p3": "What stops this being a page about {n} Democrats. Under every one of the {items} questions we also show {total} sitting House members — {reps} Republicans and {dems} Democrats.",
  "bias.p3b": "They voted on the same bills you are answering ({lo}–{hi} of {items}), so they are scored the way the candidates are, on every question rather than a chosen few. If the Republican records land close to the Democratic ones on your answers, that is the finding, not a thumb on the scale.",
  "bias.p4": "Where an opponent does leave a mark. On {acts} of the {items} there is a recorded action on the exact bill — a veto, or a bill named a must-pass priority. We show it under that question and we never add it to a tally.",
  "bias.fine": "One rule picks all {total} of those names, and it cannot be tuned question by question. So if you think it is doing work it shouldn't, the rule is the thing to argue with — and every vote behind it is in {payload}. The other half of this answer is {authorLink}.",
  "author.heading": "Who made this, who paid for it, and what I have at stake",
  "author.built": "<b>I'm Marco Arras, and I built this on my own time.</b> Nobody paid for it — no campaign, no party, no PAC, no organisation. There was no budget. The cost was evenings.",
  "author.donation": "<b>I donate to the Democratic Party.</b> You should know that before you read anything else here, and it is the reason this page is built the way it is rather than a footnote to it. I have a side. So the rule that picks the comparison members runs identically on both caucuses, a third of the questions are reserved for votes where the two parties <em>agreed</em>, the selection rule is named and published, and every vote, count and score sits in one file you can download and check. None of that asks you to trust me. That is the whole point of it.",
  "author.job": "<b>What I do for a living.</b> I work as a solutions architect in energy. The sector buys and sells power, which overlaps the utilities votes on this page, so you should weigh what I say about those accordingly. My employer had no involvement in this, did not fund it and did not review it. I do no paid political work of any kind.",
  "author.races": "<b>I picked these three races.</b> Governor, Lieutenant Governor and U.S. Senate. That is an editorial decision, not a measurement, and it is the choice most worth arguing with. I picked them because all three Democratic candidates sit in the Texas House, which means their records can be checked against your answers vote for vote. Their opponents cannot be, so this page gives them no score at all rather than an invented one.",
  "author.why": "<b>Why I made it.</b> Almost everything that reaches people about how their state is actually governed arrives pre-framed by someone who wants something. The votes themselves are public, tedious, and genuinely hard to get at. I wanted a way to see the record before seeing the label, and to hand over the entire file so that anyone can check the record is what I say it is.",
  "author.contact": "If something here is wrong, tell me: <a href=\"mailto:arras.marco@gmail.com\">arras.marco@gmail.com</a>. Corrections get made, and noted on the page.",
  "mode.short": "7 big issues",
  "mode.full": "All {n} votes",
  "mode.shortDesc": "Seven of the session's biggest fights — the bills the Lieutenant Governor made priorities or the Governor vetoed. <b>Six of the seven split cleanly along party lines</b>, so this version can mostly only tell you which party you lean toward. Switch to all {n} to find where you cross over.",
  "mode.fullDesc": "All {n} votes: one per bill, spread across 20 subject areas, including the ones where Republicans and Democrats agreed. Those are the votes that can show you crossing party lines.",
  "cand.note": "All three sat in the same chamber and are running for different offices, so these are three separate readouts, not a ranking. They voted together on most party-line bills, so expect the numbers to sit close together — where they diverge is the interesting part. Coverage over these {items} votes: {coverage}. A vote they missed is dropped for them alone, not counted against them.",
  "stmt.heading": "Statements of vote",
  "stmt.note": "A Texas member may file a statement saying the Journal recorded them wrongly. The recorded vote is the official act and is what is scored here; the statement is shown beside it, never applied in its place.",
  "preset.heading": "Try a profile",
  "preset.mixed": "Cross-pressured voter",
  "preset.muted": "Low-signal votes only",
  "preset.consistent": "Consistent partisan",
  "preset.reset": "Clear",
  "preset.note": "The first two produce almost the same <code>net lean</code> — a single blended swatch would render both as the same purple. They are opposite findings, so the readout separates them on <code>partisan load</code>.",
  "ui.showTable": "Show table",
  "ui.hideTable": "Hide table",
  "ui.methodHeading": "How this is built",
  "ui.officialCaption": "Official caption, as recorded",
  "ui.translationNotice": "Spanish here is our translation, not an official version. The official text of every bill is in English and is one tap away on each question.",
  "noun.vote.one": "vote",
  "noun.vote.many": "votes",
  "party.D": "Democrats",
  "party.R": "Republicans",
  "verdict.mildLean.headline": "You lean toward {party}",
  "verdict.mildLean.caveat": "More of your answers matched that party than the other one.",
  "hdr.eyebrow": "PlainRecord · Texas House {session} · {n} real recorded votes",
  "prov.questions.label": "Questions",
  "prov.questions.short": "the seven biggest fights of the session",
  "prov.questions.full": "one per bill, across {cats} subjects",
  "prov.record.label": "Straight from the record",
  "prov.record.hint": "taken from the official House Journal, not a summary",
  "prov.agreed.label": "Both parties agreed",
  "prov.agreed.mostlyParty": "nearly all of these were party-line fights",
  "prov.agreed.notAFight": "these votes were not a party fight at all",
  "prov.picked.label": "Picked by",
  "prov.picked.hand": "hand",
  "prov.picked.rule": "a written rule",
  "prov.picked.handHint": "each one shows why it was chosen",
  "prov.picked.ruleHint": "{rule}, max {perCat} per subject",
  "stats.lean.label": "Which way you lean",
  "stats.lean.towardD": "toward Democrats",
  "stats.lean.towardR": "toward Republicans",
  "stats.lean.middle": "right down the middle",
  "stats.lean.empty": "answer a few votes",
  "stats.cross.label": "How often you cross",
  "stats.cross.hint": "of your answers land on the opposite side from your overall lean",
  "stats.load.label": "How partisan these votes were",
  "stats.load.low": "very low — these votes barely split the parties",
  "stats.load.hint": "1.00 would mean every party member voted with their side",
  "strip.noContent": "no partisan content",
  "strip.empty": "Answer a vote to place the first mark.",
  "strip.candidateRecords": "Candidate records on the same votes",
  "strip.dotLabel": "{bill} {category}, you answered {answer}, position {pos}",
  "strip.title": "Each answered vote plotted on a blue-to-red partisan axis, with the three candidates' own records below",
  "strip.legendYours": "your answer",
  "strip.legendCands": "candidate's record on the same votes",
  "vote.yea": "Yea",
  "vote.nay": "Nay",
  "vote.none": "no vote recorded",
  "q.blind": "blind — party not shown",
  "q.caption": "Official bill caption. The House voted {yeas} yes, {nays} no.",
  "q.plainTag": "In plain terms",
  "q.plainNote": "Our summary, not the official text. The caption above is the official wording.",
  "q.whyThis": "Why this one:",
  "q.skip": "Skip",
  "q.showReceipt": "Show the receipt",
  "q.hideReceipt": "Hide the receipt",
  "q.receiptHead": "How this vote is coloured.",
  "q.receiptBody": "Valence is the Republican Yea share minus the Democratic Yea share — measured, not judged.",
  "q.rYea": "Republicans voting Yea",
  "q.dYea": "Democrats voting Yea",
  "q.doneEyebrow": "Done",
  "q.doneCaption": "All {n} votes answered or skipped.",
  "q.doneSub": "The strip above holds every answer with measurable partisan content.",
  "q.startOver": "Start over",
  "rev.threeRaces": "The three races — how they voted on {bill}",
  "rev.noneVoted": "None of the three has a recorded vote on this bill.",
  "rev.agreedCount": "{agreed} of {counted} voted the same way you did",
  "rev.missingOne": ", and one has no recorded vote.",
  "rev.missingMany": ", and {n} have no recorded vote.",
  "rev.youSaid": "You said",
  "rev.partyVote": "How each party voted on it",
  "rev.compareSummary": "Compare with six other House members",
  "rev.compareHint": "three from each party, picked by rule",
  "rev.repsHead": "Three Republicans, picked by rule",
  "rev.demsHead": "Three Democrats, picked by the same rule",
  "rev.compareNote": "None of these six is on the ballot. From each caucus: the most party-line member, the median, and the one who most often broke ranks — the same rule on both sides, recomputed every build, so the comparison is not a pick of names.",
  "rev.oppHead": "What their opponents did on this bill",
  "rev.oppVetoed": "vetoed it",
  "rev.oppSigned": "signed it",
  "rev.oppUnsigned": "let it pass unsigned",
  "rev.oppNoSide": "took no side",
  "rev.oppSignedNote": "A governor signs most of what reaches him, so a signature means he did not object — not that he pushed for it.",
  "rev.oppPriority": "made it a priority",
  "rev.oppNote": "Not votes — neither of them votes in the House, so these are not counted above. And each list runs one way only: a governor vetoes just the bills he opposes, a priority list names just the bills its author wants passed. That is why you see a side on this bill and never a percentage.",
  "rev.outcomeHead": "Where Texas stands on {category}",
  "rev.sameSide": "same side as you",
  "rev.oppositeSide": "opposite side to you",
  "rev.source": "source",
  "outc.leftBlank": "Deliberately left blank:",
  "outc.incumbent": "{name} has been {office} since {since}, covering {sessions}.",
  "table.empty": "Nothing answered yet.",
  "table.bill": "Bill",
  "table.caption": "Caption",
  "table.category": "Category",
  "table.you": "You",
  "table.rYea": "R Yea",
  "table.dYea": "D Yea",
  "table.valence": "Valence",
  "table.position": "Position",
  "table.source": "Source",
  "sec.howMany": "How many votes",
  "sec.yourAnswers": "Your answers, one mark each",
  "sec.netLean": "net lean",
  "sec.candidates": "The three candidates, scored against your answers",
  "sec.outcomes": "What these areas look like now",
  "method.where.lead": "Where the questions come from.",
  "method.where.body": "These are real votes the Texas House took. We use one vote per bill, so no bill is asked about twice. Then we sort the bills into 20 subject areas — the same list the state's own library uses — and take at most {perCat} from each area.",
  "method.notFights.lead": "Why some questions are not close fights.",
  "method.notFights.body": "About {reserve} out of every 100 spots are saved for votes where Republicans and Democrats <em>agreed</em>. We do that on purpose. If we only picked the big fights, every answer you gave would land at one end or the other, and nobody could ever come out purple. The rule we follow is written down and named {rule}, so you can check we did not change it to get a nicer answer.",
  "method.who.lead": "Who is on this page.",
  "method.seven.lead": "The seven big ones.",
  "method.seven.body": "We picked these by hand, but not by our own opinion. Each one is a bill the Lieutenant Governor called a top priority, or a bill the Governor vetoed. Those are their published lists, not ours. Each question shows why it made the list. Six of the seven split the two parties sharply — that is what a headline fight is.",
  "method.words.lead": "Where the words come from.",
  "method.words.body": "Every question is the bill's official summary, copied word for word. We did not rewrite it to sound better or worse. How each member voted comes from the official House Journal where we could match it (<span class=\"src\">journal</span>), and otherwise from a scrape (<span class=\"src\">scrape</span>). The table tells you which, for every vote.",
  "method.check.lead": "Check it yourself.",
  "method.check.body": "Every vote, count and score behind this page sits in one file: {link}. That is the exact file this page loaded, not a copy we made for show. Take it: the data is public domain (CC0) and the code is MIT. If you reuse an outcome figure, please carry its caveat with it.",
  "readout.answered": "{n} of {total} answered",
  "bias.clearestCase": "{name} is the clearest case — {why}",
  "bias.authorLinkText": "who made this and what I have at stake",
  "q.counter": "{i} of {n}",
  "q.valenceRow": "valence",
  "outc.rankAria": "{value} — {comparison}",
  "rev.voted": "voted {vote}",
  "rev.sameAsYou": "same as you",
  "rev.oppositeToYou": "opposite to you",
  "rev.youSaidVote": "You voted <b>{vote}</b>.",
  "rev.reps": "Republicans",
  "rev.dems": "Democrats",
  "rev.yeaShare": "{pct} Yea",
  "tip.youAnswered": "You voted",
  "tip.rYea": "R voted Yea",
  "tip.dYea": "D voted Yea",
  "tip.position": "your position",
  "tip.chamber": "chamber",
  "page.title": "Texas House voting records — Goodwin, Hinojosa, Talarico | The Purple Strip",
  "page.description": "A blind quiz on real Texas House votes. Answer without knowing which party took which side, then see where you land and where Texas actually stands.",
  "page.langSwitch": "En español",
  "page.translationNotice": "Everything we wrote ourselves is in Spanish. The official bill captions stay in English, exactly as they appear in the record — translating them would make them something other than the record.",
  "strip.legendRamp": "Democratic-coded ← position → Republican-coded",
  "prov.record.value": "{n} of {total}",
  "strip.poleD": "Democratic-coded",
  "strip.poleR": "Republican-coded",
  "strip.poleDShort": "Dem-coded",
  "strip.poleRShort": "Rep-coded",
  "og.eyebrow": "TEXAS HOUSE · {session} LEGISLATURE",
  "og.deck": "A blind quiz on <b>{n} real votes</b>. Party labels stay hidden until after you answer.",
  "og.axisD": "AGREED WITH DEMOCRATS",
  "og.axisMid": "BOTH PARTIES",
  "og.axisR": "AGREED WITH REPUBLICANS",
  "og.prov": "{rollcalls} roll calls · {eligible} eligible · {asked} asked",
  "og.imageAlt": "The Purple Strip — a blind quiz on {n} real Texas House votes. A blue-to-red axis labelled \"agreed with Democrats\" and \"agreed with Republicans\", with {dots} purple dots spread across its whole width.",
  "method.denominator.lead": "Two cross-cutting figures, and why.",
  "method.denominator.body": "The percentage in the tiles above counts all {items} questions. The <code>crossCuttingShare</code> field in the data file is measured over the rule-selected votes only, so it is a slightly different number. That is deliberate: it exists to check the <em>rule</em>, and the seven headline bills were picked by hand rather than by the rule — six of them split the parties sharply, so counting them would make the rule look more one-sided than it is. Both numbers are honest and neither is the other one rounded.",
  "method.labels.lead": "Why the subjects do not add up.",
  "method.labels.body": "The rule picked {ruleSelected} votes, at most {perCat} per subject, and we added {headline} big bills by hand — the {items} questions here. Count the subjects in the data file today and you will not get that back. After the votes were picked we corrected six subject labels that were wrong on the page: <em>Abortion</em> sat above a question about prosecuting election crimes. Correcting a label cannot reach back and change which votes the rule chose, so what you are counting is the corrected labels over the original picks. We would rather show you that than quietly relabel and let the arithmetic look tidy.",
  "privacy.lead": "What this page counts, and what it does not.",
  "privacy.body": "It counts visits · how many people came and which link sent them · using Vercel's analytics, which sets no cookies and cannot follow you to another site. <b>Your answers are not part of that.</b> They never leave your browser while you answer: the page makes no network request at all until you have finished. If you then tap <b>add my result</b> on the result screen, one request goes out, and it carries where you landed, three numbers about your answers, and which way you answered each vote. No name, no address, nothing that identifies you, and only totals are kept at the other end — there is no record of your particular submission to look up. If instead you tap <b>share where I landed</b>, you get a link holding one number, which of eleven positions you landed in, and anyone opening it tells this site that much. Tap neither and nothing is ever sent. That is not a promise, it is checked on every build — the test answers five questions and fails if a single byte goes out, then taps each button and fails if what goes out carries anything beyond those counts.",
  "intro.subhead": "How Vikki Goodwin, Gina Hinojosa and James Talarico voted in the Texas House, checked against your own answers.",
  "rep.heading": "And how did your own representative vote?",
  "rep.lede": "The three above are running for offices that affect every Texan. This is the person who actually represents you in the Texas House, scored the same way and on the same votes you answered.",
  "rep.districtLabel": "Or your district number",
  "rep.districtPlaceholder": "1 to 150",
  "rep.findDistrict": "If you do not know your district, it is on your voter registration card, or search your address at {link}.",
  "rep.findDistrictLinkText": "the state's own lookup",
  "rep.noSuchDistrict": "District {d} has no sitting member in this record. 149 of the 150 seats are filled.",
  "rep.outOfRange": "The Texas House has districts 1 to 150.",
  "rep.noVotes": "{name} cast none of the {items} votes you were asked about, so there is no alignment to report. That is an absence, not a middling result.",
  "rep.answerFirst": "Answer a few votes first, then come back and look your representative up.",
  "rep.coverage": "Their record covers {voted} of the {items} questions in the full set, and {n} of those overlap what you answered. A vote they missed is dropped for them alone, not counted against them.",
  "rep.thin": "Only {n} of your answers overlap their record, so this number is heavily shrunk toward zero and should not be read closely.",
  "rep.loadFailed": "Could not load the member record. The rest of the page is unaffected; the file is at {link} if you want to check it yourself.",
  "rep.excluded": "{n} people voted in this session but are not in this lookup, having left the House since. A district whose seat changed hands will show its current member with a partial record.",
  "rep.excludedOne": "{name} also represented district {district} this session, casting {votes} votes before leaving the House. They are not in this lookup, which answers who represents a district now, so district {district} shows its current member with a partial record.",
  "rep.district": "District {d}",
  "rep.zipLabel": "Your ZIP code",
  "rep.zipPlaceholder": "5 digits",
  "rep.zipWhole": "All of {zip} sits in District {d}.",
  "rep.zipSpans": "ZIP {zip} is split across {n} House districts. Which one you are in comes down to your street, so pick yours below, or get an exact answer from {link}.",
  "rep.zipShare": "{pct}% of this ZIP",
  "rep.zipShareSmall": "under 1% of this ZIP",
  "rep.zipUnknown": "{zip} is not a Texas ZIP code in this record.",
  "rep.zipFailed": "Could not load the ZIP list. The district number box still works.",
  "guess.heading": "First, a guess: where do you think you'll land?",
  "guess.body": "Put the marker where you expect your own answers to put you. At the end you'll see both: your guess, and where the actual votes placed you.",
  "guess.hint": "Drag it, tap the bar, or use the arrow keys.",
  "guess.continue": "That's my guess",
  "guess.skip": "Skip this and start",
  "guess.unplaced": "Move the marker to make a guess, or skip it.",
  "guess.at": "Your guess: {label}",
  "guess.label.farD": "well over on the Democratic side",
  "guess.label.nearD": "a little toward the Democratic side",
  "guess.label.middle": "about the middle",
  "guess.label.nearR": "a little toward the Republican side",
  "guess.label.farR": "well over on the Republican side",
  "strip.legendGuess": "where you guessed you'd land",
  "result.guessLine": "You guessed {guess}. On the actual votes you landed {actual}.",
  "result.guessExact": "You guessed {guess}, and that is where you landed.",
  "share.button": "Add my result to the count",
  "share.what": "Nothing is sent unless you tap that. If you do, one request carries where you landed, three numbers about your answers, and which way you answered each vote — no name, no address, nothing that identifies you. Only totals are kept.",
  "share.sending": "Sending…",
  "share.done": "Added. {total} results counted so far.",
  "share.already": "This device already added one. Try again in a few hours.",
  "share.failed": "That didn't go through, so nothing was counted.",
  "share.link": "Challenge someone with these seven",
  "share.linkNote": "Makes a link carrying your answers to these seven votes. Whoever opens it answers the same seven blind first, then sees how the two of you compare. Nothing is sent anywhere and nothing is stored: the answers ride in the part of the address after the # symbol, which browsers never transmit to a website, so no link preview can give your result away either.",
  "share.copy": "Copy link",
  "share.copied": "Link copied",
  "share.copyFailed": "Could not copy. The link is in the box above.",
  "share.text": "I took a blind quiz on 7 real Texas House votes. Answer the same 7, then see how we compare.",
  "shared.intro": "Somebody has challenged you on the same seven votes. Answer them first, then you will see how the two of you compare.",
  "compare.heading": "How the two of you compare",
  "compare.agreed": "You agreed on {agreed} of the {both} votes you both answered.",
  "compare.allAgreed": "You agreed on every one of the {both} votes you both answered.",
  "compare.noneShared": "You did not answer any of the same votes, so there is nothing to compare yet.",
  "compare.positions": "On those votes you landed {mine}. They landed {theirs}.",
  "compare.same": "You both landed in the same place: {mine}.",
  "strip.legendThem": "where they landed",
  "compare.again": "Challenge somebody else",
};

export const ES: Record<CopyKey, string> = {
  "verdict.fewMarks.headline": "Responda unas cuantas más y podremos decirle algo",
  "verdict.fewMarks.caveat": "Hasta ahora ha respondido {n} {votes}. Necesitamos al menos {min}.",
  "verdict.weakLoad.headline": "Estos votos no alcanzan para ubicarle",
  "verdict.weakLoad.caveat": "En los que respondió, republicanos y demócratas votaron casi siempre del mismo modo. Así que sus respuestas no dicen mucho sobre a qué partido está más cerca, en ninguna dirección.",
  "verdict.balanced.headline": "Está dividido exactamente por la mitad",
  "verdict.balanced.caveat": "Aproximadamente tantas de sus respuestas coincidieron con los republicanos como con los demócratas. Este es el resultado morado.",
  "verdict.crossover.headline": "Se inclina hacia {party}, pero cruza líneas a menudo",
  "verdict.crossover.caveat": "La mayoría de sus respuestas coincidieron con {party}, pero una parte considerable coincidió con {other}.",
  "verdict.consistent.headline": "Coincide con {party} casi siempre",
  "verdict.consistent.caveat": "Casi todas sus respuestas coincidieron con el mismo partido.",
  "verdict.nearMiddle.headline": "Se ubica cerca del centro",
  "verdict.nearMiddle.caveat": "No porque se divida entre los partidos, sino porque los votos que respondió ya caían cerca de la línea entre ellos.",
  "score.almostAlways": "Vota con usted casi siempre",
  "score.moreOften": "Vota con usted más veces que no",
  "score.leansToward": "Se inclina hacia sus posturas",
  "score.chance": "No más claro que el azar en ningún sentido",
  "score.leansAgainst": "Se inclina en contra de sus posturas",
  "score.againstAlways": "Vota en contra de usted casi siempre",
  "axis.alignment": "cuánto vota este legislador con usted",
  "axis.load": "¿qué tan partidistas son sus propias posturas?",
  "intro.h1": "La Franja Morada",
  "q.skipQuiz": "Omitir el cuestionario y echar un vistazo",
  "rep.answerForScore": "Responda algunos votos y aquí verá qué tan de cerca {name} coincide con usted.",
  "result.checkRep": "¿Cómo votó mi propio representante?",
  "how.close": "Cerrar",
  "how.full": "El método completo, los datos y quién hizo esto",
  "q.resultNow": "Ver mi resultado hasta ahora",
  "result.keepGoing": "Seguir respondiendo: quedan {left}",
  "start.lede": "Siete votos que su Cámara de Texas realmente emitió en 2025. Ocultamos quién votó de qué manera. ¿Dónde se sitúa usted?",
  "start.begin": "Empezar",
  "start.fine": "Unos dos minutos · sin registro · nada sale de este dispositivo a menos que usted lo pida",
  "start.how": "Cómo funciona esto",
  "start.hide": "Ocultar",
  "vote.yes": "A favor",
  "vote.no": "En contra",
  "q.prompt": "¿Votaría usted a favor de este proyecto de ley?",
  "q.next": "Siguiente",
  "q.seeResult": "Ver dónde se sitúa",
  "q.showOfficial": "Texto oficial",
  "q.hideOfficial": "Ocultar texto oficial",
  "q.officialNote": "La pregunta de arriba es nuestro resumen en lenguaje sencillo. Este es el texto oficial del proyecto de ley, palabra por palabra. La Cámara votó {yeas} a favor, {nays} en contra.",
  "q.askedAs": "Este todavía no tiene versión en lenguaje sencillo, así que se plantea con el texto oficial.",
  "q.youSaid": "Usted votó {vote}.",
  "result.restart": "Empezar de nuevo",
  "result.tryAll": "Responder los 67 votos",
  "theme.toDark": "Oscuro",
  "theme.toLight": "Claro",
  "intro.p1": "<b>Los legisladores de Texas votan a favor o en contra de nuevas leyes.</b> Tomamos votos reales de 2025 y ocultamos quién votó de qué manera. Ahora vota usted.",
  "intro.p2": "En cada uno contamos cuántos republicanos votaron a favor y cuántos demócratas votaron a favor. ¿Sobre todo republicanos? Lo pintamos de <span class=\"sw-r\">rojo</span>. ¿Sobre todo demócratas? <span class=\"sw-b\">Azul</span>. ¿Los dos partidos de acuerdo? <span class=\"sw-g\">Gris</span>, porque ese voto no nos dice mucho sobre bandos.",
  "intro.p3": "Cada respuesta que da se convierte en un punto. Los puntos a la izquierda significan que coincidió con los demócratas. Los de la derecha, con los republicanos. <b>Si sus puntos caen en los dos lados, usted no encaja limpiamente en un solo partido.</b> Esa es la parte morada.",
  "intro.p4": "Después le mostramos <b>cómo están realmente estas áreas en Texas hoy</b>: financiamiento escolar, cobertura de salud y otras, con la fuente de cada cifra.",
  "intro.fine": "La opinión de nadie decide los colores. Salen de los conteos reales de votos, y usted puede verificarlos en cada pregunta. Las cifras de resultados también son reales, pero la posición de un estado tiene muchas causas: le mostramos las cifras y los votos, y la conexión la hace usted.",
  "bias.heading": "¿No favorece esto a quienes tienen historial de votos?",
  "bias.p1": "Lo haría, si calificáramos a alguien más. Por eso no lo hacemos. Una calificación aquí necesita una sola cosa: los mismos proyectos de ley, votados por ambos. Solo los miembros de la Cámara de Representantes de Texas tienen eso. Los {n} candidatos de arriba están en la Cámara de Texas. Ninguna de las personas contra las que compiten lo está:",
  "bias.p2": "Así que no reciben ninguna cifra: ni baja, ni estimada. Cualquier calificación que imprimiéramos para ellos serían votos que nos inventamos.",
  "bias.p3": "Lo que evita que esta sea una página sobre {n} demócratas. Debajo de cada una de las {items} preguntas mostramos también a {total} miembros en funciones de la Cámara: {reps} republicanos y {dems} demócratas.",
  "bias.p3b": "Votaron los mismos proyectos que usted está respondiendo ({lo}-{hi} de {items}), así que se califican igual que los candidatos, en cada pregunta y no en unas pocas escogidas. Si los historiales republicanos quedan cerca de los demócratas según sus respuestas, ese es el hallazgo, no un pulgar en la balanza.",
  "bias.p4": "Donde un oponente sí deja huella. En {acts} de las {items} hay una acción registrada sobre ese mismo proyecto: un veto, o un proyecto declarado prioridad obligada. La mostramos debajo de esa pregunta y nunca la sumamos a un conteo.",
  "bias.fine": "Una sola regla escoge los {total} nombres, y no se puede ajustar pregunta por pregunta. Así que si cree que está haciendo un trabajo que no debería, la regla es lo que hay que discutir, y cada voto detrás de ella está en {payload}. La otra mitad de esta respuesta es {authorLink}.",
  "author.heading": "Quién hizo esto, quién lo pagó y qué tengo en juego",
  "author.built": "<b>Soy Marco Arras y hice esto en mi propio tiempo.</b> Nadie lo pagó: ninguna campaña, ningún partido, ningún PAC, ninguna organización. No hubo presupuesto. El costo fueron mis noches.",
  "author.donation": "<b>Yo dono al Partido Demócrata.</b> Debería saberlo antes de leer cualquier otra cosa aquí, y es la razón por la que esta página está construida como está, no una nota al pie. Tengo un lado. Por eso la regla que escoge a los miembros de comparación funciona igual en las dos bancadas, un tercio de las preguntas se reserva para votos en los que los dos partidos <em>estuvieron de acuerdo</em>, la regla de selección tiene nombre y está publicada, y cada voto, conteo y calificación está en un archivo que usted puede descargar y verificar. Nada de eso le pide que confíe en mí. Ese es exactamente el punto.",
  "author.job": "<b>A qué me dedico.</b> Trabajo como arquitecto de soluciones en el sector energético. El sector compra y vende energía, lo cual se cruza con los votos sobre servicios públicos de esta página, así que debería ponderar en consecuencia lo que yo diga sobre esos. Mi empleador no tuvo participación en esto, no lo financió y no lo revisó. No hago ningún tipo de trabajo político remunerado.",
  "author.races": "<b>Yo escogí estas tres contiendas.</b> Gobernador, Vicegobernador y Senado de Estados Unidos. Esa es una decisión editorial, no una medición, y es la elección que más vale la pena discutir. Las escogí porque los tres candidatos demócratas están en la Cámara de Texas, lo que significa que sus historiales se pueden comparar con sus respuestas voto por voto. Los de sus oponentes no, así que esta página no les da ninguna calificación en lugar de darles una inventada.",
  "author.why": "<b>Por qué lo hice.</b> Casi todo lo que llega a la gente sobre cómo se gobierna realmente su estado llega ya enmarcado por alguien que quiere algo. Los votos en sí son públicos, tediosos y de verdad difíciles de alcanzar. Quería una manera de ver el registro antes de ver la etiqueta, y de entregar el archivo completo para que cualquiera pueda verificar que el registro es lo que yo digo que es.",
  "author.contact": "Si algo aquí está mal, dígamelo: <a href=\"mailto:arras.marco@gmail.com\">arras.marco@gmail.com</a>. Las correcciones se hacen y se anotan en la página.",
  "mode.short": "7 temas grandes",
  "mode.full": "Los {n} votos",
  "mode.shortDesc": "Siete de las peleas más grandes de la sesión: los proyectos que el Vicegobernador hizo prioridades o que el Gobernador vetó. <b>Seis de las siete dividieron limpiamente por línea partidista</b>, así que esta versión casi solo puede decirle hacia qué partido se inclina. Cambie a los {n} votos para encontrar dónde cruza.",
  "mode.fullDesc": "Los {n} votos: uno por proyecto, repartidos en 20 materias, incluidos aquellos en los que republicanos y demócratas estuvieron de acuerdo. Esos son los votos que pueden mostrarle cruzando líneas partidistas.",
  "cand.note": "Los tres estuvieron en la misma cámara y compiten por cargos distintos, así que estas son tres lecturas separadas, no una clasificación. Votaron juntos en la mayoría de los proyectos de línea partidista, así que espere que las cifras queden cerca; donde se separan es la parte interesante. Cobertura sobre estos {items} votos: {coverage}. Un voto que no emitieron se descarta solo para ellos, no se cuenta en su contra.",
  "stmt.heading": "Declaraciones de voto",
  "stmt.note": "Un miembro de Texas puede presentar una declaración diciendo que el Diario lo registró mal. El voto registrado es el acto oficial y es lo que se califica aquí; la declaración se muestra al lado, nunca se aplica en su lugar.",
  "preset.heading": "Pruebe un perfil",
  "preset.mixed": "Votante con presiones cruzadas",
  "preset.muted": "Solo votos de señal baja",
  "preset.consistent": "Partidista consistente",
  "preset.reset": "Limpiar",
  "preset.note": "Los dos primeros producen casi la misma <code>inclinación neta</code>: una sola muestra mezclada pintaría ambos del mismo morado. Son hallazgos opuestos, así que la lectura los separa por <code>carga partidista</code>.",
  "ui.showTable": "Mostrar tabla",
  "ui.hideTable": "Ocultar tabla",
  "ui.methodHeading": "Cómo está construido esto",
  "ui.officialCaption": "Título oficial, tal como fue registrado",
  "ui.translationNotice": "El español aquí es nuestra traducción, no una versión oficial. El texto oficial de cada proyecto de ley está en inglés y está a un toque de distancia en cada pregunta.",
  "noun.vote.one": "voto",
  "noun.vote.many": "votos",
  "party.D": "los demócratas",
  "party.R": "los republicanos",
  "verdict.mildLean.headline": "Se inclina hacia {party}",
  "verdict.mildLean.caveat": "Más de sus respuestas coincidieron con ese partido que con el otro.",
  "hdr.eyebrow": "PlainRecord · Cámara de Texas {session} · {n} votos reales registrados",
  "prov.questions.label": "Preguntas",
  "prov.questions.short": "las siete peleas más grandes de la sesión",
  "prov.questions.full": "uno por proyecto, en {cats} materias",
  "prov.record.label": "Directo del registro",
  "prov.record.hint": "tomado del Diario oficial de la Cámara, no de un resumen",
  "prov.agreed.label": "Los dos partidos de acuerdo",
  "prov.agreed.mostlyParty": "casi todas fueron peleas de línea partidista",
  "prov.agreed.notAFight": "estos votos no fueron para nada una pelea entre partidos",
  "prov.picked.label": "Escogidas por",
  "prov.picked.hand": "mano",
  "prov.picked.rule": "una regla escrita",
  "prov.picked.handHint": "cada una muestra por qué fue escogida",
  "prov.picked.ruleHint": "{rule}, máximo {perCat} por materia",
  "stats.lean.label": "Hacia dónde se inclina",
  "stats.lean.towardD": "hacia los demócratas",
  "stats.lean.towardR": "hacia los republicanos",
  "stats.lean.middle": "exactamente por la mitad",
  "stats.lean.empty": "responda algunos votos",
  "stats.cross.label": "Con qué frecuencia cruza",
  "stats.cross.hint": "de sus respuestas caen del lado opuesto a su inclinación general",
  "stats.load.label": "Qué tan partidistas fueron estos votos",
  "stats.load.low": "muy baja: estos votos apenas dividieron a los partidos",
  "stats.load.hint": "1.00 significaría que cada miembro votó con su bando",
  "strip.noContent": "sin contenido partidista",
  "strip.empty": "Responda un voto para colocar la primera marca.",
  "strip.candidateRecords": "Historial de los candidatos en los mismos votos",
  "strip.dotLabel": "{bill} {category}, usted respondió {answer}, posición {pos}",
  "strip.title": "Cada voto respondido trazado en un eje partidista de azul a rojo, con el historial de los tres candidatos debajo",
  "strip.legendYours": "su respuesta",
  "strip.legendCands": "historial del candidato en los mismos votos",
  "vote.yea": "A favor",
  "vote.nay": "En contra",
  "vote.none": "sin voto registrado",
  "q.blind": "a ciegas: no se muestra el partido",
  "q.caption": "Título oficial del proyecto. La Cámara votó {yeas} a favor y {nays} en contra.",
  "q.plainTag": "En términos simples",
  "q.plainNote": "Nuestro resumen, no el texto oficial. El título de arriba es la redacción oficial.",
  "q.whyThis": "Por qué esta:",
  "q.skip": "Omitir",
  "q.showReceipt": "Ver el comprobante",
  "q.hideReceipt": "Ocultar el comprobante",
  "q.receiptHead": "Cómo se colorea este voto.",
  "q.receiptBody": "La valencia es el porcentaje republicano a favor menos el porcentaje demócrata a favor: medida, no juzgada.",
  "q.rYea": "Republicanos que votaron a favor",
  "q.dYea": "Demócratas que votaron a favor",
  "q.doneEyebrow": "Listo",
  "q.doneCaption": "Los {n} votos fueron respondidos u omitidos.",
  "q.doneSub": "La franja de arriba contiene cada respuesta con contenido partidista medible.",
  "q.startOver": "Empezar de nuevo",
  "rev.threeRaces": "Las tres contiendas: cómo votaron en {bill}",
  "rev.noneVoted": "Ninguno de los tres tiene voto registrado en este proyecto.",
  "rev.agreedCount": "{agreed} de {counted} votaron igual que usted",
  "rev.missingOne": ", y uno no tiene voto registrado.",
  "rev.missingMany": ", y {n} no tienen voto registrado.",
  "rev.youSaid": "Usted dijo",
  "rev.partyVote": "Cómo votó cada partido",
  "rev.compareSummary": "Compare con otros seis miembros de la Cámara",
  "rev.compareHint": "tres de cada partido, escogidos por regla",
  "rev.repsHead": "Tres republicanos, escogidos por regla",
  "rev.demsHead": "Tres demócratas, escogidos por la misma regla",
  "rev.compareNote": "Ninguno de estos seis está en la boleta. De cada bancada: el miembro más de línea partidista, el mediano y el que más veces rompió filas; la misma regla en los dos lados, recalculada en cada compilación, para que la comparación no sea una selección de nombres.",
  "rev.oppHead": "Qué hicieron sus oponentes con este proyecto",
  "rev.oppVetoed": "lo vetó",
  "rev.oppSigned": "lo firmó",
  "rev.oppUnsigned": "la dejó pasar sin firmar",
  "rev.oppNoSide": "no tomó postura",
  "rev.oppSignedNote": "Un gobernador firma la mayoría de lo que le llega, así que una firma significa que no se opuso, no que lo impulsara.",
  "rev.oppPriority": "lo hizo prioridad",
  "rev.oppNote": "No son votos: ninguno de ellos vota en la Cámara, así que no se cuentan arriba. Y cada lista corre en un solo sentido: un gobernador veta solo los proyectos que rechaza, y una lista de prioridades nombra solo los proyectos que su autor quiere aprobar. Por eso ve una postura en este proyecto y nunca un porcentaje.",
  "rev.outcomeHead": "Cómo está Texas en {category}",
  "rev.sameSide": "del mismo lado que usted",
  "rev.oppositeSide": "del lado opuesto al suyo",
  "rev.source": "fuente",
  "outc.leftBlank": "Dejado en blanco a propósito:",
  "outc.incumbent": "{name} ha sido {office} desde {since}, abarcando {sessions}.",
  "table.empty": "Nada respondido todavía.",
  "table.bill": "Proyecto",
  "table.caption": "Título",
  "table.category": "Materia",
  "table.you": "Usted",
  "table.rYea": "R a favor",
  "table.dYea": "D a favor",
  "table.valence": "Valencia",
  "table.position": "Posición",
  "table.source": "Fuente",
  "sec.howMany": "Cuántos votos",
  "sec.yourAnswers": "Sus respuestas, una marca cada una",
  "sec.netLean": "inclinación neta",
  "sec.candidates": "Los tres candidatos, calificados según sus respuestas",
  "sec.outcomes": "Cómo están estas áreas ahora",
  "method.where.lead": "De dónde vienen las preguntas.",
  "method.where.body": "Son votos reales que emitió la Cámara de Texas. Usamos un voto por proyecto, así que ningún proyecto se pregunta dos veces. Después clasificamos los proyectos en 20 materias, la misma lista que usa la biblioteca legislativa del estado, y tomamos como máximo {perCat} de cada materia.",
  "method.notFights.lead": "Por qué algunas preguntas no son peleas cerradas.",
  "method.notFights.body": "Cerca de {reserve} de cada 100 lugares se reservan para votos en los que republicanos y demócratas <em>estuvieron de acuerdo</em>. Lo hacemos a propósito. Si solo escogiéramos las peleas grandes, cada respuesta que diera caería en un extremo o en el otro, y nadie podría salir morado. La regla que seguimos está escrita y se llama {rule}, así que puede comprobar que no la cambiamos para obtener una respuesta más agradable.",
  "method.who.lead": "Quién aparece en esta página.",
  "method.seven.lead": "Las siete grandes.",
  "method.seven.body": "Las escogimos a mano, pero no según nuestra propia opinión. Cada una es un proyecto que el Vicegobernador declaró prioridad, o que el Gobernador vetó. Esas son sus listas publicadas, no las nuestras. Cada pregunta muestra por qué entró en la lista. Seis de las siete dividieron a los dos partidos con claridad, y eso es lo que hace una pelea de portada.",
  "method.words.lead": "De dónde vienen las palabras.",
  "method.words.body": "Cada pregunta es el resumen oficial del proyecto, copiado palabra por palabra. No lo reescribimos para que suene mejor ni peor. Cómo votó cada miembro viene del Diario oficial de la Cámara donde pudimos hacer la correspondencia (<span class=\"src\">journal</span>), y en los demás casos de una extracción automática (<span class=\"src\">scrape</span>). La tabla le dice cuál, en cada voto.",
  "method.check.lead": "Compruébelo usted mismo.",
  "method.check.body": "Cada voto, conteo y calificación detrás de esta página está en un solo archivo: {link}. Es el archivo exacto que cargó esta página, no una copia hecha para aparentar. Tómelo: los datos son de dominio público (CC0) y el código es MIT. Si reutiliza una cifra de resultados, por favor lleve su advertencia con ella.",
  "readout.answered": "{n} de {total} respondidas",
  "bias.clearestCase": "{name} es el caso más claro: {why}",
  "bias.authorLinkText": "quién hizo esto y qué tengo en juego",
  "q.counter": "{i} de {n}",
  "q.valenceRow": "valencia",
  "outc.rankAria": "{value}: {comparison}",
  "rev.voted": "votó {vote}",
  "rev.sameAsYou": "igual que usted",
  "rev.oppositeToYou": "al contrario que usted",
  "rev.youSaidVote": "Usted votó <b>{vote}</b>.",
  "rev.reps": "Republicanos",
  "rev.dems": "Demócratas",
  "rev.yeaShare": "{pct} a favor",
  "tip.youAnswered": "Usted votó",
  "tip.rYea": "R a favor",
  "tip.dYea": "D a favor",
  "tip.position": "su posición",
  "tip.chamber": "cámara",
  "page.title": "Historial de votos de la Cámara de Texas — Goodwin, Hinojosa, Talarico | La Franja Morada",
  "page.description": "Un cuestionario a ciegas sobre votos reales de la Cámara de Texas. Responda sin saber qué partido tomó qué lado, y después vea dónde queda usted y cómo está Texas en realidad.",
  "page.langSwitch": "In English",
  "page.translationNotice": "Todo lo que escribimos nosotros está en español. Los títulos oficiales de los proyectos de ley se quedan en inglés, tal como constan en el registro: traducirlos los convertiría en otra cosa.",
  "strip.legendRamp": "Codificado demócrata ← posición → codificado republicano",
  "prov.record.value": "{n} de {total}",
  "strip.poleD": "de código demócrata",
  "strip.poleR": "de código republicano",
  "strip.poleDShort": "cód. demócrata",
  "strip.poleRShort": "cód. republicano",
  "og.eyebrow": "CÁMARA DE TEXAS · LEGISLATURA {session}",
  "og.deck": "Un cuestionario a ciegas sobre <b>{n} votos reales</b>. Las etiquetas de partido quedan ocultas hasta después de responder.",
  "og.axisD": "COINCIDIÓ CON LOS DEMÓCRATAS",
  "og.axisMid": "LOS DOS PARTIDOS",
  "og.axisR": "COINCIDIÓ CON LOS REPUBLICANOS",
  "og.prov": "{rollcalls} votaciones nominales · {eligible} elegibles · {asked} preguntadas",
  "og.imageAlt": "La Franja Morada — un cuestionario a ciegas sobre {n} votos reales de la Cámara de Texas. Un eje de azul a rojo rotulado \"coincidió con los demócratas\" y \"coincidió con los republicanos\", con {dots} puntos morados repartidos por todo su ancho.",
  "method.denominator.lead": "Dos cifras de votos sin división partidista, y por qué.",
  "method.denominator.body": "El porcentaje de los recuadros de arriba cuenta las {items} preguntas. El campo <code>crossCuttingShare</code> del archivo de datos se mide solo sobre los votos escogidos por la regla, así que es una cifra ligeramente distinta. Eso es a propósito: existe para comprobar la <em>regla</em>, y los siete proyectos principales los escogimos a mano y no por regla; seis de ellos dividieron a los partidos con claridad, así que contarlos haría parecer la regla más sesgada de lo que es. Las dos cifras son honestas y ninguna es la otra redondeada.",
  "method.labels.lead": "Por qué las materias no cuadran.",
  "method.labels.body": "La regla escogió {ruleSelected} votos, como máximo {perCat} por materia, y nosotros añadimos a mano {headline} proyectos importantes — las {items} preguntas de aquí. Si hoy cuenta las materias en el archivo de datos, esa cuenta no le saldrá. Después de escoger los votos corregimos seis etiquetas de materia que estaban mal en la página: <em>Aborto</em> aparecía encima de una pregunta sobre perseguir delitos electorales. Corregir una etiqueta no puede volver atrás y cambiar qué votos escogió la regla, así que lo que usted cuenta son las etiquetas corregidas sobre la selección original. Preferimos enseñarle eso antes que reetiquetar en silencio y dejar que la cuenta parezca limpia.",
  "privacy.lead": "Qué cuenta esta página y qué no.",
  "privacy.body": "Cuenta visitas · cuántas personas vinieron y qué enlace las envió · con la analítica de Vercel, que no usa cookies y no puede seguir su rastro en otro sitio. <b>Sus respuestas no forman parte de eso.</b> Nunca salen de su navegador mientras responde: la página no hace ninguna petición de red hasta que termine. Si luego toca <b>añadir mi resultado</b> en la pantalla de resultados, sale una sola petición que lleva dónde quedó, tres números sobre sus respuestas y en qué sentido respondió cada voto. Sin nombre, sin dirección, sin nada que revele su identidad, y al otro lado solo se guardan totales: no queda registro de su envío concreto que se pueda consultar. Si en cambio toca <b>compartir dónde quedé</b>, obtiene un enlace que contiene un solo dato, en cuál de once posiciones quedó, y quien lo abra le indica eso a este sitio. Si no toca ninguno de los dos, nunca se envía nada. Eso no es una promesa, se comprueba en cada compilación — la prueba responde cinco preguntas y falla si sale un solo byte, y después toca cada botón y falla si lo que sale lleva algo más que esos conteos.",
  "intro.subhead": "Cómo votaron Vikki Goodwin, Gina Hinojosa y James Talarico en la Cámara de Texas, comparado con sus propias respuestas.",
  "rep.heading": "¿Y cómo votó su propio representante?",
  "rep.lede": "Los tres de arriba se postulan para cargos que afectan a todos los texanos. Esta es la persona que de verdad le representa en la Cámara de Texas, calificada igual y sobre los mismos votos que usted respondió.",
  "rep.districtLabel": "O su número de distrito",
  "rep.districtPlaceholder": "1 a 150",
  "rep.findDistrict": "Si no sabe su distrito, está en su tarjeta de registro de votante, o busque su domicilio en {link}.",
  "rep.findDistrictLinkText": "la herramienta del estado",
  "rep.noSuchDistrict": "El distrito {d} no tiene miembro en funciones en este registro. 149 de los 150 escaños están ocupados.",
  "rep.outOfRange": "La Cámara de Texas tiene distritos del 1 al 150.",
  "rep.noVotes": "{name} no emitió ninguno de los {items} votos sobre los que se le preguntó, así que no hay coincidencia que informar. Es una ausencia, no un resultado intermedio.",
  "rep.answerFirst": "Responda algunos votos primero y luego vuelva a buscar a su representante.",
  "rep.coverage": "Su historial cubre {voted} de las {items} preguntas del conjunto completo, y {n} de esas coinciden con lo que usted respondió. Un voto que no emitieron se descarta solo para ellos, no se cuenta en su contra.",
  "rep.thin": "Solo {n} de sus respuestas coinciden con su historial, así que esta cifra está muy contraída hacia cero y no debería leerse de cerca.",
  "rep.loadFailed": "No se pudo cargar el registro de miembros. El resto de la página no se ve afectada; el archivo está en {link} si quiere comprobarlo usted mismo.",
  "rep.excluded": "{n} personas votaron en esta sesión pero no están en esta búsqueda, porque dejaron la Cámara desde entonces. Un distrito cuyo escaño cambió de manos mostrará a su miembro actual con un historial parcial.",
  "rep.excludedOne": "{name} también representó al distrito {district} en esta sesión y emitió {votes} votos antes de dejar la Cámara. No aparece en esta búsqueda, que responde quién representa un distrito ahora, así que el distrito {district} muestra a su representante actual con un historial parcial.",
  "rep.district": "Distrito {d}",
  "rep.zipLabel": "Su código postal",
  "rep.zipPlaceholder": "5 dígitos",
  "rep.zipWhole": "Todo el código postal {zip} está en el Distrito {d}.",
  "rep.zipSpans": "El código postal {zip} está repartido entre {n} distritos de la Cámara. Cuál le corresponde depende de su calle, así que elija el suyo abajo, o consulte {link} para una respuesta exacta.",
  "rep.zipShare": "{pct}% de este código postal",
  "rep.zipShareSmall": "menos del 1% de este código postal",
  "rep.zipUnknown": "{zip} no es un código postal de Texas en este registro.",
  "rep.zipFailed": "No se pudo cargar la lista de códigos postales. La casilla del número de distrito sigue funcionando.",
  "guess.heading": "Primero, una predicción: ¿dónde cree que va a quedar?",
  "guess.body": "Coloque el marcador donde espera quedar según sus propias respuestas. Al final verá ambos: su predicción y dónde quedó con los votos reales.",
  "guess.hint": "Arrástrelo, toque la barra o use las flechas del teclado.",
  "guess.continue": "Esa es mi predicción",
  "guess.skip": "Omitir esto y empezar",
  "guess.unplaced": "Mueva el marcador para hacer una predicción, u omítala.",
  "guess.at": "Su predicción: {label}",
  "guess.label.farD": "bastante hacia el lado demócrata",
  "guess.label.nearD": "algo hacia el lado demócrata",
  "guess.label.middle": "más o menos en el medio",
  "guess.label.nearR": "algo hacia el lado republicano",
  "guess.label.farR": "bastante hacia el lado republicano",
  "strip.legendGuess": "donde predijo que quedaría",
  "result.guessLine": "Predijo que quedaría {guess}. Con los votos reales quedó {actual}.",
  "result.guessExact": "Predijo que quedaría {guess}, y ahí es donde quedó.",
  "share.button": "Añadir mi resultado al conteo",
  "share.what": "No se envía nada a menos que lo toque. Si lo hace, una sola petición lleva dónde quedó, tres números sobre sus respuestas y en qué sentido respondió cada voto: sin nombre, sin dirección, sin nada que revele su identidad. Solo se guardan totales.",
  "share.sending": "Enviando…",
  "share.done": "Añadido. {total} resultados en el conteo hasta ahora.",
  "share.already": "Este dispositivo ya añadió uno. Inténtelo de nuevo en unas horas.",
  "share.failed": "Eso no se envió, así que no se contó nada.",
  "share.link": "Desafiar a alguien con estos siete",
  "share.linkNote": "Crea un enlace con sus respuestas a estos siete votos. Quien lo abra responde primero los mismos siete a ciegas, y después ve cómo se comparan los dos. No se envía nada a ningún sitio y no se guarda nada: las respuestas viajan en la parte de la dirección después del símbolo #, que los navegadores nunca transmiten a un sitio web, así que ninguna vista previa puede revelar su resultado.",
  "share.copy": "Copiar enlace",
  "share.copied": "Enlace copiado",
  "share.copyFailed": "No se copió. El enlace está en el cuadro de arriba.",
  "share.text": "Hice un cuestionario a ciegas sobre 7 votos reales de la Cámara de Representantes de Texas. Responda los mismos 7 y luego vea cómo nos comparamos.",
  "shared.intro": "Alguien le ha lanzado un desafío con los mismos siete votos. Respóndalos primero y luego verá cómo se comparan los dos.",
  "compare.heading": "Cómo se comparan los dos",
  "compare.agreed": "Coincidieron en {agreed} de los {both} votos que ambos respondieron.",
  "compare.allAgreed": "Coincidieron en todos los {both} votos que ambos respondieron.",
  "compare.noneShared": "No respondieron ninguno de los mismos votos, así que todavía no hay nada que comparar.",
  "compare.positions": "En esos votos usted quedó {mine}. La otra persona quedó {theirs}.",
  "compare.same": "Los dos quedaron en el mismo lugar: {mine}.",
  "strip.legendThem": "donde quedó la otra persona",
  "compare.again": "Desafiar a otra persona",
};

/**
 * Which strings a reviewer has signed off, by locale.
 *
 * Spanish rows still marked `draft` in copy.json are listed here so the page
 * can be honest about it: a build that ships unapproved Spanish should say so
 * rather than presenting a machine draft as a translation.
 */
export const ES_UNAPPROVED: readonly CopyKey[] = [

];
