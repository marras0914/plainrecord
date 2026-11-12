/**
 * PlainRecord: outside shocks, for the economy module's cards
 *
 * THE RULE THAT DECIDES WHICH NOTES EXIST. Which shocks get a note is a knob
 * that can tilt a blind card, the same kind of knob as picking which terms to
 * show. So nobody here picks them. A note exists for:
 *
 *   1. every outside shock Blinder and Watson name in "Presidents and the U.S.
 *      Economy: An Econometric Exploration" (NBER w20324; AER 2016): the oil
 *      shocks, the financial crisis, and the wars they count as defense-
 *      spending "luck" factors; and
 *   2. every NBER-dated recession that begins after their sample ends (2012),
 *      described in the NBER committee's own words. As of NBER's last update
 *      (14 March 2023) there is one: February to April 2020.
 *
 * Nothing else goes in, however reasonable. Adding a shock means changing the
 * rule above, in a diff someone can argue with.
 *
 * TWO WORDINGS PER NOTE. `blind` is shown on an unlabeled card: a kind of
 * event, with no year, name, place or party, because those give the term
 * away. It cannot make the card anonymous (see ECONOMY.md: a reader who knows
 * the history will recognise some terms, and the page says so). `full` is for
 * the reveal and the labeled explorer, and attributes the claim to its source.
 *
 * Every note carries a verbatim quote. `npm run data:econ:quotes` checks each
 * one against the downloaded source text, which is not committed (the paper
 * is NBER's to distribute).
 *
 * Say what happened, never who was at fault.
 *
 * Last reviewed: 2026-11-12.
 */

export type ShockKind = 'oil' | 'financial' | 'war' | 'pandemic';

export interface ContextNote {
  id: string;
  kind: ShockKind;
  /** Calendar years the source gives, inclusive. Which terms a note attaches
   *  to is computed from these, so a note can span two terms. */
  fromYear: number;
  toYear: number;
  blind: string;
  full: string;
  source: { label: string; url: string; quote: string };
}

const BW = {
  label: 'Blinder and Watson, "Presidents and the U.S. Economy: An Econometric Exploration," NBER Working Paper 20324 (2014), published in the American Economic Review 106(4), 2016',
  url: 'https://www.nber.org/papers/w20324',
};
const NBER_2020 = {
  label: 'NBER Business Cycle Dating Committee, announcement of 8 June 2020',
  url: 'https://www.nber.org/news/business-cycle-dating-committee-announcement-june-8-2020',
};

/** One wording per kind, so no card's blind text is more pointed than another's. */
export const BLIND: Record<ShockKind, string> = {
  oil: 'Oil prices rose sharply.',
  financial: 'A financial crisis struck.',
  war: 'Defense spending rose with a war.',
  pandemic: 'A pandemic hit, and the economy contracted sharply.',
};

