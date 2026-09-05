/**
 * What the Governor did with each quiz bill.
 *
 *   npm run data:govacts
 *
 * WHY THIS EXISTS
 *
 * A reader asked why Dan Patrick appears all over the page and Greg Abbott
 * barely at all. She was right, and the numbers are stark: Patrick had eight
 * priority-bill designations attached to questions, Abbott had one veto. So the
 * Lieutenant Governor was represented by what he wanted PASSED and the Governor
 * only by what he KILLED — and on a page whose whole argument is that a record
 * should be shown both ways, that is an asymmetry that flatters neither.
 *
 * The Governor does have a positive instrument. Every bill that reaches him is
 * signed, vetoed, or allowed to become law without his signature, and the
 * Legislature publishes which on the bill's own history page. That is a
 * complete, authoritative, per-bill record — not a press release, not a
 * characterisation.
 *
 * THREE THINGS IT MUST NOT PRETEND
 *
 * 1. A signature is weak evidence. He signed 27 of the 32 bills that reached
 *    him. It says he did not object; it does not say he pushed.
 *
 * 2. Letting a bill become law unsigned has NO side. It is a deliberate refusal
 *    to endorse something he also declined to stop, and forcing it into
 *    for-or-against would invent a position. It carries position: null, and the
 *    reveal renders it as its own state — the same rule the candidate reveal
 *    already follows for a missing vote.
 *
 * 3. He had no opportunity on 35 of the 67. Those bills passed the House and
 *    died before reaching him, so his silence on them is not a choice. They get
 *    no act at all, and the page says how many rather than leaving a reader to
 *    infer that he ignored them.
 *
 * Source: the same cached bill-history pages fetched for the subject audit, so
 * this costs no new requests.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CACHE = 'data/cache/subjects';
const PAYLOAD = 'public/data/quiz_89R.json';
const OUT = 'data/gov_acts_89R.json';

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

/** The date printed immediately before an action phrase, if there is one. */
function dateFor(t, phrase) {
  const at = t.search(phrase);
  if (at < 0) return null;
  const before = t.slice(Math.max(0, at - 90), at);
  const dates = [...before.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)];
  return dates.length ? dates[dates.length - 1][1] : null;
}

const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
const out = [];
const tally = { signed: 0, unsigned: 0, vetoed: 0, neverReached: 0, noPage: 0 };

for (const it of payload.items) {
  const f = `${CACHE}/${slug(it.billId)}.html`;
  if (!existsSync(f)) { tally.noPage++; continue; }
  const t = text(readFileSync(f, 'utf8'));
  const url = `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=${slug(it.billId)}`;

  let kind = null, when = null;
  if (/Vetoed by the Governor/i.test(t)) {
    kind = 'veto'; when = dateFor(t, /Vetoed by the Governor/i);
  } else if (/Filed without the Governor'?s signature/i.test(t)) {
    kind = 'became_law_unsigned'; when = dateFor(t, /Filed without the Governor'?s signature/i);
  } else if (/Signed by the Governor/i.test(t)) {
    kind = 'signed'; when = dateFor(t, /Signed by the Governor/i);
  }

  if (!kind) {
    // Never reached him. Recorded so the count can be stated rather than
    // leaving a reader to read silence as a position.
    tally.neverReached++;
    out.push({ billId: it.billId, kind: null, reachedGovernor: false, sourceUrl: url });
    continue;
  }

  tally[kind === 'veto' ? 'vetoed' : kind === 'signed' ? 'signed' : 'unsigned']++;
  out.push({
    billId: it.billId,
    kind,
    reachedGovernor: true,
    // Signing means he did not object. It does not mean he pushed, and letting
    // a bill become law unsigned is neither support nor opposition.
    position: kind === 'signed' ? 1 : kind === 'veto' ? -1 : null,
    date: when,
    sourceUrl: url,
  });
}

writeFileSync(OUT, JSON.stringify({
  session: payload.session,
  generated: new Date().toISOString().slice(0, 10),
  who: 'Greg Abbott',
  office: 'Governor',
  source: 'https://capitol.texas.gov/BillLookup/History.aspx',
  note: 'Signed / vetoed / became law without signature, per the Legislature\'s own bill history. ' +
    'A signature is weak evidence — he signed 27 of the 32 bills that reached him. Becoming law ' +
    'unsigned carries no position. 35 bills never reached him and get no act.',
  tally,
  items: out,
}, null, 2), 'utf8');

console.log('');
console.log(`  reached the Governor        ${tally.signed + tally.unsigned + tally.vetoed}`);
console.log(`    signed                    ${tally.signed}`);
console.log(`    became law unsigned       ${tally.unsigned}   (no side — recorded as such)`);
console.log(`    vetoed                    ${tally.vetoed}`);
console.log(`  never reached him           ${tally.neverReached}   (no act; he had no opportunity)`);
if (tally.noPage) console.log(`  no cached bill page         ${tally.noPage}`);
console.log(`\n  -> ${OUT}\n`);
