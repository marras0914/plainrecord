/**
 * PlainRecord: what Christian traditions and Jewish movements officially say,
 * and what the parties' platforms say, issue by issue (the faith module)
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
/** Every issue, as of 13 Nov 2026. */
export const FILLED_ISSUES: IssueId[] = ['immigration', 'abortion', 'death-penalty', 'guns', 'poverty', 'environment', 'healthcare', 'criminal-justice'];

export type TraditionId = 'catholic' | 'sbc' | 'umc' | 'ame' | 'ag' | 'reform' | 'conservative' | 'orthodox';

export const TRADITIONS: { id: TraditionId; name: string; family: string; official: string; libraryUrl: string }[] = [
  { id: 'catholic', name: 'Catholic Church in the United States', family: 'Catholic',
    official: 'Statements approved by the full body of U.S. bishops (USCCB), Forming Consciences for Faithful Citizenship first. Not staff, committee or diocesan letters.',
    libraryUrl: 'https://www.usccb.org/issues-and-action/faithful-citizenship' },
  { id: 'sbc', name: 'Southern Baptist Convention', family: 'Baptist',
    official: 'Resolutions adopted by the messengers at an SBC Annual Meeting. Not entity or agency statements.',
    libraryUrl: 'https://www.sbc.net/resource-library/resolutions/' },
  { id: 'umc', name: 'The United Methodist Church', family: 'Mainline Protestant',
    official: 'The Social Principles and the Book of Resolutions, as adopted by the General Conference (2024 revision). The Social Principles are shown in full where they address the issue; otherwise the Book of Resolutions entry on it.',
    libraryUrl: 'https://www.umc.org/en/what-we-believe/social-principles' },
  { id: 'ame', name: 'African Methodist Episcopal Church', family: 'Historically Black church',
    official: 'General Conference resolutions, then statements of the Council of Bishops.',
    libraryUrl: 'https://www.ame-church.com/' },
  { id: 'ag', name: 'Assemblies of God (USA)', family: 'Pentecostal',
    official: 'Position papers and official statements of the General Council or its Executive Presbytery. Not columns by its officers.',
    libraryUrl: 'https://ag.org/Beliefs/Position-Papers' },
  // Judaism's three U.S. movements, added 15 Nov 2026. Which bodies count was
  // Marco's call that day: both bodies where two vote (FAITH.md, "Judaism").
  { id: 'reform', name: 'Reform Judaism', family: 'Jewish',
    official: 'Resolutions adopted by the Union for Reform Judaism (by its General Assembly or North American Board of Trustees) or by the Central Conference of American Rabbis. Not statements by the Religious Action Center\'s staff, press releases or action alerts.',
    libraryUrl: 'https://urj.org/what-we-believe/resolutions' },
  { id: 'conservative', name: 'Conservative Judaism', family: 'Jewish',
    official: 'Resolutions adopted by the Rabbinical Assembly. Not its other statements, and not rulings on Jewish law (teshuvot) by its Committee on Jewish Law and Standards. The United Synagogue of Conservative Judaism publishes no resolutions online.',
    libraryUrl: 'https://rabbinicalassembly.org/about-us/search-past-resolutions' },
  { id: 'orthodox', name: 'Orthodox Judaism', family: 'Jewish',
    // The OU alone, Marco's call later on 15 Nov 2026 (the Rabbinical Council
    // of America, a rabbis' association, was dropped).
    official: 'Positions adopted by the Orthodox Union\'s convention delegates or its Board of Directors, as listed in its convention resolutions. The Orthodox Union is the union of Orthodox synagogues, but it does not speak for all of Orthodox Judaism, and Haredi bodies such as Agudath Israel issue no voted resolutions. Not press releases, testimony or letters from its advocacy office.',
    libraryUrl: 'https://www.ou.org/assets/OU_2023_National_Convention_Resolutions_Final_dq4fkw.pdf' },
];

/**
 * Which of a Jewish movement's statements is shown in full, decided 15 Nov
 * 2026: the newest one on the issue that states a direction for law or
 * government, since the page sets it beside the platforms. A resolution on a
 * movement's own investments or members' institutions is listed, not shown
 * (URJ 2024 on divesting its holdings; RA 2019 on its members'
 * institutions). A resolution on reproductive care is shown under abortion;
 * under healthcare the newest on care in general is shown.
 */
export const isJewish = (id: TraditionId) => TRADITIONS.find((t) => t.id === id)?.family === 'Jewish';

export const JEWISH_BODIES: Record<'reform' | 'conservative' | 'orthodox', ('urj' | 'ccar' | 'ra')[]> = {
  // Orthodox: the OU's standing positions are one booklet, entered by hand.
  reform: ['urj', 'ccar'], conservative: ['ra'], orthodox: [],
};

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
  // "reproductive ..." added 15 Nov 2026 for the Jewish movements, whose
  // resolutions say "Reproductive Rights" (URJ 1990) or "Reproductive
  // Freedom" (RA). It matched no SBC title.
  abortion: /abortion|pro-?life|roe v|planned parenthood|hyde|reproductive (?:rights|freedom|health|justice|choice|care)|reproductive & sexual health/i,
  // Not "spiritual welfare" (an SBC resolution on evangelism, 1978).
  poverty: /poverty|\bpoor\b|(?<!spiritual )welfare|hunger|minimum wage/i,
  'death-penalty': /death penalty|capital punishment|execution/i,
  // Not "weapon": it matches resolutions on nuclear and other weapons of war.
  guns: /\bgun|firearm/i,
  // Not bare "climate": it matched "School Discipline and Academic Climate"
  // (URJ 2017). Known gap, 15 Nov 2026: no "global warming", so the SBC's
  // 2007 "On Global Warming" is not listed. Adding it would make that the
  // SBC's current environment statement, which is Marco's call to make.
  environment: /environment|creation care|climate (?:change|crisis|justice|action|leadership)|pollution|stewardship of creation|ecolog/i,
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
  usccb2025: 'https://www.usccb.org/resources/special-pastoral-message-immigration-november-12-2025',
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
  sbcDeath2000: 'https://www.sbc.net/resource-library/resolutions/on-capital-punishment/',
  sbcGuns2018: 'https://www.sbc.net/resource-library/resolutions/on-gun-violence-and-mass-shootings/',
  umcPolitical: 'https://www.umc.org/en/content/social-principles-the-political-community',
  umcGuns3428: 'https://www.umc.org/en/content/book-of-resolutions-our-call-to-end-gun-violence',
  sbcPoverty2014: 'https://www.sbc.net/resource-library/resolutions/on-global-hunger-relief/',
  sbcEnvironment2006: 'https://www.sbc.net/resource-library/resolutions/on-environmentalism-and-evangelicals/',
  umcEconomic: 'https://www.umc.org/en/content/social-principles-the-economic-community',
  umcNatural: 'https://www.umc.org/en/content/social-principles-the-natural-world',
  sbcHealth2013: 'https://www.sbc.net/resource-library/resolutions/on-the-danger-of-age-discrimination-in-healthcare-rationing/',
  sbcPrison2013: 'https://www.sbc.net/resource-library/resolutions/on-americas-growing-prison-population/',
  ccarImmigration2026: 'https://www.ccarnet.org/ccar-resolutions/central-conference-of-american-rabbis-resolution-on-immigration-due-process/',
  ccarAbortion2024: 'https://www.ccarnet.org/ccar-resolutions/ccar-womens-rabbinic-network-resolution-affirming-our-commitment-to-broad-accessible-reproductive-sexual-health-care/',
  ccarHunger2016: 'https://www.ccarnet.org/ccar-resolutions/ccar-resolution-hunger-america/',
  ccarDeath1979: 'https://www.ccarnet.org/ccar-resolutions/capital-punishment-1979/',
  ccarGuns2015: 'https://www.ccarnet.org/ccar-resolutions/ccar-resolution-gun-violence/',
  ccarClimate2022: 'https://www.ccarnet.org/ccar-resolutions/central-conference-of-american-rabbis-resolution-on-the-climate-crisis/',
  ccarHealth2017: 'https://www.ccarnet.org/ccar-resolutions/resolution-health-care/',
  ccarPrisons2021: 'https://www.ccarnet.org/ccar-resolutions/central-conference-of-american-rabbis-resolution-on-private-prisons/',
  raImmigration2017: 'https://rabbinicalassembly.org/resolutions/resolution-immigration-united-states',
  raAbortion2024: 'https://rabbinicalassembly.org/resolutions/resolution-supporting-freedom-access-reproductive-health-care',
  raHunger2020: 'https://rabbinicalassembly.org/resolutions/resolution-hunger-crisis-america',
  raDeath1995: 'https://deathpenaltyinfo.org/stories/rabbinical-assembly',
  raGuns2016: 'https://rabbinicalassembly.org/resolutions/resolution-american-gun-violence',
  raParis2016: 'https://rabbinicalassembly.org/resolutions/resolution-paris-united-nations-framework-convention-climate-change-unfccc',
  raHealth2026: 'https://rabbinicalassembly.org/resolutions/resolution-opposing-laws-limiting-essential-health-care',
  raPolice2016: 'https://rabbinicalassembly.org/resolutions/resolution-racial-injustice-and-police-brutality',
  ou2023: 'https://www.ou.org/assets/OU_2023_National_Convention_Resolutions_Final_dq4fkw.pdf',
  rpt2024: 'https://texasgop.org/wp-content/uploads/2024/06/2024-RPT-Platform.pdf',
  tdp2024: 'https://txdem.co/24-Platform',
  rnc2024: 'https://www.presidency.ucsb.edu/documents/2024-republican-party-platform',
  dnc2024: 'https://www.presidency.ucsb.edu/documents/2024-democratic-party-platform',
} as const;

