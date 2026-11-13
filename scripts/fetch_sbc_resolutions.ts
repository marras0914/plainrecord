/**
 * PlainRecord: every SBC resolution's title, date and link
 *
 *   npm run data:sbc
 *
 * Reads the SBC's own WordPress API (post type mere_resource, which holds the
 * resolutions library) and writes data/faith/sbc_resolutions.json: title,
 * date and URL for every resolution, nothing else. Committed, so the build
 * never calls sbc.net. faith_positions.ts lists a tradition's earlier
 * statements on an issue from this file by title (ISSUE_TITLE_TERMS), so the
 * listed history is the SBC's own, not a selection.
 *
 * The library's search page filters in JavaScript and ignores ?search= when
 * fetched; the API is the only scripted route that returns everything.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORK_DIR } from './paths';

export const SBC_FILE = join(WORK_DIR, 'faith', 'sbc_resolutions.json');
const API = 'https://www.sbc.net/wp-json/wp/v2/mere_resource';
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

async function main(): Promise<void> {
  const out: { title: string; date: string; url: string }[] = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${API}?per_page=100&page=${page}&orderby=date&order=asc&_fields=title,date,link`, { headers: UA });
    if (r.status === 400) break; // past the last page
    if (!r.ok) throw new Error(`sbc.net API page ${page}: HTTP ${r.status}`);
    const items = await r.json() as { title: { rendered: string }; date: string; link: string }[];
    if (!items.length) break;
    for (const i of items) {
      if (!i.link.includes('/resource-library/resolutions/')) continue;
      out.push({ title: decode(i.title.rendered), date: i.date.slice(0, 10), url: i.link });
    }
    process.stderr.write(`  page ${page}: ${out.length} resolutions so far\n`);
  }
  if (out.length < 500) throw new Error(`only ${out.length} resolutions; the library has well over a thousand, so something is wrong`);
  mkdirSync(join(WORK_DIR, 'faith'), { recursive: true });
  writeFileSync(SBC_FILE, JSON.stringify({ source: API, fetched: new Date().toISOString().slice(0, 10), resolutions: out }, null, 1) + '\n');
  console.log(`\n  wrote ${out.length} resolutions to ${SBC_FILE}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\n  ${e.message}\n`); process.exitCode = 1; });
}
