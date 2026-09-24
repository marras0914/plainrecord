/**
 * PlainRecord — are the share images current?
 *
 * The share cards (public/share/*.png) and chart downloads (public/charts/img/)
 * are PNGs rendered by build_share_cards.mjs with Chromium, which the Vercel
 * build does not have, so they are generated locally and committed, like og.png.
 * A committed image can go stale: rebuild the data and the page says one thing
 * while the picture of it says another.
 *
 * So each render records a hash of everything that draws them, and the page
 * builders ask cardsFresh() before pointing at one. Stale images are not an
 * error and never shown: the pages fall back to the generic og.png and drop the
 * download links until `npm run build:cards` is run again. A wrong chart
 * travelling on social media is the failure this exists to prevent.
 *
 * The hash normalises line endings, because this is authored on Windows and
 * built on Linux, and a CRLF working copy would otherwise never match.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url);
const at = (p) => new URL(p, ROOT);

/** Everything whose change could change a pixel of a card or a download. */
export const CARD_INPUTS = [
  'public/data/votes_89R.json',
  'public/data/quiz_89R.json',
  'public/data/quiz_89R.es.json',
  'public/data/members_89R.json',
  'public/data/boundaries_tx.topo.json',
  'scripts/_charts.mjs',
  'scripts/_page_shell.mjs',
  'scripts/build_charts.mjs',
  'scripts/build_bill_pages.mjs',
  'scripts/build_share_cards.mjs',
];

export function inputsHash() {
  const h = createHash('sha256');
  for (const p of CARD_INPUTS) {
    h.update(p + '\0');
    h.update(readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex');
}

export const MANIFEST = 'public/share/manifest.json';

let cached = null;
/** True only if the committed images were rendered from exactly these inputs. */
export function cardsFresh() {
  if (cached !== null) return cached;
  if (!existsSync(at(MANIFEST))) return (cached = false);
  const m = JSON.parse(readFileSync(at(MANIFEST), 'utf8'));
  cached = m.inputsHash === inputsHash();
  if (!cached) {
    console.warn('\n  [share cards] STALE: the data or chart code changed since `npm run build:cards`.'
      + '\n  Pages fall back to og.png and hide chart downloads until it is re-run.\n');
  }
  return cached;
}

const SITE = 'https://rightnleft.com';
export const billCard = (slug, lang) => `${SITE}/share/bill-${slug}-${lang}.png`;
export const chartsCard = (lang) => `${SITE}/share/charts-${lang}.png`;
export const chartDownload = (id, lang) => `/charts/img/${id}-${lang}.png`;
