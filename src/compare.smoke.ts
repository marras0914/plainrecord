/**
 * PlainRecord — smoke suite for the blind compare
 *
 *   npx tsx src/compare.smoke.ts
 *
 * An invite link is forwarded to people who never visited the site and is
 * opened weeks after it was made, so two properties have to hold absolutely.
 *
 * A round trip must be exact for every possible answer set, all 2187 of them,
 * not a sample. If a code can decode one position off, a recipient is compared
 * against a person who never answered that way and nothing reports an error.
 *
 * The canonical order must be DERIVED, not inherited from the payload. Those
 * two orders differ today, and encoding by payload position would mean a future
 * re-export silently remapped every link already in circulation.
 */

import { HEADLINE_ITEMS, type AnswerMap } from './quiz-data.js';
import {
  COMPARE_IDS,
  COMPARE_N,
  encodeCompare,
  decodeCompare,
  incomingFrom,
  inviteUrl,
  agreementWith,
  toAnswerMap,
} from './compare.js';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ---------------------------------------------------------------------------
// The canonical order. This is the check that protects every link ever made.
// ---------------------------------------------------------------------------

const payloadOrder = HEADLINE_ITEMS.map((i) => i.id);
const sorted = payloadOrder.slice().sort();

check('the compare covers seven votes', COMPARE_IDS.length === COMPARE_N, String(COMPARE_IDS.length));
check('the canonical order is the SORTED ids',
  JSON.stringify(COMPARE_IDS) === JSON.stringify(sorted));
// The precondition that makes the check above worth having. If the payload
// happened to be sorted already, sorting would be a no-op and this suite would
// pass just as well with the bug present.
check('and the payload order is genuinely different, so sorting is load-bearing',
  JSON.stringify(payloadOrder) !== JSON.stringify(sorted),
  `payload starts ${payloadOrder[0].slice(9, 13)}, sorted starts ${sorted[0].slice(9, 13)}`);
check('the ids are the headline set, nothing else',
  COMPARE_IDS.every((id) => payloadOrder.includes(id)));

// ---------------------------------------------------------------------------
// Round trip over every reachable answer set: 3^7 = 2187.
// ---------------------------------------------------------------------------

const mapOf = (state: number[]): AnswerMap => {
  const m: AnswerMap = {};
  COMPARE_IDS.forEach((id, i) => {
    if (state[i] === 1) m[id] = 1;
    else if (state[i] === 2) m[id] = -1;
    // 0 means not answered
  });
  return m;
};

let trips = 0;
let exact = 0;
let codes = new Set<string>();
let longest = 0;
for (let n = 0; n < 3 ** COMPARE_N; n++) {
  const state = Array.from({ length: COMPARE_N }, (_, i) => Math.floor(n / 3 ** i) % 3);
  const answers = mapOf(state);
  const answeredCount = state.filter((x) => x !== 0).length;
  const code = encodeCompare(answers);
  longest = Math.max(longest, code.length);
  const back = decodeCompare(code);

  if (answeredCount === 0) {
    // Nothing answered is not a shareable result, and must be refused.
    if (back === null) exact++;
    trips++;
    continue;
  }
  codes.add(code);
  trips++;
  const ok = back !== null
    && back.answered === answeredCount
    && COMPARE_IDS.every((_id, i) => {
      const t = back.answers[i];
      if (state[i] === 0) return t === null;
      return t === (state[i] === 1);
    });
  if (ok) exact++;
}

check('every one of the 2187 answer sets round-trips exactly', exact === trips, `${exact}/${trips}`);
check('and the 2186 shareable ones all produce different codes',
  codes.size === 3 ** COMPARE_N - 1, `${codes.size} distinct`);
check('a code is at most three characters', longest <= 3, `longest ${longest}`);

// ---------------------------------------------------------------------------
// Decoding refuses anything a hand-edited fragment could be. Paired with the
// acceptance, so a parser that refused everything could not pass.
// ---------------------------------------------------------------------------

