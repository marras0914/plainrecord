/**
 * PlainRecord: the faith module's shipped file
 *
 *   npm run data:faith
 *
 * Writes SHIP_DIR/faith.json, the full labeled record from faith_positions.ts:
 * issues, traditions and their rules for what counts as official, every
 * statement shown in full, every earlier one listed, every "no official
 * statement", every plank, every recorded platform silence, and how many
 * entries have been reviewed by a member of the tradition or party described.
 * CC0, served CORS-open like quiz_89R.json.
 *
 * The pages (scripts/build_faith_pages.mjs) read only this file, so a page
 * cannot say something the published record does not. faith.smoke.ts fails if
 * the committed file differs from what this would write, so an edit to
 * faith_positions.ts without a re-export is caught by npm test.
 *
 * No date stamp in the file: the same data always writes the same bytes.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { BOOKS, VERSES_FILE } from './extract_faith_verses';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ISSUES, TRADITIONS, STATEMENTS, EARLIER, NO_STATEMENT, NO_PLANK, PLANKS, KNOWN_GAPS, TO_READ, ISSUE_TITLE_TERMS, SBC_RESOLUTIONS, JEWISH_RESOLUTIONS,
  SIDE_POINTS, NO_SIDE_POINT,
} from '../faith_positions';
import { CITATIONS_FILE } from './extract_jewish_citations';
import { PEW_PUBLISHED, PEW_COLUMNS, MEMBERS_OF, PEW_SOURCE } from '../faith_members';
import { ADVOCACY, ADVOCACY_NONE } from '../faith_advocacy';
import { FLOOR_BILLS, floorBillsFor, loadFloorVotes } from '../faith_floor_votes';
import { SHIP_DIR } from './paths';
import { buildHouseVotes } from './faith_house_votes';

const FLOOR = loadFloorVotes();

export const PLATFORMS = {
  'R-texas': { name: 'Republican Party of Texas', year: 2024, url: 'https://texasgop.org/wp-content/uploads/2024/06/2024-RPT-Platform.pdf' },
  'D-texas': { name: 'Texas Democratic Party', year: 2024, url: 'https://txdem.co/24-Platform' },
  'R-national': { name: 'Republican National Committee', year: 2024, url: 'https://www.presidency.ucsb.edu/documents/2024-republican-party-platform' },
  'D-national': { name: 'Democratic National Committee', year: 2024, url: 'https://www.presidency.ucsb.edu/documents/2024-democratic-party-platform' },
} as const;

// --- passages cited on both sides (decided 16 Nov 2026) ----------------------
//
// Marco asked whether each tradition's positions match scripture. The site
// cannot rule on that without reading scripture for one side, so instead the
// scripture page shows what each tradition cites, grouped by the side its
// words take, and lists here every passage that traditions on OPPOSITE sides
// of the same point both cite. The site says who cites what, never who reads
// it right.

/** One cited passage: a book and chapter, and its verses (null: the whole chapter). */
export interface Passage { code: string; chapter: number; verses: number[] | null }
export interface CiteRef extends Passage { traditionId: string; asWritten: string; url: string | null; chapterPage: string | null }

/** Two citations overlap if they share a verse; a whole chapter shares every verse in it. */
export function passagesOverlap(x: Passage, y: Passage): boolean {
  if (x.code !== y.code || x.chapter !== y.chapter) return false;
  if (x.verses === null || y.verses === null) return true;
  return x.verses.some((n) => y.verses!.includes(n));
}

const expand = (ranges: [number, number][]) => (ranges.length ? ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)) : null);

/** A Sefaria ref like "Exodus 21:22-23" as a passage, if it is in the Hebrew Bible. */
export function sefariaPassage(ref: string): Passage | null {
  const m = ref.match(/^(.+?) (\d+)(?::(\d+)(?:-(\d+))?)?$/);
  // Sefaria writes "Psalms" and "II Kings"; the book list has "Psalm" (with
  // "Psalms" among its forms) and "2 Kings".
  const name = m?.[1].replace(/^II /, '2 ').replace(/^I /, '1 ');
  const book = name && BOOKS.find((b) => b.en === name || b.forms.includes(name));
  if (!m || !book) return null;
  return { code: book.code, chapter: Number(m[2]), verses: m[3] ? expand([[Number(m[3]), Number(m[4] ?? m[3])]]) : null };
}

