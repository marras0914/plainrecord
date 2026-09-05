/**
 * Official Texas bill analyses, for writing the plain-language questions.
 *
 * WHY THIS EXISTS
 *
 * 7 of the 67 quiz items have a plain-language rewrite; the other 60 are asked
 * in the bill's official caption, which is the legal title and frequently says
 * nothing about what the bill does. "Relating to information regarding
 * perinatal palliative care; creating an administrative penalty" does not tell
 * a reader who has to provide that information, to whom, or when.
 *
 * Writing a plain summary from a caption alone would therefore mean inventing
 * the parts the caption leaves out, on a site whose entire value is not doing
 * that. So the summaries are grounded in the official analysis the Legislature
 * publishes for each bill, which is a public document written to explain what
 * the bill does.
 *
 * WHICH SECTION, AND WHY IT MATTERS
 *
 * An analysis opens with "AUTHOR'S / SPONSOR'S STATEMENT OF INTENT", which is
 * the sponsor making their case — advocacy, in the sponsor's framing. The
 * section after it describes the operative changes. This script keeps both but
 * marks which is which, and the drafting rule is to use the descriptive
 * section: a quiz that asked its questions in the sponsor's words would be
 * exactly the pre-framing this project exists to avoid.
 *
 * Nothing here writes a summary. It gathers the source a human writes from, and
 * records the URL beside each one so any wording can be checked against it.
 *
 *   npm run data:analyses          # fetch and cache
 *   npm run data:analyses -- --refresh
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';

const CACHE = 'data/cache/analyses';
const OUT = 'data/bill_analyses_89R.json';
const PAYLOAD = 'public/data/quiz_89R.json';
const SESSION = '89R';

const refresh = process.argv.includes('--refresh');

/** "SB 1233" -> "SB01233". The site pads bill numbers to five digits. */
function slug(billId) {
  const m = /^([A-Z]+)\s*(\d+)$/.exec(billId.trim());
  if (!m) return null;
  return m[1] + String(m[2]).padStart(5, '0');
}

// Enrolled first: it describes the bill as actually passed, which is the thing
// the recorded vote was on. Earlier stages describe a version that may have
// been amended on the floor.
const STAGES = ['F', 'E', 'H', 'S', 'I'];

const url = (s, stage) =>
  `https://capitol.texas.gov/tlodocs/${SESSION}/analysis/html/${s}${stage}.htm`;

