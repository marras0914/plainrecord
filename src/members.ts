/**
 * PlainRecord — how your own representative voted
 *
 * The site could tell you how three statewide candidates voted and not how your
 * own member did, because the shipped payload carries per-member votes for nine
 * people. This module loads the other 140 on demand and scores any of them with
 * the SAME estimator the candidates go through, so a member's number means
 * exactly what a candidate's number means.
 *
 * FETCHED, NOT BUNDLED. members_89R.json is 10.7 KB gzipped, and 6.3 KB of that
 * is the ocd-person ids — which the page never needs but which are what make the
 * file joinable to every other legislative dataset, and it is published CC0 for
 * that reason. Bundling it would charge every visitor for a lookup most will not
 * use. Fetching it charges only the ones who ask.
 *
 * It does not weaken the page's privacy claim. This is a GET for a static file
 * that the whole internet can already read; nothing about the reader's answers
 * goes with it, and verify_site.mjs asserts that separately by inspecting every
 * request made while answering.
 */

import { scoreLegislator, scoreBand, type VoteItem, type Answer } from '../scoring';
import { renderScoreBand } from './verdict';
import type { Adapted } from './quiz-data';

/**
 * Where the member record lives. Same shape as PAYLOAD_URL in main.ts: relative
 * so it works the moment it ships.
 *
 * NOTE for scripts/build_artifact.mjs — the single-file share build inlines the
 * payload and has no /data/ directory beside it, so it rewrites PAYLOAD_URL to
 * an absolute rightnleft.com URL. This constant needs the same treatment or the
 * lookup silently does nothing in the artifact.
 */
export const MEMBERS_URL = '/data/members_89R.json';

export interface Member {
  /** District number, 1 to 150. */
  d: number;
  n: string;
  /** First letter of the party, as the roster gives it. */
  p: string;
  id: string;
  /** One character per item in `itemOrder`: y, n, or . for no vote recorded. */
  v: string;
  voted: number;
}

interface MemberFile {
  session: string;
  itemOrder: string[];
  members: Member[];
  provenance: { sittingHouseMembers: number; unnamedVoters: number };
}

/**
 * The synthetic id the member's votes are filed under while scoring.
 *
 * Deliberately not the real ocd-person id: the payload may already carry that
 * member (the three candidates and six comparators are in both files), and
 * writing over their existing votes would make a member score differently
 * depending on whether you reached them through the district lookup or the
 * candidate card. A key that cannot collide keeps the two paths identical.
 */
const SCORING_KEY = '__district_member__';

let cache: MemberFile | null = null;
let inFlight: Promise<MemberFile | null> | null = null;

/**
 * Load the member record, once.
 *
 * Returns null rather than throwing on failure, because a failed lookup should
 * leave the rest of the page working and say so, not take the page down. The
 * caller renders the reason.
 */
