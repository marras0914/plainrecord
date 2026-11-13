/**
 * PlainRecord: what Christian traditions officially say, and what the parties'
 * platforms say, issue by issue (the faith module)
 *
 * THE SITE NEVER DECIDES WHAT "THE CHRISTIAN POSITION" IS. This file holds
 * reported positions only: each tradition's official statements and each
 * party's platform plank, with a short verbatim excerpt, a neutral summary in
 * the site's words, and the source. The page sets them side by side, one
 * tradition at a time, and computes nothing.
 *
 * THE RULES, from stated_positions.ts and FAITH.md, applied to new sources:
 *
 *   1. Every entry carries a public sourceUrl and its date.
 *   2. One fixed list of issues; every tradition and both parties, at both
 *      levels, are placed on every issue.
 *   3. Direction only where a source states it. Emphasis without a position
 *      is left out and listed in KNOWN_GAPS.
 *   4. "No official statement" is a valid entry, shown on the page.
 *   5. Excerpts are verbatim and under 15 words; summaries describe and do not
 *      characterize, and use the same verbs for every source.
 *   6. EVERY qualifying statement is listed, newest first (decided 12 Nov
 *      2026), so a tradition whose position has moved shows the movement.
 *      What qualifies is fixed per tradition in TRADITIONS[].official and is
 *      the same for every issue: the body that speaks for the tradition, not
 *      its staff, its agencies or its leaders' columns.
 *
 * NOT YET REVIEWED. Marco decided on 12 Nov 2026 to publish before reviewers
 * from these traditions are found, with every page saying plainly that the
 * entries have not been reviewed by members of the traditions they describe.
 * `review` stays empty until someone has. This reverses FAITH.md's original
 * launch gate, which said nothing ships unreviewed.
 *
 * Sources are read as raw text from downloads in data/faith_sources/
 * (gitignored), and `npm run data:faith:quotes` checks every excerpt against
 * them.
 *
 * Last reviewed: 2026-11-12 (pilot: immigration only).
 */

import { readFileSync } from 'node:fs';

export type IssueId =
  | 'immigration' | 'abortion' | 'poverty' | 'death-penalty'
  | 'guns' | 'environment' | 'healthcare' | 'criminal-justice';

export const ISSUES: { id: IssueId; name: string; description: string }[] = [
  { id: 'immigration', name: 'Immigration', description: 'Who may come to and stay in the United States, and how the law is enforced at the border and within it.' },
  { id: 'abortion', name: 'Abortion', description: 'Whether and when the law permits ending a pregnancy.' },
  { id: 'poverty', name: 'Poverty and welfare', description: 'Public assistance for people with low incomes.' },
  { id: 'death-penalty', name: 'The death penalty', description: 'Whether the state may execute people convicted of crimes.' },
  { id: 'guns', name: 'Guns', description: 'Who may own firearms and how the law regulates them.' },
  { id: 'environment', name: 'Creation care and the environment', description: 'Pollution, conservation and climate.' },
  { id: 'healthcare', name: 'Healthcare', description: 'Who pays for medical care and how people get access to it.' },
  { id: 'criminal-justice', name: 'Criminal justice', description: 'Policing, sentencing and prisons.' },
];

/** Issues whose entries are complete. The pilot fills immigration first. */
export const FILLED_ISSUES: IssueId[] = ['immigration', 'abortion'];

export type TraditionId = 'catholic' | 'sbc' | 'umc' | 'ame' | 'ag';

export const TRADITIONS: { id: TraditionId; name: string; family: string; official: string; libraryUrl: string }[] = [
  { id: 'catholic', name: 'Catholic Church in the United States', family: 'Catholic',
    official: 'Statements approved by the full body of U.S. bishops (USCCB), Forming Consciences for Faithful Citizenship first. Not staff, committee or diocesan letters.',
    libraryUrl: 'https://www.usccb.org/issues-and-action/faithful-citizenship' },
  { id: 'sbc', name: 'Southern Baptist Convention', family: 'Baptist',
    official: 'Resolutions adopted by the messengers at an SBC Annual Meeting. Not entity or agency statements.',
    libraryUrl: 'https://www.sbc.net/resource-library/resolutions/' },
  { id: 'umc', name: 'The United Methodist Church', family: 'Mainline Protestant',
    official: 'The Social Principles and the Book of Resolutions, as adopted by the General Conference (2024 revision).',
    libraryUrl: 'https://www.umc.org/en/what-we-believe/social-principles' },
  { id: 'ame', name: 'African Methodist Episcopal Church', family: 'Historically Black church',
    official: 'General Conference resolutions, then statements of the Council of Bishops.',
    libraryUrl: 'https://www.ame-church.com/' },
  { id: 'ag', name: 'Assemblies of God (USA)', family: 'Pentecostal',
    official: 'Position papers and official statements of the General Council or its Executive Presbytery. Not columns by its officers.',
    libraryUrl: 'https://ag.org/Beliefs/Position-Papers' },
];

