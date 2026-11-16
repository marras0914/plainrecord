/**
 * PlainRecord: every resolution of the Jewish bodies the faith pages count
 *
 *   npm run data:jewish
 *
 * Which bodies count was decided 15 Nov 2026 (FAITH.md, "Judaism"): Reform =
 * URJ and CCAR; Conservative = the Rabbinical Assembly; Orthodox = the
 * Orthodox Union. This script lists the resolutions of the three with an
 * online library (the OU's standing positions are one PDF, read by hand) and
 * writes data/faith/jewish_resolutions.json:
 * body, title, date and URL for each, nothing else. Committed, so the build
 * never calls these sites. faith_positions.ts lists a tradition's earlier
 * statements on an issue from it by title (ISSUE_TITLE_TERMS), as it does
 * for the SBC.
 *
 * It also saves the text of every resolution whose title matches an issue to
 * data/faith_sources/jewish/ (gitignored), for the quote check and the
 * citation list.
 *
 * Where each library comes from:
 *   URJ   urj.org/what-we-believe/resolutions?page=N, "Year Adopted" per item.
 *   CCAR  ccarnet.org/ccar-resolutions/page/N/, which prints each resolution
 *         in full; the date is the first "Month D, YYYY" in it, else a year in
 *         the title.
 *   RA    rabbinicalassembly.org/about-us/search-past-resolutions?page=N; the
 *         index has no dates, so each resolution's page is read for its date.
 *
 * The Rabbinical Council of America was counted for Orthodox Judaism for a
 * few hours on 15 Nov 2026, then dropped: Marco chose the Orthodox Union alone.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORK_DIR } from './paths';
import { FAITH_SOURCE_DIR } from './faith_sources';
import { ISSUE_TITLE_TERMS } from '../faith_positions';

export const JEWISH_FILE = join(WORK_DIR, 'faith', 'jewish_resolutions.json');
export const JEWISH_TEXT_DIR = join(FAITH_SOURCE_DIR, 'jewish');
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

export type JewishBody = 'urj' | 'ccar' | 'ra';
export interface JewishResolution { body: JewishBody; title: string; date: string; url: string }

const MONTHS ='January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_RE = new RegExp(`\\b(${MONTHS}) (\\d{1,2}), (\\d{4})\\b`);
const isoOf = (m: RegExpMatchArray) => `${m[3]}-${String(MONTHS.split('|').indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;

const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
  .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&hellip;/g, '…');
/** HTML to text, one paragraph per line. */
export const textOf = (html: string) => decode(html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
  .replace(/<\/(p|h\d|li|div|tr|blockquote)>|<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ''))
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
const oneLine = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    let r: Response;
    try { r = await fetch(url, { headers: UA }); }
    catch (e) {
      // A dropped connection ("fetch failed", 15 Nov 2026 on ccarnet.org).
      if (attempt >= 3) throw new Error(`${url}: ${(e as Error).message}`);
      await sleep(3000 * attempt);
      continue;
    }
    if (r.ok) { await sleep(300); return r.text(); }
    if (attempt >= 3 || r.status < 500) throw new Error(`${url}: HTTP ${r.status}`);
    await sleep(3000 * attempt);
  }
}

const onAnIssue = (title: string) => Object.values(ISSUE_TITLE_TERMS).some((re) => re.test(title));
const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').pop()!.slice(0, 120);
function saveText(body: JewishBody, url: string, text: string) {
  mkdirSync(join(JEWISH_TEXT_DIR, body), { recursive: true });
  writeFileSync(join(JEWISH_TEXT_DIR, body, `${slugOf(url)}.txt`), text + '\n');
}
/** Where the quote check finds a saved resolution's text. */
export const jewishTextFile = (body: JewishBody, url: string) => join('jewish', body, `${slugOf(url)}.txt`);

