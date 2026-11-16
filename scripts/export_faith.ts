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
} from '../faith_positions';
import { CITATIONS_FILE } from './extract_jewish_citations';
import { SHIP_DIR } from './paths';
import { buildHouseVotes } from './faith_house_votes';

export const PLATFORMS = {
  'R-texas': { name: 'Republican Party of Texas', year: 2024, url: 'https://texasgop.org/wp-content/uploads/2024/06/2024-RPT-Platform.pdf' },
  'D-texas': { name: 'Texas Democratic Party', year: 2024, url: 'https://txdem.co/24-Platform' },
  'R-national': { name: 'Republican National Committee', year: 2024, url: 'https://www.presidency.ucsb.edu/documents/2024-republican-party-platform' },
  'D-national': { name: 'Democratic National Committee', year: 2024, url: 'https://www.presidency.ucsb.edu/documents/2024-democratic-party-platform' },
} as const;

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
  return {
    about: 'What five Christian traditions and three Jewish movements officially say, and what the Texas and national party platforms say, on eight issues, with sources; and, where a church took a side on specific Texas bills, how each party in the Texas House voted on them. Not yet reviewed by members of the traditions described. CC0.',
    license: 'CC0-1.0',
    source: 'https://rightnleft.com/faith/methodology',
    reviewed: { entries: all.filter((e) => e.review.length > 0).length, of: all.length },
    /** The SBC's earlier statements are every title match among this many resolutions. */
    sbcResolutionsSearched: SBC_RESOLUTIONS.length,
    /** The Jewish movements' earlier statements: title matches among these. */
    jewishResolutionsSearched: Object.fromEntries((['urj', 'ccar', 'ra', 'rca'] as const).map((b) => [b, JEWISH_RESOLUTIONS.filter((r) => r.body === b).length])),
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
    verses,
    citations,
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
