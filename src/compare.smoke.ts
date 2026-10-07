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

import { HEADLINE_ITEMS, SHORT_ITEMS, type AnswerMap } from './quiz-data.js';
import {
  COMPARE_IDS,
  LEGACY_IDS,
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
// THE ORDER IS PINNED BY BILL NOW, not by sorted id. It used to be the sorted
// ids, which was stable only while the ids were: correcting the vote-selection
// rule repointed SB 6 at its real passage vote, changing its id, moving it from
// position 0 to position 6 and shifting every other bill by one. Every link in
// circulation would have decoded with all seven answers on the wrong questions.
//
// So the assertion is no longer "sorted". It is that each position holds the
// bill it has always held.
// Two pinned lists since 7 October 2026: #c= links decode against the original
// seven forever, #d= links against the current short quiz.
const PINNED_BILLS = ['SB 6', 'SB 10', 'SB 14', 'SB 8', 'SB 5', 'SB 2', 'SB 3'];
const billAt = LEGACY_IDS.map((id) => HEADLINE_ITEMS.find((i) => i.id === id)?.billId);
check('each legacy position holds the bill it has always held',
  JSON.stringify(billAt) === JSON.stringify(PINNED_BILLS),
  billAt.join(', '));
const SHORT_PINNED = ['SB 2', 'SB 8', 'SB 10', 'SB 3', 'SB 14', 'HB 871', 'HB 2060'];
const shortAt = COMPARE_IDS.map((id) => SHORT_ITEMS.find((i) => i.id === id)?.billId);
check('each current position holds its pinned short-quiz bill',
  JSON.stringify(shortAt) === JSON.stringify(SHORT_PINNED), shortAt.join(', '));
check('the current list is exactly the short quiz',
  COMPARE_IDS.length === SHORT_ITEMS.length && SHORT_ITEMS.every((i) => COMPARE_IDS.includes(i.id)));

// The precondition that makes the check above worth having. If the pinned order
// happened to equal the sorted one, pinning would be doing nothing and this
// suite would pass just as well with the old code.
check('and the pinned order is genuinely not the sorted order, so pinning is load-bearing',
  JSON.stringify(LEGACY_IDS) !== JSON.stringify(sorted),
  `pinned starts ${LEGACY_IDS[0].slice(9, 13)}, sorted starts ${sorted[0].slice(9, 13)}`);

check('the legacy ids are the headline set, nothing else',
  LEGACY_IDS.every((id) => payloadOrder.includes(id))
  && LEGACY_IDS.length === new Set(LEGACY_IDS).size);

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
check('an invite points at the site root with a d= fragment',
  /^https:\/\/rightnleft\.com\/#d=[0-9a-z]{1,3}$/.test(url), url);
check('a Spanish invite keeps the reader in Spanish',
  inviteUrl(full, 'https://rightnleft.com', 'es').startsWith('https://rightnleft.com/es/#d='),
  inviteUrl(full, 'https://rightnleft.com', 'es'));

// THE OLD LINKS. A #c= code made before 7 October 2026 must still decode against
// the ORIGINAL seven, and a #d= code against the new ones. Proven with a code
// whose answers differ by position, so decoding against the wrong list would
// put SB 6's answer on SB 2 and fail here.
{
  const oldAnswers: AnswerMap = {};
  LEGACY_IDS.forEach((id, i) => { oldAnswers[id] = i === 0 ? 1 : -1; }); // yes on SB 6 only
  const oldCode = encodeCompare(oldAnswers, LEGACY_IDS);
  const viaC = incomingFrom(`#c=${oldCode}`)!;
  const asMap = toAnswerMap(viaC);
  const sb6 = HEADLINE_ITEMS.find((i) => i.billId === 'SB 6')!.id;
  const sb2 = SHORT_ITEMS.find((i) => i.billId === 'SB 2')!.id;
  check('an old #c= link still decodes against the original seven',
    viaC.ids === LEGACY_IDS && asMap[sb6] === 1 && asMap[sb2] === -1,
    JSON.stringify({ sb6: asMap[sb6], sb2: asMap[sb2] }));
  const viaD = incomingFrom(`#d=${oldCode}`)!;
  check('the same code under #d= is read against the new seven, not the old',
    viaD.ids === COMPARE_IDS && toAnswerMap(viaD)[sb6] === undefined);
  // Someone answering the new short quiz is compared with an old link on the
  // five bills both sets share, and nothing else.
  const mine: AnswerMap = {};
  SHORT_ITEMS.forEach((i) => { mine[i.id] = -1; });
  const a = agreementWith(viaC, mine);
  check('an old link compares on the five shared bills only', a.both === 5, `${a.both} compared`);
}
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