export interface Review { reviewerId: string; date: string }

export interface Statement {
  traditionId: TraditionId;
  issueId: IssueId;
  title: string;
  /** Which official body adopted it, and how. */
  body: string;
  /** ISO date, or a year where the source gives only the year. */
  sourceDate: string;
  /** Neutral, the site's words. */
  summary: string;
  /** Verbatim, under 15 words, the source's words. */
  excerpt: string;
  sourceUrl: string;
  review: Review[];
}

/**
 * An earlier or further qualifying statement, listed by title, date and link
 * under the current one, with no summary or excerpt. Decided 13 Nov 2026:
 * long histories (the SBC has about 25 resolutions mainly on abortion) show
 * the current statement in full and list every other qualifying one, so
 * nothing is hidden and nothing is chosen. A reader follows the link for the
 * text.
 */
export interface Earlier {
  traditionId: TraditionId;
  issueId: IssueId;
  title: string;
  /** ISO date or year, as the source gives it. */
  date: string;
  url: string;
}

/**
 * Which statements are "on" an issue, for the listed history: a title that
 * contains one of these words. Mechanical, so the list is the same whoever
 * builds it; a statement about an issue that does not name it in its title is
 * not listed, and that is the rule's cost.
 */
export const ISSUE_TITLE_TERMS: Record<IssueId, RegExp> = {
  // Not "refugee" or "border": those titles include persecution abroad (North
  // Korean refugees in China), which is not U.S. immigration policy.
  immigration: /immigra|migrant|sojourner/i,
  // Not "sanctity of life": it made a 2026 resolution on assisted suicide the
  // SBC's latest abortion statement. The cost is that two resolutions titled
  // only "Sanctity of Human Life" (1991, 2015) are not listed.
  abortion: /abortion|pro-?life|roe v|planned parenthood|hyde/i,
  poverty: /poverty|\bpoor\b|welfare|hunger|minimum wage/i,
  'death-penalty': /death penalty|capital punishment|execution/i,
  guns: /\bgun|firearm|weapon/i,
  environment: /environment|creation care|climate|pollution|stewardship of creation|ecolog/i,
  healthcare: /health ?care|health insurance|medicaid|medicare/i,
  'criminal-justice': /criminal justice|prison|incarcerat|sentenc|policing|police/i,
};

export interface Plank {
  party: 'D' | 'R';
  level: 'texas' | 'national';
  platformYear: number;
  issueId: IssueId;
  summary: string;
  excerpt: string;
  sourceUrl: string;
  review: Review[];
}

const SRC = {
  usccb2023: 'https://www.usccb.org/resources/2023-Nov-15%20FCFC%20action%20item%20text%20final.pdf',
  usccb2019: 'https://www.usccb.org/resources/forming-consciences-for-faithful-citizenship-2019.pdf',
  sbc2026: 'https://www.sbc.net/resource-library/resolutions/on-immigration-human-dignity-and-the-rule-of-law/',
  sbc2023: 'https://www.sbc.net/resource-library/resolutions/on-wisely-engaging-immigration/',
  sbc2018: 'https://www.sbc.net/resource-library/resolutions/on-immigration/',
  sbc2011: 'https://www.sbc.net/resource-library/resolutions/on-immigration-and-the-gospel/',
  umc: 'https://www.umc.org/content/what-the-umc-believes-about-immigrants-and-migrants',
  ame2018: 'https://www.ame-church.com/news/cob-statement-re-condemning-immigrant-family-separation/',
  ag2006: 'https://ethnicrelations.ag.org/About',
  sbcAbortion2025: 'https://www.sbc.net/resource-library/resolutions/on-standing-against-the-moral-evils-and-medical-dangers-of-chemical-abortion-pills/',
  umcAbortion: 'https://www.umc.org/en/content/ask-the-umc-valuing-life-abortion-adoption',
  agAbortion2010: 'https://ag.org/Beliefs/Position-Papers/Sanctity-of-Human-Life-Abortion',
  rpt2024: 'https://texasgop.org/wp-content/uploads/2024/06/2024-RPT-Platform.pdf',
  tdp2024: 'https://txdem.co/24-Platform',
  rnc2024: 'https://www.presidency.ucsb.edu/documents/2024-republican-party-platform',
  dnc2024: 'https://www.presidency.ucsb.edu/documents/2024-democratic-party-platform',
} as const;

