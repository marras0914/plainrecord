/**
 * POST /api/share — opt-in only.
 *
 * Body: { mode: "short"|"full", guess: number|null, answers: [{ qid, agree }] }
 *
 * Increments aggregate counters and stores nothing else. See api/_tally.ts for
 * what is kept and what this deliberately does not defend against.
 *
 * THE ORDER OF THE THREE SIDE EFFECTS IS THE POINT OF THIS FILE. The draft this
 * replaces reserved the rate-limit slot as its first action, before it had even
 * parsed the body. Any malformed request — a client bug, a truncated upload, a
 * double-submit race — burned the reader's slot for six hours and answered the
 * honest retry with `already_counted`, so the tally lost the response and the
 * reader was told it had been counted. Here nothing is reserved until the body
 * has parsed, validated and scored, and the reservation is released again if
 * the write that follows it fails.
 */

import {
  KEYS,
  RATE_TTL_SECONDS,
  derive,
  json,
  originAllowed,
  rateKey,
  redis,
  regionOf,
  validate,
  deltaBins,
  binOf,
  carriesPosition,
  handleNode,
} from './_tally.js';

export const config = { runtime: 'nodejs' };

async function share(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': request.headers.get('origin') ?? '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!originAllowed(request.headers.get('origin'))) return json({ error: 'origin' }, 403);

  const salt = process.env.RATE_SALT;
  if (!salt) {
    // Refuse rather than counting without a rate limit. A deployment with no
    // salt is a deployment that cannot tell one submitter from a thousand, and
    // a preview without the secret should be inert, not quietly authoritative.
    return json({ error: 'unconfigured' }, 503);
  }

  // ---- parse and validate before anything is written -----------------------

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const payload = validate(raw);
  if (!payload) return json({ error: 'invalid' }, 422);

  let derived;
  try {
    derived = derive(payload);
  } catch {
    return json({ error: 'unscorable' }, 422);
  }

  // ---- reserve, write, release on failure ---------------------------------

  const db = redis();
  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '';

  // No address means no rate limit is possible. Counting anyway would make the
  // limit optional for anyone who can strip a header, so this declines instead.
  if (!ip) return json({ error: 'no_client_address' }, 400);

  const rk = rateKey(ip, salt);
  const reserved = await db.set(rk, '1', { nx: true, ex: RATE_TTL_SECONDS });
  if (reserved === null) return json({ error: 'already_counted' }, 429);

  const region = regionOf(request.headers);
  const qKey = KEYS.questions();

  // Whether this reading carries a position at all. Everything positional below
  // is gated on it, so the lean histogram's own total IS the readable count and
  // no consumer has to rescale it to get an honest denominator.
  const readable = carriesPosition(derived.verdict);

  try {
    const pipe = db.pipeline();
    pipe.hincrby(KEYS.meta(), 'total', 1);
    pipe.hincrby(KEYS.region(), region, 1);
    pipe.hincrby(KEYS.mode(), payload.mode, 1);

    // Always counted, including the unreadable readings: this hash is how
    // "how many could not be read" is answered, so it must see everything.
    pipe.hincrby(KEYS.verdict(region), derived.verdict, 1);

    if (readable) {
      pipe.hincrby(KEYS.meta(), 'readable', 1);
      pipe.hincrby(KEYS.lean(region), String(derived.bin), 1);
    }

    // The guess counters move only for readers who made a prediction, and the
    // comparison ones only when there is also a position to compare against.
    // Three separate denominators, because a claim about predictions must not
    // quote the overall total (the guess is skippable) and a claim about missing
    // your own prediction must not quote readers whose result had no position to
    // miss it by.
    if (payload.guess !== null) {
      pipe.hincrby(KEYS.meta(), 'guessed', 1);
      if (readable) {
        pipe.hincrby(KEYS.meta(), 'guessedReadable', 1);
        pipe.hincrby(KEYS.guess(region), String(binOf(payload.guess)), 1);
        pipe.hincrby(KEYS.delta(region), String(deltaBins(derived.netLean, payload.guess)), 1);
      }
    }

    for (const a of payload.answers) {
      pipe.hincrby(qKey, `${a.qid}:${a.agree ? 'agree' : 'disagree'}`, 1);
    }

    await pipe.exec();
  } catch {
    // The reservation exists only to stop a double count of a write that
    // happened. This one did not, so it must not cost the reader six hours.
    await db.del(rk).catch(() => {});
    return json({ error: 'write_failed' }, 502);
  }

  const total = Number((await db.hget<string | number>(KEYS.meta(), 'total')) ?? 0);

  return json(
    { ok: true, total, verdict: derived.verdict },
    200,
    request.headers.get('origin')
      ? { 'access-control-allow-origin': request.headers.get('origin') as string }
      : {},
  );
}

// See handleNode in ./_tally: the Node (req, res) signature is the one every
// Vercel runtime version accepts, and the Web shape above is built from it.
export default handleNode(share);
