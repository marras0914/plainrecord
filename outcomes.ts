/**
 * PlainRecord — outcome indicators
 *
 * A quiz that reports "you agreed with X on 60% of votes" and stops there is
 * missing the point. Votes have consequences. This module attaches published
 * outcome data to the policy areas the votes fall in.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THIS FILE EXISTS TO ENFORCE: an outcome is not a causal claim.
 * ---------------------------------------------------------------------------
 * "Texas ranks 47th in per-student funding" is a sourced fact. "Texas ranks
 * 47th because of Greg Abbott" is an argument, and a contestable one — rankings
 * move on demographics, funding formulas, federal policy, local property values
 * and the economy alongside state law. DATA_PIPELINE.md already forbids loaded
 * framing ("describe legislative function, mechanism and fiscal impact — no
 * loaded adjectives"), and an unfalsifiable attribution is the strongest form of
 * that mistake: the first reader who disputes it wins, and takes the verifiable
 * parts of the project down with them.
 *
 * So every indicator carries a source, a year, and a `caveat` naming what else
 * drives it. What the page then puts side by side is:
 *
 *   the outcome (sourced)  +  the recorded act (sourced)  +  who held office
 *
 * and lets the reader close the gap. That is a stronger position than an
 * accusation, because none of the three pieces can be argued away.
 *
 * BALANCE IS NOT DECORATION. `standing` is recorded for every indicator
 * including the middling ones. Texas ranks 26th on firearm deaths — unremarkable
 * — and that stays in. A panel where every number indicts reads as advocacy and
 * gets dismissed as such; one that reports a mixed picture is believed.
 *
 * Every figure below was checked against its cited source. Do not add an
 * indicator you have not opened the source for.
 */

export type Standing =
  | 'bottom'    // among the worst states on this measure
  | 'middle'    // unremarkable relative to other states
  | 'top'       // among the best states
  | 'neutral';  // a magnitude, not a grade — see below

/**
 * `neutral` exists because the first version of this file forced a verdict onto
 * every figure, and some figures do not have one. Texas spending $11bn on border
 * enforcement, or 78 GW of data-centre load arriving, are large facts whose
 * meaning IS the political argument: one reader sees waste, another sees
 * necessary spending; one sees a cost shifted onto households, another sees
 * investment. Marking those 'bottom' would be the page taking the side it
 * promised not to take.
 */

export interface Outcome {
  /** Quiz category this attaches to (see categorize.ts). */
  category: string;
  label: string;
  /** The headline figure, as plain text. */
  value: string;
  /** What to compare it against. */
  comparison: string;
  /** Rank among states where the source gives one, else null. */
  rank: string | null;
  standing: Standing;
  sourceName: string;
  sourceUrl: string;
  year: string;
  /** What else drives this number. Rendered, not optional in practice. */
  caveat: string;
}