/**
 * For each point the platforms split on: every book and chapter where a
 * tradition on one side and a tradition on the other cite overlapping
 * verses, with each side's citations of it as the statements write them.
 */
export function citedOnBothSides(
  points: { issueId: string; churches: Record<string, { side: 'a' | 'b' } | null | undefined> }[],
  citesOf: (traditionId: string, issueId: string) => CiteRef[],
) {
  return points.map((pt) => {
    const side = (s: 'a' | 'b') => Object.entries(pt.churches).filter(([, q]) => q?.side === s).flatMap(([t]) => citesOf(t, pt.issueId));
    const a = side('a');
    const b = side('b');
    const hitA = a.filter((x) => b.some((y) => passagesOverlap(x, y)));
    const hitB = b.filter((y) => a.some((x) => passagesOverlap(x, y)));
    const chapters = [...new Set([...hitA, ...hitB].map((x) => `${x.code} ${x.chapter}`))];
    return {
      issueId: pt.issueId,
      passages: chapters.map((ch) => {
        const pick = (xs: CiteRef[]) => xs.filter((x) => `${x.code} ${x.chapter}` === ch).map(({ traditionId, asWritten, url, chapterPage }) => ({ traditionId, asWritten, url, chapterPage }));
        const [code, chapter] = ch.split(' ');
        return { code, chapter: Number(chapter), a: pick(hitA), b: pick(hitB) };
      }),
    };
  });
}

/** Newest first; a bare year sorts after any dated statement in that year. */
const byDateDesc = (a: string, b: string) => b.padEnd(10, '0').localeCompare(a.padEnd(10, '0'));

