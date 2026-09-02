/**
 * PlainRecord — stated positions (tier 2 acts and tier 3 stances)
 *
 * Hand-curated, because the sources are press releases and news coverage rather
 * than a structured database. Curation is a bias surface, so the rules are:
 *
 *   1. Every entry carries a public `sourceUrl`. No unsourced positions.
 *   2. Topics come from the controlled vocabulary below, and BOTH sides get put
 *      on the same topic axis. A topic that only ever appears for one party is a
 *      curation smell — it means the axis was drawn around one candidate's framing.
 *   3. Direction is recorded only where a source states it. Where a candidate has
 *      merely *emphasized* a subject without a clear direction, the entry is
 *      OMITTED and listed in `KNOWN_GAPS` instead. Emphasis is not a position.
 *   4. Tier 3 stances never carry a billId and are never scored — see evidence.ts.
 *
 * This file is deliberately reviewable by someone who disagrees with it. If a
 * position is mischaracterized, the fix is a PR against this file with a better
 * source, and the diff is the audit trail.
 *
 * Last reviewed: 2026-08-31.
 */

import type { Evidence, PersonId } from './evidence';
import { validateEvidence } from './evidence';

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Candidate {
  id: PersonId;
  name: string;
  party: 'D' | 'R' | 'I';
  office: string;
  /** LegiScan people_id, when they have a Texas legislative record to join to. */
  legiscanId: string | null;
  /** Sessions in which this person cast recorded legislative votes. */
  voteSessions: string[];
  incumbent: boolean;
}

export const CANDIDATES: Candidate[] = [
  // --- the three Democrats: sitting TX House members, full roll-call records ---
  {
    id: 'tx-house-hinojosa-gina',
    name: 'Gina Hinojosa',
    party: 'D',
    office: 'Governor',
    legiscanId: null, // fill from tx_roster_*.json at ingest
    voteSessions: ['85R', '86R', '87R', '88R', '89R'],
    incumbent: false,
  },
  {
    id: 'tx-house-goodwin-vikki',
    name: 'Vikki Goodwin',
    party: 'D',
    office: 'Lieutenant Governor',
    legiscanId: null,
    voteSessions: ['86R', '87R', '88R', '89R'],
    incumbent: false,
  },
  {
    id: 'tx-house-talarico-james',
    name: 'James Talarico',
    party: 'D',
    office: 'U.S. Senate',
    legiscanId: null,
    voteSessions: ['86R', '87R', '88R', '89R'],
    incumbent: false,
  },

  // --- the three Republicans: executive incumbents, no overlapping votes ---
  {
    id: 'tx-gov-abbott-greg',
    name: 'Greg Abbott',
    party: 'R',
    office: 'Governor',
    legiscanId: null,
    // Never served in a legislature: judge, TX Supreme Court, AG, Governor.
    voteSessions: [],
    incumbent: true,
  },
  {
    id: 'tx-ltgov-patrick-dan',
    name: 'Dan Patrick',
    party: 'R',
    office: 'Lieutenant Governor',
    legiscanId: null,
    // TX Senate 2007-2015 (80th-83rd). No overlap with any Democrat above.
    voteSessions: ['80R', '81R', '82R', '83R'],
    incumbent: true,
  },
  {
    id: 'tx-ag-paxton-ken',
    name: 'Ken Paxton',
    party: 'R',
    office: 'U.S. Senate',
    legiscanId: null,
    // TX House 2003-2013 (78th-82nd), TX Senate 2013-2015 (83rd). No overlap.
    voteSessions: ['78R', '79R', '80R', '81R', '82R', '83R'],
    incumbent: true,
  },

  // --- third candidate in the Lt. Governor race ---
  {
    id: 'tx-ltgov-collier-mike',
    name: 'Mike Collier',
    party: 'I',
    office: 'Lieutenant Governor',
    legiscanId: null,
    // Never held legislative office; ran for Lt. Gov. as a Democrat in 2018 and
    // 2022, running as an Independent in 2026.
    voteSessions: [],
    incumbent: false,
  },
];

