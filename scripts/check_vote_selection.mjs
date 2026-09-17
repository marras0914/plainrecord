/**
 * Does every quiz question point at a vote the bill actually had?
 *
 *   npm run data:votes:check
 *
 * WHY THIS EXISTS. The exporter collapsed a bill's several roll calls to one by
 * taking the most divisive, using 4p(1-p), which peaks at a 50/50 split. A
 * motion that FAILED sits closer to 50/50 than a passage vote almost by
 * definition, so procedural skirmishes beat final passage every time the two
 * were compared.
 *
 * A reader on r/texas found it on SB 17: the question pointed at a 64-74 vote
 * with no journal record, a motion to print remarks during debate, which did not
 * pass. The real third-reading passage was 86-59, House Record 1881. The two
 * carry OPPOSITE signs, so every reader who answered that question was scored
 * backwards on it.
 *
 * Nothing in the suite could see this. Every check asked whether the payload was
 * internally consistent, and it was: the wrong vote was a real vote, correctly
 * counted, correctly categorised, correctly weighted. It was simply not the vote
 * the question was about. So this compares the payload against the FULL corpus
 * the site publishes, which is the only place the alternatives are visible.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const payload = JSON.parse(readFileSync(join(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
const corpusFile = JSON.parse(readFileSync(join(ROOT, 'public/data/votes_89R.json'), 'utf8'));
const corpus = Array.isArray(corpusFile) ? corpusFile
  : (corpusFile.votes ?? corpusFile.items ?? Object.values(corpusFile));

let fails = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

console.log('\n  Which vote each question points at\n');

const byId = new Map(corpus.map((r) => [r.id, r]));
const byBill = new Map();
for (const r of corpus) {
  const a = byBill.get(r.billId) ?? [];
  a.push(r);
  byBill.set(r.billId, a);
}

check('every question is a vote in the published corpus',
  payload.items.every((i) => byId.has(i.id)),
  payload.items.filter((i) => !byId.has(i.id)).map((i) => i.billId).join(', ') || `${payload.items.length} items`);

// --- a question must not point at a vote that failed ------------------------
//
// The page asks "would you vote for this bill". Scoring that against a motion
// the House rejected is not a close call, it is the wrong object entirely.
const failedVotes = payload.items.filter((i) => i.nays >= i.yeas);
check('no question is scored on a vote that did not pass',
  failedVotes.length === 0,
  failedVotes.map((i) => `${i.billId} ${i.yeas}-${i.nays}`).join(', ') || `${payload.items.length} checked`);

// --- and not at a skirmish when the bill's own passage is on the record -----
const shadowed = [];
for (const item of payload.items) {
  const rec = byId.get(item.id);
  if (!rec) continue;
  const better = (byBill.get(item.billId) ?? []).filter(
    (r) => r.id !== rec.id && r.yeas > r.nays && r.src === 'journal',
  );
  if (!better.length) continue;
  // Only a problem when the one in use is NOT itself a journal-sourced passage.
  if (rec.yeas > rec.nays && rec.src === 'journal') continue;
  const flip = better.some((b) => Math.sign(b.valence) !== Math.sign(rec.valence));
  shadowed.push({ bill: item.billId, using: `${rec.yeas}-${rec.nays}`, src: rec.src, flip,
    alt: better.map((b) => `${b.yeas}-${b.nays}(j${b.journalRecord})`).join(' ') });
}

check('no question is scored on a lesser vote while an adopted one is on the record',
  shadowed.length === 0,
  shadowed.length
    ? shadowed.map((s) => `${s.bill} using ${s.using} [${s.src}] vs ${s.alt}${s.flip ? ' SIGN FLIP' : ''}`).join('; ')
    : `${payload.items.length} checked`);

// Called out separately because it is the difference between a question being
// imprecise and a question scoring the reader the wrong way round.
const flips = shadowed.filter((s) => s.flip);
check('no question carries the opposite sign to an adopted vote on the same bill',
  flips.length === 0,
  flips.map((s) => s.bill).join(', ') || 'none');

// -----------------------------------------------------------------------------
// The blanks that are not blanks
//
// A person shown on the page with no vote on the question's roll call, who DID
// vote on another roll call of the same bill. The page used to render that as a
// plain absence, which reads as "did not take a position" and is wrong. The
// payload now carries an `elsewhere` field for it, written by
// add_elsewhere_votes.mjs and displayed only, never scored.
//
// This recomputes the field from the corpus rather than trusting it. A stale
// payload — the field written once, then a re-export dropping it — is the
// failure that would otherwise be invisible, because every other thing about
// such a file is correct.

const idxOf = new Map();
(corpusFile.memberOrder ?? []).forEach((id, i) => idxOf.set(id, i));
const castOf = (ch) => (ch === 'y' ? 1 : ch === 'n' ? -1 : null);
const onPage = [
  ...payload.candidates.map((c) => c.id),
  ...(payload.comparators ?? []).map((c) => c.id),
];

let expected = 0;
const missing = [], spurious = [], wrongWay = [], onAVoter = [];
for (const item of payload.items) {
  const all = corpus.filter((v) => v.billId === item.billId);
  const sel = all.find((v) => v.id === item.id);
  if (!sel) continue;
  const others = all.filter((v) => v.id !== item.id);
  const have = item.elsewhere ?? {};

  for (const id of onPage) {
    const i = idxOf.get(id);
    if (i === undefined) continue;
    const here = castOf(sel.v[i]);
    const there = others.map((v) => castOf(v.v[i])).filter((c) => c !== null);
    const want = here === null && there.length && new Set(there).size === 1 ? there[0] : null;

    if (want !== null) {
      expected++;
      if (!(id in have)) missing.push(`${item.billId}/${id.slice(-6)}`);
      else if (have[id] !== want) wrongWay.push(`${item.billId}/${id.slice(-6)}`);
    } else if (id in have) {
      // Either nothing to report, or — worse — the person has a real vote on
      // this roll call and the mark would contradict it on screen.
      (here === null ? spurious : onAVoter).push(`${item.billId}/${id.slice(-6)}`);
    }
  }
}

check('every absence that hides a vote on the same bill is marked',
  missing.length === 0, missing.join(', ') || `${expected} case(s) marked`);
check('no mark claims a vote the corpus does not show',
  spurious.length === 0 && wrongWay.length === 0,
  [...spurious, ...wrongWay].join(', ') || 'none');
check('no mark sits on a member who DID vote on this roll call',
  onAVoter.length === 0, onAVoter.join(', ') || 'none');


console.log(fails
  ? `\n  ${fails} problem(s). See scripts/export_quiz_data.ts for the selection rule.\n`
  : '\n  every question points at a roll call the House adopted\n');

process.exitCode = fails ? 1 : 0;