export function buildFaithPayload() {
  const statements = [...STATEMENTS].sort((a, b) => byDateDesc(a.sourceDate, b.sourceDate));
  const earlier = [...EARLIER].sort((a, b) => byDateDesc(a.date, b.date));
  const all = [...STATEMENTS, ...PLANKS];
  // The verses each statement cites, from npm run data:faith:verses (which
  // needs the downloaded sources, so its output is committed).
  const v = JSON.parse(readFileSync(VERSES_FILE, 'utf8'));
  const used = new Set<string>(v.citations.flatMap((c: { refs: { code: string }[] }) => c.refs.map((r) => r.code)));
  const verses = {
    translations: v.translations,
    maxVersesWithText: v.maxVersesWithText,
    fixes: v.fixes,
    /** Book code to English name, for the books cited. */
    books: Object.fromEntries(BOOKS.filter((b) => used.has(b.code)).map((b) => [b.code, b.en])),
    /** By statement: `${traditionId}.${issueId}.${sourceDate}`. */
    byStatement: Object.fromEntries(v.citations.map((c: { statement: string; scope: string; refs: unknown[] }) => [c.statement, { scope: c.scope, refs: c.refs }])),
    text: v.verses,
    platformReferenceCounts: v.platformReferenceCounts,
  };
  // What each Jewish statement cites, listed and linked, not printed
  // (npm run data:faith:citations; committed for the same reason).
  const c = JSON.parse(readFileSync(CITATIONS_FILE, 'utf8'));
  const citations = { source: c.source, aliases: c.aliases, byStatement: c.byStatement };
  // Every passage a tradition's statements on an issue cite: Bible references
  // from the verse record, Hebrew Bible references from the Jewish citations.
  const citesOf = (traditionId: string, issueId: string): CiteRef[] => STATEMENTS
    .filter((s) => s.traditionId === traditionId && s.issueId === issueId)
    .flatMap((s): CiteRef[] => {
      const key = `${s.traditionId}.${s.issueId}.${s.sourceDate}`;
      const vr = verses.byStatement[key] as { refs: { asWritten: string; code: string; chapter: number; ranges: [number, number][]; chapterPage: string }[] } | undefined;
      if (vr) return vr.refs.map((r) => ({ traditionId, asWritten: r.asWritten, url: null, chapterPage: r.chapterPage, code: r.code, chapter: r.chapter, verses: expand(r.ranges) }));
      const cr = c.byStatement[key] as { citations: { written: string; ref: string; url: string; kind: string }[] } | undefined;
      return (cr?.citations ?? []).flatMap((x) => {
        const p = x.kind === 'Tanakh' ? sefariaPassage(x.ref) : null;
        return p ? [{ traditionId, asWritten: x.written, url: x.url, chapterPage: null, ...p }] : [];
      });
    });
  const both = citedOnBothSides(SIDE_POINTS, citesOf);
  // A book cited on both sides only in Jewish texts still needs its name.
  for (const code of both.flatMap((g) => g.passages.map((p) => p.code))) {
    (verses.books as Record<string, string>)[code] ??= BOOKS.find((b) => b.code === code)!.en;
  }
  return {
    about: 'What five Christian traditions and three Jewish movements officially say, and what the Texas and national party platforms say, on eight issues, with sources; and, where a church took a side on specific Texas bills, how each party in the Texas House voted on them. Not reviewed by members of the traditions described; every quote is checked by a program against a saved copy of its source. CC0.',
    license: 'CC0-1.0',
    source: 'https://rightnleft.com/faith/methodology',
    reviewed: { entries: all.filter((e) => e.review.length > 0).length, of: all.length },
    /** The SBC's earlier statements are every title match among this many resolutions. */
    sbcResolutionsSearched: SBC_RESOLUTIONS.length,
    /** The Jewish movements' earlier statements: title matches among these. */
    jewishResolutionsSearched: Object.fromEntries((['urj', 'ccar', 'ra'] as const).map((b) => [b, JEWISH_RESOLUTIONS.filter((r) => r.body === b).length])),
    issues: ISSUES.map((i) => ({ ...i, titleTerms: ISSUE_TITLE_TERMS[i.id].source })),
    traditions: TRADITIONS,
    platforms: PLATFORMS,
    statements,
    earlier,
    noStatement: NO_STATEMENT,
    planks: PLANKS,
    noPlank: NO_PLANK,
    knownGaps: KNOWN_GAPS,
    toRead: TO_READ,
    /**
     * Which side each church takes, issue by issue, on a point where the two
     * platforms take opposite sides; each placement with the church's own
     * words. No count across issues.
     */
    sidePoints: SIDE_POINTS,
    noSidePoint: NO_SIDE_POINT,
    verses,
    citations,
    /**
     * Passages cited by traditions on opposite sides of the same point
     * (decided 16 Nov 2026). Who cites what; never which reading is right.
     */
    citedOnBothSides: both,
    /**
     * What each tradition's members say, from Pew (decided 16 Nov 2026):
     * Pew's own published figures, beside the tradition's own words. No score.
     * Evangelicals are left out: they are only a check (faith_members.ts).
     */
    /**
     * What each tradition's own advocacy office backed or opposed in Congress
     * since January 2025, on these issues, naming a bill (decided 16 Nov 2026).
     * Newest first; undated pages last. No count.
     */
    advocacy: {
      since: '2025-01-03',
      // Each entry carries the floor votes on the bills it names, by Marco's
      // rule of 17 Nov 2026 (faith_floor_votes.ts), oldest first.
      items: [...ADVOCACY].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).map((a) => {
        const ids = floorBillsFor(a).map((b) => b.id);
        const votes = FLOOR.votes.filter((v) => ids.includes(v.billId)).sort((x, y) => x.date.localeCompare(y.date));
        return votes.length ? { ...a, floorVotes: votes } : a;
      }),
      none: ADVOCACY_NONE,
      floor: {
        fetched: FLOOR.fetched, houseRollCalls: FLOOR.houseRollCalls, senateRollCalls: FLOOR.senateRollCalls,
        measuresWithRollCall: FLOOR.measuresWithRollCall,
        // The name each voted bill goes by, for the page's one sentence.
        bills: FLOOR_BILLS.map((b) => b.names[0]),
      },
    },
    members: {
      source: PEW_SOURCE,
      columns: Object.fromEntries(Object.entries(PEW_COLUMNS).map(([q, cs]) => [q, cs.map((c) => c.key)])),
      published: Object.fromEntries(Object.entries(PEW_PUBLISHED).filter(([g]) => g !== 'evangelical')),
      membersOf: MEMBERS_OF,
    },
    /**
     * How each party in the Texas House voted on the bills a church itself
     * took a side on. Only the Catholic bishops publish such a list in Texas.
     */
    houseVotes: [buildHouseVotes()],
  };
}

export type FaithPayload = ReturnType<typeof buildFaithPayload>;

function main(): void {
  const p = buildFaithPayload();
  const json = JSON.stringify(p);
  writeFileSync(join(SHIP_DIR, 'faith.json'), json);
  console.log(`\n  faith.json  ${p.statements.length} statements, ${p.earlier.length} earlier, ${p.planks.length} planks, ${(json.length / 1024).toFixed(1)} KB\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