export async function loadMembers(): Promise<MemberFile | null> {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch(MEMBERS_URL, { credentials: 'omit' });
      if (!res.ok) return null;
      const data = (await res.json()) as MemberFile;
      if (!Array.isArray(data.members) || !Array.isArray(data.itemOrder)) return null;
      cache = data;
      return data;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** The member for a district, or undefined. 149 of 150 seats are filled. */
export function memberForDistrict(file: MemberFile, district: number): Member | undefined {
  return file.members.find((m) => m.d === district);
}

/** Members whose name contains `q`, case-insensitively. For the name search. */
export function searchMembers(file: MemberFile, q: string, limit = 8): Member[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  return file.members
    .filter((m) => m.n.toLowerCase().includes(needle))
    .slice(0, limit);
}

export interface MemberResult {
  member: Member;
  /** Shrunk alignment score, on the same scale as a candidate's. */
  adjusted: number;
  /** How many of the reader's answered items this member also voted on. */
  n: number;
  /** The band phrase, in the current locale. Null when n is 0. */
  phrase: string | null;
}

/**
 * Score a member against the reader's answers, through the real estimator.
 *
 * The member's votes are merged into copies of the adapted items rather than
 * recomputed here. That is the point: `scoreLegislator` applies the same
 * weighting, the same expected-agreement baseline and the same shrinkage it
 * applies to Goodwin, so a district member's 0.62 and a candidate's 0.62 are the
 * same claim. Reimplementing the arithmetic for this panel is exactly the
 * two-implementations bug src/quiz-data.ts exists to prevent.
 */
export function scoreMember(
  adapted: Adapted,
  file: MemberFile,
  member: Member,
  answers: Record<string, Answer>,
): MemberResult {
  const vote = new Map<string, 1 | -1 | null>();
  for (const [i, itemId] of file.itemOrder.entries()) {
    const c = member.v[i];
    vote.set(itemId, c === 'y' ? 1 : c === 'n' ? -1 : null);
  }

  const items: VoteItem[] = adapted.items.map((it) => ({
    ...it,
    votes: { ...it.votes, [SCORING_KEY]: vote.get(it.id) ?? null },
  }));

  const r = scoreLegislator(SCORING_KEY, items, answers, adapted.scoringWeights);
  return {
    member,
    adjusted: r.adjustedScore,
    n: r.n,
    // No phrase at n = 0. A member who cast none of the votes the reader
    // answered has no alignment to report, and the bands would otherwise put
    // them in "no clearer than chance", which reads as a finding rather than
    // as an absence. One sitting member voted on none of the 67.
    phrase: r.n > 0 ? renderScoreBand(scoreBand(r.adjustedScore)) : null,
  };
}

// -----------------------------------------------------------------------------
// ZIP codes
//
// There is no official ZIP-to-Texas-House-district file; scripts/build_zips.mjs
// derives one through 2020 Census blocks, which nest inside both. See that file
// for why the join is on blocks and not on polygons.
//
// A separate fetch from the member record on purpose: only readers who type a
// ZIP pay the 12.4 KB, and most arrive knowing their district or their member's
// name.

/** Same build_artifact.mjs caveat as MEMBERS_URL — it must be made absolute. */
export const ZIPS_URL = '/data/zips_89R.json';

/**
 * A ZIP maps either to one district, stored as a bare number, or to several,
 * stored as [district, percent of ZIP land area] pairs, largest share first.
 * The bare-number case is 54% of Texas ZIPs and halves the file.
 */
export type ZipEntry = number | Array<[number, number]>;

export interface ZipFile {
  session: string;
  zips: Record<string, ZipEntry>;
  provenance?: { zips?: number; zipsSpanningDistricts?: number };
}

let zipCache: ZipFile | null = null;
let zipInFlight: Promise<ZipFile | null> | null = null;

/** Load the crosswalk, once. Null on failure; the district box still works. */
export async function loadZips(): Promise<ZipFile | null> {
  if (zipCache) return zipCache;
  if (zipInFlight) return zipInFlight;
  zipInFlight = (async () => {
    try {
      const res = await fetch(ZIPS_URL, { credentials: 'omit' });
      if (!res.ok) return null;
      const data = (await res.json()) as ZipFile;
      if (!data || typeof data.zips !== 'object') return null;
      zipCache = data;
      return data;
    } catch {
      return null;
    } finally {
      zipInFlight = null;
    }
  })();
  return zipInFlight;
}

export interface ZipDistrict {
  d: number;
  /** Percent of the ZIP's land area in this district. 100 when it is the only one. */
  pct: number;
}

/**
 * The districts a ZIP touches, largest share first, or null if the ZIP is not
 * in the file.
 *
 * Returns every district rather than the largest one. A ZIP that spans
 * districts is a genuine ambiguity — it is decided by the reader's street — and
 * silently answering with the biggest share would be wrong for up to half the
 * people in a split ZIP.
 */
export function districtsForZip(file: ZipFile, zip: string): ZipDistrict[] | null {
  const v = file.zips[zip];
  if (v === undefined) return null;
  if (typeof v === 'number') return [{ d: v, pct: 100 }];
  return v.map(([d, pct]) => ({ d, pct }));
}
