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
  /**
   * Former members who voted this session and hold no current district.
   *
   * Separate from `members` on purpose: the lookup answers who represents a
   * district NOW, and a seat that changed hands has a current holder. This is
   * what lets the page name who cast the rest of that district's votes instead
   * of only saying somebody did.
   *
   * Optional because the build reaches the retired roster over the network and
   * degrades to the unnamed count when it cannot.
   */
  retired?: { id: string; name: string; district: number; until: string; voted: number }[];
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

/** One vote where a member went against their own caucus's majority. */
export interface Crossing {
  /** The payload item id, so the caller can reach the bill and its links. */
  itemId: string;
  /** 1 for Yea, -1 for Nay — the member's own vote, not their caucus's. */
  cast: 1 | -1;
}

export interface CrossingReport {
  /** Items where the two caucus majorities landed on opposite sides. */
  divisive: number;
  crossings: Crossing[];
}

/**
 * Where a member voted against their own caucus's majority.
 *
 * WHY THIS EXISTS AND WHY IT NEEDS NO ANSWERS
 *
 * Until now the district panel could say nothing at all until the reader had
 * answered something, because everything it showed was a SCORE, and a score is
 * a comparison that needs both halves. So a reader who arrived to look up their
 * representative met a heading asking how that representative voted, above a
 * prompt to go and take a quiz. An r/houston moderator read the site as an
 * advert on exactly that basis, and he had a point.
 *
 * A member's votes need nothing from the reader. They are already in
 * members_89R.json, one character per item, for all 150 seats.
 *
 * WHY CROSSINGS RATHER THAN ALL 67
 *
 * Sixty-seven rows is a wall, and most of them are a member voting the way
 * their party voted, which a reader can predict without reading. The crossings
 * are the opposite: they are short, they are specific, and they are the one
 * thing on this site that cannot be guessed from a party label. That is also
 * the standing criticism of the quiz — that the answers are obvious — so the
 * panel answers it with the data instead of with an argument.
 *
 * `divisive` is reported alongside because zero crossings is a real finding and
 * needs a denominator. "Never crossed" means nothing without "out of how many
 * chances", and a member with 51 chances who took none is a different fact from
 * one with three.
 */
export function crossings(
  items: { id: string; rYea: number | null; dYea: number | null }[],
  file: MemberFile,
  member: Member,
): CrossingReport {
  const at = new Map(file.itemOrder.map((id, i) => [id, i]));
  const out: Crossing[] = [];
  let divisive = 0;

  for (const it of items) {
    // A caucus share can be missing, and a missing share is not a tie. Treating
    // null as 0 would silently call every such item a Nay majority and invent
    // crossings out of absent data, so the item is skipped and does not count
    // toward the denominator either.
    if (it.rYea === null || it.dYea === null) continue;

    // Which way each caucus went. An item where both majorities agree offers no
    // caucus to break with, so it is not a chance to cross and is not counted.
    const rMajority = it.rYea > 0.5 ? 1 : -1;
    const dMajority = it.dYea > 0.5 ? 1 : -1;
    if (rMajority === dMajority) continue;
    divisive++;

    const i = at.get(it.id);
    if (i === undefined) continue;
    const c = member.v[i];
    const cast = c === 'y' ? 1 : c === 'n' ? -1 : null;
    if (cast === null) continue;

    // An independent or an unrecognised party letter has no caucus majority to
    // break with, so nothing is reported rather than a guess being made.
    const own = member.p === 'R' ? rMajority : member.p === 'D' ? dMajority : null;
    if (own === null) continue;
    if (cast !== own) out.push({ itemId: it.id, cast });
  }

  return { divisive, crossings: out };
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
 * stored as [district, people, percent of ZIP land area] triples, most people
 * first. `people` is a 2020 census HEAD COUNT, not a percent, and the counts
 * for a ZIP sum to its population. The bare-number case is 54% of Texas ZIPs
 * and halves the file.
 *
 * The two-element form is the file as it stood before 17 September 2026, when
 * the only share was land area. It is still accepted because /data is cached
 * for an hour, so a reader who loaded the old file can be running this code
 * against it. Its share is NOT read as a population share — see
 * districtsForZip.
 */
export type ZipEntry = number | Array<[number, number, number] | [number, number]>;

export interface ZipFile {
  session: string;
  /** 'population' once the shares count people. Absent in files built before that. */
  shares?: string;
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
  /**
   * People who lived in this district's part of the ZIP at the 2020 census.
   *
   * Null only when the loaded file predates population counts, in which case
   * the panel shows no percentage at all. It is deliberately not filled in
   * from `landPct`: those two numbers disagree about which district is largest
   * in 108 of the 913 split ZIPs, so substituting one for the other is the
   * exact error this field exists to end.
   */
  people: number | null;
  /**
   * `people` as a percent of the whole ZIP, rounded, or null alongside it.
   *
   * Zero only when `people` is zero. A district holding a handful of a ZIP's
   * residents rounds to 0% and must not be described as holding nobody — 77002
   * has one, HD-134 with 71 people — so the caller tests `people`, not this,
   * to tell an empty piece from a small one.
   */
  popPct: number | null;
  /** Percent of the ZIP's land area in this district. Published for audit, never ranked on. */
  landPct: number;
}

/**
 * The districts a ZIP touches, most people first, or null if the ZIP is not in
 * the file.
 *
 * Returns every district rather than the largest one. A ZIP that spans
 * districts is a genuine ambiguity — it is decided by the reader's street — and
 * silently answering with the biggest share would be wrong for up to half the
 * people in a split ZIP.
 */
export function districtsForZip(file: ZipFile, zip: string): ZipDistrict[] | null {
  const v = file.zips[zip];
  if (v === undefined) return null;
  if (typeof v === 'number') return [{ d: v, people: null, popPct: 100, landPct: 100 }];
  const byPopulation = file.shares === 'population';
  if (!byPopulation || v.some((e) => e.length !== 3)) {
    // An old cached file. Its one share is land, and the list is in land
    // order, so the share is carried through for provenance and withheld from
    // the reader rather than relabelled.
    return v.map((e) => ({ d: e[0], people: null, popPct: null, landPct: e[1] }));
  }
  const total = v.reduce((a, e) => a + (e[1] ?? 0), 0);
  return v.map((e) => ({
    d: e[0],
    people: e[1],
    // The ZIP's own population is the denominator, and it is the sum of these
    // counts by construction. A ZIP that spans districts and holds nobody
    // cannot be built — build_zips.mjs throws on it — but dividing by zero
    // here would produce NaN on screen rather than an error anyone sees.
    popPct: total > 0 ? Math.round((e[1] / total) * 100) : null,
    landPct: e[2] as number,
  }));
}