export const STATEMENTS: Statement[] = [
  // --- immigration --------------------------------------------------------
  {
    traditionId: 'catholic', issueId: 'immigration',
    title: 'Introductory Note to Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops', sourceDate: '2023-11-15',
    summary: 'Calls for comprehensive immigration reform that offers a path to citizenship, treats immigrant workers fairly, keeps families together, maintains the integrity of the borders, respects the rule of law, and addresses why people leave their countries.',
    excerpt: 'comprehensive immigration reform that offers a path to citizenship, treats immigrant workers fairly',
    sourceUrl: SRC.usccb2023, review: [],
  },
  {
    traditionId: 'catholic', issueId: 'immigration',
    title: 'Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops (2015 text, reissued 2019)', sourceDate: '2019',
    summary: 'Calls for reform that includes a broad legalization program with a path to citizenship, worker protections, family reunification, due process and refuge for people fleeing persecution, and says a nation\'s right to control its borders should be recognized but pursued justly and humanely.',
    excerpt: 'a broad and fair legalization program with a path to citizenship',
    sourceUrl: SRC.usccb2019, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'immigration',
    title: 'On Immigration, Human Dignity, and the Rule of Law',
    body: 'Resolution adopted at the SBC Annual Meeting, Orlando', sourceDate: '2026-06',
    summary: 'Calls for enforcing immigration law justly, humanely and with due process, including removing people the government prioritizes for deportation; rejects amnesty without accountability; rejects nativism and ethnic hostility; and asks for particular care for children and families.',
    excerpt: 'we reject amnesty, understood as forgiveness of legal violations without accountability',
    sourceUrl: SRC.sbc2026, review: [],
  },
  {
    traditionId: 'umc', issueId: 'immigration',
    title: 'Social Principles, as quoted by the church',
    body: 'Adopted by the General Conference (2024 revision)', sourceDate: '2024',
    summary: 'Affirms the dignity and rights of migrants, immigrants and refugees, urges congregations to welcome them, and opposes laws that criminalize or punish people for their migration status and detention in inhumane conditions.',
    excerpt: 'We affirm the dignity, worth, and rights of migrants, immigrants, and refugees',
    sourceUrl: SRC.umc, review: [],
  },
  {
    traditionId: 'ame', issueId: 'immigration',
    title: 'Statement condemning immigrant family separation',
    body: 'Council of Bishops', sourceDate: '2018',
    summary: 'Opposes the use of Romans 13 to justify separating immigrant children from their parents, supports the ecumenical Faith Leaders Statement on Family Separation, and says a positive resolution is needed for Dreamers.',
    excerpt: "justify and condone the U.S. government's separations of immigrant children from their parents",
    sourceUrl: SRC.ame2018, review: [],
  },
  {
    traditionId: 'ag', issueId: 'immigration',
    title: 'Official statement on immigration',
    body: 'The General Council of the Assemblies of God', sourceDate: '2006-08-14',
    summary: 'Says the borders should be secure so that immigration conforms to the law, supports comprehensive immigration reform reflecting human dignity, compassion and justice, and says ministry to everyone living or working in the country stands apart from questions of jurisdiction.',
    excerpt: 'we support comprehensive immigration reform that reflects human dignity, compassion, and justice',
    sourceUrl: SRC.ag2006, review: [],
  },
];

