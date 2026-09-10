/**
 * PlainRecord — smoke suite for the shareable result
 *
 *   npx tsx src/share.smoke.ts
 *
 * The link is the one artefact of this project that leaves the site and gets
 * forwarded to people who never visited it. Two things therefore have to hold,
 * and both are checked here rather than assumed.
 *
 * A round trip must be exact. If encoding a result and decoding it back can
 * shift by one, a recipient is shown a position the sender was never in, and
 * nothing on either end would notice.
 *
 * The fragment must carry ONLY the bin. A URL is trivially forwarded, screen
 * shotted and pasted into a group chat, so anything smuggled into it is
 * published by people who did not know they were publishing it.
 */

import { binOf, BINS } from '../bins.js';
import {
  resultUrl,
  sharedBinFrom,
  shareTargets,
  shareOrigin,
} from './share.js';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const ORIGIN = 'https://rightnleft.com';

// ---------------------------------------------------------------------------
// Round trip. Asserted across every bin, not a sample.
// ---------------------------------------------------------------------------

let exact = 0;
for (let bin = 0; bin < BINS; bin++) {
  const lean = (bin / 5) - 1;
  const url = resultUrl(lean, ORIGIN, 'en');
  const back = sharedBinFrom(new URL(url).hash);
  if (back === bin) exact++;
}
check('every bin survives a round trip exactly', exact === BINS, `${exact}/${BINS}`);

// The precondition: the loop above must actually have produced distinct bins.
// If resultUrl ever returned a constant, the check above would still pass.
const encoded = new Set(
  Array.from({ length: BINS }, (_, b) => resultUrl((b / 5) - 1, ORIGIN, 'en')),
);
check('the eleven bins produce eleven different links', encoded.size === BINS, `${encoded.size} distinct`);

check('a lean is bucketed, not passed through',
  resultUrl(0.83, ORIGIN, 'en').endsWith(`#r=${binOf(0.83)}`), resultUrl(0.83, ORIGIN, 'en'));
check('the leftmost lean encodes bin 0', resultUrl(-1, ORIGIN, 'en').endsWith('#r=0'));
check('the rightmost lean encodes bin 10', resultUrl(1, ORIGIN, 'en').endsWith('#r=10'));
check('dead centre encodes bin 5', resultUrl(0, ORIGIN, 'en').endsWith('#r=5'));

// ---------------------------------------------------------------------------
// What the fragment may contain
// ---------------------------------------------------------------------------

const sample = resultUrl(0.42, ORIGIN, 'en');
check('the whole fragment is just r=<digits>',
  /#r=\d{1,2}$/.test(sample), sample);
check('the URL carries no query string at all',
  !sample.includes('?'), sample);
check('and nothing that looks like an answer, an id or a score',
  !/qid|answer|netLean|crossover|partisanLoad|verdict|ocd-/i.test(sample), sample);

// ---------------------------------------------------------------------------
// Decoding refuses anything that is not a real bin. Each rejection is paired
// with the acceptance it is derived from, so a broken parser that rejects
// everything cannot pass this section.
// ---------------------------------------------------------------------------

check('accepts a valid fragment', sharedBinFrom('#r=7') === 7);
check('rejects a bin above the range', sharedBinFrom('#r=11') === null);
check('rejects a negative bin', sharedBinFrom('#r=-1') === null);
check('rejects a fractional bin', sharedBinFrom('#r=3.5') === null);
check('rejects a non-numeric value', sharedBinFrom('#r=abc') === null);
check('rejects an empty value', sharedBinFrom('#r=') === null);
check('rejects an absent fragment', sharedBinFrom('') === null);
check('rejects an unrelated fragment', sharedBinFrom('#method') === null);
check('does not match r= inside another key', sharedBinFrom('#other=1') === null);
check('reads r= when it follows another key', sharedBinFrom('#a=1&r=4') === 4);
check('reads r= when another key follows it', sharedBinFrom('#r=4&a=1') === 4);
check('rejects a huge number rather than clamping it', sharedBinFrom('#r=999') === null);

// Clamping instead of refusing would render a confident dot for a URL somebody
// typed wrong. Asserted directly, because it is a judgement a future edit could
// quietly reverse in the name of robustness.
check('an out-of-range bin is refused, NOT clamped to an edge',
  sharedBinFrom('#r=99') === null && sharedBinFrom('#r=-99') === null);

// ---------------------------------------------------------------------------
// Locale
// ---------------------------------------------------------------------------

check('an English link points at the root', shareOrigin(ORIGIN, 'en') === 'https://rightnleft.com/');
check('a Spanish link points at /es/', shareOrigin(ORIGIN, 'es') === 'https://rightnleft.com/es/');
check('a Spanish result keeps the reader in Spanish',
  resultUrl(0.4, ORIGIN, 'es') === 'https://rightnleft.com/es/#r=7',
  resultUrl(0.4, ORIGIN, 'es'));
check('a trailing slash on the origin is not doubled',
  shareOrigin('https://rightnleft.com/', 'en') === 'https://rightnleft.com/');

// ---------------------------------------------------------------------------
// Fallback targets
// ---------------------------------------------------------------------------

const TEXT = 'I judged 7 real votes my Texas House took, with the party hidden. Where do you land?';
const targets = shareTargets(sample, TEXT);
check('three fallback targets', targets.length === 3, targets.map((x) => x.key).join(','));
check('every target is https', targets.every((x) => x.href.startsWith('https://')));
check('every target carries the encoded url',
  targets.every((x) => x.href.includes(encodeURIComponent(sample))));
check('the text is percent-encoded, not raw',
  targets.filter((x) => x.key !== 'facebook').every((x) => x.href.includes(encodeURIComponent(TEXT))));
check('no target URL contains a raw space or a raw hash',
  targets.every((x) => !/[ ]/.test(x.href) && x.href.split('?')[1]?.indexOf('#') === -1));

// ---------------------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
