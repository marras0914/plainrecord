/**
 * PlainRecord: the economy pages' words, from i18n/economy.json
 *
 * Shared by build_economy_pages.mjs and build_hubs.mjs (the Context hub lists
 * the economy pages), so both refuse unapproved Spanish the same way.
 */

import { readFileSync } from 'node:fs';

export const ECON_COPY = JSON.parse(readFileSync(new URL('../i18n/economy.json', import.meta.url), 'utf8'));

/** Keys whose Spanish is not yet approved. Empty means Spanish may ship. */
export function unapprovedEcon() {
  return Object.entries(ECON_COPY).filter(([k, e]) => k !== '_meta' && e.status !== 'ok').map(([k]) => k);
}

/**
 * Throws, failing the build, while any string is unapproved, exactly as the
 * classroom and site Spanish gates do. ECON_DRAFT=1 lifts it for a local look
 * and must never be set on Vercel.
 */
export function requireApprovedEcon(who) {
  const pending = unapprovedEcon();
  if (pending.length && process.env.ECON_DRAFT !== '1') {
    throw new Error(`${who}: i18n/economy.json has ${pending.length} unapproved Spanish strings (${pending.slice(0, 4).join(', ')}...). Set ECON_DRAFT=1 for a local look only.`);
  }
}

/**
 * A string in one language, as HTML, with {name} filled. The copy itself may
 * carry inline <b> and <em> and is trusted; the values filled in are escaped.
 * Throws on a missing key or an unfilled name.
 */
export function et(lang, key, vars = {}) {
  const e = ECON_COPY[key];
  if (!e || typeof e[lang] !== 'string') throw new Error(`economy.json: no ${lang} for ${key}`);
  return e[lang].replace(/\{(\w+)\}/g, (m, name) => {
    if (!(name in vars)) throw new Error(`economy.json ${key}: {${name}} not supplied`);
    return String(vars[name]).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
}

export const ECON_PATHS = {
  en: { blind: 'economy', explore: 'economy/explore', method: 'economy/methodology' },
  es: { blind: 'economia', explore: 'economia/explorar', method: 'economia/metodologia' },
};