const full = mapOf(Array.from({ length: COMPARE_N }, () => 1));
const goodCode = encodeCompare(full);
check('accepts a real code', decodeCompare(goodCode) !== null, goodCode);
check('refuses an empty code', decodeCompare('') === null);
check('refuses a code that is all zeroes (nothing answered)', decodeCompare('0') === null);
check('refuses a value past fourteen bits', decodeCompare('zzzz') === null);
check('refuses non-base36 characters', decodeCompare('!!') === null);
check('refuses an over-long code', decodeCompare('abcde') === null);
check('refuses an answer bit set for an unanswered question',
  // bit 0 set (answered agree) with no mask bit for it: impossible from the
  // encoder, and exactly the shape a hand-edited fragment takes.
  decodeCompare((1).toString(36)) === null, (1).toString(36));

// ---------------------------------------------------------------------------
// The fragment
// ---------------------------------------------------------------------------

const url = inviteUrl(full, 'https://rightnleft.com', 'en');
check('an invite points at the site root with a c= fragment',
  /^https:\/\/rightnleft\.com\/#c=[0-9a-z]{1,3}$/.test(url), url);
check('a Spanish invite keeps the reader in Spanish',
  inviteUrl(full, 'https://rightnleft.com', 'es').startsWith('https://rightnleft.com/es/#c='),
  inviteUrl(full, 'https://rightnleft.com', 'es'));
check('the invite carries no answer text, id or score',
  !/qid|answer|netLean|crossover|verdict|ocd-/i.test(url), url);

check('an incoming fragment is read', incomingFrom(`#c=${goodCode}`) !== null);
check('reads c= after another key', incomingFrom(`#a=1&c=${goodCode}`) !== null);
check('ignores an unrelated fragment', incomingFrom('#method') === null);
check('ignores the old result fragment', incomingFrom('#r=8') === null);
check('ignores c= inside another key', incomingFrom('#abc=1') === null);

// ---------------------------------------------------------------------------
// Agreement. An absence is never a disagreement.
// ---------------------------------------------------------------------------

const allAgree = mapOf(Array.from({ length: COMPARE_N }, () => 1));
const allDisagree = mapOf(Array.from({ length: COMPARE_N }, () => 2));
const theirsAllAgree = decodeCompare(encodeCompare(allAgree))!;

let a = agreementWith(theirsAllAgree, allAgree);
check('identical answers agree on all seven', a.both === 7 && a.agreed === 7 && a.differed === 0,
  JSON.stringify(a));
a = agreementWith(theirsAllAgree, allDisagree);
check('opposite answers differ on all seven', a.both === 7 && a.agreed === 0 && a.differed === 7,
  JSON.stringify(a));

// One of them skipped three. The comparison speaks only about the four shared.
const partial = mapOf([1, 1, 1, 1, 0, 0, 0]);
a = agreementWith(theirsAllAgree, partial);
check('a vote either person skipped is excluded, not counted as a difference',
  a.both === 4 && a.agreed === 4 && a.differed === 0, JSON.stringify(a));

const theirsPartial = decodeCompare(encodeCompare(mapOf([1, 2, 0, 0, 1, 1, 1])))!;
a = agreementWith(theirsPartial, mapOf([1, 1, 1, 2, 0, 1, 2]));
// shared: 0 (both agree), 1 (they disagree, I agree), 5 (both agree), 6 (they agree, I disagree)
check('a mixed overlap counts only the shared votes',
  a.both === 4 && a.agreed === 2 && a.differed === 2, JSON.stringify(a));

// ---------------------------------------------------------------------------
// Their answers must be usable by the real estimator, keyed by real item ids.
// ---------------------------------------------------------------------------

const asMap = toAnswerMap(theirsPartial);
const keys = Object.keys(asMap);
check('their answers come back keyed by real item ids',
  keys.length === 5 && keys.every((k) => COMPARE_IDS.includes(k)), `${keys.length} keys`);
check('and only ever as 1 or -1',
  Object.values(asMap).every((v) => v === 1 || v === -1));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
