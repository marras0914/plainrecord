/**
 * PlainRecord: the words of the three spaces (Policy, Religion, Economics)
 *
 * From i18n/home.json, under the same gate as faith.json and economy.json:
 * while any string is unapproved, requireApprovedHome() throws and the build
 * fails. HOME_DRAFT=1 lifts it for a local look and must never be set on Vercel.
 *
 * Shared by _site_nav.mjs (nav and footer labels), build_home.mjs (the front
 * page) and build_hubs.mjs (the Policy hub).
 */

import { readFileSync } from 'node:fs';

export const HOME_COPY = JSON.parse(readFileSync(new URL('../i18n/home.json', import.meta.url), 'utf8'));

export function unapprovedHome() {
  return Object.entries(HOME_COPY).filter(([k, e]) => k !== '_meta' && e.status !== 'ok').map(([k]) => k);
}

export function requireApprovedHome(who) {
  const pending = unapprovedHome();
  if (pending.length && process.env.HOME_DRAFT !== '1') {
    throw new Error(`${who}: i18n/home.json has ${pending.length} unapproved Spanish strings (${pending.slice(0, 4).join(', ')}...). Set HOME_DRAFT=1 for a local look only.`);
  }
}

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A string in one language, escaped, with {name} filled (escaped unless the name ends in Html). */
export function ht(lang, key, vars = {}) {
  const e = HOME_COPY[key];
  const L = lang === 'es' ? 'es' : 'en';
  if (!e || typeof e[L] !== 'string') throw new Error(`home.json: no ${L} for ${key}`);
  return escText(e[L]).replace(/\{(\w+)\}/g, (m, name) => {
    if (!(name in vars)) throw new Error(`home.json ${key}: {${name}} not supplied`);
    return name.endsWith('Html') ? String(vars[name]) : escText(vars[name]);
  });
}

/** Where the quiz lives since 14 Nov 2026; the front page took / and /es. */
export const QUIZ_PATH = { en: '/quiz', es: '/es/cuestionario' };
export const HOME_PATH = { en: '/', es: '/es' };
export const POLICY_PATH = { en: '/policy', es: '/politica' };
