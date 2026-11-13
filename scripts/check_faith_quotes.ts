/**
 * PlainRecord: are the faith module's excerpts really in their sources?
 *
 *   npm run data:faith:quotes
 *
 * Every statement and plank in faith_positions.ts carries a verbatim excerpt.
 * This checks each against the source text downloaded into data/faith_sources/
 * (gitignored: these are the churches' and parties' documents to distribute,
 * so this is run by hand, like data:econ:quotes, not by npm test).
 *
 * Matching ignores whitespace, dashes, quote marks and apostrophes, decodes
 * HTML entities, and for the one PDF that prints line numbers mid-sentence
 * (the USCCB's 2023 Introductory Note) drops those numbers. Every letter must
 * still match in order.
 *
 * A control excerpt with one word changed must NOT be found, or nothing is
 * reported.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { STATEMENTS, PLANKS } from '../faith_positions';
import { WORK_DIR } from './paths';

const DIR = join(WORK_DIR, 'faith_sources');

/** Source URL to the downloaded text, and whether it carries line numbers. */
const FILES: Record<string, { file: string; lineNumbers?: boolean }> = {
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
  'https://www.umc.org/en/content/social-principles-the-political-community': { file: 'umc_sp_the-political-community.txt' },
  'https://www.umc.org/en/content/book-of-resolutions-our-call-to-end-gun-violence': { file: 'umc_bor_3428.txt' },
  'https://texasgop.org/wp-content/uploads/2024/06/2024-RPT-Platform.pdf': { file: 'rpt_2024.txt' },
  'https://txdem.co/24-Platform': { file: 'tdp_2024.txt' },
  'https://www.presidency.ucsb.edu/documents/2024-republican-party-platform': { file: 'rnc_2024.txt' },
  'https://www.presidency.ucsb.edu/documents/2024-democratic-party-platform': { file: 'dnc_2024.txt' },
};

const ENTITIES: Record<string, string> = { amp: '&', nbsp: ' ', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", hellip: '...', mdash: '-', ndash: '-' };
const norm = (s: string) => s
  .replace(/&(\w+);/g, (m, e) => ENTITIES[e] ?? m)
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/[‐-―−-]/g, '')
  .replace(/[‘’“”'"]/g, '')
  .replace(/\s+/g, '')
  .toLowerCase();

const texts = new Map<string, string>();
const load = (url: string) => {
  if (texts.has(url)) return texts.get(url)!;
  const src = FILES[url];
  if (!src) return undefined;
  const path = join(DIR, src.file);
  if (!existsSync(path)) { console.error(`\n  missing ${path}; download the source first (see FAITH.md)\n`); process.exit(1); }
  let raw = readFileSync(path, 'utf8');
  if (src.lineNumbers) raw = raw.replace(/(?<=\s)\d{1,3}(?=\s)/g, ' ');
  const t = norm(raw);
  texts.set(url, t);
  return t;
};

// The control: a real excerpt with one word changed must not be found.
const control = load('https://www.sbc.net/resource-library/resolutions/on-immigration-human-dignity-and-the-rule-of-law/')!;
if (control.includes(norm('we support amnesty, understood as forgiveness of legal violations without accountability'))) {
  console.error('\n  the control excerpt matched; the check cannot fail, so nothing is reported\n');
  process.exit(1);
}
console.log('\n  [PASS] control: an altered excerpt is not found');

let fails = 0;
const entries = [
  ...STATEMENTS.map((s) => ({ label: `${s.traditionId} ${s.issueId} ${s.sourceDate}`, url: s.sourceUrl, excerpt: s.excerpt })),
  ...PLANKS.map((p) => ({ label: `${p.party}-${p.level} ${p.issueId} ${p.platformYear}`, url: p.sourceUrl, excerpt: p.excerpt })),
];
for (const e of entries) {
  const t = load(e.url);
  const ok = t !== undefined && t.includes(norm(e.excerpt));
  if (!ok) fails++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${e.label}: ${t === undefined ? 'no downloaded source mapped' : ok ? 'found' : 'NOT found'}`);
}
console.log(fails ? `\n  ${fails} excerpt(s) not found\n` : `\n  all ${entries.length} excerpts found in their sources\n`);
process.exitCode = fails ? 1 : 0;
