/**
 * PlainRecord: which Bible verses each faith statement cites
 *
 *   npm run data:faith:verses
 *
 * FAITH.md: "A verse goes in only when a documented source on that side has
 * cited it on that issue." So the site picks no verses. This script reads each
 * statement's own downloaded text, finds every Bible reference in it, and
 * writes data/faith/verses.json (committed) with the text of each verse in the
 * World English Bible and the Reina-Valera 1909, both public domain, from
 * eBible.org (downloaded to data/bibles/, gitignored).
 *
 * THE RULES, mechanical so the result is the same whoever runs it:
 *
 *   1. Only statements shown in full count, not the earlier ones listed.
 *   2. A document the record cites for one issue counts whole: every verse in
 *      it is cited on that issue. A document cited for several issues (the
 *      bishops' Forming Consciences and its 2023 note, the Methodist Political
 *      Community section) counts only where the verse sits in the same section
 *      as the excerpt quoted for that issue. Sections are the document's own:
 *      headings on a web page, numbered paragraphs in the 2019 guide,
 *      indented paragraphs in the 2023 note.
 *   3. A passage longer than eight verses, or a whole chapter, is listed by
 *      reference with a link to the chapter, without its text. The Methodist
 *      Economic Community section cites "Matt. 25:3-46", which is shown as
 *      written rather than corrected.
 *   4. The platforms are searched the same way. None cites a verse; the
 *      output records the count for each, so a page can say so from the data.
 *
 * Reference forms that a PDF's text layer garbled are fixed in FIXES below,
 * each with its reason, and every verse is checked to exist in both Bibles.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { STATEMENTS, PLANKS, type Statement } from '../faith_positions';
import { FAITH_SOURCE_DIR, FAITH_SOURCE_FILES, decodeEntities, normForMatch } from './faith_sources';
import { WORK_DIR } from './paths';

const BIBLE_DIR = join(WORK_DIR, 'bibles');
export const VERSES_FILE = new URL('../data/faith/verses.json', import.meta.url);
export const MAX_VERSES_WITH_TEXT = 8;

// --- books -----------------------------------------------------------------

/** VPL code, the English and Spanish names, and the forms sources write. */
export const BOOKS: { code: string; en: string; es: string; forms: string[] }[] = [
  ['GEN', 'Genesis', 'Génesis', 'Genesis|Gen'], ['EXO', 'Exodus', 'Éxodo', 'Exodus|Exod|Ex'],
  ['LEV', 'Leviticus', 'Levítico', 'Leviticus|Lev'], ['NUM', 'Numbers', 'Números', 'Numbers|Num'],
  ['DEU', 'Deuteronomy', 'Deuteronomio', 'Deuteronomy|Deut|Dt'], ['JOS', 'Joshua', 'Josué', 'Joshua|Josh'],
  ['JDG', 'Judges', 'Jueces', 'Judges|Judg'], ['RUT', 'Ruth', 'Rut', 'Ruth'],
  ['1SA', '1 Samuel', '1 Samuel', '1 Samuel|1 Sam'], ['2SA', '2 Samuel', '2 Samuel', '2 Samuel|2 Sam'],
  ['1KI', '1 Kings', '1 Reyes', '1 Kings|1 Kgs'], ['2KI', '2 Kings', '2 Reyes', '2 Kings|2 Kgs'],
  ['1CH', '1 Chronicles', '1 Crónicas', '1 Chronicles|1 Chr'], ['2CH', '2 Chronicles', '2 Crónicas', '2 Chronicles|2 Chr'],
  ['EZR', 'Ezra', 'Esdras', 'Ezra'], ['NEH', 'Nehemiah', 'Nehemías', 'Nehemiah|Neh'], ['EST', 'Esther', 'Ester', 'Esther|Esth'],
  ['JOB', 'Job', 'Job', 'Job'], ['PSA', 'Psalm', 'Salmo', 'Psalms|Psalm|Pss|Ps'], ['PRO', 'Proverbs', 'Proverbios', 'Proverbs|Prov'],
  ['ECC', 'Ecclesiastes', 'Eclesiastés', 'Ecclesiastes|Eccl'], ['SOL', 'Song of Songs', 'Cantares', 'Song of Songs|Song of Solomon'],
  ['ISA', 'Isaiah', 'Isaías', 'Isaiah|Isa'], ['JER', 'Jeremiah', 'Jeremías', 'Jeremiah|Jer'], ['LAM', 'Lamentations', 'Lamentaciones', 'Lamentations|Lam'],
  ['EZE', 'Ezekiel', 'Ezequiel', 'Ezekiel|Ezek'], ['DAN', 'Daniel', 'Daniel', 'Daniel|Dan'], ['HOS', 'Hosea', 'Oseas', 'Hosea|Hos'],
  ['JOE', 'Joel', 'Joel', 'Joel'], ['AMO', 'Amos', 'Amós', 'Amos'], ['OBA', 'Obadiah', 'Abdías', 'Obadiah'], ['JON', 'Jonah', 'Jonás', 'Jonah'],
  ['MIC', 'Micah', 'Miqueas', 'Micah|Mic'], ['NAH', 'Nahum', 'Nahúm', 'Nahum'], ['HAB', 'Habakkuk', 'Habacuc', 'Habakkuk|Hab'],
  ['ZEP', 'Zephaniah', 'Sofonías', 'Zephaniah|Zeph'], ['HAG', 'Haggai', 'Hageo', 'Haggai'], ['ZEC', 'Zechariah', 'Zacarías', 'Zechariah|Zech'],
  ['MAL', 'Malachi', 'Malaquías', 'Malachi|Mal'],
  ['MAT', 'Matthew', 'Mateo', 'Matthew|Matt|Mt'], ['MAR', 'Mark', 'Marcos', 'Mark|Mk'], ['LUK', 'Luke', 'Lucas', 'Luke|Lk'],
  ['JOH', 'John', 'Juan', 'John|Jn'], ['ACT', 'Acts', 'Hechos', 'Acts'], ['ROM', 'Romans', 'Romanos', 'Romans|Rom'],
  ['1CO', '1 Corinthians', '1 Corintios', '1 Corinthians|1 Cor'], ['2CO', '2 Corinthians', '2 Corintios', '2 Corinthians|2 Cor'],
  ['GAL', 'Galatians', 'Gálatas', 'Galatians|Gal'], ['EPH', 'Ephesians', 'Efesios', 'Ephesians|Eph'], ['PHI', 'Philippians', 'Filipenses', 'Philippians|Phil'],
  ['COL', 'Colossians', 'Colosenses', 'Colossians|Col'], ['1TH', '1 Thessalonians', '1 Tesalonicenses', '1 Thessalonians|1 Thess'],
  ['2TH', '2 Thessalonians', '2 Tesalonicenses', '2 Thessalonians|2 Thess'], ['1TI', '1 Timothy', '1 Timoteo', '1 Timothy|1 Tim'],
  ['2TI', '2 Timothy', '2 Timoteo', '2 Timothy|2 Tim'], ['TIT', 'Titus', 'Tito', 'Titus'], ['PHM', 'Philemon', 'Filemón', 'Philemon'],
  ['HEB', 'Hebrews', 'Hebreos', 'Hebrews|Heb'], ['JAM', 'James', 'Santiago', 'James|Jas'], ['1PE', '1 Peter', '1 Pedro', '1 Peter|1 Pet'],
  ['2PE', '2 Peter', '2 Pedro', '2 Peter|2 Pet'], ['1JO', '1 John', '1 Juan', '1 John|1 Jn'], ['2JO', '2 John', '2 Juan', '2 John|2 Jn'],
  ['3JO', '3 John', '3 Juan', '3 John|3 Jn'], ['JUD', 'Jude', 'Judas', 'Jude'], ['REV', 'Revelation', 'Apocalipsis', 'Revelation|Rev'],
].map(([code, en, es, forms]) => ({ code, en, es, forms: forms.split('|') }));

