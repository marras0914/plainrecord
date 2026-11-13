/**
 * PlainRecord: the faith pages' words, from i18n/faith.json
 *
 * Two kinds of entry live in that file:
 *
 *   ui.*, hub.*, me.*   the pages' own words, used through ft()
 *   everything else     the Spanish of a sentence that lives in English in
 *                       faith_positions.ts (a summary, a note, an issue name),
 *                       keyed by the record it belongs to (keys below) and used
 *                       through tx()
 *
 * Each data entry keeps the English it translates. tx() refuses an entry whose
 * English no longer matches the record, so editing a summary in
 * faith_positions.ts without re-translating it fails the build instead of
 * shipping a Spanish page that says the old thing.
 *
 * Shared by build_faith_pages.mjs and build_hubs.mjs (the Context hub lists the
 * faith pages), so both refuse unapproved Spanish the same way.
 */

import { readFileSync } from 'node:fs';

export const FAITH_COPY = JSON.parse(readFileSync(new URL('../i18n/faith.json', import.meta.url), 'utf8'));

/** Keys whose Spanish is not yet approved. Empty means Spanish may ship. */
export function unapprovedFaith() {
  return Object.entries(FAITH_COPY).filter(([k, e]) => k !== '_meta' && e.status !== 'ok').map(([k]) => k);
}

/**
 * Throws, failing the build, while any string is unapproved, exactly as the
 * economy and site Spanish gates do. FAITH_DRAFT=1 lifts it for a local look
 * and must never be set on Vercel.
 */
export function requireApprovedFaith(who) {
  const pending = unapprovedFaith();
  if (pending.length && process.env.FAITH_DRAFT !== '1') {
    throw new Error(`${who}: i18n/faith.json has ${pending.length} unapproved Spanish strings (${pending.slice(0, 4).join(', ')}...). Set FAITH_DRAFT=1 for a local look only.`);
  }
}

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A page string in one language, as HTML, with {name} filled. The copy itself
 * may carry inline <b> and <em> and is trusted; the values filled in are
 * escaped unless the name ends in "Html" (a link the builder made). Throws on
 * a missing key or an unfilled name.
 */
export function ft(lang, key, vars = {}) {
  const e = FAITH_COPY[key];
  if (!e || typeof e[lang] !== 'string') throw new Error(`faith.json: no ${lang} for ${key}`);
  return e[lang].replace(/\{(\w+)\}/g, (m, name) => {
    if (!(name in vars)) throw new Error(`faith.json ${key}: {${name}} not supplied`);
    return name.endsWith('Html') ? String(vars[name]) : escText(vars[name]);
  });
}

/**
 * A sentence from the record, as escaped text: the English itself, or its
 * approved Spanish. Throws if the Spanish is missing or translates an older
 * English.
 */
export function tx(lang, key, english) {
  if (lang === 'en') return escText(english);
  const e = FAITH_COPY[key];
  if (!e || typeof e.es !== 'string') throw new Error(`faith.json: no Spanish for ${key} ("${english.slice(0, 50)}...")`);
  if (e.en !== english) throw new Error(`faith.json ${key}: the English has changed since it was translated. Was "${e.en.slice(0, 60)}...", now "${english.slice(0, 60)}...". Re-translate it and get it approved.`);
  return escText(e.es);
}

// Keys for the record's sentences. One place, so the builder and whatever
// writes the translations agree.
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const KEY = {
  issueName: (i) => `issue.${i.id}.name`,
  issueDesc: (i) => `issue.${i.id}.desc`,
  tradName: (t) => `trad.${t.id}.name`,
  tradFamily: (t) => `trad.${t.id}.family`,
  tradOfficial: (t) => `trad.${t.id}.official`,
  platform: (k) => `platform.${k}`,
  body: (s) => `body.${slug(s.body)}`,
  statement: (s) => `st.${s.traditionId}.${s.issueId}.${s.sourceDate}`,
  noStatement: (n) => `none.${n.traditionId}.${n.issueId}`,
  plank: (p) => `plank.${p.party}-${p.level}.${p.issueId}`,
  noPlank: (n) => `silent.${n.party}-${n.level}.${n.issueId}`,
  toRead: (r, i) => `toread.${r.traditionId}.${r.issueId}.${i}`,
};

export const FAITH_PATHS = {
  en: { home: 'faith', method: 'faith/methodology' },
  es: { home: 'fe', method: 'fe/metodologia' },
};

/** One page per tradition. The ids are the record's; the slugs are the reader's. */
export const TRADITION_SLUG = {
  catholic: { en: 'catholic', es: 'catolica' },
  sbc: { en: 'southern-baptist', es: 'bautista-del-sur' },
  umc: { en: 'united-methodist', es: 'metodista-unida' },
  ame: { en: 'ame', es: 'ame' },
  ag: { en: 'assemblies-of-god', es: 'asambleas-de-dios' },
};
export const traditionPath = (id, lang) => `${FAITH_PATHS[lang].home}/${TRADITION_SLUG[id][lang]}`;