export const STATEMENTS: Statement[] = [
  // --- immigration --------------------------------------------------------
  {
    // Found 14 Nov 2026 while working through TO_READ: a full-body statement
    // newer than the 2023 note. Its own text: "approved by the general
    // membership of bishops" at the Fall Plenary Assembly (vote 216-5-3).
    traditionId: 'catholic', issueId: 'immigration',
    title: 'Special Pastoral Message on Immigration',
    body: 'Approved by the U.S. bishops', sourceDate: '2025-11-12',
    summary: 'Opposes the indiscriminate mass deportation of people and calls for meaningful immigration reform, says nations have a responsibility to regulate their borders, and voices concern about detention conditions, immigrants losing legal status, and enforcement near churches, hospitals and schools.',
    excerpt: 'We oppose the indiscriminate mass deportation of people.',
    sourceUrl: SRC.usccb2025, review: [],
  },
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
    // Read from the Social Principles themselves on 14 Nov 2026 (section G of
    // The Political Community), no longer from the church's page quoting them.
    title: 'Social Principles: The Political Community',
    body: 'Adopted by the General Conference (2024 revision)', sourceDate: '2024',
    summary: 'Affirms the dignity and rights of migrants, immigrants and refugees, urges congregations to welcome them, and opposes laws that criminalize or punish people for their migration status, detention in inhumane conditions, the separation of families, and for-profit detention centers.',
    excerpt: 'We affirm the dignity, worth and rights of migrants, immigrants and refugees',
    sourceUrl: SRC.umcPolitical, review: [],
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

STATEMENTS.push(
  // --- the death penalty --------------------------------------------------
  {
    traditionId: 'catholic', issueId: 'death-penalty',
    title: 'Introductory Note to Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops', sourceDate: '2023-11-15',
    summary: 'Lists the death penalty among grave threats to the life and dignity of the human person, alongside euthanasia, gun violence, terrorism and human trafficking.',
    excerpt: 'include euthanasia, gun violence, terrorism, the death penalty, and human trafficking',
    sourceUrl: SRC.usccb2023, review: [],
  },
  {
    traditionId: 'catholic', issueId: 'death-penalty',
    title: 'Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops (2015 text, reissued 2019)', sourceDate: '2019',
    summary: 'Calls for ending the use of the death penalty, saying the nation\'s continued reliance on it cannot be justified, while noting the Church accepted it in the past for egregious crimes when no alternative was available.',
    excerpt: 'our nation’s continued reliance on the death penalty cannot be justified',
    sourceUrl: SRC.usccb2019, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'death-penalty',
    title: 'On Capital Punishment',
    body: 'Resolution adopted at the SBC Annual Meeting, Orlando', sourceDate: '2000-06',
    summary: 'Supports the fair and equitable use of capital punishment for murder or treasonous acts that result in death, only on clear and overwhelming evidence of guilt, and calls for vigilance, justice and equity in the criminal justice system.',
    excerpt: 'support the fair and equitable use of capital punishment by civil magistrates',
    sourceUrl: SRC.sbcDeath2000, review: [],
  },
  {
    traditionId: 'umc', issueId: 'death-penalty',
    title: 'Social Principles: The Political Community',
    body: 'Adopted by the General Conference (2024 revision)', sourceDate: '2024',
    summary: 'Opposes capital punishment, saying it compounds the loss of life and falls disproportionately on people who are poor, uneducated, from marginalized racial and ethnic communities, or mentally impaired.',
    excerpt: 'compels us to oppose capital punishment and the imposition of the death penalty',
    sourceUrl: SRC.umcPolitical, review: [],
  },
  // --- guns ---------------------------------------------------------------
  {
    traditionId: 'catholic', issueId: 'guns',
    title: 'Introductory Note to Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops', sourceDate: '2023-11-15',
    summary: 'Supports measures to reduce gun violence, which it lists among grave threats to the life and dignity of the human person.',
    excerpt: 'We support common sense measures to reduce gun violence',
    sourceUrl: SRC.usccb2023, review: [],
  },
  {
    traditionId: 'catholic', issueId: 'guns',
    title: 'Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops (2015 text, reissued 2019)', sourceDate: '2019',
    summary: 'Calls for addressing gun violence among the issues that affect human life and dignity.',
    excerpt: 'We must work to address gun violence',
    sourceUrl: SRC.usccb2019, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'guns',
    title: 'On Gun Violence and Mass Shootings',
    body: 'Resolution adopted at the SBC Annual Meeting, Dallas', sourceDate: '2018-06',
    summary: 'Calls on governments to examine what drives gun violence and to adopt preventive measures that reduce gun violence and mass shootings in accordance with the Second Amendment, says gun ownership carries great responsibility, and names the human heart as the source of the violence and the gospel as its answer.',
    excerpt: 'implement preventative measures that would reduce gun violence and mass shootings',
    sourceUrl: SRC.sbcGuns2018, review: [],
  },
  {
    // The 2024 Social Principles do not address guns, so under the UMC rule the
    // Book of Resolutions entry on the issue is shown in full instead.
    traditionId: 'umc', issueId: 'guns',
    title: 'Our Call to End Gun Violence (Book of Resolutions 3428)',
    body: 'Adopted by the General Conference (2016, readopted 2024)', sourceDate: '2024',
    summary: 'Calls on congregations to advocate at the local and national level for laws that prevent or reduce gun violence, and to form partnerships with communities that have experienced it.',
    excerpt: 'laws that prevent or reduce gun violence',
    sourceUrl: SRC.umcGuns3428, review: [],
  },
);

STATEMENTS.push(
  // --- poverty ------------------------------------------------------------
  {
    traditionId: 'catholic', issueId: 'poverty',
    title: 'Introductory Note to Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops', sourceDate: '2023-11-15',
    summary: 'Names lack of justice for the poor among the grave concerns Catholics bring to public life, and calls on them to serve the poor and the needy.',
    excerpt: 'lack of justice for the poor',
    sourceUrl: SRC.usccb2023, review: [],
  },
  {
    traditionId: 'catholic', issueId: 'poverty',
    title: 'Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops (2015 text, reissued 2019)', sourceDate: '2019',
    summary: 'Calls for helping families and children overcome poverty through access to education, decent work at fair, living wages and adequate assistance for the vulnerable, and for more development aid, fairer trade and debt relief for the poorest countries.',
    excerpt: 'decent work at fair, living wages and adequate assistance for the vulnerable',
    sourceUrl: SRC.usccb2019, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'poverty',
    title: 'On Global Hunger Relief',
    body: 'Resolution adopted at the SBC Annual Meeting, Baltimore', sourceDate: '2014-06',
    summary: 'Encourages Southern Baptists and their churches to support the convention\'s Global Hunger Relief offering through giving and an annual World Hunger Sunday. It addresses church giving rather than public policy.',
    excerpt: 'embrace and support the new Global Hunger Relief initiative',
    sourceUrl: SRC.sbcPoverty2014, review: [],
  },
  {
    traditionId: 'umc', issueId: 'poverty',
    title: 'Social Principles: The Economic Community',
    body: 'Adopted by the General Conference (2024 revision)', sourceDate: '2024',
    summary: 'Pledges to work toward eradicating the roots and effects of poverty, rejects teaching that treats wealth as a sign of God\'s favor and poverty as a sign of disfavor, and endorses policies that guarantee workers fair compensation, sometimes called a living wage.',
    excerpt: 'work toward the eradication of the roots and effects of poverty',
    sourceUrl: SRC.umcEconomic, review: [],
  },
  // --- the environment ----------------------------------------------------
  {
    traditionId: 'catholic', issueId: 'environment',
    title: 'Introductory Note to Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops', sourceDate: '2023-11-15',
    summary: 'Calls for hearing both the cry of the earth and the cry of the poor, and for responding to climate change with actions that better protect creation for present and future generations.',
    excerpt: 'respond to climate change with actions to better protect creation',
    sourceUrl: SRC.usccb2023, review: [],
  },
  {
    traditionId: 'catholic', issueId: 'environment',
    title: 'Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops (2015 text, reissued 2019)', sourceDate: '2019',
    summary: 'Calls for urgently finding ways to care better for creation, especially for the poor, who are most affected by climate change.',
    excerpt: 'care better for God’s creation, especially those most impacted by climate change',
    sourceUrl: SRC.usccb2019, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'environment',
    title: 'On Environmentalism and Evangelicals',
    body: 'Resolution adopted at the SBC Annual Meeting, Greensboro', sourceDate: '2006-06',
    summary: 'Supports conserving natural resources while respecting property rights, and public policy and private efforts to improve the environment based on sound science; opposes alliances with environmental groups whose positions it considers contrary to biblical principles, and solutions it calls scientifically questionable that restrict access to natural resources and economic development.',
    excerpt: 'encourage public policy and private enterprise efforts that seek to improve the environment',
    sourceUrl: SRC.sbcEnvironment2006, review: [],
  },
  {
    traditionId: 'umc', issueId: 'environment',
    title: 'Social Principles: The Natural World',
    body: 'Adopted by the General Conference (2024 revision)', sourceDate: '2024',
    summary: 'Says global warming and climate change already threaten all life on earth and that burning fossil fuels is the greatest single contributor to greenhouse gases, and urges cooperation to end poaching and protect endangered species and their habitats.',
    excerpt: 'Global warming and climate change are already creating extreme conditions',
    sourceUrl: SRC.umcNatural, review: [],
  },
);

STATEMENTS.push(
  // --- healthcare ---------------------------------------------------------
  {
    traditionId: 'catholic', issueId: 'healthcare',
    title: 'Introductory Note to Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops', sourceDate: '2023-11-15',
    summary: 'Names the need for greater access to healthcare among the concerns Catholics bring to public life, and calls for supporting parents through work, training and help with childcare, healthcare, housing and transportation.',
    excerpt: 'the need for greater access to healthcare and education',
    sourceUrl: SRC.usccb2023, review: [],
  },
  {
    traditionId: 'catholic', issueId: 'healthcare',
    title: 'Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops (2015 text, reissued 2019)', sourceDate: '2019',
    summary: 'Calls for providing health care while respecting human life, human dignity and religious freedom, and counts access to health care among the things every person has a right to.',
    excerpt: 'Provide health care while respecting human life, human dignity, and religious freedom',
    sourceUrl: SRC.usccb2019, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'healthcare',
    title: 'On the Danger of Age Discrimination in Healthcare Rationing',
    body: 'Resolution adopted at the SBC Annual Meeting, Houston', sourceDate: '2013-06',
    summary: 'Opposes any public policy that might discriminate against the elderly in their access to quality healthcare, and encourages ministry to senior adults. It does not address health care more broadly.',
    excerpt: 'discriminate against the elderly in their access to quality healthcare',
    sourceUrl: SRC.sbcHealth2013, review: [],
  },
  {
    traditionId: 'umc', issueId: 'healthcare',
    title: 'Social Principles: The Political Community',
    body: 'Adopted by the General Conference (2024 revision)', sourceDate: '2024',
    summary: 'Affirms health care as a basic human right, vows to work toward expanded access to preventive, therapeutic and palliative care, and urges United Methodists to join efforts to create systems that provide comprehensive health protections for all.',
    excerpt: 'We affirm health care as a basic human right',
    sourceUrl: SRC.umcPolitical, review: [],
  },
  // --- criminal justice ---------------------------------------------------
  {
    traditionId: 'catholic', issueId: 'criminal-justice',
    title: 'Introductory Note to Forming Consciences for Faithful Citizenship',
    body: 'Approved by the U.S. bishops', sourceDate: '2023-11-15',
    summary: 'Calls for continued reform of the criminal justice system and an end to the use of the death penalty.',
    excerpt: 'We continue to seek reform of the criminal justice system',
    sourceUrl: SRC.usccb2023, review: [],
  },
  {
    traditionId: 'sbc', issueId: 'criminal-justice',
    title: 'On America\'s Growing Prison Population',
    body: 'Resolution adopted at the SBC Annual Meeting, Houston', sourceDate: '2013-06',
    summary: 'Supports legislation to reduce high incarceration rates without jeopardizing public safety, probation and parole as alternatives to long incarceration for some nonviolent offenders, and programs that help released prisoners reintegrate into society.',
    excerpt: 'legislative policies that seek to reduce high incarceration rates without jeopardizing public safety',
    sourceUrl: SRC.sbcPrison2013, review: [],
  },
  {
    traditionId: 'umc', issueId: 'criminal-justice',
    title: 'Social Principles: The Political Community',
    body: 'Adopted by the General Conference (2024 revision)', sourceDate: '2024',
    summary: 'Urges governments to develop systems that emphasize restorative justice, calls for monitoring criminal justice systems for prejudice and bias, and encourages churches to minister to people who are incarcerated and to advocate for criminal justice reform.',
    excerpt: 'urge governments to develop systems that emphasize restorative justice',
    sourceUrl: SRC.umcPolitical, review: [],
  },
);

// --- Judaism (15 Nov 2026) --------------------------------------------------
// Read from the downloads in data/faith_sources/jewish/ (npm run data:jewish).
// Which statement is current: JEWISH_BODIES above.
const CCAR = 'Adopted by the Central Conference of American Rabbis';
const RA = 'Adopted by the Rabbinical Assembly';
const OU = 'Orthodox Union standing policy position, passed by an earlier convention and restated in its 2023 convention resolutions';
STATEMENTS.push(
  {
    traditionId: 'reform', issueId: 'immigration',
    title: 'Central Conference of American Rabbis Resolution on Immigration & Due Process',
    body: CCAR, sourceDate: '2026-04-22',
    summary: 'Opposes immigration enforcement at or near houses of worship, hospitals and schools except in urgent circumstances, denounces deportations without due process, condemns raids by masked immigration officers, and calls for legislation that balances security with a humane welcome.',
    excerpt: 'Denounces deportations without due process procedures',
    sourceUrl: SRC.ccarImmigration2026, review: [],
  },
  {
    traditionId: 'reform', issueId: 'abortion',
    title: 'Resolution Affirming Our Commitment to Broad, Accessible Reproductive & Sexual Health Care',
    body: 'Adopted by the Central Conference of American Rabbis with the Women\'s Rabbinic Network', sourceDate: '2024-04-18',
    summary: 'Calls on its members and communities to affirm the legal right of a pregnant person to choose to carry or end a pregnancy free from government interference, along with the right to birth control and to comprehensive sex education.',
    excerpt: 'legal right of a pregnant person to make their own informed, medically guided choice',
    sourceUrl: SRC.ccarAbortion2024, review: [],
  },
  {
    traditionId: 'reform', issueId: 'poverty',
    title: 'CCAR Resolution on Hunger in America',
    body: CCAR, sourceDate: '2016-05-19',
    summary: 'Calls on federal, state and local policymakers to support the Supplemental Nutrition Assistance Program (SNAP) and to protect it from proposals such as turning it into a block grant, and calls on its members to advocate for policies to end hunger.',
    excerpt: 'protect SNAP from harmful policy proposals',
    sourceUrl: SRC.ccarHunger2016, review: [],
  },
  {
    traditionId: 'reform', issueId: 'death-penalty',
    title: 'Capital Punishment',
    body: 'Adopted by the Central Conference of American Rabbis at its 90th Annual Convention', sourceDate: '1979',
    summary: 'Restates the conference\'s opposition to the death penalty, first stated in 1958 and 1960, says no evidence shows that it deters crime, and opposes it under all circumstances.',
    excerpt: 'We oppose capital punishment under all circumstances.',
    sourceUrl: SRC.ccarDeath1979, review: [],
  },
  {
    traditionId: 'reform', issueId: 'guns',
    title: 'CCAR Resolution on Gun Violence',
    body: CCAR, sourceDate: '2015-08-11',
    summary: 'Urges members of its congregations and communities to demand that Congress enact gun violence prevention legislation, and calls on governments that buy guns to use that buying power to press manufacturers for safer dealer networks and safer gun technology.',
    excerpt: 'demand that their Representatives and Senators enact effective gun violence prevention legislation',
    sourceUrl: SRC.ccarGuns2015, review: [],
  },
  {
    traditionId: 'reform', issueId: 'environment',
    title: 'Central Conference of American Rabbis Resolution on the Climate Crisis',
    body: CCAR, sourceDate: '2022-05-20',
    summary: 'Commits the conference to advocate, and urges its members to join in advocating, for local, state and federal policies to curb U.S. greenhouse gas emissions and address the harms of climate change.',
    excerpt: 'designed to curb American greenhouse gas emissions and address the harms of climate change',
    sourceUrl: SRC.ccarClimate2022, review: [],
  },
  {
    traditionId: 'reform', issueId: 'healthcare',
    title: 'Resolution on Health Care',
    body: CCAR, sourceDate: '2017-03-23',
    summary: 'Calls on the President, Congress and the states to preserve and expand access to health care, including keeping Medicare and Medicaid as public programs, expanding Medicaid in every state to people at or below 138% of the poverty level, and barring denial of coverage for pre-existing conditions.',
    excerpt: 'preserve and expand access to health care',
    sourceUrl: SRC.ccarHealth2017, review: [],
  },
  {
    traditionId: 'reform', issueId: 'criminal-justice',
    title: 'Central Conference of American Rabbis Resolution on Private Prisons',
    body: CCAR, sourceDate: '2021-05-06',
    summary: 'Supports legislation banning new private prisons and detention centers, and calls on states with private prison contracts to end them as soon as the law allows.',
    excerpt: 'Support legislation banning construction or implementation of new private prisons and detention centers',
    sourceUrl: SRC.ccarPrisons2021, review: [],
  },
  {
    traditionId: 'conservative', issueId: 'immigration',
    title: 'Resolution on Immigration to the United States',
    body: RA, sourceDate: '2017-02-28',
    summary: 'Supports sanctuary cities, a path to citizenship for undocumented residents, the extension of DACA and the closing of immigrant detention centers, and opposes extra funding that would turn immigration agencies into a deportation force and the use of private prisons for undocumented immigrants.',
    excerpt: 'allow the eleven million undocumented residents of the United States a path to citizenship',
    sourceUrl: SRC.raImmigration2017, review: [],
  },
  {
    traditionId: 'conservative', issueId: 'abortion',
    title: 'Resolution Supporting Freedom of Access to Reproductive Health Care',
    body: RA, sourceDate: '2024-04-16',
    summary: 'Supports the Women\'s Health Protection Act, which would bar government restrictions on abortion services, legislation protecting the transport of birth control and abortion medication across state lines, and the FDA\'s continued approval of mifepristone.',
    excerpt: 'prohibiting governmental restrictions on the provision of, and access to, abortion services',
    sourceUrl: SRC.raAbortion2024, review: [],
  },
  {
    traditionId: 'conservative', issueId: 'poverty',
    title: 'Resolution on the Hunger Crisis in America',
    body: RA, sourceDate: '2020-03-24',
    summary: 'Denounces three federal rule changes to the Supplemental Nutrition Assistance Program (SNAP) that it says will weaken food support for people in need, and asks its members to advocate against them and support hunger relief.',
    excerpt: 'strongly denounce these changes which will weaken nutritional support for those in need',
    sourceUrl: SRC.raHunger2020, review: [],
  },
  {
    // Not in the Rabbinical Assembly's online archive; the Death Penalty
    // Information Center publishes the text, marked "referred from 1995
    // Convention Plenum". It is the RA's resolution, so it counts.
    traditionId: 'conservative', issueId: 'death-penalty',
    title: 'Resolution on Capital Punishment',
    body: 'Rabbinical Assembly resolution referred from its 1995 convention. Published by the Death Penalty Information Center, not on the Rabbinical Assembly\'s own site', sourceDate: '1995',
    summary: 'Opposes the adoption of death penalty laws and urges their abolition in states that have them, and urges laws that make life imprisonment without parole the punishment for some capital crimes.',
    excerpt: 'oppose the adoption of death penalty laws and urge their abolition',
    sourceUrl: SRC.raDeath1995, review: [],
  },
  {
    traditionId: 'conservative', issueId: 'guns',
    title: 'Resolution on American Gun Violence',
    body: RA, sourceDate: '2016-04-06',
    summary: 'Encourages its members to lobby for background checks on all gun sales, bans on military-style assault weapons and high-capacity magazines, and making gun trafficking a federal crime, and urges communities to demand gun violence prevention legislation.',
    excerpt: 'required background checks on all public and private gun sales',
    sourceUrl: SRC.raGuns2016, review: [],
  },
  {
    traditionId: 'conservative', issueId: 'environment',
    title: 'Resolution on Paris United Nations Framework Convention on Climate Change (UNFCCC)',
    body: RA, sourceDate: '2016-04-06',
    summary: 'Supports the Clean Power Plan and other energy efficiency measures, urges the U.S. government to pay its share of the Green Climate Fund, and supports a loss and damage mechanism to help developing nations hurt by climate change.',
    excerpt: 'support and advocate with other faith-based communities for the Clean Power Plan',
    sourceUrl: SRC.raParis2016, review: [],
  },
  {
    traditionId: 'conservative', issueId: 'healthcare',
    title: 'Resolution on Opposing Laws Limiting Essential Health Care',
    body: RA, sourceDate: '2026-03-30',
    summary: 'Commits the Rabbinical Assembly to promote everyone\'s ability to get the medical care they need, condemns efforts to keep pregnant people from health care, and opposes policies that discriminate against LGBTQ+ people or limit access to reproductive health care.',
    excerpt: 'promote the ability for all people to access the medical care they may need',
    sourceUrl: SRC.raHealth2026, review: [],
  },
  {
    traditionId: 'conservative', issueId: 'criminal-justice',
    title: 'Resolution on Racial Injustice and Police Brutality',
    body: RA, sourceDate: '2016-04-06',
    summary: 'Calls on legislators to reduce the prison population through community-based policing, changes to sentencing and better programs after release, and calls on rabbis to work with local police to limit the use of force.',
    excerpt: 'reducing the historically high levels of our prison population',
    sourceUrl: SRC.raPolice2016, review: [],
  },
  {
    traditionId: 'orthodox', issueId: 'death-penalty',
    title: 'A Summary of Standing Policy Positions of the Orthodox Union: Death Penalty',
    body: OU, sourceDate: '2023',
    summary: 'Supports a moratorium on executions in the United States and a commission to review death penalty procedures.',
    excerpt: 'supports efforts to place a moratorium on executions in the United States',
    sourceUrl: SRC.ou2023, review: [],
  },
  {
    traditionId: 'orthodox', issueId: 'guns',
    title: 'A Summary of Standing Policy Positions of the Orthodox Union: Gun Regulation',
    body: OU, sourceDate: '2023',
    summary: 'Endorses gun regulation, including banning certain sophisticated attack weapons, and supports gun control efforts.',
    excerpt: 'endorse common sense gun regulation including banning of certain sophisticated attack weapons',
    sourceUrl: SRC.ou2023, review: [],
  },
  {
    traditionId: 'orthodox', issueId: 'environment',
    title: 'A Summary of Standing Policy Positions of the Orthodox Union: Energy Policy',
    body: OU, sourceDate: '2023',
    summary: 'Supports greater energy efficiency and higher federal fuel economy (CAFE) standards, and favors exploring Alaska\'s oil fields while keeping strict environmental standards.',
    excerpt: 'We support an increase of “CAFÉ” standards',
    sourceUrl: SRC.ou2023, review: [],
  },
);

/**
 * "No official statement" (rule 4): a tradition with no qualifying statement
 * on an issue, shown on the page as such rather than left blank.
 */
export const NO_STATEMENT: { traditionId: TraditionId; issueId: IssueId; note: string }[] = [
  { traditionId: 'ame', issueId: 'abortion', note: 'No General Conference resolution or Council of Bishops statement on abortion was found. Statements from the church\'s International Health Commission do not qualify under the rule for this tradition.' },
  { traditionId: 'ame', issueId: 'death-penalty', note: 'No General Conference resolution or Council of Bishops statement on the death penalty was found on ame-church.com or elsewhere.' },
  { traditionId: 'ame', issueId: 'guns', note: 'No General Conference resolution or Council of Bishops statement on guns was found on ame-church.com or elsewhere.' },
  { traditionId: 'ag', issueId: 'death-penalty', note: 'There is no position paper on the death penalty. The 2015 position paper Church Mission and Peacemaking refers to a "perspective paper" on capital punishment, but no such paper is published on ag.org.' },
  { traditionId: 'ag', issueId: 'guns', note: 'There is no position paper or official statement on guns.' },
  { traditionId: 'ame', issueId: 'poverty', note: 'No General Conference resolution or Council of Bishops statement on poverty or public assistance was found on ame-church.com or elsewhere.' },
  { traditionId: 'ame', issueId: 'environment', note: 'No General Conference resolution or Council of Bishops statement on the environment was found on ame-church.com or elsewhere.' },
  { traditionId: 'ag', issueId: 'poverty', note: 'There is no position paper or official statement on poverty or public assistance.' },
  { traditionId: 'ame', issueId: 'healthcare', note: 'No General Conference resolution or Council of Bishops statement on healthcare was found on ame-church.com or elsewhere.' },
  { traditionId: 'ame', issueId: 'criminal-justice', note: 'No General Conference resolution or Council of Bishops statement on criminal justice was found on ame-church.com or elsewhere.' },
  { traditionId: 'ag', issueId: 'healthcare', note: 'There is no position paper or official statement on healthcare policy.' },
  { traditionId: 'ag', issueId: 'criminal-justice', note: 'There is no position paper or official statement on criminal justice.' },
  { traditionId: 'ag', issueId: 'environment', note: 'There is no position paper on the environment. The 2015 position paper Church Mission and Peacemaking refers to a "perspective paper" on environmental protection, but no such paper is published on ag.org.' },
  // The OU's standing positions (2023 and 2017 convention booklets) cover the
  // death penalty, guns and energy, and none of these five.
  { traditionId: 'orthodox', issueId: 'immigration', note: 'The Orthodox Union\'s standing positions do not address immigration.' },
  { traditionId: 'orthodox', issueId: 'abortion', note: 'The Orthodox Union\'s standing positions do not address abortion.' },
  { traditionId: 'orthodox', issueId: 'poverty', note: 'The Orthodox Union\'s standing positions do not address poverty or public assistance.' },
  { traditionId: 'orthodox', issueId: 'healthcare', note: 'The Orthodox Union\'s standing positions do not address healthcare policy.' },
  { traditionId: 'orthodox', issueId: 'criminal-justice', note: 'The Orthodox Union\'s standing positions do not address policing, sentencing or prisons in general. Its heading "Criminal Justice Issues" covers only the death penalty and guns.' },
];

/** A platform that says nothing on an issue: stated on the page, not left blank. */
export const NO_PLANK: { party: 'D' | 'R'; level: 'texas' | 'national'; issueId: IssueId; note: string }[] = [
  { party: 'R', level: 'national', issueId: 'death-penalty', note: 'The 2024 RNC platform does not mention the death penalty.' },
  { party: 'D', level: 'national', issueId: 'death-penalty', note: 'The 2024 DNC platform does not mention the death penalty.' },
  { party: 'R', level: 'national', issueId: 'poverty', note: 'The 2024 RNC platform has no plank on poverty or public assistance. Its nearest commitments are no cuts to Social Security and Medicare, and making permanent the 2017 tax law, including its larger Child Tax Credit.' },
];

export const PLANKS: Plank[] = [
  // --- healthcare ---------------------------------------------------------
  {
    party: 'R', level: 'texas', platformYear: 2024, issueId: 'healthcare',
    summary: 'Calls for building state reserves sufficient for Texas to exit the federal Medicaid program, directing budget surpluses to a Texas Health Savings Account until then, and opposing mandates for treatment, vaccination or masks and health insurance surcharges.',
    excerpt: 'enabling the state to develop reserves sufficient to exit the federal Medicaid program',
    sourceUrl: SRC.rpt2024, review: [],
  },
  {
    party: 'D', level: 'texas', platformYear: 2024, issueId: 'healthcare',
    summary: 'Calls for expanding Medicaid, protecting Medicare benefits, making prescription drugs affordable for all, and helping small businesses afford health insurance for their employees.',
    excerpt: 'We must expand Medicaid, protect Medicare benefits, and make prescription drugs affordable for all',
    sourceUrl: SRC.tdp2024, review: [],
  },
  {
    party: 'R', level: 'national', platformYear: 2024, issueId: 'healthcare',
    summary: 'Calls for more transparency, choice and competition in health care, expanded access to affordable health care and prescription drug options, and protecting Medicare with no cuts.',
    excerpt: 'expand access to new Affordable Healthcare and prescription drug options',
    sourceUrl: SRC.rnc2024, review: [],
  },
  {
    party: 'D', level: 'national', platformYear: 2024, issueId: 'healthcare',
    summary: 'Calls for protecting and expanding the Affordable Care Act, extending Medicaid-like coverage in states that have not expanded Medicaid, lowering drug prices through more transparency from pharmacy benefit managers, and ending the waiting list for Medicaid home- and community-based services.',
    excerpt: 'protect and expand the Affordable Care Act',
    sourceUrl: SRC.dnc2024, review: [],
  },
  // --- criminal justice ---------------------------------------------------
  {
    party: 'R', level: 'texas', platformYear: 2024, issueId: 'criminal-justice',
    summary: 'Calls for basing bail only on a person\'s danger to society, risk of flight and criminal history, enforcing laws uniformly with punishment that fits the crime, and never using law enforcement to target people for political purposes.',
    excerpt: 'ensure bail in Texas is based only on a person’s danger to society',
    sourceUrl: SRC.rpt2024, review: [],
  },
  {
    party: 'D', level: 'texas', platformYear: 2024, issueId: 'criminal-justice',
    summary: 'Calls for ending the use of criminal statutes and incarceration to punish problems such as addiction and homelessness, addressing bias in the justice system, and training police to build trust in diverse communities.',
    excerpt: 'End the punishment of social problems such as addiction and homelessness',
    sourceUrl: SRC.tdp2024, review: [],
  },
  {
    party: 'R', level: 'national', platformYear: 2024, issueId: 'criminal-justice',
    summary: 'Calls for replenishing police departments, protecting officers from lawsuits it calls frivolous, locking up violent offenders, and cutting federal funding to sanctuary jurisdictions.',
    excerpt: 'restore safety in our neighborhoods by replenishing Police Departments',
    sourceUrl: SRC.rnc2024, review: [],
  },
  {
    party: 'D', level: 'national', platformYear: 2024, issueId: 'criminal-justice',
    summary: 'Calls for passing the George Floyd Justice in Policing Act, ending state-level use of private prisons, restricting solitary confinement and chokeholds, automatically sealing juvenile records, and supporting rehabilitation and reentry.',
    excerpt: 'Democrats will end state-level use of private prisons and detention centers',
    sourceUrl: SRC.dnc2024, review: [],
  },
  // --- poverty ------------------------------------------------------------
  {
    party: 'R', level: 'texas', platformYear: 2024, issueId: 'poverty',
    summary: 'Calls for abolishing all federal welfare programs, as not an appropriate role for the federal government, and for repealing minimum wage and prevailing wage laws.',
    excerpt: 'We support the abolition of all federal welfare programs',
    sourceUrl: SRC.rpt2024, review: [],
  },
  {
    party: 'D', level: 'texas', platformYear: 2024, issueId: 'poverty',
    summary: 'Calls for a living wage indexed to inflation for all Texas workers, including tipped workers, and for removing outside work requirements for SNAP benefits.',
    excerpt: 'All Texas workers should receive a living wage indexed to inflation',
    sourceUrl: SRC.tdp2024, review: [],
  },
  {
    party: 'D', level: 'national', platformYear: 2024, issueId: 'poverty',
    summary: 'Calls for raising the federal minimum wage to at least $15 an hour and restoring the expanded Child Tax Credit and Earned Income Tax Credit.',
    excerpt: 'We\'ll work to finally raise the federal minimum wage to at least $15-an-hour',
    sourceUrl: SRC.dnc2024, review: [],
  },
  // --- the environment ----------------------------------------------------
  {
    party: 'R', level: 'texas', platformYear: 2024, issueId: 'environment',
    summary: 'Calls for opposing climate change initiatives that obstruct business interests and private property use, including Executive Order 14008, the 30x30 conservation initiative, Net Zero mandates and declarations of a climate emergency.',
    excerpt: 'We oppose environmentalism, or “climate change” initiatives',
    sourceUrl: SRC.rpt2024, review: [],
  },
  {
    party: 'D', level: 'texas', platformYear: 2024, issueId: 'environment',
    summary: 'Calls for reducing greenhouse gas emissions through clean energy, alternative fuel vehicles and efficient buildings, rapid decarbonization, and a stronger EPA that sets and meets a net zero carbon emissions goal, and states that climate change is real.',
    excerpt: 'Reduce greenhouse gas emissions by supporting policies that develop clean energy resources',
    sourceUrl: SRC.tdp2024, review: [],
  },
  {
    party: 'R', level: 'national', platformYear: 2024, issueId: 'environment',
    // An earlier draft ended "the platform does not otherwise address the
    // environment", which a count of the text disproved: it also pledges to
    // preserve natural treasures and restore conservation. Claims of absence
    // get checked like any other.
    summary: 'Calls for lifting restrictions on oil and gas production, ending the Green New Deal, canceling the electric vehicle mandate and cutting regulations, and pledges to preserve the nation\'s natural treasures and restore what it calls genuine conservation efforts.',
    excerpt: 'We will DRILL, BABY, DRILL and we will become Energy Independent',
    sourceUrl: SRC.rnc2024, review: [],
  },
  {
    party: 'D', level: 'national', platformYear: 2024, issueId: 'environment',
    summary: 'Calls for continuing the clean energy investments of the Inflation Reduction Act, faster permitting for clean energy, more clean energy on public lands, electrified ports and zero-emissions freight, and lower emissions from buildings and heavy industry.',
    excerpt: 'We\'ll keep pushing to reduce emissions from America\'s buildings and heavy industry',
    sourceUrl: SRC.dnc2024, review: [],
  },
  // --- the death penalty --------------------------------------------------
  {
    party: 'R', level: 'texas', platformYear: 2024, issueId: 'death-penalty',
    summary: 'Calls for capital punishment that is properly applied and reasonably swift, while respecting due process.',
    excerpt: 'Properly applied capital punishment is legitimate and should be reasonably swift',
    sourceUrl: SRC.rpt2024, review: [],
  },
  {
    party: 'D', level: 'texas', platformYear: 2024, issueId: 'death-penalty',
    summary: 'Calls for abolishing the death penalty and declaring a moratorium on executions.',
    excerpt: 'Abolish the death penalty and declare a moratorium on executions',
    sourceUrl: SRC.tdp2024, review: [],
  },
  // --- guns ---------------------------------------------------------------
  {
    party: 'R', level: 'texas', platformYear: 2024, issueId: 'guns',
    summary: 'Calls for repealing or nullifying the National Firearms Act and the Gun Control Act, unrestricted constitutional carry, aligning the Texas Constitution with the Second Amendment\'s language, and making businesses that bar licensed carriers liable for their safety.',
    excerpt: 'Repeal and/or nullify the National Firearms Act of 1934',
    sourceUrl: SRC.rpt2024, review: [],
  },
  {
    party: 'D', level: 'texas', platformYear: 2024, issueId: 'guns',
    summary: 'Calls for preserving Second Amendment rights while adding safeguards against suicide, mass murder, accidents and interpersonal violence, including background checks for gun-show and private sales, and lifting limits on federal research into gun violence.',
    excerpt: 'supports the right of law-abiding Americans to own and bear arms',
    sourceUrl: SRC.tdp2024, review: [],
  },
  {
    party: 'R', level: 'national', platformYear: 2024, issueId: 'guns',
    summary: 'Calls for defending the right to keep and bear arms, as one of the constitutional freedoms in the platform\'s list of 20 commitments; the platform has no other plank on guns.',
    excerpt: 'THE RIGHT TO KEEP AND BEAR ARMS',
    sourceUrl: SRC.rnc2024, review: [],
  },
  {
    party: 'D', level: 'national', platformYear: 2024, issueId: 'guns',
    summary: 'Calls for universal background checks, a renewed ban on assault weapons and high-capacity magazines, and required safe storage, and cites the administration\'s red flag laws, narrowing of the "boyfriend loophole" and action on ghost guns.',
    excerpt: 'We will once again ban assault weapons and high-capacity magazines',
    sourceUrl: SRC.dnc2024, review: [],
  },
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

/**
 * Every resolution of the URJ, CCAR and Rabbinical Assembly
 * (scripts/fetch_jewish_resolutions.ts). The OU's standing positions are one
 * booklet, entered by hand above.
 */
export const JEWISH_RESOLUTIONS: { body: 'urj' | 'ccar' | 'ra'; title: string; date: string; url: string }[] =
  JSON.parse(readFileSync(new URL('./data/faith/jewish_resolutions.json', import.meta.url), 'utf8')).resolutions;

/** A Jewish movement's resolutions on an issue by title, newest first. */
export const jewishOnIssue = (t: keyof typeof JEWISH_BODIES, issue: IssueId) => JEWISH_RESOLUTIONS
  .filter((r) => JEWISH_BODIES[t].includes(r.body) && ISSUE_TITLE_TERMS[issue].test(r.title))
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

/** Listed by hand where a tradition has no machine-readable library. */
const HAND_EARLIER: Earlier[] = [
  { traditionId: 'umc', issueId: 'immigration', title: 'Welcoming the Migrant to the U.S. (Book of Resolutions 4271)', date: '2024', url: 'https://www.umc.org/en/content/book-of-resolutions-welcoming-the-migrant-to-the-us' },
  { traditionId: 'umc', issueId: 'immigration', title: 'Global Migration and the Quest for Justice (Book of Resolutions 4273)', date: '2024', url: 'https://www.umc.org/en/content/book-of-resolutions-global-migration-and-the-quest-for-justice' },
  // Read in full 14 Nov 2026. 4275 is printed whole only on the church's
  // explainer page, which is therefore its link.
  { traditionId: 'umc', issueId: 'immigration', title: 'Concerning Immigration (Book of Resolutions 4275)', date: '2024', url: SRC.umc },
  { traditionId: 'umc', issueId: 'immigration', title: 'The United Methodist Church Is a Sanctuary Church (Book of Resolutions)', date: '2024', url: 'https://www.umc.org/en/content/book-of-resolutions-the-united-methodist-church-is-a-sanctuary-church' },
  // Approval notes read 15 Nov 2026 in a browser (usccb.org refuses scripts).
  // 2003: "approved simultaneously by the full bodies of U.S. Catholic bishops
  // and the Mexican bishops at their November 2002 General Meetings".
  // 2000: "approved by the full body of bishops at their November 2000
  // general meeting".
  { traditionId: 'catholic', issueId: 'immigration', title: 'Strangers No Longer: Together on the Journey of Hope (with the Mexican bishops)', date: '2003-01-22', url: 'https://www.usccb.org/issues-and-action/human-life-and-dignity/immigration/strangers-no-longer-together-on-the-journey-of-hope' },
  { traditionId: 'catholic', issueId: 'immigration', title: 'Welcoming the Stranger Among Us: Unity in Diversity', date: '2000-11-15', url: 'https://www.usccb.org/committees/pastoral-care-migrants-refugees-travelers/welcoming-stranger-among-us-unity-diversity' },
  // The OU's 2017 convention booklet states the same three positions.
  ...(['death-penalty', 'guns', 'environment'] as const).map((issueId) => ({
    traditionId: 'orthodox' as const, issueId, title: 'Orthodox Union 2017 Biennial Convention Resolutions: Standing Policy Positions', date: '2017',
    url: 'https://advocacy.ou.org/content/uploads/Biennial-resolutions-2017.pdf',
  })),
];

/**
 * Every other qualifying statement, listed under the current one: for the SBC
 * and the Jewish movements every title match except the current statement,
 * computed; for the others the hand list above.
 */
export const EARLIER: Earlier[] = [
  ...FILLED_ISSUES.flatMap((issue) => {
    const current = new Set(STATEMENTS.filter((s) => s.traditionId === 'sbc' && s.issueId === issue).map((s) => s.sourceUrl));
    return sbcOnIssue(issue).filter((r) => !current.has(r.url))
      .map((r) => ({ traditionId: 'sbc' as const, issueId: issue, title: r.title, date: r.date, url: r.url }));
  }),
  ...(Object.keys(JEWISH_BODIES) as (keyof typeof JEWISH_BODIES)[]).flatMap((t) => FILLED_ISSUES.flatMap((issue) => {
    // Every statement of the movement shown in full, on any issue: one on
    // reproductive care is shown under abortion and not also listed under
    // healthcare (JEWISH_BODIES above).
    const current = new Set(STATEMENTS.filter((s) => s.traditionId === t).map((s) => s.sourceUrl));
    return jewishOnIssue(t, issue).filter((r) => !current.has(r.url))
      .map((r) => ({ traditionId: t, issueId: issue, title: r.title, date: r.date, url: r.url }));
  })),
  ...HAND_EARLIER,
];

/**
 * Statements that qualify under a tradition's rule but have not been read yet,
 * so they are not in STATEMENTS. Listed so the gap is visible, not forgotten.
 */
export const TO_READ: { traditionId: TraditionId; issueId: IssueId; what: string }[] = [
  // 14 Nov 2026: the two UMC items were read (Social Principles section G,
  // Book of Resolutions 4271, 4273, 4275 and the sanctuary resolution) and
  // are done. The Catholic search found the 2025 Special Pastoral Message.
  // 15 Nov 2026: both older Catholic statements were full-body; now EARLIER.
  { traditionId: 'ame', issueId: 'immigration', what: 'AME General Conference resolutions, which outrank the Council of Bishops. None found online; the church paper\'s summary of the 2024 General Conference legislation names none on immigration.' },
];

/** Positions emphasized without a stated direction (rule 3). Empty so far. */
export const KNOWN_GAPS: { who: string; issueId: IssueId; note: string }[] = [];

// --- which side each church takes (decided 15 Nov 2026) ---------------------
//
// Marco asked for a grid showing which party each church actually lines up
// with, issue by issue, with no total and no "should". The knob is the
// question, so the PARTIES set it, not us:
//
//   1. For each issue, the point is one where both platforms at a level take
//      opposite sides in their own words. A level where they don't is not
//      compared. An issue with no such point is listed in NO_SIDE_POINT.
//   2. The two answers are the platforms' own, reduced to a few plain words.
//   3. A church is placed on a side only if one of its statements shown in
//      full takes that side in its own words; the quote is shown with the mark.
//      Otherwise it is null, "doesn't say", which is a fact about its text.
//   4. Each quote is verbatim, under 15 words, and checked against the source
//      by npm run data:faith:quotes.
//   5. No count across issues, anywhere: which issues are on the list would
//      decide any total.
//
// Three placements were judgment calls, decided by Marco on 15 Nov 2026: the
// SBC on the environment (opposes "solutions based on questionable science",
// never names climate: doesn't say), UMC on healthcare (calls on governments
// to ensure access, never names Medicaid: widen) and the Catholic bishops on
// the environment (call for "actions" in a document on political
// responsibility: act).

export type Level = 'texas' | 'national';
export type PlatformKey = `${'D' | 'R'}-${Level}`;
export interface SideQuote { side: 'a' | 'b'; quote: string; url: string }

export interface SidePoint {
  issueId: IssueId;
  /** The point, in the site's words. */
  question: string;
  /** The two answers, in the platforms' terms. */
  a: string;
  b: string;
  /** Levels where the D and R platforms take opposite sides. */
  levels: Level[];
  platforms: Partial<Record<PlatformKey, SideQuote>>;
  /** Every tradition with a statement on the issue: its side, or null for "doesn't say". */
  churches: Partial<Record<TraditionId, SideQuote | null>>;
}

export const SIDE_POINTS: SidePoint[] = [
  {
    issueId: 'immigration',
    question: 'What should happen to people living in the United States without legal status?',
    a: 'Offer a way to stay legally', b: 'Deport them',
    levels: ['texas', 'national'],
    platforms: {
      'D-texas': { side: 'a', quote: 'Enact comprehensive immigration reform, including an attainable path to citizenship', url: SRC.tdp2024 },
      'R-texas': { side: 'b', quote: 'devote all available resources to deportations', url: SRC.rpt2024 },
      'D-national': { side: 'a', quote: 'supporting a pathway for long-term undocumented individuals', url: SRC.dnc2024 },
      'R-national': { side: 'b', quote: 'Republicans will secure the Border, deport Illegal Aliens', url: SRC.rnc2024 },
    },
    churches: {
      catholic: { side: 'a', quote: 'comprehensive immigration reform that offers a path to citizenship', url: SRC.usccb2023 },
      // Rejects "amnesty, understood as forgiveness of legal violations without
      // accountability" and backs removing people the government prioritizes:
      // neither a way to stay nor deporting people as such.
      sbc: null,
      umc: null,
      ame: null,
      ag: null,
    },
  },
  {
    issueId: 'abortion',
    question: 'Should the law protect access to abortion?',
    a: 'Protect access', b: 'Restrict or end it',
    levels: ['texas', 'national'],
    platforms: {
      'D-texas': { side: 'a', quote: 'reinstate the right to an abortion', url: SRC.tdp2024 },
      'R-texas': { side: 'b', quote: 'We urge lawmakers to enact legislation to abolish abortion', url: SRC.rpt2024 },
      'D-national': { side: 'a', quote: 'we will pass national legislation to make Roe the law of the land again', url: SRC.dnc2024 },
      'R-national': { side: 'b', quote: 'We will oppose Late Term Abortion', url: SRC.rnc2024 },
    },
    churches: {
      catholic: { side: 'b', quote: 'seek full protection for all human life from the moment of conception', url: SRC.usccb2019 },
      sbc: { side: 'b', quote: 'pray and labor for the abolition of all forms of abortion', url: SRC.sbcAbortion2025 },
      umc: { side: 'a', quote: 'United Methodists worldwide affirm and support the legal availability', url: SRC.umcAbortion },
      ag: { side: 'b', quote: 'seek legislative and judicial redress', url: SRC.agAbortion2010 },
    },
  },
  {
    issueId: 'death-penalty',
    question: 'Should the death penalty be ended?',
    a: 'End it', b: 'Keep it',
    levels: ['texas'],
    platforms: {
      'D-texas': { side: 'a', quote: 'Abolish the death penalty and declare a moratorium on executions', url: SRC.tdp2024 },
      'R-texas': { side: 'b', quote: 'Properly applied capital punishment is legitimate and should be reasonably swift', url: SRC.rpt2024 },
    },
    churches: {
      catholic: { side: 'a', quote: 'our nation’s continued reliance on the death penalty cannot be justified', url: SRC.usccb2019 },
      sbc: { side: 'b', quote: 'support the fair and equitable use of capital punishment by civil magistrates', url: SRC.sbcDeath2000 },
      umc: { side: 'a', quote: 'compels us to oppose capital punishment and the imposition of the death penalty', url: SRC.umcPolitical },
    },
  },
  {
    issueId: 'guns',
    question: 'Should the law limit how guns are bought and sold?',
    a: 'Add limits', b: 'Repeal limits',
    // The RNC platform defends "the right to keep and bear arms" but takes no
    // side on any limit, so the national level is not compared.
    levels: ['texas'],
    platforms: {
      'D-texas': { side: 'a', quote: 'Remove loopholes that exempt gun shows and private sales', url: SRC.tdp2024 },
      'R-texas': { side: 'b', quote: 'Repeal and/or nullify the National Firearms Act of 1934', url: SRC.rpt2024 },
    },
    churches: {
      // "common sense measures to reduce gun violence": no limit named.
      catholic: null,
      // "preventative measures ... in accordance with the Second Amendment": no limit named.
      sbc: null,
      umc: { side: 'a', quote: 'Universal background checks on all gun purchases', url: SRC.umcGuns3428 },
    },
  },
  {
    issueId: 'poverty',
    question: 'Should the law set a minimum wage?',
    a: 'Set or raise one', b: 'Repeal it',
    // The RNC platform has no plank on poverty (NO_PLANK).
    levels: ['texas'],
    platforms: {
      'D-texas': { side: 'a', quote: 'All Texas workers should receive a living wage indexed to inflation', url: SRC.tdp2024 },
      'R-texas': { side: 'b', quote: 'Repeal Minimum Wage Law and prevailing wage laws', url: SRC.rpt2024 },
    },
    churches: {
      // "decent work at fair, living wages": no law named.
      catholic: null,
      sbc: null,
      umc: { side: 'a', quote: 'endorse the establishment and enforcement of policies that guarantee workers fair and equitable compensation', url: SRC.umcEconomic },
    },
  },
  {
    issueId: 'environment',
    question: 'Should government act to reduce the emissions behind climate change?',
    a: 'Act to reduce them', b: 'Oppose climate measures',
    levels: ['texas', 'national'],
    platforms: {
      'D-texas': { side: 'a', quote: 'Reduce greenhouse gas emissions by supporting policies that develop clean energy resources', url: SRC.tdp2024 },
      'R-texas': { side: 'b', quote: 'We oppose environmentalism, or “climate change” initiatives', url: SRC.rpt2024 },
      'D-national': { side: 'a', quote: 'We\'ll keep pushing to reduce emissions from America\'s buildings and heavy industry', url: SRC.dnc2024 },
      'R-national': { side: 'b', quote: 'terminating the Socialist Green New Deal', url: SRC.rnc2024 },
    },
    churches: {
      catholic: { side: 'a', quote: 'respond to climate change with actions to better protect creation', url: SRC.usccb2023 },
      sbc: null,
      umc: { side: 'a', quote: 'To reverse the current trajectory of global climate change, increased investments are needed', url: SRC.umcNatural },
    },
  },
  {
    issueId: 'healthcare',
    question: 'Should government widen public health coverage such as Medicaid?',
    a: 'Widen it', b: 'Pull back from it',
    // The RNC platform also calls for expanded access, so the national
    // platforms do not take opposite sides.
    levels: ['texas'],
    platforms: {
      'D-texas': { side: 'a', quote: 'We must expand Medicaid', url: SRC.tdp2024 },
      'R-texas': { side: 'b', quote: 'enabling the state to develop reserves sufficient to exit the federal Medicaid program', url: SRC.rpt2024 },
    },
    churches: {
      catholic: null,
      sbc: null,
      umc: { side: 'a', quote: 'ensure that every human being has access to medical services and treatment', url: SRC.umcPolitical },
    },
  },
];

/** Issues where the platforms take no opposite sides on one point (rule 1). */
export const NO_SIDE_POINT: { issueId: IssueId; note: string }[] = [
  { issueId: 'criminal-justice', note: 'The platforms address different things: the Texas Republican platform bail and uniform enforcement, the Texas Democratic platform addiction, homelessness and bias, the national platforms police funding and private prisons. None takes the opposite side of another on one point, so no church is placed.' },
];
