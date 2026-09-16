/**
 * Seed i18n/plain_89R.json — the source of truth for plain-language questions.
 *
 * 7 of 67 items have a plain rewrite. The other 60 are asked in the bill's
 * official caption, which is a legal title: "Relating to information regarding
 * perinatal palliative care; creating an administrative penalty" tells a reader
 * nothing about who must do what.
 *
 * Every summary written here has to be checkable against a source, in both
 * languages, before it ships. So this file carries, for each item:
 *
 *   en / es      the summary, empty until written
 *   status       "draft" until a human approves it; nothing else ships
 *   source       the URL of the official analysis it was written from
 *   operative    the excerpt of that analysis describing what the bill DOES
 *   sponsorsCase the sponsor's own framing, kept ONLY so a reviewer can see
 *                what was deliberately not used
 *
 * The last two are the point. A summary written from the caption alone would be
 * invention; a summary written from the sponsor's statement would be the
 * pre-framing this whole project exists to avoid.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = 'i18n/plain_89R.json';
const ANALYSES = 'data/bill_analyses_89R.json';
const PAYLOAD = 'public/data/quiz_89R.json';
const SIDECAR = 'public/data/quiz_89R.es.json';

const analyses = JSON.parse(readFileSync(ANALYSES, 'utf8'));
const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
const sidecar = JSON.parse(readFileSync(SIDECAR, 'utf8'));

const byBill = new Map(analyses.items.map((a) => [a.billId, a]));
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { items: {} };

const items = {};
let approved = 0, drafts = 0, noSource = 0;

for (const it of payload.items) {
  const a = byBill.get(it.billId);
  const prior = existing.items?.[it.billId];
  const esExisting = sidecar.items?.[it.billId]?.plain ?? '';

  // The seven that already exist are already approved: they shipped, and a
  // reader has been reading them since the site went up.
  const shipped = Boolean(it.plain);

  const entry = {
    category: it.category,
    caption: it.caption,
    en: prior?.en ?? it.plain ?? '',
    es: prior?.es ?? esExisting,
    status: prior?.status ?? (shipped ? 'ok' : 'draft'),
    // The analysis if the Legislature published one, otherwise the bill's own
    // page, which always exists and carries the full text.
    //
    // HJR 218 has no analysis: constitutional amendments often do not get one.
    // Falling through to null made it the only approved item with no source at
    // all, which `plain:check` rightly refuses, since an approved summary with
    // nothing to check it against is just an assertion. The bill page is a
    // weaker source than an analysis and it is a real one.
    source: a?.url ?? `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=${payload.session}&Bill=${it.billId.replace(/\s+/g, '')}`,
    // Was 900, which threw away two thirds of what the fetch had already kept.
    //
    // The old comment said a reviewer needs enough to check a 25-word summary
    // against, not the whole document. That was right about the whole document
    // and wrong about 900 characters: a section-by-section analysis spends its
    // opening on citation and legislative findings, so 900 characters often ran
    // out before reaching a single operative change. A reviewer asking "does
    // this summary say what the bill DOES" was being shown the part that says
    // what the bill is CALLED.
    //
    // 3000 is what fetch_analyses keeps, so this no longer discards anything we
    // have. The URL is still there for the rest.
    operative: (a?.describes ?? '').slice(0, 3000),
    sponsorsCase: (a?.sponsorsCase ?? '').slice(0, 400),
  };
  if (entry.status === 'ok') approved++; else drafts++;
  if (!entry.source) noSource++;
  items[it.billId] = entry;
}

writeFileSync(OUT, JSON.stringify({
  _meta: {
    what: 'Plain-language rewrites of the quiz questions, in both languages.',
    rule: 'Written from the operative section of the official bill analysis, never from the ' +
      'caption alone and never from the sponsor\'s statement of intent. status must be "ok" ' +
      'before an entry ships; scripts/add_plain.mjs refuses drafts.',
    source: 'https://capitol.texas.gov/tlodocs/89R/analysis/html/',
  },
  session: payload.session,
  items,
}, null, 2), 'utf8');

console.log(`\n  ${Object.keys(items).length} items written to ${OUT}`);
console.log(`    already approved and shipping   ${approved}`);
console.log(`    drafts awaiting a summary       ${drafts}`);
console.log(`    with no official analysis       ${noSource}`);
const noOp = Object.entries(items).filter(([, v]) => v.status === 'draft' && v.operative.length < 200);
console.log(`    drafts with too little source text to write from: ${
  noOp.length ? noOp.map(([k]) => k).join(', ') : 'none'}\n`);