export const OUTCOMES: Outcome[] = [
  {
    category: 'Education',
    label: 'Per-student school funding',
    value: '$13,189 per student',
    comparison: '$5,664 below the national average of $18,853',
    rank: '47th of 50 states',
    standing: 'bottom',
    sourceName: 'National Education Association, Rankings & Estimates',
    sourceUrl: 'https://tsta.org/grading-texas/even-with-an-extra-8-5-billion-for-public-schools-texas-still-trails-the-national-average-in-per-student-funding-by-4000/',
    year: '2024–25',
    caveat:
      'Other sources place Texas between 42nd and 47th depending on fiscal year and whether ' +
      'construction and pensions are counted. Per-student figures are also pushed around by ' +
      'enrolment growth and local property values, not only by state appropriations.',
  },
  {
    category: 'Health & Human Services',
    label: 'Adults without health insurance',
    value: '21.6% of adults',
    comparison: 'roughly double the national rate of 11.3%',
    rank: 'highest in the nation',
    standing: 'bottom',
    sourceName: 'U.S. Census Bureau, via Cover Texas Now',
    sourceUrl: 'https://covertexasnow.org/posts/2025/9/11/census-shows-texas-had-nations-worst-uninsured-rate-for-kids-and-adults-in-2024',
    year: '2024',
    caveat:
      'Driven heavily by Texas not expanding Medicaid, which is a decision of the legislature and ' +
      'governor — but also by the state’s share of agricultural and self-employed work, and by ' +
      'federal subsidy rules that Congress sets.',
  },
  {
    category: 'Families & Children',
    label: 'Children without health insurance',
    value: '13.6% of children — about 1.1 million',
    comparison: 'more than double the national rate of 6.0%; nearly a quarter of all uninsured children in the U.S.',
    rank: 'highest in the nation',
    standing: 'bottom',
    sourceName: 'Georgetown Center for Children and Families',
    sourceUrl: 'https://ccf.georgetown.edu/2025/09/12/u-s-and-state-by-state-child-health-coverage-trends/',
    year: '2024',
    caveat:
      'Rose from 10.9% in 2022, a 29% increase. Enrolment paperwork after the pandemic coverage ' +
      'unwinding accounts for part of the rise; eligibility rules set in Austin account for part.',
  },
  {
    category: 'Abortion',
    label: 'Infant deaths after the 2021 six-week ban',
    value: 'infant deaths rose 12.9% in the following year',
    comparison: 'against a 1.8% rise in the rest of the United States',
    rank: null,
    standing: 'bottom',
    sourceName: 'JAMA Pediatrics (peer-reviewed)',
    sourceUrl: 'https://jamanetwork.com/journals/jama/fullarticle/2821508',
    year: '2024 study, 2021–22 data',
    caveat:
      'A single-state time-series comparison, not a randomised finding. The authors attribute much ' +
      'of the rise to congenital anomalies diagnosed too late to act on under the ban. This concerns ' +
      'the 2021 law (SB 8 of the 87th), not any bill on this quiz.',
  },
  {
    category: 'Energy & Environment',
    label: 'What households pay for electricity',
    value: '16.11¢ per kWh — up about 40% since 2020',
    comparison: 'from 11.50¢ in 2020; delivered rates are running 14–19¢ in 2026, and some monthly bills have reached $600–$800',
    rank: null,
    standing: 'bottom',
    sourceName: 'ElectricityPlans, Texas rate trends',
    sourceUrl: 'https://electricityplans.com/texas-electricity-trends/',
    year: '2020–2026',
    // The honest reading, and the reason this is a SEPARATE entry from the data
    // centre one below: this rise already happened, and most data centre load has
    // not been built yet. Pinning the 40% on data centres would be precisely the
    // causal error this file exists to prevent.
    caveat:
      'This increase largely predates the data centre build-out. Natural gas prices, ' +
      'transmission construction, population growth and extreme weather all move retail ' +
      'rates. Treat it as what has happened to bills, not as a data centre effect.',
  },
  {
    category: 'Energy & Environment',
    label: 'What data centres are forecast to draw',
    value: '≈78 GW of data-centre demand projected by 2030',
    comparison:
      'against an all-time grid peak of 85.5 GW for the whole of Texas (Aug 2023). ERCOT’s own 2024 forecast for the same year was 29.6 GW — it has since more than doubled.',
    rank: null,
    standing: 'neutral',
    sourceName: 'ERCOT long-term load forecast, via Data Center Dynamics',
    sourceUrl: 'https://www.datacenterdynamics.com/en/news/ercot-and-miso-forecast-huge-increases-in-peak-load-driven-by-data-center-demand/',
    year: 'forecast to 2030',
    caveat:
      'A forecast built from interconnection requests, not built capacity — developers request ' +
      'far more than they finish, and ERCOT has revised this number sharply upward twice. Who ' +
      'pays for the transmission it needs is the live question, and is what SB 6 and the 2026 ' +
      'PUC actions are about.',
  },
  {
    category: 'Immigration',
    label: 'Spending on Operation Lone Star',
    value: '$11 billion since 2021',
    comparison:
      'border security spending went from $800 million in 2018–19 to $6.6 billion in 2024–25; proposed appropriations would take the running total to roughly $18 billion',
    rank: null,
    standing: 'neutral',
    sourceName: 'Dallas Morning News; Texas Tribune',
    sourceUrl: 'https://www.texastribune.org/2025/04/21/texas-border-security-spending-operation-lone-star/',
    year: '2021–2026',
    caveat:
      'Deliberately marked neutral. It has funded roughly 45 miles of state-built barrier, over ' +
      '100 miles of razor wire and busing more than 119,000 people to other cities. Whether that ' +
      'is money well spent is the argument, not a fact this page can settle. Abbott has asked ' +
      'the federal government to reimburse it.',
  },
  {
    category: 'Elections & Voting',
    label: 'Voter turnout',
    value: '56.6% of eligible voters in 2024',
    comparison: 'behind every state except Hawaii, Oklahoma, Arkansas and West Virginia',
    rank: '5th lowest of 50 states',
    standing: 'bottom',
    sourceName: 'Ballotpedia turnout analysis; U.S. Census Bureau',
    sourceUrl: 'https://ballotpedia.org/Election_results,_2024:_Analysis_of_voter_turnout_in_the_2024_general_election',
    year: '2024',
    caveat:
      'Rank depends on the denominator: measured against voting-age citizens rather than eligible ' +
      'voters, Census estimates put Texas 2nd lowest at 57.9%. Turnout also tracks how competitive ' +
      'a state is thought to be, not registration law alone.',
  },
  {
    category: 'Criminal Justice',
    label: 'Incarceration rate',
    value: '751 per 100,000 people',
    comparison:
      'counting prisons, jails, immigration detention and juvenile facilities; Mississippi is highest, Massachusetts lowest at 96 per 100,000 in prison',
    rank: '6th highest of 50 states',
    standing: 'bottom',
    sourceName: 'Prison Policy Initiative; USAFacts',
    sourceUrl: 'https://www.prisonpolicy.org/profiles/TX.html',
    year: '2023–25',
    caveat:
      'Down 18% over the past decade, so the trend runs the other way from the level. Rates vary ' +
      'a lot by which facility types a source counts.',
  },
  {
    category: 'Business & Labor',
    label: 'Job growth',
    value: '132,500 jobs added in 2025 — more than any other state',
    comparison:
      'real GDP grew 4.8% in 2024, above the national rate; at $2.9 trillion Texas would be the world’s 8th largest economy on its own',
    rank: '1st of 50 states for jobs added',
    standing: 'top',
    // Kept for the same reason the middling firearm figure is kept. A panel of
    // uniformly bad numbers is an argument; a panel that reports where the state
    // leads is evidence.
    sourceName: 'Dallas Fed; Bureau of Labor Statistics via Visual Capitalist',
    sourceUrl: 'https://www.visualcapitalist.com/map-job-growth-in-every-u-s-state-2025/',
    year: '2024–25',
    caveat:
      'First place is in absolute jobs, which partly reflects being the second most populous state. ' +
      'By growth RATE Missouri led 2025 at +1.7%. Job counts also say nothing about pay: Texas has ' +
      'no state minimum wage above the federal $7.25.',
  },
  {
    category: 'Taxes & Spending',
    label: 'Property tax burden',
    value: '1.245% effective rate — a median bill of $4,108',
    comparison:
      'against a national average rate of 0.888% and a national median bill of $3,211 — and Texas homes are worth less on average ($313,200 vs $360,600)',
    rank: '9th highest of 50 states',
    standing: 'bottom',
    sourceName: 'ATTOM property tax analysis, via Fox 4',
    sourceUrl: 'https://www.fox4news.com/news/texas-ranks-9th-highest-us-property-tax-rates-according-new-study',
    year: '2025',
    caveat:
      'This is the direct trade-off for having no state income tax: schools, cities and counties are ' +
      'funded from local property levies instead. Whether that is the better deal depends on your ' +
      'income and whether you own. Rates also vary widely by county.',
  },
  {
    category: 'Housing',
    label: 'Renters spending too much on rent',
    value: '47.7% of renters are cost-burdened',
    comparison:
      'of 4.1 million renter households; 23.6% are severely burdened, paying over half their income in rent. Median rent rose 9.1% after inflation while median household income rose 3.1%, to $78,476.',
    rank: null,
    standing: 'bottom',
    sourceName: 'U.S. Census / American Community Survey, via Texas Tribune',
    sourceUrl: 'https://www.texastribune.org/2026/01/29/texas-census-housing-incomes/',
    year: '2024–25',
    caveat:
      'The burden is concentrated: about 90% of renters earning under $30,000 are cost-burdened, ' +
      'against a far lower share of higher earners, so a statewide average understates how hard it ' +
      'lands at the bottom. Rents are also set by local markets and land supply, not by state law alone.',
  },
  {
    category: 'Housing',
    label: 'How much housing is being built',
    value: '74,350 new residential permits in 2025 — more than any state',
    comparison:
      'Houston ranked 1st and Dallas 2nd among all U.S. cities for new permits, with San Antonio 8th and Austin 9th',
    rank: '1st of 50 states',
    standing: 'top',
    // Both halves of housing are in, and they point opposite ways. Texas builds
    // more homes than anywhere and affordability still deteriorated faster than
    // the national average. Publishing only the cost-burden figure would have
    // been a true number telling half a story.
    sourceName: 'Census building permits, via Wealth Enhancement / Consumer Affairs',
    sourceUrl: 'https://www.wealthenhancement.com/blog/what-states-are-building-most-new-houses-2025',
    year: '2025',
    caveat:
      'Permit volume fell about 9% from the previous year. First place is an absolute count, which ' +
      'partly reflects size and population growth. Note the tension with the figure above: leading ' +
      'the country in construction has not stopped affordability worsening faster here than nationally.',
  },
  {
    category: 'Technology & Privacy',
    label: 'Texans without a broadband connection',
    value: 'more than 9 million people',
    comparison:
      'either because the infrastructure does not reach them or because they are not subscribed; four of the five least-connected cities in the country are in Texas',
    rank: null,
    standing: 'bottom',
    sourceName: 'Texas Consumer Association; National Digital Inclusion Alliance',
    sourceUrl: 'https://www.texasconsumer.org/news-press/millions-of-texans-still-dont-have-broadband-access-some-lawmakers-are-trying-to-change-that',
    year: '2025 (city ranking 2019)',
    caveat:
      'The 9 million figure combines two different problems — no service available, and service ' +
      'available but unaffordable — which need different fixes. The least-connected-cities ranking ' +
      'is from a 2019 analysis and may have moved since.',
  },
  {
    category: 'Technology & Privacy',
    label: 'Data privacy enforcement',
    value: '$1.375 billion recovered from Google',
    comparison:
      'the largest state privacy recovery against Google by any attorney general, plus $1.4 billion from Meta over facial-recognition data in 2024',
    rank: 'largest in the nation',
    standing: 'top',
    // Kept for the same reason the job-growth and homebuilding figures are kept,
    // and it matters more here: this is the record of KEN PAXTON, who is running
    // against one of the three candidates and who has no scoreable legislative
    // evidence at all (see evidence.ts). Omitting the one concrete, favourable
    // thing on his record while listing Abbott's vetoes would be a thumb on the
    // scale.
    sourceName: 'Office of the Texas Attorney General',
    sourceUrl: 'https://www.texasattorneygeneral.gov/news/releases/attorney-general-ken-paxton-secures-historic-1375-billion-settlement-google-related-texans-data',
    year: '2024–25',
    caveat:
      'Secured by Attorney General Ken Paxton, who is a candidate in one of the three races here. ' +
      'Settlement size is not the same as consumer benefit — how much reaches Texans, versus the ' +
      'state treasury and outside counsel, is a separate question this figure does not answer.',
  },
  // Courts has no clean "Texas is Nth of 50" measure — which is why it was the
  // last category attempted. Both entries below are therefore `neutral`: the
  // figures are solid, but which way they point is genuinely arguable, and
  // forcing a verdict would be inventing one.
  {
    category: 'Courts & Civil Law',
    label: 'Who pays for a lawyer when you cannot afford one',
    value: 'the state covers about 13% of the cost',
    comparison:
      'counties pay the rest. In 2013 counties spent $189.7 million against the state’s $27.4 million — 14 cents from the state for every county dollar.',
    rank: null,
    standing: 'neutral',
    sourceName: 'Texas Indigent Defense Commission; Legislative Budget Board',
    sourceUrl: 'https://www.tidc.texas.gov/media/kajgysgo/tidc_annual_report_fy20.pdf',
    year: 'FY2020 (comparison 2013)',
    caveat:
      'Marked neutral because it describes who bears a cost, not a ranking — whether the state or ' +
      'the county should fund the right to counsel is the argument. Note the dating: the 13% share ' +
      'is FY2020 and the dollar comparison is 2013, so both may have moved. The 13% is state grants ' +
      'offsetting county spending, not a share of total system cost.',
  },
  {
    category: 'Courts & Civil Law',
    label: 'Exonerations',
    value: 'more than 470 since 1989 — most of any state',
    comparison:
      '26 in 2024 alone, ahead of Illinois on 20. Texas has also exonerated 18 people from death row, second only to Florida.',
    rank: '1st of 50 states',
    standing: 'neutral',
    // The clearest case in this file for why 'neutral' had to exist. A high
    // exoneration count reads two opposite ways and the data cannot settle which:
    // many wrongful convictions happened, OR the state has unusually effective
    // machinery for finding and undoing them. Dallas County's conviction
    // integrity unit is nationally known for exactly the second reading.
    sourceName: 'National Registry of Exonerations',
    sourceUrl: 'https://exonerationregistry.org/exonerations-county',
    year: '1989–2025',
    caveat:
      'Reads two opposite ways and the number cannot tell you which: it may mean more wrongful ' +
      'convictions, or better machinery for catching them. Both are partly true here. 17 of the 26 ' +
      'exonerations in 2024 trace to misconduct by a single Houston narcotics officer. Texas has ' +
      'also executed more people than any state since 1976.',
  },
  {
    category: 'Guns',
    label: 'Firearm death rate',
    value: '13.9 deaths per 100,000 people',
    comparison: 'against 28.0 in Mississippi (highest) and 3.7 in Hawaii (lowest)',
    rank: '26th of 50 states',
    standing: 'middle',
    // Kept deliberately: Texas is unremarkable here. An outcome panel where every
    // figure indicts is advocacy; one that reports the middling result too is
    // evidence. Texas does record the highest raw number of firearm deaths of any
    // state, which is a function of being the second-largest state by population.
    sourceName: 'Violence Policy Center, from CDC data',
    sourceUrl: 'https://vpc.org/state-firearm-death-rates-ranked-by-rate-2024/',
    year: '2024',
    caveat:
      'Texas has the highest raw count of firearm deaths of any state, which mostly reflects being ' +
      'the second most populous. Per capita it sits in the middle of the states.',
  },
];