/**
 * eBible.org's chapter pages use USFM book codes, which differ from the VPL
 * file's for these books, and pad the chapter: GEN01, PSA008, JHN10.
 */
const USFM: Record<string, string> = { JOH: 'JHN', MAR: 'MRK', JAM: 'JAS', PHI: 'PHP', EZE: 'EZK', JOE: 'JOL', NAH: 'NAM', SOL: 'SNG', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN' };
export const chapterPage = (code: string, chapter: number) =>
  `${USFM[code] ?? code}${String(chapter).padStart(code === 'PSA' ? 3 : 2, '0')}.htm`;

const FORM_TO_CODE =new Map(BOOKS.flatMap((b) => b.forms.map((f) => [f.toLowerCase(), b.code] as const)));
// Longest first, so "1 Cor" wins over "Cor" and "Psalms" over "Ps".
const FORM_RE = [...FORM_TO_CODE.keys()].sort((a, b) => b.length - a.length)
  .map((f) => f.replace(/ /g, '\\s?').replace(/\./g, '\\.')).join('|');

/**
 * A whole chapter cited with no verse ("Romans 13") is only taken for full
 * book names that are not also ordinary words, so "Job 2" or "Acts 3" in prose
 * is never read as scripture.
 */
const CHAPTER_ONLY_OK = new Set(['GEN', 'EXO', 'LEV', 'DEU', 'PSA', 'ISA', 'JER', 'EZE', 'MAT', 'LUK', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHI', 'COL', 'HEB']);

// One verse list: 4, 4-6, 4, 10, 12. Stops before "20:25" (a new chapter).
// (?!\d) keeps a number whole, so "22,23:" cannot backtrack to "22,2"; a new
// chapter is a number, a colon and a digit, so the colon in "Exodus 21:22,23:
// “The fetus..." is punctuation.
const VLIST = String.raw`\d{1,3}(?!\d)(?:\s?[-–]\s?\d{1,3}(?!\d))?(?:\s?,\s?\d{1,3}(?!\d)(?:\s?[-–]\s?\d{1,3}(?!\d))?(?!\s?:\s?\d))*`;
// ":\s?" because the AME prints "Deuteronomy 10: 18-19".
const REF_RE = new RegExp(String.raw`\b(${FORM_RE})\.?\s?(\d{1,3})(?::\s?(${VLIST}))?((?:\s?[,;]\s?\d{1,3}:\s?${VLIST})*)`, 'gi');

export interface Ref {
  /** As the source printed it (after any FIXES). */
  asWritten: string;
  code: string;
  chapter: number;
  /** Inclusive ranges; empty for a whole chapter. */
  ranges: [number, number][];
}

const parseVerses = (s: string): [number, number][] => s.split(',').map((part) => {
  const [a, b] = part.split(/[-–]/).map((x) => Number(x.trim()));
  return [a, b ?? a] as [number, number];
});

/** Every reference in a text, in order. */
export function findRefs(text: string): Ref[] {
  const out: Ref[] = [];
  for (const m of text.matchAll(REF_RE)) {
    const code = FORM_TO_CODE.get(m[1].replace(/\s+/g, ' ').toLowerCase())!;
    const chapter = Number(m[2]);
    if (!m[3] && !CHAPTER_ONLY_OK.has(code)) continue;
    if (!m[3] && !/^[A-Z][a-z]{3,}$/.test(m[1])) continue; // a whole chapter only with the book spelled out
    // "Matthew 4:23; 9:35-38" is two references; the first is written without
    // what follows it.
    out.push({ asWritten: m[0].slice(0, m[0].length - (m[4] ?? '').length).trim(), code, chapter, ranges: m[3] ? parseVerses(m[3]) : [] });
    for (const c of (m[4] ?? '').matchAll(new RegExp(String.raw`(\d{1,3}):\s?(${VLIST})`, 'g'))) {
      out.push({ asWritten: `${m[1]} ${c[0]}`, code, chapter: Number(c[1]), ranges: parseVerses(c[2]) });
    }
  }
  return out;
}

/**
 * Reference forms the PDF text layer garbled. Each is the exact text in the
 * downloaded file, what the printed page shows, and why.
 */
export const FIXES: { file: string; garbled: string; fixed: string; why: string }[] = [
  { file: 'usccb_fcfc_2023_action.txt', garbled: 'Eph. 4:2947 32', fixed: 'Eph. 4:29-32', why: 'The PDF prints line number 47 inside the reference and its text layer drops the hyphen.' },
  { file: 'usccb_fcfc_2019.txt', garbled: 'Lk 6:3638', fixed: 'Lk 6:36-38', why: 'The PDF text layer drops the hyphen in "6:36-38".' },
  { file: 'usccb_special_message_2025.txt', garbled: 'Luke 10:30– 37', fixed: 'Luke 10:30-37', why: 'The PDF breaks "10:30-37" across two lines of a narrow column.' },
];

// --- the Bibles ------------------------------------------------------------

function loadVpl(id: string): Map<string, string> {
  const path = join(BIBLE_DIR, id, `${id}_vpl.txt`);
  if (!existsSync(path)) throw new Error(`missing ${path}; download https://ebible.org/Scriptures/${id}_vpl.zip and unzip it into ${join(BIBLE_DIR, id)}`);
  const m = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const hit = /^(\S+ \d+:\d+) (.*)$/.exec(line);
    if (hit) m.set(hit[1], hit[2].trim());
  }
  return m;
}

export const TRANSLATIONS = {
  web: { name: 'World English Bible', license: 'Public domain', source: 'https://ebible.org/find/details.php?id=eng-web', chapterUrl: 'https://ebible.org/eng-web/' },
  rv1909: { name: 'Reina-Valera 1909', license: 'Public domain', source: 'https://ebible.org/find/details.php?id=spaRV1909', chapterUrl: 'https://ebible.org/spaRV1909/' },
};

// --- sections of a multi-issue document --------------------------------------

/** The document split into its own sections, as plain text. */
function sectionsOf(file: string, html?: string): string[] {
  if (html) {
    // A web page: split at its headings and at the named anchors its own
    // table of contents links to (umc.org marks subsections that way, as
    // <a name="death-penalty">, not with heading tags).
    const raw = readFileSync(join(FAITH_SOURCE_DIR, html), 'utf8');
    return raw.split(/<h[1-4][^>]*>|<a name="/i).map((s) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' '));
  }
  if (file === 'usccb_fcfc_2019.txt') {
    // Numbered paragraphs, kept only where the numbers run in sequence, so a
    // stray "no. 38." in a citation does not start a section.
    const t = readFileSync(join(FAITH_SOURCE_DIR, file), 'utf8').replace(/\s+/g, ' ');
    const cuts: number[] = [];
    let next = 1;
    for (const m of t.matchAll(/(?<=\s)(\d{1,3})\.\s(?=[A-Z“"])/g)) {
      if (Number(m[1]) === next) { cuts.push(m.index!); next++; }
    }
    if (next < 80) throw new Error(`usccb_fcfc_2019: found only ${next - 1} numbered paragraphs`);
    return [0, ...cuts].map((c, i) => t.slice(c, cuts[i] ?? t.length));
  }
  if (file === 'usccb_fcfc_2023_action.txt') {
    // The note has no headings or numbers. In the PDF's layout text each line
    // starts with its line number, and a paragraph's first line is indented
    // after it.
    const pdf = join(FAITH_SOURCE_DIR, 'usccb_fcfc_2023_action.pdf');
    const layout = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8', maxBuffer: 1 << 24 });
    const paras: string[] = [];
    for (const line of layout.split(/\r?\n/)) {
      const m = /^\s*(\d{1,3})(\s+)(.*)$/.exec(line);
      if (!m) { if (line.trim() && paras.length) paras[paras.length - 1] += ` ${line.trim()}`; continue; }
      if (m[2].length >= 2 || !paras.length) paras.push(m[3]); else paras[paras.length - 1] += ` ${m[3]}`;
    }
    if (paras.length < 20) throw new Error(`usccb_fcfc_2023: found only ${paras.length} paragraphs`);
    return paras;
  }
  throw new Error(`${file} is cited for several issues but has no rule for its sections`);
}

// --- the extraction ----------------------------------------------------------

export const statementKey = (s: Pick<Statement, 'traditionId' | 'issueId' | 'sourceDate'>) => `${s.traditionId}.${s.issueId}.${s.sourceDate}`;
const fixed = (file: string, text: string) => FIXES.filter((f) => f.file === file).reduce((t, f) => t.split(f.garbled).join(f.fixed), text);

export function extract() {
  const web = loadVpl('eng-web');
  const rv = loadVpl('spaRV1909');
  const issuesOf = new Map<string, Set<string>>();
  for (const s of STATEMENTS) {
    if (!issuesOf.has(s.sourceUrl)) issuesOf.set(s.sourceUrl, new Set());
    issuesOf.get(s.sourceUrl)!.add(s.issueId);
  }
  // Every FIX must still match its file, or it is fixing nothing.
  for (const f of FIXES) {
    if (!readFileSync(join(FAITH_SOURCE_DIR, f.file), 'utf8').replace(/\s+/g, ' ').includes(f.garbled)) throw new Error(`FIX for "${f.garbled}" no longer matches ${f.file}`);
  }

  const verses: Record<string, { web: string; rv1909: string }> = {};
  const problems: string[] = [];
  const citations = STATEMENTS.map((s) => {
    const src = FAITH_SOURCE_FILES[s.sourceUrl];
    if (!src) throw new Error(`no downloaded source mapped for ${s.sourceUrl}`);
    let text: string;
    let scope: 'whole document' | 'same section as the excerpt';
    if (issuesOf.get(s.sourceUrl)!.size === 1) {
      text = readFileSync(join(FAITH_SOURCE_DIR, src.file), 'utf8');
      scope = 'whole document';
    } else {
      const want = normForMatch(s.excerpt);
      const strip = (t: string) => (src.lineNumbers ? t.replace(/(?<=\s)\d{1,3}(?=\s)/g, ' ') : t);
      const hits = sectionsOf(src.file, src.html).filter((sec) => normForMatch(strip(sec)).includes(want));
      if (hits.length !== 1) throw new Error(`${statementKey(s)}: the excerpt is in ${hits.length} sections of ${src.file}, not exactly one`);
      text = hits[0];
      scope = 'same section as the excerpt';
    }
    const seen = new Set<string>();
    const refs = findRefs(fixed(src.file, text.replace(/\s+/g, ' '))).filter((r) => {
      const id = `${r.code} ${r.chapter}:${r.ranges.map((x) => x.join('-')).join(',')}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).map((r) => {
      const named = r.ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => `${r.code} ${r.chapter}:${a + i}`));
      // A verse the source names that the Bible does not have (the SBC's 2006
      // resolution cites Genesis 1:32; the chapter has 31) is shown as the
      // source wrote it and noted, not corrected. A reference with no real
      // verse at all, or a chapter that does not exist, is a parsing error.
      const notInBible = named.filter((k) => !web.has(k) && !rv.has(k));
      const oneSided = named.filter((k) => web.has(k) !== rv.has(k));
      if (oneSided.length) problems.push(`${statementKey(s)}: "${r.asWritten}" names ${oneSided.join(', ')}, in one Bible but not the other`);
      if (named.length && notInBible.length === named.length) problems.push(`${statementKey(s)}: "${r.asWritten}" names no verse that exists`);
      if (!named.length && !web.has(`${r.code} ${r.chapter}:1`)) problems.push(`${statementKey(s)}: "${r.asWritten}" names a chapter that does not exist`);
      const keys = named.filter((k) => !notInBible.includes(k));
      const withText = keys.length > 0 && named.length <= MAX_VERSES_WITH_TEXT;
      if (withText) for (const k of keys) verses[k] = { web: web.get(k)!, rv1909: rv.get(k)! };
      const chapterLength = [...web.keys()].filter((k) => k.startsWith(`${r.code} ${r.chapter}:`)).length;
      return { ...r, chapterPage: chapterPage(r.code, r.chapter), verseKeys: withText ? keys : [], verseCount: named.length, notInBible, ...(notInBible.length ? { chapterLength } : {}) };
    });
    return { statement: statementKey(s), scope, refs };
  });

  // The platforms, searched the same way, whole.
  const platformUrls = [...new Set(PLANKS.map((p) => p.sourceUrl))];
  const platforms = Object.fromEntries(platformUrls.map((u) => {
    const f = FAITH_SOURCE_FILES[u].file;
    return [u, findRefs(readFileSync(join(FAITH_SOURCE_DIR, f), 'utf8').replace(/\s+/g, ' ')).length];
  }));

  if (problems.length) throw new Error(`references that name no verse:\n  ${problems.join('\n  ')}`);
  return { translations: TRANSLATIONS, maxVersesWithText: MAX_VERSES_WITH_TEXT, fixes: FIXES, citations, verses, platformReferenceCounts: platforms };
}

function main(): void {
  const out = extract();
  writeFileSync(VERSES_FILE, JSON.stringify(out, null, 1) + '\n');
  const n = out.citations.reduce((a, c) => a + c.refs.length, 0);
  console.log(`\n  verses.json  ${n} references in ${out.citations.filter((c) => c.refs.length).length} of ${out.citations.length} statements, ${Object.keys(out.verses).length} verses with text`);
  for (const c of out.citations) console.log(`  ${c.statement.padEnd(36)} ${String(c.refs.length).padStart(3)}  ${c.scope === 'whole document' ? '' : '(section) '}${c.refs.map((r) => r.asWritten).join(' | ')}`);
  console.log(`  platforms: ${Object.values(out.platformReferenceCounts).join(', ')} references\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
