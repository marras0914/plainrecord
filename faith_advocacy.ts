/**
 * PlainRecord: what each tradition's own advocacy office backed or opposed in
 * Congress, beside what the tradition says
 *
 * Decided by Marco, 16 Nov 2026 ("actions versus words"):
 *   - Only the body's own published documents (letters to Congress, action
 *     alerts, statements, its legislative agenda or endorsement list), in the
 *     119th Congress (January 2025 on).
 *   - Only on the site's eight issues, and only where the document names a
 *     bill and takes a side. A loose fit is left out (anti-trafficking bills,
 *     the FEMA Act, payday lending, the adoption credit, the religious-worker
 *     visa bill).
 *   - Agenda letters count, labeled as such; the RAC's action alerts count
 *     though they are hosted on VoterVoice, labeled with their host.
 *   - No count anywhere: the reader compares the words and the actions.
 *
 * Federal lobbying reports could not be the source: the Lobbying Disclosure
 * Act does not count a church's communications as lobbying (2 U.S.C.
 * 1602(8)(B)(xviii)), so these bodies mostly never file.
 *
 * Every quote, and every bill name in `named`, is checked against the saved
 * source by npm run data:faith:quotes. Two sources refuse scripted downloads
 * (the AME statement and the ERLC endorsement list); their saved text was
 * transcribed from the page as rendered in a browser on 16 Nov 2026.
 */

import type { IssueId, TraditionId } from './faith_positions';

export type Stance = 'backs' | 'opposes' | 'changes' | 'criticizes';
export type DocKind = 'letter' | 'agenda' | 'list' | 'alert' | 'statement';

export interface AdvocacyItem {
  traditionId: TraditionId;
  issueIds: IssueId[];
  /** The office that published it. */
  body: string;
  stance: Stance;
  /** Each bill exactly as the document names it (checked against the source). */
  named: string[];
  /** The bill number, where the document gives one or the bill is unambiguous. */
  numbers?: string;
  kind: DocKind;
  /** YYYY-MM-DD or YYYY-MM; null for an undated page (an endorsement list, an alert). */
  date: string | null;
  docTitle: string;
  url: string;
  /** Verbatim, under 25 words. */
  quote: string;
  /** Where the page is hosted, when not on the body's own site. */
  host?: string;
}

const USCCB = 'U.S. Conference of Catholic Bishops';
const ERLC = 'Ethics & Religious Liberty Commission (SBC)';
const GBCS = 'General Board of Church and Society (UMC)';
const RAC = 'Religious Action Center of Reform Judaism';

const HR1_HOUSE = {
  traditionId: 'catholic' as const, body: USCCB, kind: 'letter' as const, date: '2025-05-20',
  docTitle: 'Letter to Congress Regarding One Big Beautiful Bill Act, May 20, 2025',
  url: 'https://www.usccb.org/resources/letter-congress-regarding-one-big-beautiful-bill-act-may-20-2025',
  named: ['One Big Beautiful Bill Act'], numbers: 'H.R. 1',
};

const RAC_LETTER = {
  traditionId: 'reform' as const, body: RAC, kind: 'agenda' as const, date: '2025-01-03',
  docTitle: 'Letter to the 119th Congress',
  url: 'https://rac.org/sites/default/files/2025-01/religious_action_center_of_reform_judaism_letter_to_the_119th_congress.pdf',
};

const ERLC_LIST = {
  traditionId: 'sbc' as const, body: ERLC, kind: 'list' as const, date: null, stance: 'backs' as const,
  docTitle: 'Bill Endorsements, 119th Congressional Term (2025-2026)',
  url: 'https://erlc.com/policy-content/bill-endorsements-2025-2026/',
  quote: 'the ERLC has championed legislation containing policy solutions that are rooted in Scripture',
};

const UMC_GUNS = {
  traditionId: 'umc' as const, issueIds: ['guns' as const], body: GBCS, kind: 'alert' as const, date: '2025-06-04',
  docTitle: 'Take a Stand Against Gun Violence',
  url: 'https://www.umcjustice.org/latest/action-alert-take-a-stand-against-gun-violence-6544',
};

