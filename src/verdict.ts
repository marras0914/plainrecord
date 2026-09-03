/**
 * PlainRecord — turning a verdict into words
 *
 * The estimator decides WHICH reading a profile gets; this decides how to say
 * it. That split is the whole point: `valence.ts` and `scoring.ts` stay free of
 * copy and of locales, and every sentence a reader sees comes from
 * i18n/copy.json.
 *
 * Nothing here makes a judgement. If you find yourself adding a threshold to
 * this file, it belongs in the estimator instead — otherwise the two disagree
 * about what a reading means and only one of them is tested.
 */

import type { ProfileDescription, LeanSide } from '../valence';
import type { ScoreBand } from '../scoring';
import { t, plural } from './i18n';
import type { CopyKey } from './copy.gen';

/** The party word for a side, article included where the language needs one. */
export function partyWord(side: LeanSide): string {
  return t(side === 'D' ? 'party.D' : 'party.R');
}

/** The other party's word. Used where a sentence names both. */
export function otherPartyWord(side: LeanSide): string {
  return partyWord(side === 'D' ? 'R' : 'D');
}

export interface RenderedVerdict {
  headline: string;
  /** Always present — every verdict has something to qualify it with. */
  caveat: string;
}

/**
 * Render a profile reading in the current locale.
 *
 * The two copy keys are built from the verdict name, so a new verdict in the
 * estimator surfaces as a missing-key compile error here rather than as a blank
 * readout on the page. That is deliberate: the last time this logic grew a
 * branch, the copy inventory missed it entirely.
 */
export function renderVerdict(d: ProfileDescription): RenderedVerdict {
  const headlineKey = `verdict.${d.verdict}.headline` as CopyKey;
  const caveatKey = `verdict.${d.verdict}.caveat` as CopyKey;

  // Every placeholder any verdict can ask for. Passing the full set costs
  // nothing and means a copy edit that introduces {party} into a sentence that
  // did not have it does not need a code change to work.
  const vars: Record<string, string | number> = {
    n: d.n,
    min: d.minMarks,
    votes: plural(d.n, t('noun.vote.one'), t('noun.vote.many')),
  };
  if (d.side) {
    vars.party = partyWord(d.side);
    vars.other = otherPartyWord(d.side);
  }

  return { headline: t(headlineKey, vars), caveat: t(caveatKey, vars) };
}

const SCORE_KEYS: Record<ScoreBand, CopyKey> = {
  almostAlways: 'score.almostAlways',
  moreOften: 'score.moreOften',
  leansToward: 'score.leansToward',
  chance: 'score.chance',
  leansAgainst: 'score.leansAgainst',
  againstAlways: 'score.againstAlways',
};

/** The phrase for a score band, in the current locale. */
export function renderScoreBand(band: ScoreBand): string {
  return t(SCORE_KEYS[band]);
}
