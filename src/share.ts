/**
 * PlainRecord — sharing a result without a server
 *
 * The result travels in the URL FRAGMENT, the part after `#`. Browsers never
 * put a fragment in the HTTP request, so a shared link carries where somebody
 * landed without this site storing it, transmitting it, or being able to see
 * it. That is not a convenience: the page's whole claim is that answering sends
 * nothing, and a share feature that phoned home to mint a link would have
 * broken it for the sake of a nicer URL.
 *
 * ONLY THE BIN IS ENCODED, one integer from 0 to 10. It is enough to say "they
 * landed here" and it maps to nothing about which questions were answered which
 * way. Richer encoding is possible later; it is not free, because a link that
 * carries per-question answers is a link a reader might forward without
 * realising how much of themselves is in it.
 *
 * The bin arithmetic comes from ../bins so a link means the same thing the
 * tally means. See the note in that file.
 */

import { binOf, isBin, BINS } from '../bins.js';
import { LOCALE, ES_PREFIX } from './i18n.js';

/** Where a shared link should point, honouring the language being read. */
export function shareOrigin(origin: string, locale: string = LOCALE): string {
  const base = origin.replace(/\/$/, '');
  return locale === 'es' ? `${base}${ES_PREFIX}/` : `${base}/`;
}

/**
 * The link for a reader whose profile came out at `lean`.
 *
 * Takes the lean rather than a bin so callers cannot pass an unbucketed number
 * by accident and encode a position half a bin off what was displayed.
 */
export function resultUrl(lean: number, origin: string, locale: string = LOCALE): string {
  return `${shareOrigin(origin, locale)}#r=${binOf(lean)}`;
}

/**
 * Read a shared bin out of a URL fragment, or null.
 *
 * Takes the hash as an argument so it can be tested without a browser. Anything
 * that is not a whole number in range is refused rather than clamped: a clamped
 * value would render a confident dot for a URL somebody had typed wrong, and a
 * fragment is trivially editable by anyone who wants to try.
 */
export function sharedBinFrom(hash: string): number | null {
  const m = /(?:^|[#&])r=(-?\d{1,3})(?:&|$)/.exec(hash);
  if (!m) return null;
  const n = Number(m[1]);
  return isBin(n) ? n : null;
}

/** The same, read from the live document. Safe outside a browser. */
export function sharedBin(): number | null {
  if (typeof document === 'undefined') return null;
  return sharedBinFrom(location.hash);
}

/** Remove the shared-result fragment without reloading or adding a history entry. */
export function clearSharedBin(): void {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  if (!/(?:^|[#&])r=/.test(location.hash)) return;
  history.replaceState(null, '', location.pathname + location.search);
}

export interface ShareTarget {
  key: 'x' | 'reddit' | 'facebook';
  href: string;
}

/**
 * Prefilled links for the desktop fallback.
 *
 * Plain anchors, not embedded widgets. Nothing is fetched from any of these
 * hosts, no script runs, and no cookie is set unless the reader actually
 * follows one. That distinction is the reason a privacy-first page can carry
 * them at all, and `connect-src 'self'` in the CSP keeps it honest.
 *
 * Facebook is included knowing it ignores the supplied text and builds its
 * preview from the destination's Open Graph tags, so it will read as the site's
 * generic card until per-result images exist.
 */
export function shareTargets(url: string, text: string): ShareTarget[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return [
    { key: 'x', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { key: 'reddit', href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
    { key: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  ];
}

/** True when the browser can open a native share sheet. */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export { BINS };
