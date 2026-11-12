/**
 * PlainRecord: are the economy notes' quotes really in their sources?
 *
 *   npm run data:econ:quotes
 *
 * Every note in econ_context.ts carries a verbatim quote. This checks each one
 * against the source text downloaded into data/econ_sources/ (gitignored, since
 * the paper is NBER's to distribute, so this is run by hand, like
 * data:districts:check, and not by npm test):
 *
 *   w20324.txt           the paper's text layer, extracted from w20324.pdf
 *   nber_2020_peak.html  the NBER committee's announcement of 8 June 2020
 *
 * Matching ignores whitespace, dash characters and curly quotes, because a
 * PDF's text layer drops or changes those ("1990-1991" extracts as
 * "19901991"); every letter and digit must still match in order.
 *
 * Proven able to fail: a quote with one word changed is checked first, and the
 * run refuses to report anything if that control passes.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONTEXT } from '../econ_context';
import { WORK_DIR } from './paths';

const DIR = join(WORK_DIR, 'econ_sources');
const norm = (s: string) => s
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
  .replace(/[‐-―−-]/g, '').replace(/[‘’“”'"]/g, '')
  .replace(/\s+/g, '');

const SOURCES: Record<string, string> = {
  'https://www.nber.org/papers/w20324': 'w20324.txt',
  'https://www.nber.org/news/business-cycle-dating-committee-announcement-june-8-2020': 'nber_2020_peak.html',
};

let fails = 0;
const texts = new Map<string, string>();
for (const [url, file] of Object.entries(SOURCES)) {
  const path = join(DIR, file);
  if (!existsSync(path)) { console.error(`\n  missing ${path}; download the source first (see ECONOMY.md)\n`); process.exit(1); }
  texts.set(url, norm(readFileSync(path, 'utf8')));
}

// The control: a real quote with one word swapped must NOT be found.
const paper = texts.get('https://www.nber.org/papers/w20324')!;
const control = norm('On balance, growth under Nixon-Ford was markedly faster than under Kennedy-Johnson');
if (paper.includes(control)) {
  console.error('\n  the control quote matched; the check cannot fail, so nothing is reported\n');
  process.exit(1);
}
console.log('\n  [PASS] control: an altered quote is not found');

for (const n of CONTEXT) {
  const text = texts.get(n.source.url);
  const ok = text !== undefined && text.includes(norm(n.source.quote));
  if (!ok) fails++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${n.id}: quote ${text === undefined ? 'has no downloaded source' : ok ? 'found' : 'NOT found'}`);
}
console.log(fails ? `\n  ${fails} quote(s) not found\n` : `\n  all ${CONTEXT.length} quotes found in their sources\n`);
process.exitCode = fails ? 1 : 0;
