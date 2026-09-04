/**
 * PlainRecord — locale selection and string interpolation
 *
 * Two responsibilities and nothing else: decide which locale this page is, and
 * substitute real numbers into a copy string. No formatting policy, no view
 * logic, no data.
 *
 * The locale comes from the URL PATH (`/es/`), not from a cookie, a toggle or
 * `navigator.language`. Three reasons, in order of how much they matter:
 *
 *   1. It is shareable. Someone hands their neighbour a link and the neighbour
 *      gets the same language. A client-side toggle sends everyone to English
 *      first and loses the person who cannot read the button.
 *   2. It is indexable. People search for this in Spanish. A path plus an
 *      hreflang pair is the only version of this that Google can list twice.
 *   3. It cannot disagree with itself. `navigator.language` would render a
 *      Spanish page for a reader who explicitly asked for English.
 */

import { EN, ES, ES_UNAPPROVED, type CopyKey, type Locale } from './copy.gen';

/** Folded by vite. See the note on EN/ES in copy.gen.ts for why this exists. */
declare const __BUILD_LOCALE__: Locale;

/**
 * The build locale, or 'en' when there is no build.
 *
 * The `typeof` guard is not defensive padding — this module is imported OUTSIDE
 * vite by `npm test` and by the CLI report scripts, where the define does not
 * exist and a bare read is a ReferenceError that crashes the suite before a
 * single check runs. It cost two crashed suites to learn.
 *
 * vite replaces the identifier textually, so in a build this reads
 * `typeof "en" === 'undefined' ? 'en' : "en"` and folds to a constant — the
 * guard does not cost the tree-shaking that the split depends on.
 */
const BUILD_LOCALE: Locale =
  typeof __BUILD_LOCALE__ === 'undefined' ? 'en' : __BUILD_LOCALE__;

/**
 * The copy table for THIS bundle, chosen at build time.
 *
 * Selecting on the folded constant rather than on LOCALE is what makes the other
 * table unreferenced and therefore droppable. LOCALE still decides everything
 * else — it is read from the URL path at runtime and is what `alternateHref` and
 * the unapproved-translation helpers use.
 */
const TABLE: Record<CopyKey, string> = BUILD_LOCALE === 'es' ? ES : EN;

/** Path prefix that selects Spanish. Also the directory the build emits. */
export const ES_PREFIX = '/es';

/**
 * The locale for this document.
 *
 * Read once at module load rather than per call: it cannot change without a
 * navigation, and re-deriving it inside `t()` invites a caller to render half a
 * page in each language if the URL is ever rewritten mid-session.
 */
export const LOCALE: Locale = detectLocale();

function detectLocale(): Locale {
  // `document` is absent under the test runner and any SSG pass. The scoring
  // and valence modules are deliberately I/O-free for exactly this reason, and
  // this module has to be safe in the same places.
  if (typeof document === 'undefined') return 'en';
  const path = document.location?.pathname ?? '/';
  return path === ES_PREFIX || path.startsWith(`${ES_PREFIX}/`) ? 'es' : 'en';
}

/** The same document in the other language, preserving the rest of the path. */
export function alternateHref(locale: Locale = LOCALE === 'en' ? 'es' : 'en'): string {
  if (typeof document === 'undefined') return locale === 'es' ? `${ES_PREFIX}/` : '/';
  const { pathname, search, hash } = document.location;
  const bare = pathname.startsWith(`${ES_PREFIX}/`)
    ? pathname.slice(ES_PREFIX.length)
    : pathname === ES_PREFIX
      ? '/'
      : pathname;
  const next = locale === 'es' ? `${ES_PREFIX}${bare === '/' ? '/' : bare}` : bare;
  return `${next}${search}${hash}`;
}

/**
 * True when this page is showing Spanish that no fluent reader has approved.
 *
 * The page uses this to say so. Presenting an unreviewed machine draft as "the
 * Spanish version" on a site whose argument is that it is careful would cost
 * more than having no Spanish at all.
 */
export function isUnapprovedTranslation(key: CopyKey): boolean {
  return LOCALE === 'es' && ES_UNAPPROVED.includes(key);
}

export function anyUnapproved(): boolean {
  return LOCALE === 'es' && ES_UNAPPROVED.length > 0;
}

/**
 * Look up `key` in the current locale and substitute `{name}` placeholders.
 *
 * Placeholders are substituted by NAME, never by position, because Spanish word
 * order moves them: "Los {n} candidatos" and "{n} candidates" put the same
 * value in different places, and a positional scheme would silently swap two
 * numbers the moment a translator reordered a sentence.
 *
 * A missing key or a missing variable throws in development and degrades
 * visibly rather than silently in production — a blank space where a number
 * belongs is the failure a reader cannot report because they cannot see it.
 */
export function t(key: CopyKey, vars: Record<string, string | number> = {}): string {
  // No cross-locale fallback, deliberately. There used to be one — `?? EN[key]`
  // — but the other locale's table is no longer in this bundle to fall back TO,
  // and it would have been the wrong behaviour anyway: silently showing English
  // on the Spanish page is the half-translated failure the whole build is set up
  // to refuse. Both tables are generated from one key list and `npm run
  // i18n:check` asserts parity, so a missing key is a build error, not a runtime
  // condition to paper over.
  const template = TABLE[key];
  if (template === undefined) {
    if (import.meta.env?.DEV) throw new Error(`i18n: no such key "${key}"`);
    return '';
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name];
    if (v === undefined) {
      if (import.meta.env?.DEV) {
        throw new Error(`i18n: "${key}" needs {${name}}, which was not passed`);
      }
      return whole;
    }
    return String(v);
  });
}

/**
 * Small integers as words, per locale — "All three candidates", not "All 3".
 *
 * This lived in main.ts as an English-only array, which is one of the three
 * things copy.json flags as needing a code change rather than a translation.
 * Counts of people read as words in both languages; measurements stay numerals,
 * because a reader is meant to be able to check those.
 */
const WORDS: Record<Locale, readonly string[]> = {
  en: ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
  es: ['ningún', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'],
};

export function word(k: number): string {
  return WORDS[LOCALE]?.[k] ?? String(k);
}

/**
 * Plural by count, per locale.
 *
 * The English copy carried a bare `{s}` suffix, which does not work in Spanish
 * at all — "voto"/"votos" is fine but the pattern breaks the moment a noun
 * needs "-es" or changes stress. Callers pass both full forms and get one back,
 * so the copy never has to encode English morphology.
 */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
