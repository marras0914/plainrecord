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
export const FAITH_SOURCE_FILES: Record<string, { file: string; lineNumbers?: boolean; html?: string }> = {
  'https://www.usccb.org/resources/2023-Nov-15%20FCFC%20action%20item%20text%20final.pdf': { file: 'usccb_fcfc_2023_action.txt', lineNumbers: true },
  'https://www.usccb.org/resources/forming-consciences-for-faithful-citizenship-2019.pdf': { file: 'usccb_fcfc_2019.txt' },
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