export const CONTEXT: ContextNote[] = [
  // --- oil ---------------------------------------------------------------
  {
    id: 'opec-1', kind: 'oil', fromYear: 1973, toYear: 1974, blind: BLIND.oil,
    full: 'The 1973 to 1974 oil shock (OPEC I). Blinder and Watson name it as one major reason growth was slower in this term.',
    source: { ...BW, quote: 'On balance, growth under Nixon-Ford was markedly slower than under Kennedy-Johnson, and the oil shock of 1973-1974 was one major reason.' },
  },
  {
    id: 'opec-2', kind: 'oil', fromYear: 1979, toYear: 1980, blind: BLIND.oil,
    full: 'The 1979 to 1980 oil shock (OPEC II), which Blinder and Watson say helped bring on the high inflation of this term.',
    source: { ...BW, quote: 'Carter’s main problem was high inflation—brought on, in part, by OPEC II in 1979-1980.' },
  },
  {
    id: 'oil-1990', kind: 'oil', fromYear: 1990, toYear: 1991, blind: BLIND.oil,
    full: 'The 1990 to 1991 recession, which Blinder and Watson note is often attributed to tight money and a spike in oil prices.',
    source: { ...BW, quote: 'Thanks to the 1990-1991 recession—which is often attributed to tight money and a spike in oil prices—growth was substantially slower during George H.' },
  },
  {
    id: 'oil-2005', kind: 'oil', fromYear: 2005, toYear: 2008, blind: BLIND.oil,
    full: 'Oil prices roughly tripled over this term, which Blinder and Watson say played an important role in the onset of the Great Recession.',
    source: { ...BW, quote: 'Oil prices increased three-fold during Bush II-2 and undoubtedly played an important role in the onset of the Great Recession' },
  },
  // --- financial ---------------------------------------------------------
  {
    id: 'crisis-2008', kind: 'financial', fromYear: 2008, toYear: 2009, blind: BLIND.financial,
    full: 'The financial crisis of late 2008. NBER dates the recession around it from December 2007 to June 2009.',
    source: { ...BW, quote: 'Then the financial crisis struck in late 2008 (although the NBER dates the Great Recession as starting in December 2007).' },
  },
  // --- wars, which the paper counts among the "luck" factors -------------
  {
    id: 'war-korea', kind: 'war', fromYear: 1950, toYear: 1953, blind: BLIND.war,
    full: 'The Korean War. Blinder and Watson count defense spending due to wars among the factors outside a president\'s control, and test their result with these terms left out.',
    source: { ...BW, quote: 'Truman (1949-53) and Eisenhower 1 (1953-1957) for the Korean War' },
  },
  {
    // Ends 1972 so the note lands on exactly the two terms the paper names,
    // not also on the term that began in January 1973.
    id: 'war-vietnam', kind: 'war', fromYear: 1965, toYear: 1972, blind: BLIND.war,
    full: 'The Vietnam War. Blinder and Watson count defense spending due to wars among the factors outside a president\'s control, and test their result with these terms left out.',
    source: { ...BW, quote: 'Johnson (1965-1969) and Nixon (1969-1973) for the Vietnam War' },
  },
  {
    id: 'war-gulf', kind: 'war', fromYear: 1990, toYear: 1991, blind: BLIND.war,
    full: 'The Gulf War. Blinder and Watson count defense spending due to wars among the factors outside a president\'s control, and test their result with this term left out.',
    // Quoted as printed; the paper's "1987" for this term is its own, and the
    // note attaches by fromYear/toYear, not by that range.
    source: { ...BW, quote: 'Bush I (1987-1991) for the Gulf War' },
  },
  {
    id: 'war-iraq-afghanistan', kind: 'war', fromYear: 2001, toYear: 2012, blind: BLIND.war,
    full: 'The wars in Iraq and Afghanistan. Blinder and Watson count defense spending due to wars among the factors outside a president\'s control, and test their result with these terms left out.',
    source: { ...BW, quote: 'and the Bush and Obama administrations for the Iraq and Afghanistan Wars' },
  },
  // --- after the paper's sample: NBER recessions only --------------------
  {
    id: 'pandemic-2020', kind: 'pandemic', fromYear: 2020, toYear: 2020, blind: BLIND.pandemic,
    full: 'The pandemic of early 2020. NBER dates a recession from February to April 2020, and notes the economy contracted so sharply in March that the first quarter fell well below the last of 2019.',
    source: { ...NBER_2020, quote: 'The economy contracted so sharply in March (the final month of the quarter) that in 2020Q1, GDP, GDI, and employment were significantly below their levels of 2019Q4.' },
  },
];

/**
 * The notes that fall in a term, by calendar year. A term that runs from
 * 20 January of `startYear` to 20 January of `endYear` is treated as the years
 * startYear to endYear - 1, so the outgoing president's last three weeks do
 * not pull in a shock from the year the next president took office: OPEC II
 * (1979 to 1980) attaches to the term that began in 1977, not the one that
 * began in 1981.
 *
 * The Iraq and Afghanistan note ends in 2012 because the paper's sample does.
 * Extending it would be the site's claim, not the paper's.
 */
export function notesForTerm(startYear: number, endYear: number | null): ContextNote[] {
  const last = endYear === null ? Infinity : endYear - 1;
  return CONTEXT.filter((n) => n.fromYear <= last && n.toYear >= startYear);
}
