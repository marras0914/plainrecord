/**
 * Every bill link must reach the right bill.
 *
 *   node scripts/check_bill_links.mjs            # sample, fast
 *   node scripts/check_bill_links.mjs --all      # all 67, slow and polite
 *
 * A reader asked for the full text of the bills, because a one-line caption
 * often does not say what a bill actually does. The site answers that by
 * linking each question to its page on Texas Legislature Online, which carries
 * the text, the analyses and the history from the authority itself.
 *
 * THE STATUS CODE IS WORTHLESS HERE, AND THAT IS THE WHOLE REASON THIS FILE
 * EXISTS. capitol.texas.gov answers a request for SB99999 with **HTTP 200** and
 * a page reading "does not exist". A checker that asserted `res.ok` would pass
 * on every broken link we could possibly ship. So each link is verified by
 * CONTENT: the page must contain a distinctive slice of that bill's own
 * caption, taken from our payload rather than typed here.
 *
 * The control below proves that test can fail, by running the same assertion
 * against a bill number that does not exist and requiring it to come back
 * false. Without that, "all 67 matched" would be an untested claim about a
 * matcher nobody had ever seen reject anything.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = join(ROOT, 'public', 'data', 'quiz_89R.json');
const all = process.argv.includes('--all');

const data = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
const SESSION = data.session ?? '89R';

let pass = 0;
let fail = 0;
const bad = [];

const ok = (l, d = '') => { pass++; console.log(`  [PASS] ${l}${d ? '  — ' + d : ''}`); };
const no = (l, d = '') => { fail++; bad.push(l + (d ? ' — ' + d : '')); console.log(`  [FAIL] ${l}${d ? '  — ' + d : ''}`); };

/** The URL the page will build. Kept here so the check tests the real rule. */
export const billUrl = (billId, session = SESSION) =>
  `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=${session}&Bill=${billId.replace(/\s+/g, '')}`;

/**
 * A distinctive slice of the bill's caption, for matching against the page.
 * Derived from the payload, never typed: a hand-written needle would go stale
 * the moment a caption changed and would then match nothing, which passes as
 * "no error" in a naive checker.
 */
function needle(caption) {
  const clean = caption.replace(/\s+/g, ' ').trim();
  // Skip the near-universal "Relating to " opener, which is not distinctive.
  const body = clean.replace(/^Relating to (the )?/i, '');
  return body.slice(0, 40);
}

/** Does the page at `url` actually carry `text`? */
async function pageContains(url, text) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'rightnleft-link-check (+https://rightnleft.com)' },
    redirect: 'follow',
  });
  const html = await res.text();
  const flat = html.replace(/\s+/g, ' ');
  return { status: res.status, hit: flat.toLowerCase().includes(text.toLowerCase()), bytes: html.length };
}

console.log(`\n  Texas Legislature Online, session ${SESSION}\n`);

// ---------------------------------------------------------------------------
// CONTROL FIRST. If a nonexistent bill "passes", nothing below means anything.
// ---------------------------------------------------------------------------

const bogus = await pageContains(billUrl('SB 99999'), needle(data.items[0].caption));
ok('CONTROL: a nonexistent bill still answers 200', `status ${bogus.status}, so status is not evidence`);
if (bogus.hit) {
  no('CONTROL: the matcher must NOT match a nonexistent bill', 'it matched — every result below is void');
  console.log('\n  Aborting: the content matcher is not discriminating.\n');
  process.exit(1);
}
ok('CONTROL: the matcher rejects a nonexistent bill', 'so a match below is meaningful');

// ---------------------------------------------------------------------------

const items = all ? data.items : data.items.filter((_, i) => i % 9 === 0);
console.log(`\n  checking ${items.length} of ${data.items.length} bill(s)${all ? '' : ' — pass --all for every one'}\n`);

for (const it of items) {
  const url = billUrl(it.billId);
  const want = needle(it.caption);
  try {
    const r = await pageContains(url, want);
    if (r.hit) ok(`${it.billId} reaches its own bill`, `"${want}…"`);
    else no(`${it.billId} does NOT carry its caption`, `status ${r.status}, ${r.bytes}b, wanted "${want}…"`);
  } catch (e) {
    no(`${it.billId} could not be fetched`, String(e).slice(0, 90));
  }
  // Polite to a state server, and this is not a load test.
  await new Promise((r) => setTimeout(r, 350));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  Failures:');
  for (const f of bad) console.log('   - ' + f);
  console.log('\n  Do NOT ship a link that does not reach its bill. A reader who clicks');
  console.log('  through to the wrong record is worse served than one who cannot click.\n');
}
process.exit(fail ? 1 : 0);
