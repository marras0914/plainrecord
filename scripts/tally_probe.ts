/**
 * PlainRecord — end-to-end probe for the opt-in tally
 *
 *   vercel dev            # in one terminal
 *   npm run tally:probe   # in another
 *
 * The smoke suites cover validation and the reading with no store attached.
 * This is the part they cannot reach: that the function actually bundles (it
 * imports the 97 KB payload and the real estimator), that Redis is reachable,
 * and that a share moves exactly the counters it should and no others.
 *
 * IT REFUSES TO RUN AGAINST PRODUCTION. Every write here is a fake response,
 * and a probe that could put fake responses into the number a reporter gets
 * quoted is a probe that eventually will. The endpoint must be localhost, and
 * the namespace it touches must be the dev one.
 *
 * It is re-runnable: the rate limit is one share per address per six hours, so
 * the probe clears its own namespace's rate-limit keys first. It only ever
 * deletes keys under `t:development:`.
 */

import { readFileSync } from 'node:fs';
import { Redis } from '@upstash/redis';

import { HEADLINE_ITEMS } from '../src/quiz-data';
import { binOf, deltaBins, derive } from '../api/_tally';

// ---------------------------------------------------------------------------

const endpoint = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3000';

if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(endpoint.replace(/\/$/, ''))) {
  console.error(
    `\n  refusing to probe ${endpoint}\n` +
    '  This writes fake responses. It runs against localhost only.\n',
  );
  process.exit(1);
}

/** `vercel dev` sets VERCEL_ENV=development, so that is the namespace to watch. */
const NS = 'development';

function env(): { url: string; token: string } {
  // .env.local, not process.env: this script is run by npm, which does not load it.
  const raw = readFileSync('.env.local', 'utf8');
  const get = (k: string): string => {
    const m = raw.match(new RegExp(`^${k}="?([^"\\r\\n]+)"?`, 'm'));
    if (!m) throw new Error(`.env.local has no ${k} — run: vercel env pull .env.local`);
    return m[1];
  };
  return { url: get('KV_REST_API_URL'), token: get('KV_REST_API_TOKEN') };
}

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) pass++;
  else fail++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

type Counts = Record<string, unknown> | null;
const num = (h: Counts, f: string): number => Number(h?.[f] ?? 0) || 0;

