/**
 * PlainRecord: what each tradition's members say, beside what the tradition says
 *
 * Decided by Marco, 16 Nov 2026: show members against their church, per issue,
 * from Pew; no grade, no "agrees with its church" score.
 *
 * Every figure is Pew Research Center's own, as published on its 2023-24
 * Religious Landscape Study pages (read 16 Nov 2026). The denominations come
 * only from Pew: its public use file blanks the denomination and the Jewish
 * movement. For Catholics, Jews and evangelicals, faith.smoke.ts recomputes
 * each figure from that file (data/faith/pew_rls.json, from
 * scripts/compute_pew_rls.ts) and fails if they differ by more than rounding,
 * so a misread chart is caught.
 *
 * Pew Research Center bears no responsibility for the analyses or
 * interpretations of the data presented here.
 */

import type { TraditionId } from './faith_positions';

export type PewQuestion = 'abortion' | 'environment' | 'poverty' | 'immigration';
export type PewGroup = 'catholic' | 'jewish' | 'evangelical' | 'sbc' | 'umc' | 'ag';

/**
 * Pew's answer columns for each question, in Pew's order, and the public-file
 * codes each column adds up (for the recomputation check).
 */
export const PEW_COLUMNS: Record<PewQuestion, { key: string; codes: number[] }[]> = {
  abortion: [{ key: 'legal', codes: [1, 2] }, { key: 'illegal', codes: [3, 4] }, { key: 'noAnswer', codes: [99] }],
  environment: [{ key: 'costJobs', codes: [1] }, { key: 'worthCost', codes: [2] }, { key: 'noAnswer', codes: [99] }],
  poverty: [{ key: 'more', codes: [1] }, { key: 'less', codes: [2] }, { key: 'right', codes: [3] }, { key: 'noAnswer', codes: [99] }],
  immigration: [{ key: 'better', codes: [1] }, { key: 'worse', codes: [2] }, { key: 'noDifference', codes: [3] }, { key: 'noAnswer', codes: [99] }],
};

/** "<1" is Pew's own entry for a share under one percent. */
export type Pct = number | '<1';

export interface PewFigures {
  /** Pew's name for the group. */
  name: string;
  url: string;
  /** Unweighted sample size and margin of error, as Pew gives them. */
  sample: number;
  moe: number;
  answers: Record<PewQuestion, Pct[]>;
}

const RLS = 'https://www.pewresearch.org/religious-landscape-study';

export const PEW_PUBLISHED: Record<PewGroup, PewFigures> = {
  catholic: {
    name: 'Catholics', url: `${RLS}/religious-tradition/catholic/`, sample: 6958, moe: 1.7,
    answers: { abortion: [59, 39, 2], environment: [39, 59, 2], poverty: [37, 30, 31, 1], immigration: [33, 41, 25, 2] },
  },
  jewish: {
    name: 'Jews', url: `${RLS}/religious-tradition/jewish/`, sample: 850, moe: 5.0,
    answers: { abortion: [83, 17, '<1'], environment: [26, 72, 1], poverty: [49, 19, 30, 1], immigration: [50, 29, 20, 1] },
  },
  // Not shown on the site (Southern Baptists and Assemblies of God are only
  // part of it); here so the check can compare a third group with the file.
  evangelical: {
    name: 'Evangelical Protestants', url: `${RLS}/religious-tradition/evangelical-protestant/`, sample: 8298, moe: 1.5,
    answers: { abortion: [33, 65, 1], environment: [53, 44, 3], poverty: [31, 42, 26, 2], immigration: [20, 55, 24, 1] },
  },
  sbc: {
    name: 'Southern Baptist Convention', url: `${RLS}/religious-denomination/southern-baptist-convention/`, sample: 1564, moe: 3.4,
    answers: { abortion: [34, 65, 1], environment: [58, 40, 2], poverty: [31, 44, 23, 2], immigration: [14, 60, 25, 1] },
  },
  umc: {
    name: 'United Methodist Church', url: `${RLS}/religious-denomination/united-methodist-church/`, sample: 1318, moe: 3.9,
    answers: { abortion: [68, 31, 2], environment: [39, 58, 3], poverty: [30, 34, 32, 4], immigration: [24, 50, 25, 1] },
  },
  ag: {
    name: 'Assemblies of God', url: `${RLS}/religious-denomination/assemblies-of-god/`, sample: 347, moe: 6.9,
    answers: { abortion: [22, 77, 1], environment: [51, 47, 2], poverty: [34, 37, 28, 1], immigration: [17, 54, 27, 2] },
  },
};

/** Which Pew figures stand for each tradition's members, or why there are none. */
export const MEMBERS_OF: Record<TraditionId, { group: PewGroup; note?: 'allJews' } | { none: 'noPewFigures' }> = {
  catholic: { group: 'catholic' },
  sbc: { group: 'sbc' },
  umc: { group: 'umc' },
  // Pew names the AME Church but publishes no figures for it.
  ame: { none: 'noPewFigures' },
  ag: { group: 'ag' },
  // Pew reports Jews as a whole; the movement is blanked in the public file.
  reform: { group: 'jewish', note: 'allJews' },
  conservative: { group: 'jewish', note: 'allJews' },
  orthodox: { group: 'jewish', note: 'allJews' },
};

export const PEW_SOURCE = {
  name: 'Pew Research Center, 2023-24 Religious Landscape Study',
  fielded: 'July 17, 2023 to March 4, 2024',
  respondents: 36908,
  url: `${RLS}/`,
  disclaimer: 'Pew Research Center bears no responsibility for the analyses or interpretations of the data presented here.',
};