/**
 * Every candidate on a ballot we cover must appear here. A page that scores two
 * of three candidates in a race is its own bias, so this list is empty by
 * design — anyone left on it is a gap, not a footnote.
 */
export const UNRESEARCHED_BALLOT_CANDIDATES: { name: string; party: string; office: string }[] = [];

// ---------------------------------------------------------------------------
// Topic vocabulary
// ---------------------------------------------------------------------------

/**
 * Each topic is phrased so that +1 and -1 both mean something concrete, and so
 * that the phrasing does not presuppose either side's framing. "School vouchers"
 * rather than "school choice" or "defunding public schools"; the neutral noun is
 * the mechanism, not the sales pitch.
 */
export const TOPICS = {
  'school-vouchers': 'Public funds for private school tuition',
  'public-school-funding': 'Increasing public school funding',
  'healthcare-access': 'Expanding state healthcare coverage',
  'thc-ban': 'Banning consumable THC products',
  'water-infrastructure': 'State investment in water infrastructure',
  'grid-thermal-power': 'Building additional thermal power generation',
  'property-tax-limits': 'Further limits on property tax growth',
  'household-rebate': 'Direct cash rebate to households from state reserves',
  'partisan-redistricting': 'Further mid-decade partisan redistricting',
  'data-center-regulation': 'Regulating AI data center construction',
  'border-enforcement': 'Expanded state border and immigration enforcement',
  'school-religion': 'Prayer and religious displays in public schools',
  'dei-programs': 'Diversity and inclusion programs in public institutions',
  'trans-athletes': "Transgender athletes in women's sports",
  'noncitizen-voting-ban': 'Measures barring noncitizens from voting',
  'closed-primaries': 'Restricting primaries to registered party members',
  'religious-law-ban': 'Banning application of Islamic religious law',
  'second-amendment': 'Expanding firearms rights',
  'wealth-tax-cuts': 'Repealing recent federal tax cuts for high earners',
  'universal-childcare': 'Federally funded universal child care',
  'medical-debt': 'Federal medical debt relief',
  'medical-expense-deduction': 'Large federal tax deduction for medical expenses',
  'tariffs': 'Broad import tariffs',
  'iran-military-action': 'Expanded U.S. military action in Iran',
  'veterans-services': 'Increased veterans health, housing, employment support',
  'asylum-process': 'Preserving orderly asylum processing at the border',
  'chinese-tech-data-centers': 'Chinese-made technology in U.S. data centers',
  'ai-child-safety-liability': 'Criminal liability for AI harms to children',
  'term-limits': 'Term limits for statewide office holders',
  'casino-gambling': 'Legalizing casino resorts',
} as const;

export type Topic = keyof typeof TOPICS;

// ---------------------------------------------------------------------------
// Tier 3 — campaign stances. No billId. Never scored.
// ---------------------------------------------------------------------------

interface StanceSeed {
  person: PersonId;
  topic: Topic;
  position: 1 | -1;
  sourceUrl: string;
  note?: string;
}