async function main(): Promise<void> {
  const db = new Redis(env());
  const base = endpoint.replace(/\/$/, '');

  // --- make the run repeatable, without touching anything but dev rate keys --
  const rateKeys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await db.scan(cursor, { match: `t:${NS}:rl:*`, count: 200 });
    cursor = String(next);
    rateKeys.push(...batch);
  } while (cursor !== '0');
  if (rateKeys.length) await db.del(...rateKeys);
  console.log(`\n  cleared ${rateKeys.length} dev rate-limit key(s)\n`);

  // --- what we are about to send --------------------------------------------
  const guess = -0.8;
  const payload = {
    mode: 'short' as const,
    guess,
    answers: HEADLINE_ITEMS.map((i) => ({ qid: i.id, agree: true })),
  };
  // Computed locally through the same modules the endpoint uses, so the
  // assertions below are against a predicted bin rather than against whatever
  // came back — a check that read the answer off the response would pass no
  // matter what the endpoint stored.
  const expected = derive(payload);
  const expectedDelta = deltaBins(expected.netLean, guess);

  console.log(`  expecting verdict "${expected.verdict}", bin ${expected.bin}, ` +
    `guess bin ${binOf(guess)}, delta ${expectedDelta}\n`);

  const snapshot = async () => ({
    meta: (await db.hgetall(`t:${NS}:meta`)) as Counts,
    region: (await db.hgetall(`t:${NS}:region`)) as Counts,
    verdictTx: (await db.hgetall(`t:${NS}:verdict:us-other`)) as Counts,
    verdictIntl: (await db.hgetall(`t:${NS}:verdict:intl`)) as Counts,
    q: (await db.hgetall(`t:${NS}:q`)) as Counts,
  });

  const before = await snapshot();

  // --- the request ----------------------------------------------------------
  let res: Response;
  try {
    res = await fetch(`${base}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`\n  could not reach ${base} — is \`vercel dev\` running?\n  ${String(err)}\n`);
    process.exit(1);
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  check('POST /api/share succeeds', res.ok, `${res.status} ${JSON.stringify(body).slice(0, 90)}`);
  if (!res.ok) {
    console.log('\n  aborting: nothing was written, so the counter checks below would be meaningless\n');
    process.exit(1);
  }

  check('it reports a running total', typeof body.total === 'number' && (body.total as number) > 0,
    String(body.total));
  check('and the verdict it derived matches the local computation',
    body.verdict === expected.verdict, `${body.verdict} vs ${expected.verdict}`);

  const after = await snapshot();

  // --- the counters ---------------------------------------------------------
  check('meta.total went up by exactly one',
    num(after.meta, 'total') - num(before.meta, 'total') === 1,
    `${num(before.meta, 'total')} -> ${num(after.meta, 'total')}`);
  check('meta.guessed went up by exactly one',
    num(after.meta, 'guessed') - num(before.meta, 'guessed') === 1,
    `${num(before.meta, 'guessed')} -> ${num(after.meta, 'guessed')}`);

  // The reading is `consistent`, which carries a position, so the readable
  // counters must have moved too. If the fixture ever stops producing a
  // readable reading this check fails loudly rather than silently testing the
  // unreadable path.
  check('the fixture produces a readable reading',
    expected.verdict !== 'weakLoad' && expected.verdict !== 'fewMarks', expected.verdict);
  check('meta.readable went up by exactly one',
    num(after.meta, 'readable') - num(before.meta, 'readable') === 1,
    `${num(before.meta, 'readable')} -> ${num(after.meta, 'readable')}`);
  check('meta.guessedReadable went up by exactly one',
    num(after.meta, 'guessedReadable') - num(before.meta, 'guessedReadable') === 1,
    `${num(before.meta, 'guessedReadable')} -> ${num(after.meta, 'guessedReadable')}`);

  // Region: localhost has no geo headers, so it must land in intl and NOT in tx.
  // This is the check that matters for the Texas figure — a local request that
  // counted as Texan would mean every developer click skews it.
  const movedRegion = (['tx', 'us-other', 'intl'] as const).filter(
    (r) => num(after.region, r) - num(before.region, r) !== 0);
  check('exactly one region counter moved', movedRegion.length === 1, movedRegion.join(', ') || 'none');
  check('a request with no geo headers is NOT counted as Texas',
    num(after.region, 'tx') === num(before.region, 'tx'),
    `tx ${num(before.region, 'tx')} -> ${num(after.region, 'tx')}`);
  check('it is counted as intl instead',
    num(after.region, 'intl') - num(before.region, 'intl') === 1,
    `intl ${num(before.region, 'intl')} -> ${num(after.region, 'intl')}`);

  check(`verdict:intl.${expected.verdict} went up by exactly one`,
    num(after.verdictIntl, expected.verdict) - num(before.verdictIntl, expected.verdict) === 1,
    `${num(before.verdictIntl, expected.verdict)} -> ${num(after.verdictIntl, expected.verdict)}`);

  const leanKey = `t:${NS}:lean:intl`;
  const lean = (await db.hgetall(leanKey)) as Counts;
  check('the lean bin the endpoint stored is the one computed locally',
    num(lean, String(expected.bin)) > 0, `bin ${expected.bin} = ${num(lean, String(expected.bin))}`);

  const delta = (await db.hgetall(`t:${NS}:delta:intl`)) as Counts;
  check('the delta bin is actual minus guess',
    num(delta, String(expectedDelta)) > 0, `delta ${expectedDelta} = ${num(delta, String(expectedDelta))}`);

  // Per-question counts: one per answered item, all on the agree side.
  const firstId = HEADLINE_ITEMS[0].id;
  check('each answered vote is counted once, on the side it was answered',
    num(after.q, `${firstId}:agree`) - num(before.q, `${firstId}:agree`) === 1 &&
    num(after.q, `${firstId}:disagree`) - num(before.q, `${firstId}:disagree`) === 0,
    `${firstId.slice(0, 22)}… agree +1, disagree +0`);

  // --- the rate limit -------------------------------------------------------
  const again = await fetch(`${base}/api/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    body: JSON.stringify(payload),
  });
  check('a second share from the same address is refused', again.status === 429, String(again.status));
  const afterRetry = (await db.hgetall(`t:${NS}:meta`)) as Counts;
  check('and the refusal counted nothing',
    num(afterRetry, 'total') === num(after.meta, 'total'),
    `${num(after.meta, 'total')} -> ${num(afterRetry, 'total')}`);

  // A malformed body must NOT consume a slot. This is the bug the Cloudflare
  // draft shipped, so it is checked directly: clear the limit, send rubbish,
  // then send a good one and require it to be counted.
  if (rateKeys.length >= 0) {
    let c = '0';
    const keys: string[] = [];
    do {
      const [next, batch] = await db.scan(c, { match: `t:${NS}:rl:*`, count: 200 });
      c = String(next);
      keys.push(...batch);
    } while (c !== '0');
    if (keys.length) await db.del(...keys);

    const bad = await fetch(`${base}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ mode: 'short', guess: 5, answers: [] }),
    });
    check('a malformed body is refused', bad.status === 422, String(bad.status));

    const good = await fetch(`${base}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify(payload),
    });
    check('and it did NOT burn the rate-limit slot: the next honest share is counted',
      good.ok, `${good.status} — this is the ordering bug the Cloudflare draft had`);
  }

  // --- the read endpoint ----------------------------------------------------
  const tallyRes = await fetch(`${base}/api/tally`);
  check('GET /api/tally succeeds', tallyRes.ok, String(tallyRes.status));
  const tally = (await tallyRes.json()) as {
    total: number; readable: number; guessed: number; guessedReadable: number;
    regions: Record<string, { lean: number[]; verdict: Record<string, number> }>;
    note: string;
  };
  check('/api/tally reports the same total as the store',
    tally.total === num(afterRetry, 'total') + 1, `${tally.total}`);
  check('/api/tally emits all eleven bins, zeros included',
    tally.regions.intl.lean.length === 11, String(tally.regions.intl.lean.length));
  check('/api/tally emits every verdict, zeros included',
    Object.keys(tally.regions.intl.verdict).length === 7,
    Object.keys(tally.regions.intl.verdict).join(','));
  check('/api/tally carries the not-a-poll note', /Not a poll/i.test(tally.note));
  check('the lean array sums to the readable count, by construction',
    tally.regions.intl.lean.reduce((a, b) => a + b, 0) +
    tally.regions.tx.lean.reduce((a, b) => a + b, 0) +
    tally.regions['us-other'].lean.reduce((a, b) => a + b, 0) === tally.readable,
    `${tally.readable} readable`);

  console.log(`\n  ${pass} passed, ${fail} failed`);
  console.log(`  wrote ${NS} namespace only — production counters untouched\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  ${String(err instanceof Error ? err.stack : err)}\n`);
  process.exit(1);
});
