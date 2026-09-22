/**
 * PlainRecord — tell IndexNow about every URL in the sitemap
 *
 *   node scripts/indexnow.mjs           # dry run: prints what it would send
 *   node scripts/indexnow.mjs --submit  # actually submits
 *
 * WHAT THIS IS AND IS NOT. IndexNow is a push protocol: instead of waiting to
 * be crawled, a site tells participating engines that URLs exist or changed.
 * Bing and Yandex honour it; Seznam and Naver participate. GOOGLE DOES NOT, and
 * that matters here, because the question the race and district pages exist to
 * answer is a Google question. This is the cheap half that can be automated,
 * not a substitute for Search Console.
 *
 * HOW OWNERSHIP IS PROVED. A key file at the site root containing the key and
 * nothing else. Anyone can read it, and that is fine: it proves control of the
 * origin, it is not a credential, and it is committed deliberately rather than
 * kept in an env var where a redeploy would lose it. If it ever needs rotating,
 * write a new file, delete the old one, and the old key stops working.
 *
 * THE URLS COME FROM THE SITEMAP, not from a list here. The sitemap is already
 * generated from what was actually built, so a page that failed to build cannot
 * be announced, and adding the other 140 district pages needs no edit here.
 *
 * DRY RUN BY DEFAULT. Submitting is an outward-facing act against somebody
 * else's service and it cannot be taken back, so it takes an explicit flag.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'rightnleft.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const submit = process.argv.includes('--submit');

// --- the key, read from the file that proves it -----------------------------

const keyFiles = readdirSync(resolve(ROOT, 'public'))
  .filter((f) => /^[0-9a-f]{8,128}\.txt$/.test(f));
if (keyFiles.length !== 1) {
  console.error(`\n  Expected exactly one IndexNow key file in public/, found ${keyFiles.length}.`
    + `\n  Two keys means an unfinished rotation and the engines may pick either.\n`);
  process.exit(1);
}
const keyFile = keyFiles[0];
const key = keyFile.replace(/\.txt$/, '');
const contents = readFileSync(resolve(ROOT, 'public', keyFile), 'utf8').trim();
if (contents !== key) {
  console.error(`\n  ${keyFile} must contain exactly its own key and nothing else.`
    + `\n  Found ${contents.length} chars that do not match the filename.\n`);
  process.exit(1);
}

// --- the URLs, read from what was actually built -----------------------------

const sitemapPath = resolve(ROOT, 'dist/sitemap.xml');
let xml;
try {
  xml = readFileSync(sitemapPath, 'utf8');
} catch {
  console.error('\n  dist/sitemap.xml not found — run `npm run build` first.\n');
  process.exit(1);
}
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const offHost = urls.filter((u) => !u.startsWith(`https://${HOST}/`) && u !== `https://${HOST}`);
if (!urls.length || offHost.length) {
  console.error(`\n  Refusing to submit: ${urls.length} URLs, ${offHost.length} not on ${HOST}.\n`);
  process.exit(1);
}

console.log(`\n  host      ${HOST}`);
console.log(`  key       ${key}`);
console.log(`  keyfile   https://${HOST}/${keyFile}`);
console.log(`  urls      ${urls.length}`);
for (const u of urls) console.log(`              ${u}`);

if (!submit) {
  console.log('\n  dry run — nothing sent. Add --submit to actually submit.\n');
  process.exit(0);
}

// The key file has to be LIVE before submitting, or the whole batch is rejected
// and the key can be treated as invalid. Checked rather than assumed.
const probe = await fetch(`https://${HOST}/${keyFile}`);
const served = (await probe.text()).trim();
if (!probe.ok || served !== key) {
  console.error(`\n  The key file is not live yet: ${probe.status}, `
    + `${served === key ? 'contents match' : 'contents do not match'}.`
    + `\n  Deploy first, then submit.\n`);
  process.exit(1);
}
console.log(`\n  key file verified live (${probe.status})`);

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${keyFile}`,
    urlList: urls,
  }),
});
const body = await res.text();

// 200 accepted, 202 accepted but key still being validated. Both are success.
if (res.status === 200 || res.status === 202) {
  console.log(`\n  submitted ${urls.length} URLs — ${res.status}`
    + `${res.status === 202 ? ' (accepted, key validation pending)' : ''}\n`);
} else {
  console.error(`\n  IndexNow refused: ${res.status} ${body.slice(0, 300)}\n`);
  process.exit(1);
}