const STANCE_SEEDS: StanceSeed[] = [
  // ----- Gina Hinojosa (D, Governor) -----
  { person: 'tx-house-hinojosa-gina', topic: 'school-vouchers', position: -1,
    sourceUrl: 'https://ginafortexas.com/' },
  { person: 'tx-house-hinojosa-gina', topic: 'public-school-funding', position: 1,
    sourceUrl: 'https://www.cbsnews.com/texas/news/gina-hinojosa-governor-race-8-29-2026/' },
  { person: 'tx-house-hinojosa-gina', topic: 'household-rebate', position: 1,
    sourceUrl: 'https://www.texastribune.org/2026/07/07/gina-hinojosa-proposes-sending-every-texas-household-1500-in-her-bid-to-oust-greg-abbott/',
    note: '$1,500 per household from the rainy day fund; est. $17B' },
  { person: 'tx-house-hinojosa-gina', topic: 'partisan-redistricting', position: -1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/election-2026/2026/08/06/558728/gina-hinojosa-texas-governor-greg-abbott-election-2026-rally-houston/',
    note: 'pledged to veto further partisan redistricting' },

  // ----- Vikki Goodwin (D, Lt. Governor) -----
  { person: 'tx-house-goodwin-vikki', topic: 'school-vouchers', position: -1,
    sourceUrl: 'https://thetexan.news/elections/2026/state-rep-vikki-goodwin-wins-democratic-nomination-for-lieutenant-governor/article_4a251b9f-383f-445b-b688-de43c821b628.html',
    note: '"My plan would be no public dollars to private schools"' },
  { person: 'tx-house-goodwin-vikki', topic: 'public-school-funding', position: 1,
    sourceUrl: 'https://www.texastribune.org/2026/05/26/texas-lieutenant-governor-democratic-primary-runoff-vikki-goodwin-marcos-velez/' },
  { person: 'tx-house-goodwin-vikki', topic: 'healthcare-access', position: 1,
    sourceUrl: 'https://www.beaumontenterprise.com/news/article/lt-gov-nominee-vikki-goodwin-holds-healthcare-22396735.php' },
  { person: 'tx-house-goodwin-vikki', topic: 'thc-ban', position: -1,
    sourceUrl: 'https://www.beaumontenterprise.com/news/article/lt-gov-nominee-vikki-goodwin-holds-healthcare-22396735.php',
    note: 'favors regulating THC products rather than banning them' },
  { person: 'tx-house-goodwin-vikki', topic: 'water-infrastructure', position: 1,
    sourceUrl: 'https://www.texastribune.org/2026/05/26/texas-lieutenant-governor-democratic-primary-runoff-vikki-goodwin-marcos-velez/' },

  // ----- James Talarico (D, U.S. Senate) -----
  { person: 'tx-house-talarico-james', topic: 'wealth-tax-cuts', position: 1,
    sourceUrl: 'https://www.imfortalarico.com/',
    note: 'position +1 = supports repealing the cuts' },
  { person: 'tx-house-talarico-james', topic: 'universal-childcare', position: 1,
    sourceUrl: 'https://www.imfortalarico.com/' },
  { person: 'tx-house-talarico-james', topic: 'medical-debt', position: 1,
    sourceUrl: 'https://www.imfortalarico.com/' },
  { person: 'tx-house-talarico-james', topic: 'veterans-services', position: 1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/election-2026/2026/08/14/559565/james-talarico-pushes-new-plan-to-woo-texas-veterans-pledges-to-fight-for-them-the-way-they-fight-for-us/' },
  { person: 'tx-house-talarico-james', topic: 'iran-military-action', position: -1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/election-2026/2026/08/14/559565/james-talarico-pushes-new-plan-to-woo-texas-veterans-pledges-to-fight-for-them-the-way-they-fight-for-us/',
    note: 'pledged to "stop the new forever war in Iran"' },
  { person: 'tx-house-talarico-james', topic: 'tariffs', position: -1,
    sourceUrl: 'https://thetexan.news/elections/2026/talarico-targets-cost-of-living-at-campaign-tour-kickoff-in-affordability-centered-u-s-senate/article_1ceb19c3-ab21-4bdf-b086-d52ebd47cb93.html',
    note: 'favors trade partnerships over tariffs' },
  { person: 'tx-house-talarico-james', topic: 'asylum-process', position: 1,
    sourceUrl: 'https://thetexan.news/elections/2026/talarico-targets-cost-of-living-at-campaign-tour-kickoff-in-affordability-centered-u-s-senate/article_1ceb19c3-ab21-4bdf-b086-d52ebd47cb93.html' },

  // ----- Greg Abbott (R, Governor, incumbent) -----
  { person: 'tx-gov-abbott-greg', topic: 'school-vouchers', position: 1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/2026/06/12/554469/gov-greg-abbott-spells-out-vision-for-fourth-term-at-republican-state-convention-in-houston/' },
  { person: 'tx-gov-abbott-greg', topic: 'property-tax-limits', position: 1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/2026/06/12/554469/gov-greg-abbott-spells-out-vision-for-fourth-term-at-republican-state-convention-in-houston/',
    note: 'five proposals to rein in local taxing power' },
  { person: 'tx-gov-abbott-greg', topic: 'border-enforcement', position: 1,
    sourceUrl: 'https://www.texastribune.org/2025/11/09/texas-greg-abbott-reelection-campaign-governor/' },
  { person: 'tx-gov-abbott-greg', topic: 'dei-programs', position: -1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/2026/06/12/554469/gov-greg-abbott-spells-out-vision-for-fourth-term-at-republican-state-convention-in-houston/' },
  { person: 'tx-gov-abbott-greg', topic: 'trans-athletes', position: -1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/2026/06/12/554469/gov-greg-abbott-spells-out-vision-for-fourth-term-at-republican-state-convention-in-houston/' },
  { person: 'tx-gov-abbott-greg', topic: 'data-center-regulation', position: 1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/2026/06/12/554469/gov-greg-abbott-spells-out-vision-for-fourth-term-at-republican-state-convention-in-houston/' },
  { person: 'tx-gov-abbott-greg', topic: 'closed-primaries', position: 1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/2026/06/12/554469/gov-greg-abbott-spells-out-vision-for-fourth-term-at-republican-state-convention-in-houston/' },
  { person: 'tx-gov-abbott-greg', topic: 'religious-law-ban', position: 1,
    sourceUrl: 'https://www.houstonpublicmedia.org/articles/news/politics/2026/06/12/554469/gov-greg-abbott-spells-out-vision-for-fourth-term-at-republican-state-convention-in-houston/' },

  // ----- Dan Patrick (R, Lt. Governor, incumbent) -----
  { person: 'tx-ltgov-patrick-dan', topic: 'property-tax-limits', position: 1,
    sourceUrl: 'https://www.danpatrick.org/lt-governor-announces-his-2026-campaign-for-re-election/' },
  { person: 'tx-ltgov-patrick-dan', topic: 'grid-thermal-power', position: 1,
    sourceUrl: 'https://www.danpatrick.org/lt-governor-announces-his-2026-campaign-for-re-election/' },
  { person: 'tx-ltgov-patrick-dan', topic: 'school-vouchers', position: 1,
    sourceUrl: 'https://www.danpatrick.org/lt-governor-announces-his-2026-campaign-for-re-election/' },
  { person: 'tx-ltgov-patrick-dan', topic: 'border-enforcement', position: 1,
    sourceUrl: 'https://www.danpatrick.org/lt-governor-announces-his-2026-campaign-for-re-election/' },
  { person: 'tx-ltgov-patrick-dan', topic: 'school-religion', position: 1,
    sourceUrl: 'https://www.danpatrick.org/lt-governor-announces-his-2026-campaign-for-re-election/',
    note: 'prayer and the Ten Commandments in public schools' },
  { person: 'tx-ltgov-patrick-dan', topic: 'second-amendment', position: 1,
    sourceUrl: 'https://www.danpatrick.org/lt-governor-announces-his-2026-campaign-for-re-election/' },
  { person: 'tx-ltgov-patrick-dan', topic: 'water-infrastructure', position: 1,
    sourceUrl: 'https://www.danpatrick.org/lt-governor-announces-his-2026-campaign-for-re-election/' },
  { person: 'tx-ltgov-patrick-dan', topic: 'noncitizen-voting-ban', position: 1,
    sourceUrl: 'https://www.danpatrick.org/lt-governor-announces-his-2026-campaign-for-re-election/' },

  // ----- Ken Paxton (R, U.S. Senate) -----
  { person: 'tx-ag-paxton-ken', topic: 'medical-expense-deduction', position: 1,
    sourceUrl: 'https://www.texastribune.org/2026/07/31/texas-ken-paxton-us-senate-race-economic-agenda-tax-deductions/',
    note: '$25,000 per taxpayer and dependent for medical expenses incl. premiums' },
  { person: 'tx-ag-paxton-ken', topic: 'chinese-tech-data-centers', position: -1,
    sourceUrl: 'https://www.texastribune.org/2026/08/24/ken-paxton-james-talarico-data-centers-senate-texas/',
    note: 'pledged to ban Chinese technology from U.S. data centers' },
  { person: 'tx-ag-paxton-ken', topic: 'ai-child-safety-liability', position: 1,
    sourceUrl: 'https://www.texastribune.org/2026/08/24/ken-paxton-james-talarico-data-centers-senate-texas/' },
  { person: 'tx-ag-paxton-ken', topic: 'school-religion', position: 1,
    sourceUrl: 'https://en.wikipedia.org/wiki/Ken_Paxton',
    note: 'supports prayer and bible reading in schools per SB 11 (89R)' },

  // ----- gap-filling: topics that previously had only one party on them -----

  // THC. This one crosses party lines, and the split is documented on an
  // identical bill: SB 3 (89R) was Patrick's third-ranked priority and Abbott
  // vetoed it, calling it "almost certainly unconstitutional" and pushing
  // regulation instead. Patrick publicly accused him of wanting to "legalize
  // marijuana." Goodwin and Collier are on Abbott's side of this one.
  { person: 'tx-ltgov-patrick-dan', topic: 'thc-ban', position: 1,
    sourceUrl: 'https://www.texastribune.org/2025/06/23/texas-thc-ban-veto-dan-patrick-greg-abbott-sb-3/',
    note: 'SB 3 (89R) was his #3 priority bill; rebuked Abbott for the veto' },
  { person: 'tx-gov-abbott-greg', topic: 'thc-ban', position: -1,
    sourceUrl: 'https://gov.texas.gov/news/post/governor-abbott-vetoes-senate-bill-3-89r',
    note: 'vetoed SB 3; favors regulating hemp products rather than banning them' },

  // Healthcare / Medicaid expansion.
  { person: 'tx-gov-abbott-greg', topic: 'healthcare-access', position: -1,
    sourceUrl: 'https://www.governing.com/archive/texas-governor-still-wont-expand-medicaid.html',
    note: 'opposes Medicaid expansion, calling it "a tax increase waiting to happen"' },
  { person: 'tx-ltgov-patrick-dan', topic: 'healthcare-access', position: -1,
    sourceUrl: 'https://publichealthwatch.org/2022/11/07/why-do-texas-republicans-still-oppose-medicaid-expansion/',
    note: 'has kept Medicaid expansion bills from reaching the Senate floor' },

  // Data centers. Both parties land on "regulate", which makes this a high-
  // salience, LOW-valence topic — exactly the cross-cutting material the
  // selection reserve exists to keep on the quiz.
  { person: 'tx-house-hinojosa-gina', topic: 'data-center-regulation', position: 1,
    sourceUrl: 'https://thetexan.news/elections/2026/gov-abbott-challenger-hinojosa-spotlight-data-centers-in-gubernatorial-campaigns/article_64c51f5d-db12-41e9-92ff-29643cbd3e93.html',
    note: 'called for a moratorium on new approvals pending a special session' },
  { person: 'tx-house-talarico-james', topic: 'data-center-regulation', position: 1,
    sourceUrl: 'https://www.texastribune.org/2026/07/22/texas-james-talarico-data-centers-regulation-senate-2026/',
    note: '"Hold Data Centers Accountable" — local approval, end sales-tax incentives' },

  // ----- Mike Collier (I, Lt. Governor) -----
  { person: 'tx-ltgov-collier-mike', topic: 'public-school-funding', position: 1,
    sourceUrl: 'https://news-journal.com/2026/02/04/now-running-as-independent-mike-collier-outlines-platform-for-third-texas-lieutenant-governor-campaign/' },
  { person: 'tx-ltgov-collier-mike', topic: 'property-tax-limits', position: 1,
    sourceUrl: 'https://news-journal.com/2026/02/04/now-running-as-independent-mike-collier-outlines-platform-for-third-texas-lieutenant-governor-campaign/',
    note: 'state should fund more public services so local entities can cut property taxes' },
  { person: 'tx-ltgov-collier-mike', topic: 'thc-ban', position: -1,
    sourceUrl: 'https://news-journal.com/2026/02/04/now-running-as-independent-mike-collier-outlines-platform-for-third-texas-lieutenant-governor-campaign/',
    note: 'opposes a blanket ban' },
  { person: 'tx-ltgov-collier-mike', topic: 'term-limits', position: 1,
    sourceUrl: 'https://www.wfaa.com/article/news/politics/inside-politics/texas-politics/mike-collier-ditches-both-parties-new-bid-to-become-texas-lt-governor/287-545d1694-78d1-41c8-a1e4-72cc332e4e1e',
    note: 'two terms for statewide office holders' },
  { person: 'tx-ltgov-collier-mike', topic: 'casino-gambling', position: 1,
    sourceUrl: 'https://news-journal.com/2026/02/04/now-running-as-independent-mike-collier-outlines-platform-for-third-texas-lieutenant-governor-campaign/',
    note: 'casino resorts as a funding source for schools and property tax relief' },
];

export const STANCES: Evidence[] = STANCE_SEEDS.map((s) => {
  const e: Evidence = {
    personId: s.person,
    kind: 'campaign_platform',
    position: s.position,
    billId: null, // tier 3: no bill, by definition
    session: null,
    date: null,
    sourceUrl: s.sourceUrl,
    topic: s.topic,
    note: s.note,
  };
  validateEvidence(e);
  return e;
});

// ---------------------------------------------------------------------------
// Tier 2 — Patrick's designated priority bills. These DO join to bills.
// ---------------------------------------------------------------------------

/**
 * The Lieutenant Governor presides over the Senate and votes only to break ties,
 * so Patrick has no meaningful current voting record. He does, however, publish a
 * numbered priority list each session: an explicit, dated, public position on
 * specific numbered bills.
 *
 * The chamber mismatch is not a problem. These are Senate bills, and a Senate
 * bill that reaches the House floor gets a House record vote — so SB 2, SB 3 and
 * the rest have recorded votes from all three House Democrats. The join is on
 * billId, exactly as it is for a veto.
 *
 * Same one-sidedness caveat as the vetoes, in the mirror image: a priority list
 * contains only bills he SUPPORTS. Every position here is +1. evidence.ts will
 * flag the record as one-sided and refuse to score it.
 */
const PATRICK_89R_PRIORITIES: [string, string][] = [
  ['SB 1', "Senate's budget for Texas"],
  ['SB 2', 'Providing school choice'],
  ['SB 3', 'Banning THC in Texas'],
  ['SB 4', 'Increasing the homestead exemption to $140,000 ($150,000 for seniors)'],
  ['SB 5', 'Establishing the Dementia Prevention & Research Institute of Texas'],
  ['SB 6', "Increasing Texas' electric grid reliability"],
  ['SB 7', "Increasing investments in Texas' water supply"],
  ['SB 8', 'Requiring local law enforcement to assist federal deportation efforts'],
  ['SB 9', 'Reforming bail'],
  ['SB 10', 'Placing the Ten Commandments in school'],
  ['SB 11', 'Protecting the freedom to pray in school'],
  ['SB 12', 'Establishing a parental bill of rights in public education'],
  ['SB 13', 'Guarding against inappropriate books in public schools'],
  ['SB 14', 'Texas DOGE — improving government efficiency'],
  ['SB 30', 'Curbing nuclear verdicts'],
  ['SB 31', 'Life of the Mother Act'],
  ['SB 32', 'Business tax relief'],
  ['SB 33', 'Stopping taxpayer-funded abortion travel'],
  ['SB 34', 'Wildfire response'],
  ['SB 35', 'Competing for quality roads'],
  ['SB 36', 'Establishing a Homeland Security Division within DPS'],
  ['SB 37', 'Reforming faculty senates'],
  ['SB 38', 'Stopping squatters'],
  ['SB 39', 'Protecting Texas trucking'],
  ['SB 40', 'Bail reform'],
];

const PRIORITY_SOURCES = [
  'https://www.ltgov.texas.gov/2025/01/29/lt-gov-dan-patrick-announces-first-round-of-top-40-priority-bills-for-the-2025-legislative-session/',
  'https://www.ltgov.texas.gov/2025/03/13/lt-gov-dan-patrick-announces-second-round-of-top-40-priority-bills-for-the-2025-legislative-session/',
];

export const PRIORITY_BILLS: Evidence[] = PATRICK_89R_PRIORITIES.map(([billId, label], i) => {
  const e: Evidence = {
    personId: 'tx-ltgov-patrick-dan',
    kind: 'priority_bill',
    position: 1, // a priority designation is only ever support
    billId,
    session: '89R',
    date: i < 14 ? '2025-01-29' : '2025-03-13',
    sourceUrl: i < 14 ? PRIORITY_SOURCES[0] : PRIORITY_SOURCES[1],
    topic: label,
  };
  validateEvidence(e);
  return e;
});

// ---------------------------------------------------------------------------
// Gaps, recorded rather than papered over
// ---------------------------------------------------------------------------

/**
 * Subjects a candidate has emphasized without a source stating a direction, or
 * where a topic has only one side represented so far. Rule 3 says these are
 * omitted from the data; rule 2 says the imbalance has to be visible somewhere.
 * This is that somewhere.
 */
export const KNOWN_GAPS: { person: string; topic: string; why: string }[] = [
  {
    person: 'Mike Collier',
    topic: 'school-vouchers',
    why: 'His stated position is that VOTERS should decide whether to continue ' +
      'vouchers — a procedural position, not a direction on the policy. Recording ' +
      'it as -1 would put words in his mouth, so the topic is left blank for him.',
  },
  {
    person: 'Greg Abbott / Dan Patrick',
    topic: 'household-rebate',
    why: 'Neither has a sourced position on a direct cash rebate from reserves. ' +
      'Both favour property-tax relief instead, which is a different mechanism and ' +
      'is recorded separately under property-tax-limits — not as opposition to this.',
  },
  {
    person: 'Ken Paxton / James Talarico',
    topic: 'wealth-tax-cuts, universal-childcare, medical-debt, tariffs, ' +
      'iran-military-action, asylum-process, medical-expense-deduction',
    why: 'Federal topics in the Senate race where only one candidate has a sourced ' +
      'position. These axes currently flatter whoever has an entry, and the Senate ' +
      'race is the one where a stance-only comparison carries the most weight ' +
      'because Paxton has no scoreable Texas evidence at all.',
  },
  {
    person: 'all',
    topic: 'topic balance',
    why: 'Balance is measured, not asserted: evidence.smoke.ts reports how many ' +
      'topics carry more than one party and fails if that is not tracked. Treat a ' +
      'single-party topic as unfinished rather than as a finding about the candidate.',
  },
];

export const ALL_STATED: Evidence[] = [...PRIORITY_BILLS, ...STANCES];
