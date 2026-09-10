/**
 * The Purple Strip — shared pieces of the opt-in tally
 *
 * WHAT THE ENDPOINTS STORE, AND WHY IT IS ONLY COUNTS. Every key here is an
 * aggregate counter. There is no row per submission, no submission log and no
 * timestamp, so there is nothing to correlate one response against another or
 * against a request log. That is not incidental: a table with one row per
 * person is a different privacy claim from a table of totals even when the row
 * carries no name, and the site's own copy promises the second one.
 *
 * WHY THE CLIENT SENDS ANSWERS AND NOT A POSITION. An earlier draft posted a
 * precomputed bin (0..10) and the server stored it. That made the tally a
 * record of what browsers asserted about themselves, and it threw away the two
 * numbers that make a reading honest: `valence.ts` is explicit that netLean
 * alone "cannot tell mixed from muted", and `describeProfile` refuses a
 * directional reading below `PROFILE_BANDS.weakLoad`. A tally of bins would
 * have reported, in aggregate, exactly the flattering-purple claim the results
 * screen declines to make for one reader.
 *
 * So the client posts the answers and the guess — the only two things it is the
 * authority on — and the server recomputes the profile through the SAME modules
 * the page uses. `src/quiz-data.ts` exists because a hand-ported second copy of
 * the estimator once drifted from the tested one; adding a third copy in here
 * would repeat that mistake in a place nobody looks.
 *
 * WHAT THIS DOES NOT DEFEND AGAINST. `/share` is a public endpoint. The
 * rate limit is a hashed IP with a TTL, which stops a refresh loop and an
 * honest double-tap. It does not stop anyone determined: a script with a pool
 * of addresses can move these counters, and no amount of server-side
 * recomputation changes that. The numbers are worth quoting as "what the people
 * who chose to share landed on", never as a measurement of a population. The
 * playbook says the same thing in the same words on purpose.
 */

import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { ALL_ITEMS, HEADLINE_ITEMS, adapt, profileOf, describe } from '../src/quiz-data.js';
import type { AnswerMap } from '../src/quiz-data.js';
import type { ProfileVerdict } from '../valence.js';
import { binOf } from '../bins.js';

export type Region = 'tx' | 'us-other' | 'intl';
export type Mode = 'short' | 'full';

export const REGIONS: readonly Region[] = ['tx', 'us-other', 'intl'];
export const MODES: readonly Mode[] = ['short', 'full'];

/** Every verdict `describeProfile` can return. Listed so /tally emits a stable
 *  shape with explicit zeros rather than only the verdicts seen so far. */
export const VERDICTS: readonly ProfileVerdict[] = [
  'fewMarks',
  'weakLoad',
  'balanced',
  'crossover',
  'consistent',
  'mildLean',
  'nearMiddle',
];

/**
 * The two readings that carry NO position, and the reason the counters below are
 * split rather than incremented for everybody.
 *
 * `fewMarks` answered too little to read at all. `weakLoad` answered questions
 * that never split the parties, and `describeProfile` refuses it a direction
 * because "the ratio alone cannot tell mixed from muted". If the lean histogram
 * counted these, then any percentage taken off it would have a denominator that
 * includes readers with no position, and the only ways out would be to quote
 * the inflated figure or to rescale the histogram — which is inventing data.
 * So a position is only ever counted for a reading that has one, and the
 * unreadable ones are counted in the verdict hash where they can be reported
 * as themselves.
 */
export const UNREADABLE_VERDICTS: readonly ProfileVerdict[] = ['fewMarks', 'weakLoad'];

export function carriesPosition(v: ProfileVerdict): boolean {
  return !UNREADABLE_VERDICTS.includes(v);
}

/** One share per hashed address per six hours. */
export const RATE_TTL_SECONDS = 6 * 60 * 60;


/**
 * The shape of a real item id, which is an Open States vote id:
 * `ocd-vote/b57ab7cb-8312-4c8a-87b1-01371d16ffbc`, 45 characters with a slash.
 *
 * The Cloudflare draft this replaces used `/^[A-Za-z0-9_.-]{1,32}$/`, which
 * rejects every id the quiz actually has — on the slash and again on the
 * length. `/share` would have answered 422 to every genuine submission and
 * collected nothing, while looking like it worked. The suite now asserts every
 * exported id against this pattern so a payload whose id format changes fails
 * a test rather than the endpoint.
 */
