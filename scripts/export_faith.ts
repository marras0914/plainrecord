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

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ISSUES, TRADITIONS, STATEMENTS, EARLIER, NO_STATEMENT, NO_PLANK, PLANKS, KNOWN_GAPS, TO_READ, ISSUE_TITLE_TERMS, SBC_RESOLUTIONS,
} from '../faith_positions';
import { SHIP_DIR } from './paths';

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
  return {
    about: 'What five Christian traditions officially say, and what the Texas and national party platforms say, on eight issues, with sources. Not yet reviewed by members of the traditions described. CC0.',
    license: 'CC0-1.0',
    source: 'https://rightnleft.com/faith/methodology',
    reviewed: { entries: all.filter((e) => e.review.length > 0).length, of: all.length },
    /** The SBC's earlier statements are every title match among this many resolutions. */
    sbcResolutionsSearched: SBC_RESOLUTIONS.length,
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
