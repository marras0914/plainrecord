/**
 * PlainRecord — the platform plumbing for sharing
 *
 * Whether a native share sheet exists, and the prefilled fallback links for
 * when it does not. Nothing here knows what is being shared; the invite itself
 * is built by src/compare.ts.
 *
 * This file used to also encode a result into a URL. That version put the
 * position in the PATH (`/r/8`) so a crawler could read it and render a
 * per-result preview card, which solved the "shared links all look identical"
 * problem and broke a more important one: the card revealed where the sender
 * landed before the recipient had answered anything. The blind compare is the
 * product, so the encoding moved to a fragment in compare.ts, where no crawler
 * can reach it. The per-result cards are in git history at b94f33b if a public
 * "post my result" action is ever wanted as a separate, clearly-labelled thing.
 */

import { LOCALE, ES_PREFIX } from './i18n.js';

/** Where a shared link should point, honouring the language being read. */
export function shareOrigin(origin: string, locale: string = LOCALE): string {
  const base = origin.replace(/\/$/, '');
  return locale === 'es' ? `${base}${ES_PREFIX}/` : `${base}/`;
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