STATEMENTS.push(
  // --- abortion -----------------------------------------------------------
  {
    traditionId: 'catholic', issueId: 'abortion',
    title: 'Introductory Note to Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops', sourceDate: '2023-11-15',
    summary: 'Calls the threat of abortion the bishops\' pre-eminent priority, because it directly attacks the most vulnerable and ends more than a million lives a year in the United States, and pairs protecting children in the womb with solidarity with mothers.',
    excerpt: 'The threat of abortion remains our pre-eminent priority',
    sourceUrl: SRC.usccb2023, review: [],
  },
  {
    traditionId: 'catholic', issueId: 'abortion',
    title: 'Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops (2015 text, reissued 2019)', sourceDate: '2019',
    summary: 'Calls abortion the preeminent priority among threats to human life and dignity, because it directly attacks life itself, takes place within the family, and ends so many lives.',
    excerpt: 'The threat of abortion remains our preeminent priority because it directly attacks life itself',
    sourceUrl: SRC.usccb2019, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'abortion',
    title: 'On Standing Against the Moral Evils and Medical Dangers of Chemical Abortion Pills',
    body: 'Resolution adopted at the SBC Annual Meeting, Dallas', sourceDate: '2025-06',
    summary: 'Calls for revoking FDA approval of mifepristone, laws banning the manufacture, sale and distribution of abortion drugs, enforcing the Comstock Act against mailing abortion pills, and equal protection under the Constitution for the unborn so that all abortion ends, and commits to supporting pregnancy centers, adoption and maternal health care.',
    excerpt: 'pray and labor for the abolition of all forms of abortion',
    sourceUrl: SRC.sbcAbortion2025, review: [],
  },
  {
    traditionId: 'umc', issueId: 'abortion',
    title: 'Social Principles, as explained by the church',
    body: 'Adopted by the General Conference (2024 revision)', sourceDate: '2024',
    summary: 'Affirms the sanctity of the life of both the unborn child and the mother, says abortion may be justified in tragic conflicts of life with life, supports the legal availability of medically supervised abortion, and rejects abortion as birth control, for sex selection, and late in pregnancy except in specified cases.',
    excerpt: 'tragic conflicts of life with life',
    sourceUrl: SRC.umcAbortion, review: [],
  },
  {
    traditionId: 'ag', issueId: 'abortion',
    title: 'Sanctity of Human Life: Abortion and Reproductive Issues',
    body: 'Position paper adopted by the General Presbytery', sourceDate: '2010-08',
    summary: 'Holds that human life from conception is to be protected, denies that a legal right to abortion confers a moral right, says historic Christian faith has usually favored the mother\'s life where childbirth would likely cause her death, and calls on Christians to seek legislative and judicial redress.',
    excerpt: 'from conception through death, is therefore to be valued, respected, nurtured, and protected',
    sourceUrl: SRC.agAbortion2010, review: [],
  },
);

/**
 * "No official statement" (rule 4): a tradition with no qualifying statement
 * on an issue, shown on the page as such rather than left blank.
 */
export const NO_STATEMENT: { traditionId: TraditionId; issueId: IssueId; note: string }[] = [
  { traditionId: 'ame', issueId: 'abortion', note: 'No General Conference resolution or Council of Bishops statement on abortion was found. Statements from the church\'s International Health Commission do not qualify under the rule for this tradition.' },
];

export const PLANKS: Plank[] = [
  {
    party: 'R', level: 'texas', platformYear: 2024, issueId: 'abortion',
    summary: 'Calls for legislation to abolish abortion by giving the unborn equal protection of the law from fertilization, and for barring public funds for elective abortion and the transport of women across state lines to obtain one, with a private right of action against those who help.',
    excerpt: 'We urge lawmakers to enact legislation to abolish abortion',
    sourceUrl: SRC.rpt2024, review: [],
  },
  {
    party: 'D', level: 'texas', platformYear: 2024, issueId: 'abortion',
    summary: 'Calls for reinstating the right to an abortion, repealing the Hyde Amendment, protecting IVF, requiring emergency rooms to provide stabilizing care including abortion when medically necessary, and barring penalties on people who travel for an abortion or help them.',
    excerpt: 'Expand access to contraception and reinstate the right to an abortion',
    sourceUrl: SRC.tdp2024, review: [],
  },
  {
    party: 'R', level: 'national', platformYear: 2024, issueId: 'abortion',
    summary: 'Calls for opposing late-term abortion, says the 14th Amendment guarantees that no person can be denied life without due process and that the states are free to pass laws protecting that right, and supports mothers, prenatal care, access to birth control and IVF.',
    excerpt: 'We will oppose Late Term Abortion',
    sourceUrl: SRC.rnc2024, review: [],
  },
  {
    party: 'D', level: 'national', platformYear: 2024, issueId: 'abortion',
    summary: 'Calls for national legislation to make Roe the law of the land again, repealing the Hyde Amendment, and protecting access to contraception and IVF, and describes the administration\'s position that federal emergency-care law preempts state abortion bans.',
    excerpt: 'we will pass national legislation to make Roe the law of the land again',
    sourceUrl: SRC.dnc2024, review: [],
  },
  {
    party: 'R', level: 'texas', platformYear: 2024, issueId: 'immigration',
    summary: 'Calls for securing the border by whatever means necessary, including barriers and a wall, a state Border Protection Unit with authority to repel crossings and deport, faster final rulings and deportation for people in the country illegally, and deportation of non-citizens arrested in violent protests.',
    excerpt: 'effectively secure the border through whatever means necessary',
    sourceUrl: SRC.rpt2024, review: [],
  },
  {
    party: 'D', level: 'texas', platformYear: 2024, issueId: 'immigration',
    summary: 'Calls for comprehensive immigration reform with an attainable path to citizenship, keeping the Texas DREAM Act and passing a federal one, more family and employment visas, and fewer limits on asylum and Temporary Protected Status, and says being in the country without authorization is a civil offense, not a crime.',
    excerpt: 'Enact comprehensive immigration reform, including an attainable path to citizenship',
    sourceUrl: SRC.tdp2024, review: [],
  },
  {
    party: 'R', level: 'national', platformYear: 2024, issueId: 'immigration',
    // Brought up to the detail of the other three planks on 12 Nov 2026: it had
    // one clause where they had four or five, which reads as dismissive even
    // when every word is accurate.
    summary: 'Calls for sealing the border, carrying out what it calls the largest deportation operation in American history, strengthening ICE, raising penalties for illegal entry and visa overstays, and reinstating the Remain in Mexico policy.',
    excerpt: 'Republicans will secure the Border, deport Illegal Aliens',
    sourceUrl: SRC.rnc2024, review: [],
  },
  {
    party: 'D', level: 'national', platformYear: 2024, issueId: 'immigration',
    summary: 'Calls for legislation that secures the border, reforms the asylum system, expands legal immigration, keeps families together with a pathway for long-term undocumented residents, and secures the future of the DACA program.',
    excerpt: 'secure the border, reform the asylum system, expand legal immigration',
    sourceUrl: SRC.dnc2024, review: [],
  },
];