const QID_RE = /^[A-Za-z0-9_./-]{1,64}$/;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Counter keys, namespaced by deployment environment.
 *
 * A preview deployment and a local `vercel dev` share the one Upstash store
 * with production, so without the namespace every test click would land in the
 * number a reporter gets quoted. `VERCEL_ENV` is set by the platform and is not
 * something a request can influence.
 */
export function ns(): string {
  return process.env.VERCEL_ENV ?? 'development';
}

export const KEYS = {
  meta: () => `t:${ns()}:meta`,
  region: () => `t:${ns()}:region`,
  mode: () => `t:${ns()}:mode`,
  verdict: (r: Region) => `t:${ns()}:verdict:${r}`,
  lean: (r: Region) => `t:${ns()}:lean:${r}`,
  guess: (r: Region) => `t:${ns()}:guess:${r}`,
  delta: (r: Region) => `t:${ns()}:delta:${r}`,
  questions: () => `t:${ns()}:q`,
  rate: (hash: string) => `t:${ns()}:rl:${hash}`,
};

export function redis(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('tally: KV_REST_API_URL/TOKEN missing');
  return new Redis({ url, token });
}

/**
 * The rate-limit key for an address, salted so the store never holds anything
 * reversible to an IP. Without a salt this would be a plain SHA-256 of an
 * address, which is a lookup table away from being the address itself.
 */
export function rateKey(ip: string, salt: string): string {
  return KEYS.rate(createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32));
}

// ---------------------------------------------------------------------------
// Region
// ---------------------------------------------------------------------------

/**
 * Coarse region from Vercel's edge geolocation headers.
 *
 * Read from headers rather than from the address, so no IP is handled for this
 * at all — the salted hash above is the only place one is touched, and only to
 * be thrown away. Coarse and approximate: a VPN or a Texan on holiday is
 * mislabelled, and "geolocated to Texas" is not "registered Texas voter". It is
 * a transparency filter so out-of-state traffic cannot skew a Texas figure, not
 * evidence about anybody.
 */
export function regionOf(headers: Headers): Region {
  const country = headers.get('x-vercel-ip-country');
  if (country !== 'US') return 'intl';
  return headers.get('x-vercel-ip-country-region') === 'TX' ? 'tx' : 'us-other';
}

// ---------------------------------------------------------------------------
// Bucketing
//
// Re-exported from ../bins so the browser's share link and this endpoint agree
// about what bin 8 means. See the note at the top of that file for why it is
// not just declared here.
// ---------------------------------------------------------------------------

export { BINS, CENTER_BIN, clamp, binOf, deltaBins } from '../bins.js';

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

export interface SharePayload {
  mode: Mode;
  /** Predicted lean in [-1, 1], or null when the reader skipped the guess. */
  guess: number | null;
  answers: { qid: string; agree: boolean }[];
}

export function itemsFor(mode: Mode) {
  return mode === 'short' ? HEADLINE_ITEMS : ALL_ITEMS;
}

/**
 * Validate a posted body.
 *
 * The answer cap is the real item count for the mode, read from the payload
 * rather than written down here. The Cloudflare draft this replaces hard-coded
 * 20, which silently 422'd every reader who took the deeper run — the quiz
 * offers 7 or all 67, so a cap of 20 rejected exactly the most engaged
 * response it could receive.
 */
export function validate(data: unknown): SharePayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const { mode, guess, answers } = data as Record<string, unknown>;

  if (mode !== 'short' && mode !== 'full') return null;

  if (guess !== null && guess !== undefined) {
    if (typeof guess !== 'number' || !Number.isFinite(guess)) return null;
    if (guess < -1 || guess > 1) return null;
  }

  if (!Array.isArray(answers) || answers.length === 0) return null;

  const known = new Set(itemsFor(mode).map((i) => i.id));
  if (answers.length > known.size) return null;

  const seen = new Set<string>();
  for (const a of answers) {
    if (typeof a !== 'object' || a === null) return null;
    const { qid, agree } = a as Record<string, unknown>;
    if (typeof qid !== 'string' || !QID_RE.test(qid)) return null;
    if (typeof agree !== 'boolean') return null;
    // An id that is not in this mode's item list cannot be scored, so it cannot
    // be counted either. Silently dropping it would let a caller inflate the
    // per-question counts with ids the quiz never asked about.
    if (!known.has(qid)) return null;
    if (seen.has(qid)) return null;
    seen.add(qid);
  }

  return {
    mode,
    guess: typeof guess === 'number' ? guess : null,
    answers: answers as SharePayload['answers'],
  };
}

// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

export interface Derived {
  verdict: ProfileVerdict;
  netLean: number;
  crossoverShare: number;
  partisanLoad: number;
  n: number;
  bin: number;
}

/**
 * Recompute the reader's profile from their answers, through the real modules.
 *
 * Nothing about the position is taken on trust from the client. `adapt` is pure
 * and reads only the exported payload, and `profileOf`/`describe` are the same
 * functions `src/main.ts` renders from, so a reading here cannot disagree with
 * the one the reader was shown.
 */
export function derive(payload: SharePayload): Derived {
  const items = itemsFor(payload.mode);
  const answers: AnswerMap = {};
  for (const a of payload.answers) answers[a.qid] = a.agree ? 1 : -1;

  const p = profileOf(adapt(items), answers);
  return {
    verdict: describe(p).verdict,
    netLean: p.netLean,
    crossoverShare: p.crossoverShare,
    partisanLoad: p.partisanLoad,
    n: p.n,
    bin: binOf(p.netLean),
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * Origins allowed to POST. A browser cannot forge `Origin`, so this keeps a
 * casual cross-site embed from submitting on a visitor's behalf. It is not a
 * defence against curl, which sends no Origin at all and is handled by treating
 * the whole tally as self-selected rather than as evidence.
 */
const ALLOWED_ORIGINS = [
  'https://rightnleft.com',
  'https://www.rightnleft.com',
  'http://localhost:5173',
  'http://localhost:4173',
];

export function originAllowed(origin: string | null): boolean {
  if (!origin) return true; // no Origin: a non-browser caller, not a cross-site one
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Preview deployments, which are per-commit hostnames.
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
}

export function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

/**
 * Node-signature adapter.
 *
 * The handlers are written against Web `Request`/`Response` because that is
 * what the smoke suites can construct and assert on without a server. Vercel's
 * Node runtime accepts that signature on current versions but NOT on older
 * ones: `vercel dev` on CLI 50 calls the default export as `(req, res)` with a
 * Node `IncomingMessage`, and the handler died on `request.headers.get is not
 * a function` — a 500 with an empty body, which looks exactly like a Redis
 * problem from the outside.
 *
 * The `(req, res)` signature is supported by every version, so it is the one
 * exported and the Web shape is built here. That keeps one code path rather
 * than a version check, and keeps the handlers testable.
 */
export function handleNode(
  fn: (request: Request) => Promise<Response>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const method = req.method ?? 'GET';

    // The runtime may or may not have parsed the body already, depending on
    // version and content type. Both cases have to work, and a body that has
    // been consumed cannot be read from the stream a second time.
    let body = '';
    const pre = (req as IncomingMessage & { body?: unknown }).body;
    if (pre !== undefined && pre !== null) {
      body = typeof pre === 'string' ? pre : Buffer.isBuffer(pre) ? pre.toString('utf8') : JSON.stringify(pre);
    } else if (method !== 'GET' && method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string));
      body = Buffer.concat(chunks).toString('utf8');
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) for (const one of v) headers.append(k, one);
      else if (v !== undefined) headers.set(k, v);
    }

    const host = req.headers.host ?? 'localhost';
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
    const request = new Request(`${proto}://${host}${req.url ?? '/'}`, {
      method,
      headers,
      body: body === '' ? undefined : body,
    });

    let out: Response;
    try {
      out = await fn(request);
    } catch (err) {
      // A throw here would otherwise surface as an empty 500 with the reason
      // only in a log nobody is watching.
      console.error('tally handler threw:', err);
      out = json({ error: 'internal' }, 500);
    }

    res.statusCode = out.status;
    out.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await out.arrayBuffer()));
  };
}