/**
 * Who has actually held the offices. Stated as tenure, not as blame: the reader
 * can join tenure to outcome themselves, and the join is more persuasive when the
 * page has not tried to make it for them.
 */
export interface Incumbent {
  name: string;
  office: string;
  since: string;
  sessions: string;
  /** Verifiable acts, not characterisations. */
  acts: string[];
}

export const INCUMBENTS: Incumbent[] = [
  {
    name: 'Greg Abbott',
    office: 'Governor',
    since: 'January 2015',
    sessions: 'the 84th through 89th Legislatures',
    acts: [
      'Signed or vetoed every bill that reached his desk in that time.',
      'Vetoed 279 bills across those six regular sessions, 28 of them in the 89th.',
      'Vetoed SB 3, the THC ban, which was the Lieutenant Governor’s third-ranked priority bill.',
      'In 2026 directed the PUC and ERCOT to act on how data-centre costs are allocated, and froze new data-centre projects pending a state audit.',
    ],
  },
  {
    name: 'Ken Paxton',
    office: 'Attorney General',
    since: 'January 2015',
    sessions: 'the 84th through 89th Legislatures',
    acts: [
      'Set up a privacy enforcement team in 2024 and recovered $1.375 billion from Google and $1.4 billion from Meta over Texans’ data.',
      'Has no roll-call record overlapping the three House candidates: his last legislative vote was in 2015, before any of them took office.',
      'Was impeached by the Texas House in 2023 and acquitted by the Senate.',
    ],
  },
  {
    name: 'Dan Patrick',
    office: 'Lieutenant Governor',
    since: 'January 2015',
    sessions: 'the 84th through 89th Legislatures',
    acts: [
      'Presides over the Senate, assigns bills to committees and controls the calendar.',
      'Published a numbered priority-bill list each session — 25 bills in the 89th.',
      'Does not cast a vote except to break a tie, so he has no roll-call record to score.',
    ],
  },
];

