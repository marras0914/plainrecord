/**
 * PlainRecord — the QR code for the printed Spanish flyer
 *
 *   npm i --no-save qrcode jsqr pngjs
 *   node scripts/make_qr.mjs                 # -> private/qr/
 *   node scripts/make_qr.mjs --url <url>
 *
 * The three packages are deliberately NOT in package.json. This runs when a
 * flyer is printed, which is rarely, and none of them belong in the dependency
 * tree of a site that ships no third-party code. Install them for the run and
 * let them go. Note that `npm i --no-save` PRUNES other --no-save packages, so
 * install all three in one command or the second install removes the first.
 *
 * Generated locally rather than through one of the free QR websites, for two
 * reasons that both matter for this project specifically.
 *
 * A generator site knows what you encoded, and several of them quietly hand back
 * a REDIRECT through their own domain rather than your URL, so the printed code
 * stops working the day they change their pricing, and every scan is logged by
 * somebody else in the meantime. On a flyer whose selling point is that the site
 * asks nothing of the reader, a tracking redirect printed on the paper would be
 * the single worst thing in the room.
 *
 * So: no network, no redirect, and the encoded string is asserted to be exactly
 * the URL before anything is written.
 *
 * PRINT NOTES, which are the part people get wrong
 *
 * - Error correction M, not H. H sacrifices a quarter of the capacity to survive
 *   damage that a flyer on a library table does not suffer, and the denser code
 *   scans worse on an old phone camera, which is the actual failure mode here.
 * - The quiet zone is four modules and is not optional. A QR printed to the edge
 *   of a box does not scan.
 * - SVG for the layout, PNG at 1024 for anyone who needs to drop it into Word,
 *   which is what a school district's parent-engagement office will do.
 * - Pure black on pure white. Brand colours reduce contrast and this has to work
 *   photocopied.
 */

import QRCode from 'qrcode';
import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'private/qr');

const i = process.argv.indexOf('--url');
const URL_TO_ENCODE = i > 0 ? process.argv[i + 1] : 'https://rightnleft.com/es';

// The flyer is Spanish, so the default is the Spanish page. A QR that lands a
// Spanish speaker on the English page is a broken flyer even though it scans.
if (!/^https:\/\//.test(URL_TO_ENCODE)) {
  console.error('\n  Refusing: the URL must be https, because a printed http link cannot be fixed.\n');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const opts = {
  errorCorrectionLevel: 'M',
  margin: 4,
  color: { dark: '#000000', light: '#FFFFFF' },
};

const svg = await QRCode.toString(URL_TO_ENCODE, { ...opts, type: 'svg' });
writeFileSync(resolve(OUT, 'rightnleft-es.svg'), svg);
await QRCode.toFile(resolve(OUT, 'rightnleft-es.png'), URL_TO_ENCODE, { ...opts, width: 1024 });

// DECODE THE IMAGE, not the library's own segments.
//
// The first version of this check compared QRCode.create().segments against the
// URL and reported a mismatch on a perfectly good code, because segment data is
// a byte array rather than a string. That is the wrong shape of check twice
// over: it compared the wrong types, and even corrected it only asks the library
// whether it agrees with itself.
//
// What gets printed is the PNG. So the PNG is read back off disk, decoded by an
// unrelated library the way a phone camera would, and the decoded text is
// compared to the URL. A QR that encodes the wrong string looks exactly like one
// that encodes the right string, and paper cannot be patched.
const { PNG } = await import('pngjs');
const jsQR = (await import('jsqr')).default;
const png = PNG.sync.read(readFileSync(resolve(OUT, 'rightnleft-es.png')));
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
const ok = decoded?.data === URL_TO_ENCODE;

console.log('');
console.log(`  encoded : ${URL_TO_ENCODE}`);
console.log(`  scanned back off the PNG: ${decoded ? JSON.stringify(decoded.data) : '(no code found)'}`);
console.log(`  matches the URL: ${ok ? 'yes' : 'NO — do not print this'}`);
console.log(`  error correction M, quiet zone 4 modules, black on white`);
console.log('');
for (const f of ['rightnleft-es.svg', 'rightnleft-es.png']) {
  console.log(`  ${resolve(OUT, f)}  ${(statSync(resolve(OUT, f)).size / 1024).toFixed(1)} KB`);
}
console.log('');
console.log('  Print at 2cm or larger on the flyer. Below about 1.5cm a phone');
console.log('  camera at arm\'s length starts failing, which on a library table');
console.log('  is the only distance that matters.');
console.log('');

if (!ok) process.exit(1);
