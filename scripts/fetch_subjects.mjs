/**
 * The official subject list for each quiz bill, from Texas Legislature Online.
 *
 * WHY
 *
 * Four to six items on the page show a subject that is not what the bill is
 * about. HB 5138 — the attorney general's power to prosecute election crimes —
 * is labelled "Abortion".
 *
 * The label is not fabricated. The Legislature tags that bill with TEN subjects,
 * and Abortion is genuinely one of them. The defect is in how one is chosen:
 * categorize.ts picks the globally RAREST candidate category ("rarest-wins,
 * ties alphabetical"), which spreads the quiz across subjects nicely and, for
 * any bill with several subjects, systematically selects the least
 * representative one. The rarest label is by definition the most surprising,
 * and surprising is the opposite of what a subject line is for.
 *
 * Fixing that properly means re-running the ingest, which needs source data
 * that is not in this repo. So this script fetches the authoritative subject
 * list per bill straight from TLO, so a corrected category can be proposed and
 * reviewed against the real evidence rather than guessed.
 *
 *   npm run data:subjects
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SUBJECT_ROOT_MAP, subjectRoot } from '../categorize.ts';

const CACHE = 'data/cache/subjects';
const OUT = 'data/bill_subjects_89R.json';
const PAYLOAD = 'public/data/quiz_89R.json';
const refresh = process.argv.includes('--refresh');

const slug = (billId) => {
  const m = /^([A-Z]+)\s*(\d+)$/.exec(billId.trim());
  return m ? m[1] + m[2] : null;
};

const text = (html) => html
  .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;| /g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

/** The Subjects block runs from "Subjects:" to the next labelled block. */
function parseSubjects(t) {
  const at = t.search(/\bSubjects\s*:/i);
  if (at < 0) return [];
  const rest = t.slice(at + t.slice(at).indexOf(':') + 1);
  const stop = rest.search(/\b(Companions?|Companion|House Sponsor|Senate Sponsor|Last Action|Caption)\b/i);
  const block = stop > 0 ? rest.slice(0, stop) : rest.slice(0, 1200);
  // Each subject ends with its code, e.g. "Elections--General (I0310)".
  return [...block.matchAll(/([^()]+?)\s*\(([A-Z]\d{4})\)/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
mkdirSync(CACHE, { recursive: true });

const out = [];
let fetched = 0, cached = 0, none = 0;

for (const [n, it] of payload.items.entries()) {
  const s = slug(it.billId);
  const file = `${CACHE}/${s}.html`;
  let raw = null;

  if (existsSync(file) && !refresh) { raw = readFileSync(file, 'utf8'); cached++; }
  else {
    const url = `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=${s}`;
    try {
      const res = await fetch(url);
      if (res.ok) { raw = await res.text(); writeFileSync(file, raw, 'utf8'); fetched++; }
    } catch { /* recorded as none below */ }
  }

  const subjects = raw ? parseSubjects(text(raw)) : [];
  if (!subjects.length) none++;

  // The same mapping the pipeline uses, so the candidates here are exactly the
  // ones it was choosing between.
  const candidates = [...new Set(
    subjects.map((x) => SUBJECT_ROOT_MAP[subjectRoot(x)]).filter(Boolean),
  )];

  out.push({
    billId: it.billId,
    caption: it.caption,
    current: it.category,
    subjects,
    candidates,
    currentIsCandidate: candidates.includes(it.category),
  });
  if ((n + 1) % 20 === 0) process.stdout.write(`  ${n + 1}/${payload.items.length}\n`);
}

writeFileSync(OUT, JSON.stringify({
  session: payload.session,
  generated: new Date().toISOString().slice(0, 10),
  source: 'https://capitol.texas.gov/BillLookup/History.aspx',
  note: 'Official subject tags per bill. candidates are those subjects mapped through ' +
    'SUBJECT_ROOT_MAP, i.e. exactly the categories the pipeline was choosing between.',
  items: out,
}, null, 2), 'utf8');

const multi = out.filter((o) => o.candidates.length > 1);
console.log(`\n  ${out.length} bills   fetched ${fetched}, cached ${cached}, no subjects ${none}`);
console.log(`  bills with MORE THAN ONE candidate category: ${multi.length}`);
console.log(`  bills whose current category is not even a candidate: ${
  out.filter((o) => o.candidates.length && !o.currentIsCandidate).map((o) => o.billId).join(', ') || 'none'}`);
console.log(`\n  -> ${OUT}\n`);