async function urj(): Promise<JewishResolution[]> {
  const out: JewishResolution[] = [];
  for (let page = 0; ; page++) {
    const html = await get(`https://urj.org/what-we-believe/resolutions?page=${page}`);
    const items = [...html.matchAll(/<h3 class="node__title[^"]*">\s*<a href="(\/what-we-believe\/resolutions\/[^"]+)"[^>]*>\s*<span>([\s\S]*?)<\/span>[\s\S]*?<time datetime="(\d{4})/g)];
    if (!items.length) break;
    for (const m of items) out.push({ body: 'urj', title: oneLine(m[2]), date: m[3], url: `https://urj.org${m[1]}` });
    process.stderr.write(`  urj page ${page}: ${out.length}\n`);
  }
  for (const r of out.filter((r) => onAnIssue(r.title))) {
    const html = await get(r.url);
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    saveText('urj', r.url, textOf(main));
  }
  return out;
}

async function ccar(): Promise<JewishResolution[]> {
  const out: JewishResolution[] = [];
  // The archive lists some resolutions twice, once under an index-style title
  // ("Ethiopian Immigrants, Absorption of"), with the same text. One is kept.
  const byText = new Map<string, number>();
  const indexStyle = (t: string) => /, see |, (?:[A-Z][\w’']*\s?)*(?:of|on|to|for|in)$|, Resolution on$|, Ending$/.test(t);
  for (let page = 1; ; page++) {
    let html: string;
    try { html = await get(page === 1 ? 'https://www.ccarnet.org/ccar-resolutions/' : `https://www.ccarnet.org/ccar-resolutions/page/${page}/`); }
    catch (e) { if (/HTTP 404/.test((e as Error).message)) break; throw e; }
    const articles = html.split(/<article id="post-\d+" class="[^"]*cpt_resolutions/).slice(1);
    for (const a of articles) {
      const m = a.match(/<h1 class="entry-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!m) continue;
      const body = a.slice(a.indexOf('<div class="entry-content">'), a.indexOf('</article>'));
      const text = textOf(body);
      // Date: a full date in the text; else the year in its convention header
      // ("Adopted by the CCAR at the 90th Annual Convention ... 1979"); else
      // the last year in the URL ("abortion-1889-1972", a digest, is 1972).
      const d = text.match(DATE_RE);
      // A digest ("adopted ... between 1889 and 1974") is dated by its last year.
      const head = text.slice(0, 400).match(/between \d{4} and (\d{4})/) ?? text.slice(0, 400).match(/\b(18[89]\d|19\d\d|20[0-2]\d)\b/);
      const slugYears = m[1].match(/(18[89]\d|19\d\d|20[0-2]\d)/g);
      const date = d ? isoOf(d) : head ? head[1] : slugYears ? slugYears[slugYears.length - 1] : '';
      let title = oneLine(m[2]);
      // A pointer title ("Hyde Amendment, see Abortion") is replaced by the
      // resolution's own heading, the line after "Resolution Adopted by the CCAR".
      if (/, see /.test(title)) {
        const lines = text.split('\n');
        const at = lines.findIndex((l) => /adopted\s*by the ccar$/i.test(l));
        if (at >= 0 && lines[at + 1]) title = lines[at + 1];
      }
      const r: JewishResolution = { body: 'ccar', title, date, url: m[1] };
      const key = text.replace(/\s+/g, ' ').toLowerCase().replace(/^.*?adopted\s*by\s*the\s*ccar/, '').slice(0, 3000);
      const dup = byText.get(key);
      if (dup !== undefined) {
        if (indexStyle(out[dup].title) && !indexStyle(title)) {
          out[dup] = r;
          if (onAnIssue(r.title)) saveText('ccar', r.url, text);
        }
        continue;
      }
      byText.set(key, out.length);
      out.push(r);
      if (onAnIssue(r.title)) saveText('ccar', r.url, text);
    }
    process.stderr.write(`  ccar page ${page}: ${out.length}\n`);
  }
  return out;
}

async function ra(): Promise<JewishResolution[]> {
  const seen = new Map<string, string>();
  for (let page = 0; ; page++) {
    const html = await get(`https://rabbinicalassembly.org/about-us/search-past-resolutions?page=${page}`);
    // Older resolutions sit at /resolution-... or /node/NNN, not /resolutions/.
    const items = [...html.matchAll(/<a href="(\/[^"]+)" rel="bookmark"><span[^>]*>([\s\S]*?)<\/span>/g)];
    if (!items.length) break;
    for (const m of items) seen.set(`https://rabbinicalassembly.org${m[1]}`, oneLine(m[2]));
    process.stderr.write(`  ra page ${page}: ${seen.size}\n`);
  }
  const out: JewishResolution[] = [];
  const texts = new Set<string>();
  for (const [url, title] of seen) {
    const html = await get(url);
    let text = textOf(html.slice(html.indexOf('<h1'), html.indexOf('</main>') > 0 ? html.indexOf('</main>') : undefined));
    // The site's donation footer follows every resolution.
    const foot = text.search(/\n[^\n]*Every single donation you make/);
    if (foot > 0) text = text.slice(0, text.lastIndexOf('\n', foot - 1) > 0 ? text.lastIndexOf('\n', foot - 1) : foot);
    // The same resolution posted twice ("...-united-states" and "...-0").
    const key = text.replace(/\s+/g, ' ').toLowerCase();
    if (texts.has(key)) continue;
    texts.add(key);
    // The date: many older resolutions show June 2011 at the top, which is
    // when they were posted; their own closing line gives when they were
    // adopted ("Passed by the Rabbinical Assembly Plenum, March, 2006"), and
    // that wins. Then a year in the title ("Reproductive Freedom (1993)",
    // shown with a 2017 date). Else the date at the top.
    const d = text.slice(0, 400).match(DATE_RE);
    const passed = text.slice(-400).match(/(?:passed|adopted|approved)\b[^\n]{0,120}?\b(19\d\d|20[0-2]\d)\b/i);
    const y = title.match(/\((19\d\d|20[0-2]\d)\)/);
    out.push({ body: 'ra', title, date: passed ? passed[1] : y ? y[1] : d ? isoOf(d) : '', url });
    if (onAnIssue(title)) saveText('ra', url, text);
  }
  return out;
}

async function main(): Promise<void> {
  const only = process.argv[2] as JewishBody | undefined;
  const prev: JewishResolution[] = existsSync(JEWISH_FILE) ? JSON.parse(readFileSync(JEWISH_FILE, 'utf8')).resolutions : [];
  const run = { urj, ccar, ra };
  const bodies = (only ? [only] : Object.keys(run)) as JewishBody[];
  let all = prev.filter((r) => r.body in run && !bodies.includes(r.body));
  for (const b of bodies) {
    const got = await run[b]();
    const floor = { urj: 500, ccar: 500, ra: 100 }[b];
    if (got.length < floor) throw new Error(`${b}: only ${got.length} resolutions, expected at least ${floor}; something is wrong`);
    all = all.concat(got);
  }
  all.sort((a, b) => a.body.localeCompare(b.body) || b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  mkdirSync(join(WORK_DIR, 'faith'), { recursive: true });
  writeFileSync(JEWISH_FILE, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), resolutions: all }, null, 1) + '\n');
  const n = (b: string) => all.filter((r) => r.body === b).length;
  console.log(`\n  wrote ${all.length} resolutions to ${JEWISH_FILE}: urj ${n('urj')}, ccar ${n('ccar')}, ra ${n('ra')}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\n  ${e.message}\n`); process.exitCode = 1; });
}
