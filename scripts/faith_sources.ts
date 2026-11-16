/**
 * PlainRecord: where each faith source's downloaded text lives
 *
 * Shared by check_faith_quotes.ts (are the excerpts really there?) and
 * extract_faith_verses.ts (which verses does each statement cite?). The files
 * are in data/faith_sources/, gitignored: they are the churches' and parties'
 * documents to distribute, not ours.
 */

import { join } from 'node:path';
import { WORK_DIR } from './paths';

export const FAITH_SOURCE_DIR = join(WORK_DIR, 'faith_sources');

/**
 * Source URL to the downloaded text, whether it carries line numbers (the
 * USCCB's 2023 PDF prints them mid-sentence), and for a page that covers
 * several issues, the saved HTML whose headings mark its sections.
 */
export const FAITH_SOURCE_FILES: Record<string, { file: string; lineNumbers?: boolean; html?: string; paragraphs?: boolean }> = {
  'https://www.usccb.org/resources/2023-Nov-15%20FCFC%20action%20item%20text%20final.pdf': { file: 'usccb_fcfc_2023_action.txt', lineNumbers: true },
  'https://www.usccb.org/resources/forming-consciences-for-faithful-citizenship-2019.pdf': { file: 'usccb_fcfc_2019.txt' },
  // The page links the PDF (USCCB%20Special%20Message%20on%20Immigration.pdf),
  // read with `pdftotext -enc UTF-8` (no -layout: its pull quote splits the text).
  'https://www.usccb.org/resources/special-pastoral-message-immigration-november-12-2025': { file: 'usccb_special_message_2025.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-immigration-human-dignity-and-the-rule-of-law/': { file: 'sbc_2026_immigration.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-wisely-engaging-immigration/': { file: 'sbc_wisely_engaging.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-immigration/': { file: 'sbc_on_immigration_2018.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-immigration-and-the-gospel/': { file: 'sbc_immigration_gospel_2011.txt' },
  'https://www.umc.org/content/what-the-umc-believes-about-immigrants-and-migrants': { file: 'umc_immigrants.txt' },
  'https://www.ame-church.com/news/cob-statement-re-condemning-immigrant-family-separation/': { file: 'ame_family_separation_2018.txt' },
  'https://ethnicrelations.ag.org/About': { file: 'ag_ethnic_relations.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-standing-against-the-moral-evils-and-medical-dangers-of-chemical-abortion-pills/': { file: 'sbc_abortion_2025.txt' },
  'https://www.umc.org/en/content/ask-the-umc-valuing-life-abortion-adoption': { file: 'umc_valuing_life_2.txt' },
  'https://ag.org/Beliefs/Position-Papers/Sanctity-of-Human-Life-Abortion': { file: 'ag_sanctity_abortion.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-capital-punishment/': { file: 'sbc_death_penalty_2000.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-gun-violence-and-mass-shootings/': { file: 'sbc_guns_2018.txt' },
  'https://www.umc.org/en/content/social-principles-the-political-community': { file: 'umc_sp_the-political-community.txt', html: 'umc_sp_the-political-community.html' },
  'https://www.umc.org/en/content/book-of-resolutions-our-call-to-end-gun-violence': { file: 'umc_bor_3428.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-global-hunger-relief/': { file: 'sbc_poverty_2014.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-environmentalism-and-evangelicals/': { file: 'sbc_environment_2006.txt' },
  'https://www.umc.org/en/content/social-principles-the-economic-community': { file: 'umc_sp_the-economic-community.txt', html: 'umc_sp_the-economic-community.html' },
  'https://www.umc.org/en/content/social-principles-the-natural-world': { file: 'umc_sp_the-natural-world.txt', html: 'umc_sp_the-natural-world.html' },
  'https://www.sbc.net/resource-library/resolutions/on-the-danger-of-age-discrimination-in-healthcare-rationing/': { file: 'sbc_health_2013.txt' },
  'https://www.sbc.net/resource-library/resolutions/on-americas-growing-prison-population/': { file: 'sbc_prison_2013.txt' },
  // Judaism (15 Nov 2026). npm run data:jewish saves the resolutions; the
  // other two by hand: the OU booklet with `pdftotext -enc UTF-8`, and the
  // Rabbinical Assembly's 1995 death-penalty resolution from the Death Penalty
  // Information Center's page (the resolution's own lines only).
  ...Object.fromEntries([
    ['ccar', 'central-conference-of-american-rabbis-resolution-on-immigration-due-process'],
    ['ccar', 'ccar-womens-rabbinic-network-resolution-affirming-our-commitment-to-broad-accessible-reproductive-sexual-health-care'],
    ['ccar', 'ccar-resolution-hunger-america'],
    ['ccar', 'capital-punishment-1979'],
    ['ccar', 'ccar-resolution-gun-violence'],
    ['ccar', 'central-conference-of-american-rabbis-resolution-on-the-climate-crisis'],
    ['ccar', 'resolution-health-care'],
    ['ccar', 'central-conference-of-american-rabbis-resolution-on-private-prisons'],
  ].map(([body, slug]) => [`https://www.ccarnet.org/ccar-resolutions/${slug}/`, { file: `jewish/${body}/${slug}.txt` }])),
  ...Object.fromEntries([
    'resolution-immigration-united-states', 'resolution-supporting-freedom-access-reproductive-health-care',
    'resolution-hunger-crisis-america', 'resolution-american-gun-violence',
    'resolution-paris-united-nations-framework-convention-climate-change-unfccc',
    'resolution-opposing-laws-limiting-essential-health-care', 'resolution-racial-injustice-and-police-brutality',
  ].map((slug) => [`https://rabbinicalassembly.org/resolutions/${slug}`, { file: `jewish/ra/${slug}.txt` }])),
  ...Object.fromEntries(['abortion-1990', 'poverty-1998', 'health-care-reform-1999']
    .map((slug) => [`https://archive.rabbis.org/${slug}/`, { file: `jewish/rca/${slug}.txt` }])),
  'https://deathpenaltyinfo.org/stories/rabbinical-assembly': { file: 'jewish/other/dpic_rabbinical_assembly.txt' },
  'https://www.ou.org/assets/OU_2023_National_Convention_Resolutions_Final_dq4fkw.pdf': { file: 'jewish/ou/ou_2023.txt', paragraphs: true },
  'https://texasgop.org/wp-content/uploads/2024/06/2024-RPT-Platform.pdf': { file: 'rpt_2024.txt' },
  'https://txdem.co/24-Platform': { file: 'tdp_2024.txt' },
  'https://www.presidency.ucsb.edu/documents/2024-republican-party-platform': { file: 'rnc_2024.txt' },
  'https://www.presidency.ucsb.edu/documents/2024-democratic-party-platform': { file: 'dnc_2024.txt' },
};

const ENTITIES: Record<string, string> = { amp: '&', nbsp: ' ', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", hellip: '...', mdash: '-', ndash: '-' };
export const decodeEntities = (s: string) => s
  .replace(/&(\w+);/g, (m, e) => ENTITIES[e] ?? m)
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** For matching: no entities, dashes, quote marks or whitespace, lower case. */
export const normForMatch = (s: string) => decodeEntities(s)
  .replace(/[‐-―−-]/g, '')
  .replace(/[‘’“”'"]/g, '')
  .replace(/\s+/g, '')
  .toLowerCase();