// --- earlier statements ------------------------------------------------------

/** Every SBC resolution's title, date and link (scripts/fetch_sbc_resolutions.ts). */
export const SBC_RESOLUTIONS: { title: string; date: string; url: string }[] =
  JSON.parse(readFileSync(new URL('./data/faith/sbc_resolutions.json', import.meta.url), 'utf8')).resolutions;

/** The SBC resolutions on an issue by title, newest first. */
export const sbcOnIssue = (issue: IssueId) => SBC_RESOLUTIONS
  .filter((r) => ISSUE_TITLE_TERMS[issue].test(r.title))
  .sort((a, b) => b.date.localeCompare(a.date));

/** Listed by hand where a tradition has no machine-readable library. */
const HAND_EARLIER: Earlier[] = [
  { traditionId: 'umc', issueId: 'immigration', title: 'Welcoming the Migrant to the U.S. (Book of Resolutions 4271)', date: '2024', url: 'https://www.umc.org/en/content/book-of-resolutions-welcoming-the-migrant-to-the-us' },
  { traditionId: 'umc', issueId: 'immigration', title: 'Global Migration and the Quest for Justice (Book of Resolutions 4273)', date: '2024', url: 'https://www.umc.org/en/content/book-of-resolutions-global-migration-and-the-quest-for-justice' },
];

/**
 * Every other qualifying statement, listed under the current one: for the SBC
 * every title match except the current resolution, computed; for the others
 * the hand list above.
 */
export const EARLIER: Earlier[] = [
  ...FILLED_ISSUES.flatMap((issue) => {
    const current = new Set(STATEMENTS.filter((s) => s.traditionId === 'sbc' && s.issueId === issue).map((s) => s.sourceUrl));
    return sbcOnIssue(issue).filter((r) => !current.has(r.url))
      .map((r) => ({ traditionId: 'sbc' as const, issueId: issue, title: r.title, date: r.date, url: r.url }));
  }),
  ...HAND_EARLIER,
];

/**
 * Statements that qualify under a tradition's rule but have not been read yet,
 * so they are not in STATEMENTS. Listed so the gap is visible, not forgotten.
 */
export const TO_READ: { traditionId: TraditionId; issueId: IssueId; what: string }[] = [
  { traditionId: 'umc', issueId: 'immigration', what: 'Book of Resolutions 4273 (Global Migration and the Quest for Justice) and 4275 (Concerning Immigration), in full; only quotations on umc.org have been read.' },
  { traditionId: 'umc', issueId: 'immigration', what: 'The Social Principles text itself (2024 revision), rather than the church\'s page quoting it.' },
  { traditionId: 'catholic', issueId: 'immigration', what: 'Other statements approved by the full body of bishops on immigration (for example Strangers No Longer, 2003, with the Mexican bishops).' },
  { traditionId: 'ame', issueId: 'immigration', what: 'AME General Conference resolutions, which outrank the Council of Bishops; none found online so far.' },
];

/** Positions emphasized without a stated direction (rule 3). Empty so far. */
export const KNOWN_GAPS: { who: string; issueId: IssueId; note: string }[] = [];
