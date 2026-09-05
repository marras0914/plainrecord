/**
 * PlainRecord — does the Spanish sidecar still match the payload?
 *
 *   npm run i18n:sidecar
 *
 * public/data/quiz_89R.es.json translates the prose the PAYLOAD carries, keyed
 * by the English strings and names it corresponds to. Keys, not indices — an
 * outcome added or reordered by `npm run data:export` would silently shift every
 * translation down one and attach Texas's incarceration caveat to its firearm
 * figure.
 *
 * Keying by English string moves the failure mode rather than removing it: now
 * a reworded label orphans its translation instead of misplacing it. That is the
 * better failure, because it is detectable, and this is what detects it. It runs
 * in both directions:
 *
 *   MISSING  — the payload has prose the sidecar does not cover. The Spanish
 *              page would render that sentence in English.
 *   ORPHANED — the sidecar names something the payload no longer has. Dead
 *              translation, and usually a sign a label was reworded.
 *
 * The 67 official captions are exempt and asserted to be exempt: `captions` must
 * stay empty. See _meta.captions in the sidecar for why replacing them is not on
 * the table.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const en = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
const es = JSON.parse(readFileSync(resolve(ROOT, 'public/data/quiz_89R.es.json'), 'utf8'));

let failures = 0;
const missing = [];
const orphaned = [];

const say = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

/** Every key in `want` must exist in `have`, and vice versa. */
function compare(what, want, have) {
  const w = new Set(want);
  const h = new Set(have);
  for (const k of w) if (!h.has(k)) missing.push(`${what}: ${k}`);
  for (const k of h) if (!w.has(k)) orphaned.push(`${what}: ${k}`);
  say(
    [...w].every((k) => h.has(k)) && [...h].every((k) => w.has(k)),
    `${what} covered`,
    `${h.size}/${w.size}`,
  );
}

console.log('');

// ---- the four top-level prose fields ------------------------------------
for (const f of ['comparatorRule', 'candidateProvenance', 'causalNote', 'plainLanguageNote']) {
  const ok = typeof es[f] === 'string' && es[f].trim().length > 0;
  if (!ok) missing.push(`top-level: ${f}`);
  say(ok, `${f} translated`);
}

// ---- keyed collections ---------------------------------------------------
compare('categories', [...new Set(en.items.map((i) => i.category))], Object.keys(es.categories ?? {}));
compare('omissions', en.omissions.map((o) => o.category), Object.keys(es.omissions ?? {}));
compare('opponents', en.opponents.map((o) => o.name), Object.keys(es.opponents ?? {}));
compare('incumbents', en.incumbents.map((i) => i.name), Object.keys(es.incumbents ?? {}));
compare('outcomes', en.outcomes.map((o) => o.label), Object.keys(es.outcomes ?? {}));
const PROSE_FIELDS = ['label', 'why', 'plain'];
const hasProse = (i) => PROSE_FIELDS.some((f) => typeof i[f] === 'string' && i[f].trim());
compare('items carrying prose', en.items.filter(hasProse).map((i) => i.billId),
  Object.keys(es.items ?? {}));

// ---- per-record field coverage -------------------------------------------
// A key can be present while a field inside it is not, which is the quieter
// version of the same bug.
const fieldsOf = (obj, fields) => fields.filter((f) => {
  const v = obj?.[f];
  return v === undefined || (typeof v === 'string' && !v.trim());
});

for (const o of en.outcomes) {
  const tr = es.outcomes?.[o.label];
  if (!tr) continue;
  const want = ['label', 'value', 'comparison', 'caveat'];
  const gaps = fieldsOf(tr, want);
  if (gaps.length) missing.push(`outcome "${o.label}" fields: ${gaps.join(', ')}`);
  // rank is legitimately null on some outcomes; it must be null in BOTH or
  // translated in both, never null in one and present in the other.
  const enHas = o.rank !== null && o.rank !== undefined;
  const esHas = tr.rank !== null && tr.rank !== undefined;
  if (enHas !== esHas) {
    missing.push(`outcome "${o.label}": rank present in ${enHas ? 'en' : 'es'} only`);
  }
}
say(!missing.some((m) => m.startsWith('outcome ')), 'every outcome field translated');

for (const op of en.opponents) {
  const tr = es.opponents?.[op.name];
  if (!tr) continue;
  const gaps = fieldsOf(tr, ['office', 'whyNoVotes', 'evidence', 'oneSided']);
  if (gaps.length) missing.push(`opponent "${op.name}" fields: ${gaps.join(', ')}`);
}
say(!missing.some((m) => m.startsWith('opponent ')), 'every opponent field translated');

for (const inc of en.incumbents) {
  const tr = es.incumbents?.[inc.name];
  if (!tr) continue;
  const gaps = fieldsOf(tr, ['office', 'since', 'sessions']);
  if (gaps.length) missing.push(`incumbent "${inc.name}" fields: ${gaps.join(', ')}`);
  if ((tr.acts ?? []).length !== inc.acts.length) {
    missing.push(`incumbent "${inc.name}": ${tr.acts?.length ?? 0} acts translated of ${inc.acts.length}`);
  }
}
say(!missing.some((m) => m.startsWith('incumbent ')), 'every incumbent act translated');

for (const it of en.items.filter(hasProse)) {
  const tr = es.items?.[it.billId];
  if (!tr) continue;
  // Only the seven headline bills have a label and a "why this one"; the other
  // sixty have a plain-language question and nothing else. Ask for whatever
  // this item actually carries.
  const want = PROSE_FIELDS.filter((f) => it[f]);
  const gaps = fieldsOf(tr, want);
  if (gaps.length) missing.push(`item ${it.billId} fields: ${gaps.join(', ')}`);
}
say(!missing.some((m) => m.startsWith('item ')), 'every item\'s prose translated');

// ---- the captions are exempt, and that is asserted ----------------------
const capCount = Object.keys(es.captions ?? {}).length;
say(capCount === 0, 'official captions left untranslated',
  capCount === 0
    ? `all ${en.items.length} stay in English, by design`
    : `${capCount} present — a translated caption is not the caption`);

// ---- figures survive -----------------------------------------------------
// Every number in an outcome's English value/comparison must appear in the
// Spanish. Translating "$13,189" into anything else is the one error here that
// a reader cannot detect and would be actively misled by.
const numbersIn = (s) => (String(s ?? '').match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]$/, ''));
const lostFigures = [];
for (const o of en.outcomes) {
  const tr = es.outcomes?.[o.label];
  if (!tr) continue;
  for (const f of ['value', 'comparison']) {
    for (const n of numbersIn(o[f])) {
      if (!String(tr[f] ?? '').includes(n)) lostFigures.push(`"${o.label}".${f}: ${n}`);
    }
  }
}
say(lostFigures.length === 0, 'every figure carried across unchanged',
  lostFigures.length ? lostFigures.slice(0, 4).join('; ') : 'value + comparison');

// ---- report --------------------------------------------------------------
if (missing.length) {
  console.log('\n  MISSING — payload prose with no Spanish (would render in English)\n');
  for (const m of missing) console.log('    ' + m);
}
if (orphaned.length) {
  console.log('\n  ORPHANED — Spanish for something the payload no longer has\n');
  for (const o of orphaned) console.log('    ' + o);
  failures += orphaned.length ? 1 : 0;
}

console.log(
  failures === 0
    ? '\n  sidecar matches the payload\n'
    : `\n  ${failures} check(s) failed — /es/ should not ship\n`,
);
process.exit(failures === 0 ? 0 : 1);