/** Rendered wherever outcomes appear. Not optional. */
export const CAUSAL_NOTE =
  'These numbers are where Texas stands, from the sources named. They are not proof that any ' +
  'one vote, bill or official caused them — rankings move on population growth, local property ' +
  'values, federal rules and the economy as well as state law. What is on the record is the ' +
  'outcome, the vote, and who held office. Draw your own line between them.';

/**
 * All indicators for a category. Energy & Environment carries two — what bills
 * have already done, and what the forecast load is — because collapsing them
 * into one line would imply the first was caused by the second.
 */
/**
 * Deliberately NOT added, so the omission is a decision on the record rather than
 * an oversight:
 *
 *   Transportation — sources disagree irreconcilably on 2024 Texas road deaths
 *     (1,997 in one report against 4,150 in another for the same year, with a
 *     national rank that fits neither). Almost certainly different measures
 *     (crash-involved vs all fatalities, or state vs all roads). Publishing
 *     either number without opening TxDOT's own crash-facts release would break
 *     this file's one hard rule.
 *   Religion & Civil Liberties — no outcome measure exists that is not itself a
 *     value judgement. Left empty rather than invented.
 */
export const DELIBERATE_OMISSIONS: { category: string; why: string }[] = [
  {
    category: 'Transportation',
    why: 'Published 2024 road-death figures for Texas conflict (1,997 vs 4,150) and could not be reconciled to a primary source.',
  },
  {
    category: 'Religion & Civil Liberties',
    why: 'No outcome measure exists here that is not itself a value judgement.',
  },
];

export function outcomesFor(category: string): Outcome[] {
  return OUTCOMES.filter((o) => o.category === category);
}

/** Categories in the quiz that have no sourced indicator yet — reported, not hidden. */
export function categoriesWithoutOutcome(categories: string[]): string[] {
  return [...new Set(categories)].filter((c) => outcomesFor(c).length === 0).sort();
}
