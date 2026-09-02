/**
 * PlainRecord — is the custom domain actually live yet?
 *
 *   node scripts/check_domain.mjs
 *   node scripts/check_domain.mjs --domain example.com
 *
 * Run this after changing the DNS records at the registrar. It answers the one
 * question that matters — "is rightnleft.com serving OUR site?" — and it answers
 * it honestly, which a status code alone does not.
 *
 * The trap this exists to avoid: while the domain still points at Squarespace's
 * parking page, `curl -o /dev/null -w '%{http_code}' https://rightnleft.com`
 * returns 200. Two hundred, valid TLS, no errors — and completely wrong. It is
 * someone else's "Coming Soon" page. So this checks WHO is answering (the Server
 * header, the x-vercel-* headers, the page title, and our own CSP) rather than
 * whether anything answered at all.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(exec);
const argv = process.argv.slice(2);
const DOMAIN = argv[argv.indexOf('--domain') + 1] ?? 'rightnleft.com';

// --domain reaches a shell command below, so it is validated as a hostname rather
// than trusted. Windows needs shell:true to run npx.cmd at all, which means the
// only safe input is input that cannot contain shell syntax in the first place.
if (!/^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(DOMAIN)) {
  console.error(`\n  "${DOMAIN}" is not a valid hostname.\n`);
  process.exit(2);
}
const ORIGIN = 'rightnleft.vercel.app';

// Vercel's published apex target. Kept here only to compare against what DNS
// says — always take the authoritative value from `vercel domains inspect`.
const VERCEL_APEX = '76.76.21.21';

const pad = (s, n) => String(s).padEnd(n);
let verdicts = [];

const say = (state, label, detail = '') => {
  const mark = { ok: '  ok  ', no: ' NOT  ', hm: '  ?   ' }[state];
  console.log(`${mark}${pad(label, 34)}${detail}`);
  verdicts.push(state);
};

/** Resolve A records without depending on nslookup's output format. */
async function resolve(host) {
  const { promises: dns } = await import('node:dns');
  try {
    return await dns.resolve4(host);
  } catch (e) {
    return { error: e.code ?? e.message };
  }
}

async function head(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual' });
    const body = res.status < 400 ? await res.text() : '';
    return {
      status: res.status,
      location: res.headers.get('location'),
      server: res.headers.get('server'),
      vercelId: res.headers.get('x-vercel-id'),
      csp: res.headers.get('content-security-policy'),
      title: /<title>([^<]*)<\/title>/i.exec(body)?.[1]?.trim() ?? null,
    };
  } catch (e) {
    return { error: e.cause?.code ?? e.message };
  }
}

console.log(`\n  checking ${DOMAIN}\n`);

// --- 1. DNS ------------------------------------------------------------------
for (const host of [DOMAIN, `www.${DOMAIN}`]) {
  const a = await resolve(host);
  if (a.error) {
    say('no', `DNS  ${host}`, a.error);
  } else if (a.includes(VERCEL_APEX)) {
    say('ok', `DNS  ${host}`, a.join(', '));
  } else {
    say('no', `DNS  ${host}`, `${a.join(', ')}  (expected ${VERCEL_APEX})`);
  }
}

// --- 2. Who is answering -----------------------------------------------------
console.log('');
const live = await head(`https://${DOMAIN}/`);
if (live.error) {
  say('no', 'HTTPS responds', live.error);
} else {
  // Our own CSP is the strongest single tell: nobody else's page carries it.
  const ours = Boolean(live.vercelId) || (live.csp ?? '').includes("form-action 'none'");
  const parked = /squarespace/i.test(live.server ?? '') || /coming soon/i.test(live.title ?? '');
  if (ours) say('ok', 'served by our deployment', live.title ?? `HTTP ${live.status}`);
  else if (parked) say('no', 'still the parked page', `Server: ${live.server}, "${live.title}"`);
  else say('hm', 'answered by something else', `Server: ${live.server}, "${live.title}"`);

  // A 200 from the wrong host is the exact failure this script exists to catch,
  // so never report the status code on its own.
  if (!ours) say('hm', 'HTTP status alone', `${live.status} — true but meaningless here`);
}

// --- 3. Compare against the origin we know is right --------------------------
console.log('');
const origin = await head(`https://${ORIGIN}/`);
if (origin.error) say('no', `origin ${ORIGIN}`, origin.error);
else say('ok', `origin ${ORIGIN}`, origin.title ?? `HTTP ${origin.status}`);

if (!live.error && !origin.error && live.title && origin.title) {
  say(live.title === origin.title ? 'ok' : 'no', 'domain matches the origin',
    live.title === origin.title ? 'same page' : `"${live.title}" vs "${origin.title}"`);
}

// --- 4. Vercel's own view ----------------------------------------------------
console.log('');
try {
  // Two details, both learned the hard way:
  //   - Vercel prints "not configured properly" to STDERR, so reading only stdout
  //     reported a valid domain while the CLI was plainly saying otherwise. Any
  //     check that greps command output has to grep all of it.
  //   - one shell string, not execFile with an args array: Windows refuses to
  //     spawn npx.cmd without a shell (EINVAL), and passing an args array WITH a
  //     shell is what node deprecated. DOMAIN is hostname-validated above, which
  //     is what makes the string form safe here.
  const { stdout, stderr } = await run(`npx vercel domains inspect ${DOMAIN}`, {
    timeout: 60_000,
  }).catch((e) => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? '' }));
  const out = stdout + stderr;
  if (!out.trim()) {
    say('hm', 'Vercel domain configuration', 'no output (not logged in?)');
  } else {
    const misconfigured = /not configured properly/i.test(out);
    say(misconfigured ? 'no' : 'ok', 'Vercel domain configuration',
      misconfigured
        ? 'Vercel still reports it misconfigured'
        : 'Vercel reports it configured');
  }
} catch (e) {
  say('hm', 'Vercel domain configuration', `could not query — ${e.message}`);
}

const bad = verdicts.filter((v) => v === 'no').length;
console.log(
  bad === 0
    ? `\n  ${DOMAIN} is live and serving our site.\n`
    : `\n  not live yet — ${bad} check(s) still failing. DNS changes can take minutes;\n` +
      `  Squarespace's TTL can hold the old answer for up to 48 hours.\n`,
);
process.exit(bad === 0 ? 0 : 1);