/** Strip tags, decode the handful of entities these documents use. */
function text(html) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ï¿½�]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split an analysis into the sponsor's case and the description of what the
 * bill does. Which one a summary is written from is the whole point.
 *
 * TWO FORMATS, and the first attempt found the operative section in exactly one
 * document out of 66 because it assumed only one:
 *
 *   Senate Research Center (37 of them) — AUTHOR'S / SPONSOR'S STATEMENT OF
 *   INTENT, closing with a standard neutral sentence ("H.B. 5138 amends current
 *   law relating to..."), then SECTION BY SECTION ANALYSIS written in operative
 *   verbs: Provides that, Requires, Authorizes, Prohibits.
 *
 *   House committee report (29) — BACKGROUND AND PURPOSE, then ANALYSIS. The
 *   heading is the bare word, which is also the second word of the document's
 *   own title, so a naive search for it lands on "BILL ANALYSIS" in the first
 *   line and returns the whole document.
 */
function sections(t) {
  const cut = (from, to) => {
    if (from < 0) return '';
    const stop = to > from ? to : t.length;
    return t.slice(from, stop).trim();
  };
  const endAt = (() => {
    const m = /\b(EFFECTIVE DATE|RULEMAKING AUTHORITY)\b/i.exec(t);
    return m ? m.index : -1;
  })();

  // The one neutral sentence the Senate format always writes, worth keeping on
  // its own: it is the closest thing to an official plain summary.
  const oneLine = (() => {
    const m = /((?:H\.?B\.?|S\.?B\.?|H\.?J\.?R\.?|S\.?J\.?R\.?)\s*\d+\s+amends[^.]{10,300}\.)/i.exec(t);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  })();

  const bg = t.search(/BACKGROUND AND PURPOSE/i);
  if (bg >= 0) {
    // House committee report. The ANALYSIS heading is the bare word and must
    // not be confused with the "BILL ANALYSIS" in the title line.
    const rest = t.slice(bg);
    const m = /(?<!BILL\s)\bANALYSIS\b/.exec(rest);
    const analysisAt = m ? bg + m.index : -1;
    return {
      intent: cut(bg, analysisAt > bg ? analysisAt : Math.min(t.length, bg + 2400)),
      describes: cut(analysisAt, endAt),
      oneLine,
    };
  }

  // Senate Research Center.
  const intentAt = t.search(/AUTHOR'?S?\s*\/?\s*SPONSOR'?S?\s*STATEMENT OF INTENT/i);
  const sbsAt = t.search(/SECTION BY SECTION ANALYSIS/i);
  return {
    intent: cut(intentAt, sbsAt > intentAt ? sbsAt : Math.min(t.length, intentAt + 2400)),
    describes: cut(sbsAt, endAt),
    oneLine,
  };
}

async function fetchOne(billId) {
  const s = slug(billId);
  if (!s) return { billId, ok: false, why: 'unrecognised bill id' };

  mkdirSync(CACHE, { recursive: true });
  const cached = `${CACHE}/${s}.html`;
  if (existsSync(cached) && !refresh) {
    const raw = readFileSync(cached, 'utf8');
    const stage = raw.slice(0, 200).match(/<!--stage:(\w)-->/)?.[1] ?? '?';
    return { billId, ok: true, stage, cached: true, ...sections(text(raw)), url: url(s, stage) };
  }

  for (const stage of STAGES) {
    let res;
    try { res = await fetch(url(s, stage)); } catch { continue; }
    if (!res.ok) continue;
    const raw = await res.text();
    const t = text(raw);
    // A 200 that is really a "not found" page has no analysis in it.
    if (!/BILL ANALYSIS/i.test(t) || t.length < 400) continue;
    writeFileSync(cached, `<!--stage:${stage}-->` + raw, 'utf8');
    return { billId, ok: true, stage, cached: false, ...sections(t), url: url(s, stage) };
  }
  return { billId, ok: false, why: 'no analysis published at any stage' };
}

// ---------------------------------------------------------------------------

const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
const items = payload.items;
console.log(`\n  ${items.length} quiz items, ${items.filter((i) => !i.plain).length} without a plain-language version\n`);

const out = [];
let got = 0, missing = 0, fromCache = 0;
for (const [n, it] of items.entries()) {
  const r = await fetchOne(it.billId);
  if (r.ok) {
    got++;
    if (r.cached) fromCache++;
    out.push({
      id: it.id, billId: it.billId, category: it.category,
      caption: it.caption,
      hasPlain: Boolean(it.plain),
      plain: it.plain ?? null,
      stage: r.stage, url: r.url,
      // Kept separate on purpose: one is the sponsor's case, the other is what
      // the bill does. Summaries get written from the second.
      sponsorsCase: r.intent.slice(0, 2000),
      // The Legislature's own one-sentence neutral description, where it wrote one.
      officialOneLine: r.oneLine ?? '',
      describes: r.describes.slice(0, 3000),
    });
  } else {
    missing++;
    out.push({
      id: it.id, billId: it.billId, category: it.category, caption: it.caption,
      hasPlain: Boolean(it.plain), plain: it.plain ?? null,
      stage: null, url: null, sponsorsCase: '', officialOneLine: '', describes: '', why: r.why,
    });
  }
  if ((n + 1) % 10 === 0) process.stdout.write(`  ${n + 1}/${items.length}\n`);
}

const usable = out.filter((o) => o.describes.length > 200);
writeFileSync(OUT, JSON.stringify({
  session: SESSION,
  generated: new Date().toISOString().slice(0, 10),
  source: 'https://capitol.texas.gov/tlodocs/' + SESSION + '/analysis/html/',
  note: 'Official bill analyses published by the Texas Legislature. Public documents. ' +
    'sponsorsCase is the author\'s statement of intent and is advocacy; describes is the ' +
    'operative description. Plain-language questions are written from the second.',
  items: out,
}, null, 2), 'utf8');

console.log(`\n  analyses found      ${got}/${items.length}  (${fromCache} from cache)`);
console.log(`  no analysis         ${missing}`);
console.log(`  with enough text to write from  ${usable.length}`);
console.log(`\n  -> ${OUT}  ${(statSync(OUT).size / 1024).toFixed(0)} KB\n`);