export const ADVOCACY: AdvocacyItem[] = [
  // --- Catholic: the U.S. bishops -----------------------------------------
  { ...HR1_HOUSE, issueIds: ['healthcare'], stance: 'changes', quote: 'This bill undertakes the largest Medicaid cut in history' },
  { ...HR1_HOUSE, issueIds: ['poverty'], stance: 'changes', quote: 'Congress must reject the SNAP provisions in the House reconciliation bill.' },
  { ...HR1_HOUSE, issueIds: ['immigration'], stance: 'changes', quote: 'double down on an unsustainable enforcement-only approach to immigration' },
  { ...HR1_HOUSE, issueIds: ['environment'], stance: 'changes', quote: 'Abdication of these responsibilities is not acceptable.' },
  // The one provision of the bill the letter backs.
  { ...HR1_HOUSE, issueIds: ['abortion'], stance: 'backs', quote: 'We strongly support the provision in the House reconciliation legislation that would prevent major elective abortion providers' },
  {
    traditionId: 'catholic', issueIds: ['abortion'], body: USCCB, stance: 'backs', kind: 'letter', date: '2025-01-21',
    named: ['Born-Alive Abortion Survivors Protection Act'], numbers: 'S. 6 / H.R. 21',
    docTitle: 'Letter to Congress supporting the Born-Alive Abortion Survivors Protection Act',
    url: 'https://www.usccb.org/resources/born_alive_letter_2025.pdf',
    quote: 'I urge you and your colleagues to vote in favor of the Born-Alive Abortion Survivors Protection Act',
  },
  {
    traditionId: 'catholic', issueIds: ['abortion'], body: USCCB, stance: 'backs', kind: 'letter', date: '2025-07-23',
    named: ['FACE Act Repeal Act of 2025'], numbers: 'H.R. 589',
    docTitle: 'Letter on the FACE Act Repeal Act of 2025',
    url: 'https://www.usccb.org/resources/FACE_Repeal_of_2025_Letter.pdf',
    quote: 'we write in support of the FACE Act Repeal Act of 2025',
  },
  {
    traditionId: 'catholic', issueIds: ['abortion'], body: USCCB, stance: 'backs', kind: 'letter', date: '2026-04-01',
    named: ['Safeguarding Women from Chemical Abortion Act'], numbers: 'S. 4066 / H.R. 7902',
    docTitle: 'Letter to Congress on the Safeguarding Women from Chemical Abortions Act',
    url: 'https://www.usccb.org/resources/Letter%20to%20Congress%20on%20the%20Safeguarding%20Women%20from%20Chemical%20Abortions%20Act.pdf',
    quote: 'I write to express our support for the Safeguarding Women from Chemical Abortion Act',
  },
  {
    traditionId: 'catholic', issueIds: ['immigration'], body: USCCB, stance: 'backs', kind: 'letter', date: '2026-11-10',
    named: ['S. 4814'], numbers: 'S. 4814',
    docTitle: 'Letter to the U.S. Senate on S. 4814 and Related Matters',
    url: 'https://www.usccb.org/resources/USCCB%20Letter%20on%20S.%204814%20and%20Related%20Matters.pdf',
    quote: 'We urge you to work with Senate leadership toward the passage of S. 4814',
  },
  {
    traditionId: 'catholic', issueIds: ['poverty', 'criminal-justice'], body: `${USCCB}, with other Catholic organizations`, stance: 'backs', kind: 'letter', date: '2025-09-23',
    named: ['RESTORE'], numbers: 'H.R. 5223',
    docTitle: 'Joint Catholic Letter to Congress on the RESTORE Act',
    url: 'https://www.usccb.org/resources/joint-catholic-letter-congress-restore-act-september-23-2025',
    quote: 'we encourage you to include the Re-Entry Support Through Opportunities for Resources and Essentials (RESTORE) Act',
  },

  // --- Southern Baptist: the ERLC -------------------------------------------
  {
    ...ERLC_LIST, issueIds: ['abortion'],
    named: [
      'Born Alive Abortion Survivor Protection Act', 'Conscience Protection for Medical Residents Act', 'Dismemberment Abortion Ban Act of 2025',
      'Heartbeat Protection Act of 2025', 'No Taxpayer Funding for Abortion and Abortion Insurance Full Disclosure Act of 2025',
      'Pregnant Woman Health and Safety Act', 'Protect Funding for Women’s Healthcare Act', 'Protecting Individuals with Down Syndrome Act',
      'Restoring Safeguards for Dangerous Abortion Drugs Act', 'Safeguarding Women from Chemical Abortion Act', 'SAVE Moms and Babies Act',
      'Title X Abortion Provider Prohibition Act',
    ],
  },
  { ...ERLC_LIST, issueIds: ['criminal-justice'], named: ['Preventing Violence against Female Inmates Act'] },
  {
    traditionId: 'sbc', issueIds: ['abortion'], body: ERLC, stance: 'opposes', kind: 'agenda', date: '2025-01',
    named: ['Women’s Health Protection Act'],
    docTitle: '2025 Public Policy Agenda',
    url: 'https://erlc.com/wp-content/uploads/2025/01/ERL4240_LegisAgenda_build_011625.pdf',
    quote: 'Oppose the Women’s Health Protection Act and Any Pro-Abortion Legislation',
  },
  {
    traditionId: 'sbc', issueIds: ['criminal-justice'], body: ERLC, stance: 'backs', kind: 'agenda', date: '2025-01',
    named: ['Recognizing Education, Employment, New Skills, and Treatment to Enable Reintegration Act', 'EQUAL Act'],
    docTitle: '2025 Public Policy Agenda',
    url: 'https://erlc.com/wp-content/uploads/2025/01/ERL4240_LegisAgenda_build_011625.pdf',
    quote: 'the ERLC supports additional bipartisan legislation such as the',
  },

  // --- United Methodist: the General Board of Church and Society -------------
  {
    traditionId: 'umc', issueIds: ['immigration'], body: GBCS, stance: 'opposes', kind: 'alert', date: '2025-01-15',
    named: ['Laken Riley Act'], numbers: 'S. 5 / H.R. 29',
    docTitle: 'Oppose the Laken Riley Act',
    url: 'https://www.umcjustice.org/articles/action-alert-oppose-the-laken-riley-act-stand-for-justice-and-compassion-3805',
    quote: 'to oppose the Laken Riley Act.',
  },
  {
    traditionId: 'umc', issueIds: ['immigration'], body: GBCS, stance: 'backs', kind: 'alert', date: '2025-03-07',
    named: ['Sensitive Locations Act'], numbers: 'H.R. 1061',
    docTitle: 'Support the Sensitive Locations Act (H.R. 1061)',
    url: 'https://www.umcjustice.org/latest/take-action-protect-immigrant-families-communities-support-the-sensitive-locations-act-h-r-1061-4465',
    quote: 'H.R. 1061 upholds the moral and biblical call to protect the vulnerable and welcome the stranger.',
  },
  { ...UMC_GUNS, stance: 'backs', named: ['Assault Weapons Ban', 'Ethan’s Law'], numbers: 'H.R. 3115 / S. 1531; H.R. 1564 / S. 726', quote: 'below is a list of legislation to support in this Congress:' },
  { ...UMC_GUNS, stance: 'opposes', named: ['Constitutional Concealed Carry Reciprocity Act', 'Hearing Protection Act'], numbers: 'H.R. 38 / S. 65; H.R. 404 / S. 364', quote: 'And legislation to oppose:' },
  {
    traditionId: 'umc', issueIds: ['guns'], body: GBCS, stance: 'backs', kind: 'alert', date: '2026-09-30',
    named: ['Stop Arming Cartels Act'], numbers: 'H.R. 923 / S. 367',
    docTitle: 'Stop Gun Trafficking to Latin America and the Caribbean',
    url: 'https://www.umcjustice.org/latest/action-alert-stop-gun-trafficking-to-latin-america-and-the-caribbean-10867',
    // The researcher's quote dropped "H.R. 6736/S. 3508, the ARMAS Act, and"
    // from the middle of the sentence; the checker caught it. This one is whole.
    quote: 'Ask your Representatives and Senators to cosponsor the ARMAS Act and the Stop Arming Cartels Act.',
  },
  {
    traditionId: 'umc', issueIds: ['healthcare'], body: GBCS, stance: 'backs', kind: 'alert', date: '2026-05-04',
    named: ['Momnibus Act'], numbers: 'H.R. 7973',
    docTitle: 'Pass the Momnibus Act to Protect Maternal Health',
    url: 'https://www.umcjustice.org/latest/action-alert-urge-your-representative-to-pass-the-momnibus-act-to-protect-maternal-health-9448',
    quote: 'Act now to advocate that the Momnibus Act becomes law.',
  },
  {
    traditionId: 'umc', issueIds: ['healthcare'], body: GBCS, stance: 'backs', kind: 'alert', date: '2026-05-26',
    named: ['Tech to Save Moms Act'], numbers: 'H.R. 8317 / S. 958',
    docTitle: 'Support the Tech to Save Moms Act',
    url: 'https://www.umcjustice.org/latest/action-alert-tell-congress-to-support-the-tech-to-save-moms-act-9481',
    quote: 'the General Board of Church and Society has endorsed the Tech to Save Moms Act',
  },
  {
    traditionId: 'umc', issueIds: ['criminal-justice'], body: GBCS, stance: 'backs', kind: 'statement', date: '2026-04-24',
    named: ['Smarter Pretrial Detention for Drug Charges Act of 2026', 'First Step Implementation Act of 2025'],
    docTitle: 'Second Chance Awareness Month: A Call for Restorative Justice',
    url: 'https://www.umcjustice.org/latest/second-chance-awareness-month-a-call-for-restorative-justice-9382',
    quote: 'Congregations and annual conferences should urge their members of Congress to co-sponsor legislation such as the',
  },

  // --- AME: the Council of Bishops -------------------------------------------
  {
    traditionId: 'ame', issueIds: ['poverty', 'healthcare'], body: 'AME Council of Bishops', stance: 'criticizes', kind: 'statement', date: '2025-07-01',
    named: ['Big Beautiful Bill'], numbers: 'H.R. 1',
    docTitle: 'Statement Council of Bishops',
    url: 'https://www.ame-church.com/news/statement-council-of-bishops/',
    quote: 'causing hurt, pain and devastation for millions of people',
  },

  // --- Reform: the RAC (for the URJ and the CCAR), and the CCAR ---------------
  { ...RAC_LETTER, issueIds: ['abortion'], stance: 'backs', named: ['Women’s Health Protection Act', 'Equal Access to Abortion Coverage in Health Insurance Act', 'Abortion is Health Care Everywhere Act'], quote: 'We urge Congress to expand federal access to abortion and comprehensive reproductive health care' },
  { ...RAC_LETTER, issueIds: ['poverty'], stance: 'backs', named: ['Raise the Wage Act'], quote: 'the Raise the Wage Act to restore the value of the federal minimum wage' },
  { ...RAC_LETTER, issueIds: ['guns'], stance: 'backs', named: ['Bipartisan Background Checks Act', 'Background Checks Expansion Act', 'Assault Weapons Ban', 'Ethan’s Law'], quote: 'We urge Congress to prevent gun violence by supporting the Bipartisan Background Checks Act' },
  { ...RAC_LETTER, issueIds: ['death-penalty'], stance: 'backs', named: ['Federal Death Penalty Prohibition Act'], quote: 'other bills to eliminate disparities in sentencing and drug policy, and the Federal Death Penalty Prohibition Act' },
  { ...RAC_LETTER, issueIds: ['criminal-justice'], stance: 'backs', named: ['George Floyd Justice in Policing Act', 'End Racial and Religious Profiling Act', 'EQUAL Act'], quote: 'comprehensive police reform (including the George Floyd Justice in Policing Act and End Racial and Religious Profiling Act)' },
  { ...RAC_LETTER, issueIds: ['environment'], stance: 'backs', named: ['Environmental Justice for All Act', 'Recovering America’s Wildlife Act', 'Arctic Refuge Protection Act'], quote: 'advancing the Environmental Justice for All Act, the Recovering America’s Wildlife Act and Arctic Refuge Protection Act' },
  { ...RAC_LETTER, issueIds: ['healthcare'], stance: 'backs', named: ['Health Equity and Accountability Act'], quote: 'We urge Congress to protect and expand Medicaid and CHIP' },
  {
    traditionId: 'reform', issueIds: ['abortion'], body: RAC, stance: 'backs', kind: 'alert', date: null, host: 'VoterVoice',
    named: ['Equal Access to Abortion Coverage in Health Insurance Act of 2025'], numbers: 'H.R. 4611 / S. 2377',
    docTitle: 'the EACH Act',
    url: 'https://www.votervoice.net/URJ/Campaigns/97789/Respond',
    quote: 'Urge Congress to pass the Equal Access to Abortion Coverage in Health Insurance Act of 2025',
  },
  {
    traditionId: 'reform', issueIds: ['guns'], body: RAC, stance: 'backs', kind: 'alert', date: null, host: 'VoterVoice',
    named: ['universal background checks', 'Ethan’s Law'], numbers: 'H.R. 18; H.R. 1564 / S. 726',
    docTitle: 'Urge Congress to take immediate action to stop gun violence',
    url: 'https://www.votervoice.net/URJ/Campaigns/97975/Respond',
    quote: 'Establishing universal background checks (H.R. 18 in 119th congress',
  },
  {
    traditionId: 'reform', issueIds: ['poverty', 'healthcare'], body: 'Central Conference of American Rabbis', stance: 'criticizes', kind: 'statement', date: '2025-07-07',
    named: ['One Big Beautiful Bill'], numbers: 'H.R. 1',
    docTitle: 'Statement on Economic Injustice Legislation',
    url: 'https://www.ccarnet.org/statement-on-economic-injustice-legislation/',
    quote: 'is dismayed by recently adopted legislation being referred to as',
  },
];

