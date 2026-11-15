/**
 * PlainRecord: the logo's icons
 *
 *   node scripts/build_icons.mjs
 *
 * Renders public/apple-touch-icon.png (180x180), the icon a phone shows when
 * someone adds the site to a home screen. It is the strip of the logo (option A,
 * Marco, 14 Nov 2026): red | purple | blue, full bleed and square, because iOS
 * rounds the corners itself and a transparent corner would show as black.
 * public/favicon.svg is the same strip with rounded corners, written by hand.
 *
 * Committed, like og.png: re-run only when the logo changes.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 180;
// The same proportions as favicon.svg: 10 | 12 | 10 of 32.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 32 32">
  <rect width="10" height="32" fill="#c8352f"/><rect x="10" width="12" height="32" fill="#7d5ba6"/><rect x="22" width="10" height="32" fill="#1f66bd"/></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
const out = resolve(ROOT, 'public/apple-touch-icon.png');
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
await browser.close();
console.log(`  wrote ${out}`);
