/**
 * PlainRecord — smoke suite for the share plumbing
 *
 *   npx tsx src/share.smoke.ts
 *
 * Only the fallback links and the locale-aware origin live here now. Everything
 * about what a shared link CONTAINS moved to compare.smoke.ts when the result
 * moved out of the path and back into a fragment, so that a link preview can no
 * longer spoil a blind comparison.
 */

import { shareTargets, shareOrigin } from './share.js';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ` \u2014 ${detail}` : ''}`); }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ` \u2014 ${detail}` : ''}`); }
};

const ORIGIN = 'https://rightnleft.com';

check('an English link points at the root', shareOrigin(ORIGIN, 'en') === 'https://rightnleft.com/');
check('a Spanish link points at /es/', shareOrigin(ORIGIN, 'es') === 'https://rightnleft.com/es/');
check('a trailing slash on the origin is not doubled',
  shareOrigin('https://rightnleft.com/', 'en') === 'https://rightnleft.com/');

const URL_ = 'https://rightnleft.com/#c=cn3';
const TEXT = 'I took a blind quiz on 7 real Texas House votes. Answer the same 7, then see how we compare.';
const targets = shareTargets(URL_, TEXT);

check('three fallback targets', targets.length === 3, targets.map((x) => x.key).join(','));
check('every target is https', targets.every((x) => x.href.startsWith('https://')));
check('every target carries the encoded url',
  targets.every((x) => x.href.includes(encodeURIComponent(URL_))));
check('the text is percent-encoded, not raw',
  targets.filter((x) => x.key !== 'facebook').every((x) => x.href.includes(encodeURIComponent(TEXT))));
check('the fragment survives encoding, or the invite arrives empty',
  targets.every((x) => x.href.includes(encodeURIComponent('#c=cn3'))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
