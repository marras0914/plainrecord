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
export const FILLED_ISSUES: IssueId[] = ['immigration'];

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
    traditionId: 'sbc', issueId: 'immigration',
    title: 'On Wisely Engaging Immigration',
    body: 'Resolution adopted at the SBC Annual Meeting, New Orleans', sourceDate: '2023-06',
    summary: 'Calls for avenues for valid asylum claims and legal pathways to permanent status for immigrants who are here through no fault of their own, prioritizing family unity, and for measures that secure the border.',
    excerpt: 'create legal pathways to permanent status for immigrants who are in our communities',
    sourceUrl: SRC.sbc2023, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'immigration',
    title: 'On Immigration',
    body: 'Resolution adopted at the SBC Annual Meeting, Dallas', sourceDate: '2018-06',
    summary: 'Calls for reform that secures the borders and provides a pathway to legal status with restitution, keeping families together, and says nativism, mistreatment and exploitation are inconsistent with the gospel.',
    excerpt: 'securing our borders and providing a pathway to legal status with appropriate restitutionary measures',
    sourceUrl: SRC.sbc2018, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'immigration',
    title: 'On Immigration and the Gospel',
    body: 'Resolution adopted at the SBC Annual Meeting, Phoenix', sourceDate: '2011-06',
    summary: 'Calls for securing the borders and holding employers accountable, then, with the borders secured, a path to legal status with restitution for undocumented immigrants already here, and states that this is not support for amnesty.',
    excerpt: 'a just and compassionate path to legal status, with appropriate restitutionary measures',
    sourceUrl: SRC.sbc2011, review: [],
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
    traditionId: 'umc', issueId: 'immigration',
    title: 'Welcoming the Migrant to the U.S. (Book of Resolutions 4271), as quoted by the church',
    body: 'Adopted by the General Conference (Book of Resolutions 2020/2024)', sourceDate: '2024',
    summary: 'Says refusing to welcome migrants, or staying silent while families are separated, is complicity in sin, and urges churches to build relationships with migrants in their communities.',
    excerpt: 'To refuse to welcome migrants to this country',
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

export const PLANKS: Plank[] = [
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
