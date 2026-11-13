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
import { STATEMENTS, PLANKS, NO_PLANK } from '../faith_positions';
import { FAITH_SOURCE_DIR as DIR, FAITH_SOURCE_FILES as FILES, normForMatch as norm } from './faith_sources';

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
// --- recorded silences ------------------------------------------------------
//
// A NO_PLANK entry says a platform does not address an issue. That is a claim
// about the source like any excerpt, and the easier one to get wrong: a draft
// RNC summary said the platform "does not otherwise address the environment"
// until a count found its conservation pledge. So every recorded silence is
// checked: none of the issue's words may appear in that platform's text.
const SILENCE_TERMS: Partial<Record<string, RegExp>> = {
  'death-penalty': /death penalty|capital punishment|\bexecutions?\b/i,
  poverty: /\bpoverty\b|\bwelfare\b|public assistance|food stamps|\bSNAP\b|low-income|low income/i,
};
const PLATFORM_URL = {
  'R-texas': 'https://texasgop.org/wp-content/uploads/2024/06/2024-RPT-Platform.pdf',
  'D-texas': 'https://txdem.co/24-Platform',
  'R-national': 'https://www.presidency.ucsb.edu/documents/2024-republican-party-platform',
  'D-national': 'https://www.presidency.ucsb.edu/documents/2024-democratic-party-platform',
} as const;
for (const n of NO_PLANK) {
  const terms = SILENCE_TERMS[n.issueId];
  const src = FILES[PLATFORM_URL[`${n.party}-${n.level}`]];
  const raw = readFileSync(join(DIR, src.file), 'utf8');
  const hit = terms ? raw.match(terms) : null;
  const ok = terms !== undefined && hit === null;
  if (!ok) fails++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] silence ${n.party}-${n.level} ${n.issueId}: ${terms === undefined ? 'no terms defined for this issue' : hit ? `mentions "${hit[0]}"` : 'no mention'}`);
}

console.log(fails ? `\n  ${fails} problem(s)\n` : `\n  all ${entries.length} excerpts found in their sources, and ${NO_PLANK.length} recorded silences confirmed\n`);
process.exitCode = fails ? 1 : 0;