/** The bodies whose advocacy was searched and named no bill on these issues. */
export const ADVOCACY_NONE: Partial<Record<TraditionId, string>> = {
  ag: 'The Assemblies of God (USA) has no Washington policy office, and ag.org posted no position on a bill in 2025-26.',
  conservative: 'The Rabbinical Assembly\'s 2025-26 resolutions and statements on these issues name no bill.',
  orthodox: 'The Orthodox Union\'s advocacy center names bills only on school choice, antisemitism and security funding.',
};

/** Where the advocacy lives: one source file per URL, under data/faith_sources/advocacy/. */
export const ADVOCACY_FILES: Record<string, string> = {
  [HR1_HOUSE.url]: 'advocacy/usccb_hr1_house.txt',
  'https://www.usccb.org/resources/born_alive_letter_2025.pdf': 'advocacy/usccb_bornalive.txt',
  'https://www.usccb.org/resources/FACE_Repeal_of_2025_Letter.pdf': 'advocacy/usccb_face.txt',
  'https://www.usccb.org/resources/Letter%20to%20Congress%20on%20the%20Safeguarding%20Women%20from%20Chemical%20Abortions%20Act.pdf': 'advocacy/usccb_chemabortion.txt',
  'https://www.usccb.org/resources/USCCB%20Letter%20on%20S.%204814%20and%20Related%20Matters.pdf': 'advocacy/usccb_s4814.txt',
  'https://www.usccb.org/resources/joint-catholic-letter-congress-restore-act-september-23-2025': 'advocacy/usccb_restore.txt',
  [ERLC_LIST.url]: 'advocacy/erlc_endorsements.txt',
  'https://erlc.com/wp-content/uploads/2025/01/ERL4240_LegisAgenda_build_011625.pdf': 'advocacy/erlc_2025_agenda.txt',
  'https://www.umcjustice.org/articles/action-alert-oppose-the-laken-riley-act-stand-for-justice-and-compassion-3805': 'advocacy/umc_laken_riley.txt',
  'https://www.umcjustice.org/latest/take-action-protect-immigrant-families-communities-support-the-sensitive-locations-act-h-r-1061-4465': 'advocacy/umc_sensitive_locations.txt',
  [UMC_GUNS.url]: 'advocacy/umc_guns_2025.txt',
  'https://www.umcjustice.org/latest/action-alert-stop-gun-trafficking-to-latin-america-and-the-caribbean-10867': 'advocacy/umc_gun_trafficking_2026.txt',
  'https://www.umcjustice.org/latest/action-alert-urge-your-representative-to-pass-the-momnibus-act-to-protect-maternal-health-9448': 'advocacy/umc_momnibus.txt',
  'https://www.umcjustice.org/latest/action-alert-tell-congress-to-support-the-tech-to-save-moms-act-9481': 'advocacy/umc_tech_save_moms.txt',
  'https://www.umcjustice.org/latest/second-chance-awareness-month-a-call-for-restorative-justice-9382': 'advocacy/umc_second_chance.txt',
  'https://www.ame-church.com/news/statement-council-of-bishops/': 'advocacy/ame_cob_2025_07_01.txt',
  [RAC_LETTER.url]: 'advocacy/rac_119th_letter.txt',
  'https://www.votervoice.net/URJ/Campaigns/97789/Respond': 'advocacy/rac_each_alert.txt',
  'https://www.votervoice.net/URJ/Campaigns/97975/Respond': 'advocacy/rac_guns_alert.txt',
  'https://www.ccarnet.org/statement-on-economic-injustice-legislation/': 'advocacy/ccar_hr1.txt',
};
