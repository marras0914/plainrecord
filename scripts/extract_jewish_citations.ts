/**
 * PlainRecord: every source a Jewish statement cites, as it writes it
 *
 *   npm run data:faith:citations
 *
 * Decided 15 Nov 2026 (FAITH.md, "Judaism"): the Jewish movements' statements
 * cite the Hebrew Bible, but mostly the Mishnah, the Talmud, Maimonides and
 * later codes. The Christian pages print each cited verse from WEB and
 * RV1909; those are Christian translations, so a Jewish statement's citations
 * are LISTED as the statement writes them, labeled by kind, and linked to
 * Sefaria. No text is printed.
 *
 * How a citation is found: every run of up to six words ending in a chapter
 * and verse ("Leviticus 19:33", "Devarim 15:7-8") or a Talmud folio
 * ("Bava Kama 46a") is a candidate. Sefaria's own name API (/api/name) says
 * whether it is a reference, trying the shortest ending first ("19:33" alone
 * is not; "Leviticus 19:33" is) and keeping the first that is. So which
 * strings count is decided by Sefaria's catalog, not by a list kept here,
 * apart from ALIASES: spellings Sefaria does not know, each with a reason.
 * The kind label comes from the work's first category in Sefaria's index.
 *
 * Writes data/faith/jewish_citations.json, committed, so the build never calls
 * Sefaria.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORK_DIR } from './paths';
import { FAITH_SOURCE_DIR, FAITH_SOURCE_FILES } from './faith_sources';
import { STATEMENTS, isJewish } from '../faith_positions';

export const CITATIONS_FILE = join(WORK_DIR, 'faith', 'jewish_citations.json');

/** Spellings Sefaria's name API does not recognize, and what they are. */
export const ALIASES: { label: string; written: RegExp; sefaria: string; why: string }[] = [
  { label: "Y'vamot", written: /^Y'?vamot\b/i, sefaria: 'Yevamot', why: "the CCAR's transliteration of the tractate Yevamot" },
  { label: "Sh'mot", written: /^Sh'?mot\b/i, sefaria: 'Exodus', why: 'Sh\'mot is the Hebrew name of Exodus' },
  { label: 'Mishneh Torah, Mattenot Aniyyim', written: /^Mishneh Torah,? Mattenot Aniyyim\b/i, sefaria: 'Mishneh Torah, Gifts to the Poor', why: 'Sefaria titles Hilkhot Matanot Aniyim in English' },
  { label: "Mishneh Torah, Hilkhot Rotzeah u'Shmirat HaNefesh", written: /^Mishneh Torah,? Hilkhot Rotzeah u'Shmirat HaNefesh\b/i, sefaria: 'Mishneh Torah, Murderer and the Preservation of Life', why: 'Sefaria titles Hilkhot Rotzeah u\'Shmirat HaNefesh in English' },
  { label: "Yoreh De'ah", written: /^Yoreh De'ah\b/i, sefaria: 'Shulchan Arukh, Yoreh De\'ah', why: 'Yoreh De\'ah is a part of the Shulchan Arukh, which the statement does not name' },
];

// A word: capitalized ("Leviticus", "BT"), a joined lowercase prefix
// ("u'Shmirat"), or a gloss in parentheses ("Genesis (Bereishit) 2:15").
const CANDIDATE = /((?:(?:[A-Z][\w'’.-]*|[a-z]['’][A-Z][\w'’.-]*|\([A-Z][\w'’ ]*\)),?\s+){1,7})(\d{1,3}(?:[ab]\b|[:.]\d{1,3}(?:\s*[-–]\s*\d{1,3})?))/g;

interface SefariaName { is_ref: boolean; ref?: string; url?: string; index?: string }
const cache = new Map<string, SefariaName>();
async function sefariaName(s: string): Promise<SefariaName> {
  if (cache.has(s)) return cache.get(s)!;
  const r = await fetch(`https://www.sefaria.org/api/name/${encodeURIComponent(s)}?limit=0`);
  if (!r.ok) throw new Error(`sefaria /api/name ${s}: HTTP ${r.status}`);
  const j = await r.json() as SefariaName;
  cache.set(s, j);
  await new Promise((res) => setTimeout(res, 150));
  return j;
}
const kinds = new Map<string, string>();
async function kindOf(index: string): Promise<string> {
  if (kinds.has(index)) return kinds.get(index)!;
  const r = await fetch(`https://www.sefaria.org/api/v2/index/${encodeURIComponent(index)}`);
  const j = r.ok ? await r.json() as { categories?: string[] } : {};
  const k = j.categories?.[0] ?? 'Other';
  kinds.set(index, k);
  return k;
}

export interface Citation { written: string; ref: string; url: string; kind: string; alias?: string }

async function citationsIn(text: string): Promise<Citation[]> {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(CANDIDATE)) {
    const words = m[1].trim().split(/\s+/);
    const loc = m[2].replace(/\s+/g, '');
    for (let n = 1; n <= words.length; n++) {
      if (/^\(/.test(words[words.length - n])) continue; // never start on a gloss
      const written = `${words.slice(-n).join(' ').replace(/,$/, '')} ${loc}`;
      // Asked without glosses and with straight apostrophes.
      const plain = written.replace(/\s\([^)]*\)/g, '').replace(/’/g, "'");
      const alias = ALIASES.find((a) => a.written.test(plain));
      const asked = alias ? plain.replace(alias.written, alias.sefaria) : plain;
      const r = await sefariaName(asked);
      if (!r.is_ref || !r.ref || !r.index) continue;
      if (!seen.has(r.ref)) {
        seen.add(r.ref);
        out.push({ written, ref: r.ref, url: `https://www.sefaria.org/${r.url}`, kind: await kindOf(r.index), ...(alias ? { alias: alias.why } : {}) });
      }
      break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const byStatement: Record<string, { scope: string; citations: Citation[] }> = {};
  for (const s of STATEMENTS.filter((x) => isJewish(x.traditionId))) {
    const src = FAITH_SOURCE_FILES[s.sourceUrl];
    if (!src) throw new Error(`no downloaded source mapped for ${s.sourceUrl}`);
    let text = readFileSync(join(FAITH_SOURCE_DIR, src.file), 'utf8');
    let scope = 'whole document';
    // A document of many positions (the OU's standing positions): only the
    // paragraph holding the excerpt is that issue's statement.
    if (src.paragraphs) {
      const para = text.split(/\n/).find((l) => l.replace(/\s+/g, ' ').includes(s.excerpt.slice(0, 40)));
      if (!para) throw new Error(`excerpt's paragraph not found in ${src.file}`);
      text = para;
      scope = 'paragraph';
    }
    byStatement[`${s.traditionId}.${s.issueId}.${s.sourceDate}`] = { scope, citations: await citationsIn(text) };
    process.stderr.write(`  ${s.traditionId} ${s.issueId}: ${byStatement[`${s.traditionId}.${s.issueId}.${s.sourceDate}`].citations.length}\n`);
  }
  writeFileSync(CITATIONS_FILE, JSON.stringify({
    source: 'https://www.sefaria.org/api/name', aliases: ALIASES.map((a) => ({ written: a.label, sefaria: a.sefaria, why: a.why })), byStatement,
  }, null, 1) + '\n');
  const n = Object.values(byStatement).reduce((a, b) => a + b.citations.length, 0);
  console.log(`\n  ${n} citations in ${Object.keys(byStatement).length} statements; wrote ${CITATIONS_FILE}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\n  ${e.message}\n`); process.exitCode = 1; });
}
