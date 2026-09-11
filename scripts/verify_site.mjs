/**
 * PlainRecord — rendered-page verification
 *
 *   node scripts/verify_site.mjs                 # against `npm run preview` on :4173
 *   node scripts/verify_site.mjs --with-headers  # against dist/ + the real vercel.json headers
 *   node scripts/verify_site.mjs --url http://localhost:5173
 *
 * `npm test` proves the data pipeline and the scoring modules are right. It says
 * nothing about the page, because the page is where two whole classes of bug live:
 *
 *   1. The port to the real modules changed behaviour. The prototype computed
 *      profiles in inline JS; src/quiz-data.ts adapts the shipped payload back
 *      into the shapes valence.ts and scoring.ts expect. A wrong adapter still
 *      renders — it just renders wrong numbers.
 *   2. Production headers break the page. A CSP that blocks your own script looks
 *      perfect under `vite preview` (which sets no CSP) and is broken only once
 *      deployed. --with-headers serves dist/ through the actual vercel.json rules
 *      so a violation shows up here instead of on rightnleft.com.
 *
 * Assertions test PROPERTIES, not digits captured from a previous run. The item
 * count legitimately moves when a headline bill is force-added, and pinning an
 * exact lean once turned a correct build red. Where a value IS the claim —
 * `consistent` producing 0% crossover, `muted` producing a near-zero partisan
 * load — it stays exact, because that is the thing the preset exists to show.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname, sep } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const withHeaders = argv.includes('--with-headers');
const urlArg = argv[argv.indexOf('--url') + 1];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    '\n  playwright is not installed. It is a devDependency of this repo:\n' +
      '    npm install\n' +
      '    npx playwright install chromium\n',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Optionally serve dist/ through the production headers
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
};

let server = null;
let URL_UNDER_TEST = urlArg ?? 'http://localhost:4173/';

if (withHeaders) {
  const dist = join(ROOT, 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    console.error('\n  dist/index.html not found — run `npm run build` first.\n');
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  // vercel.json `source` is a path pattern, not a regex. Only `(.*)` is used here.
  const toRe = (src) => new RegExp('^' + src.replace(/\(\.\*\)/g, '.*') + '$');
  const rules = cfg.headers.map((r) => ({ re: toRe(r.source), headers: r.headers }));

  server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    let file = join(dist, path);
    // A directory serves ITS OWN index.html, the way a static host does. Falling
    // straight through to dist/index.html would serve the English page for /es/
    // and every Spanish assertion below would pass against English content —
    // the harness would confirm a build it had never actually loaded.
    if (existsSync(file) && statSync(file).isDirectory()) {
      const nested = join(file, 'index.html');
      if (existsSync(nested)) file = nested;
    }
    // cleanUrls, honoured because vercel.json sets it. Without this /r/8 falls
    // through to the entry point and every assertion about the result pages
    // runs against the site's generic card instead — the harness reads
    // vercel.json for headers, so emulating its routing badly is worse than not
    // emulating it at all.
    if (cfg.cleanUrls && !existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    // Unknown paths fall through to the entry point, as a static host does.
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    const served = '/' + file.slice(dist.length + 1).split(sep).join('/');
    for (const r of rules) {
      if (r.re.test(served)) for (const h of r.headers) res.setHeader(h.key, h.value);
    }
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise((ok, bad) => {
    server.once('error', (e) =>
      bad(
        e.code === 'EADDRINUSE'
          ? new Error('port 4174 is already in use — close whatever is on it and re-run')
          : e,
      ),
    );
    server.listen(4174, ok);
  }).catch((e) => {
    console.error(['', '  ' + e.message, ''].join('\n'));
    process.exit(1);
  });
  URL_UNDER_TEST = 'http://localhost:4174/';
  console.log(`\n  serving dist/ with vercel.json headers on ${URL_UNDER_TEST}`);
}

/**
 * Whether the target is a local server, and therefore whether this run is
 * allowed to press anything that WRITES.
 *
 * Read once here, after both places that can set the target have run, so the
 * answer cannot drift later in the file.
 */
const LOCAL_TARGET = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(URL_UNDER_TEST);
if (!LOCAL_TARGET) {
  console.log(`\n  REMOTE TARGET ${URL_UNDER_TEST} — checks that write are skipped`);
}

// ---------------------------------------------------------------------------
// What each preset is supposed to demonstrate
// ---------------------------------------------------------------------------

const num = (v) => Number(String(v).replace('−', '-').trim());

const EXPECT = {
  mixed: {
    lean: { want: 'balanced by construction (|lean| <= 0.05)', ok: (v) => Math.abs(num(v)) <= 0.05 },
    cross: { want: 'exactly 50%', ok: (v) => v === '50%' },
    load: { want: 'high partisan load (>= 0.5)', ok: (v) => num(v) >= 0.5 },
    head: /split right down the middle|cross over a lot/i,
  },
  muted: {
    lean: { want: 'near zero (|lean| <= 0.10)', ok: (v) => Math.abs(num(v)) <= 0.10 },
    cross: { want: 'some crossover (not 0%)', ok: (v) => v !== '0%' },
    // The whole point: on these votes the parties did not divide, so no lean
    // reading is meaningful and the headline must decline to give one.
    load: { want: 'low partisan load (< 0.20)', ok: (v) => num(v) < 0.20 },
    head: /can't really place you/i,
  },
  consistent: {
    lean: { want: 'strongly Democratic (<= -0.60)', ok: (v) => num(v) <= -0.60 },
    cross: { want: 'exactly 0%', ok: (v) => v === '0%' },
    load: { want: 'high partisan load (>= 0.5)', ok: (v) => num(v) >= 0.5 },
    head: /line up with Democrats/i,
  },
};

// ---------------------------------------------------------------------------

let fails = 0;

// The page opens on a start screen, runs one question at a time, and only shows
// the result — and the mode switch and the profile presets, which live in it —
// once the reader has been through the questions. These four helpers are the
// only way this file should move between those screens.
const onResult = (pg) => pg.evaluate(() => !document.getElementById('result-view')?.hidden);

/** Load the page fresh and press Start. Replaces clicking the reset preset, */
/** which is no longer reachable from inside the quiz. */
/**
 * Land on the first question.
 *
 * Start no longer opens a question: it opens the guess screen, and the quiz is
 * one more click away. This helper SKIPS the guess, so every check that was
 * written before the guess existed keeps testing what it was written to test.
 * `beginQuizWithGuess` is the variant for the checks that are about the guess.
 */
async function beginQuiz(pg, url) {
  await pg.goto(url, { waitUntil: 'networkidle' });
  await pg.click('#start-btn');
  await pg.waitForTimeout(150);
  await pg.click('#guess-skip');
  await pg.waitForTimeout(200);
}

/** Land on the first question having predicted `value` in [-1, 1]. */
async function beginQuizWithGuess(pg, url, value) {
  await pg.goto(url, { waitUntil: 'networkidle' });
  await pg.click('#start-btn');
  await pg.waitForTimeout(150);
  // `fill` does not fire the input event a range listener needs, and the button
  // is gated on that event rather than on the value — which is the whole point
  // of the flag it sets. So the event is dispatched explicitly.
  await pg.evaluate((v) => {
    const el = document.getElementById('guess-slider');
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await pg.waitForTimeout(80);
  await pg.click('#guess-go');
  await pg.waitForTimeout(200);
}

/** Answer every remaining question the same way, then land on the result. */
async function answerAll(pg, v = 1) {
  for (let i = 0; i < 200; i++) {
    if (await onResult(pg)) return;
    if (await pg.isVisible(`#q-card [data-answer="${v}"]`)) {
      await pg.click(`#q-card [data-answer="${v}"]`);
      await pg.waitForTimeout(60);
      continue;
    }
    if (await pg.isVisible('#q-next')) { await pg.click('#q-next'); await pg.waitForTimeout(60); continue; }
    return;
  }
}

/** Straight to the result, which is where the presets and the mode switch are. */
async function toResult(pg, url, v = 1) {
  await beginQuiz(pg, url);
  await answerAll(pg, v);
}
const check = (label, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1180, height: 1000 } })).newPage();

// A CSP violation reaches us as a console error, which is why the no-errors
// check at the end is load-bearing rather than cosmetic.
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push('CONSOLE ' + m.text());
});

// Did the analytics script get requested, and did it resolve?
//
// /_vercel/insights/ exists only after Web Analytics is enabled in the Vercel
// dashboard, and the local static server here cannot provide it at all. So a 404
// on that path is EXPECTED offline and is reported rather than failed — but the
// request itself is asserted, because a missing request means inject() never ran
// and the page is counting nothing while the authorship card says it counts
// visits. Suppressing the noise without checking the cause is how that sentence
// would quietly become false.
const insights = { requested: false, status: null };
page.on('request', (r) => {
  if (/\/_vercel\/insights\//.test(r.url())) insights.requested = true;
});
page.on('response', (r) => {
  if (/\/_vercel\/insights\//.test(r.url())) insights.status = r.status();
});
/**
 * Console noise that only the LOCAL server can produce, and nothing else.
 *
 * /_vercel/insights/script.js exists only once Web Analytics is enabled on
 * Vercel. The static server here falls back to index.html for unknown paths, so
 * that request comes back as HTML with a 200 and the browser reports one of two
 * things depending on timing: a failed load, or a refusal to execute HTML as a
 * script. Both are the same local-only condition.
 *
 * Deliberately narrow. It matches only messages naming that exact path, so a
 * genuine console error anywhere else still fails the run — and the same suite
 * run against https://rightnleft.com, where the script is served properly,
 * would catch anything this hides.
 */
const INSIGHTS_PATH = /_vercel\/insights\//;
const isInsightsNoise = (e) =>
  INSIGHTS_PATH.test(e) &&
  (/Failed to load resource/.test(e) || /Refused to execute script/.test(e));

try {
  await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Snapshot taken HERE, before a single click. The previous version asserted
  // insights.requested at the END of the run, by which point the mode button had
  // been clicked — and the analytics call was sitting inside setMode(), so the
  // check passed on a request no ordinary visitor would ever have caused. A
  // load-time claim has to be measured at load time.
  const insightsOnLoad = { requested: insights.requested, status: insights.status };

  console.log('');
  // The opening screen exists and asks for one tap, not a reading.
  const startWords = await page.$eval('#start-view', (e) =>
    (e.innerText.trim().match(/\S+/g) ?? []).length);
  check('the page opens on a start screen with a Start button',
    Boolean(await page.$('#start-btn')) && !(await page.$eval('#start-view', (e) => e.hidden)));
  check('the opening screen is short enough to read', startWords < 60, `${startWords} words`);
  check('no question is on screen before Start is pressed',
    (await page.$$('#q-card [data-answer]')).length === 0 ||
    !(await page.isVisible('#q-card [data-answer="1"]')));

  // Exactly one way to the method, on whichever screen you are looking at.
  //
  // Both buttons are in the DOM by design: one under Start, one in the top bar
  // for every screen after it. showView() hides whichever does not belong, with
  // the hidden ATTRIBUTE — and an author `display:` on the bar's shared rule
  // overrides the UA stylesheet's [hidden] { display:none } without a word of
  // complaint. That shipped, and the first screen a reader saw carried the same
  // button twice. So this counts what is VISIBLE; counting elements would have
  // found two on a healthy page and told us nothing.
  const howVisible = (pg) => pg.evaluate(() => {
    const label = document.getElementById('start-how')?.textContent.trim()
      ?? document.getElementById('nav-how')?.textContent.trim();
    return [...document.querySelectorAll('button')]
      .filter((b) => b.textContent.trim() === label)
      .filter((b) => b.getBoundingClientRect().height > 0)
      .map((b) => b.id || '(no id)');
  });
  const howOnStart = await howVisible(page);
  check('one "How this works" button on the start screen, not two',
    howOnStart.length === 1, howOnStart.join(' + ') || 'none visible');

  await page.click('#start-btn');
  await page.waitForTimeout(250);
  // Past the guess screen, which now sits between Start and the first question.
  await page.click('#guess-skip');
  await page.waitForTimeout(250);

  const howOnQuiz = await howVisible(page);
  check('the method is still one tap away once the quiz starts',
    howOnQuiz.length === 1, howOnQuiz.join(' + ') || 'none visible');

  const meta = await page.$eval('.q-top', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check('boots in 7-issue mode', /^1 of 7/.test(meta), meta);
  check('question 1 is the school voucher vote', /School vouchers/.test(meta), meta);
  // THE CHECK THAT USED TO ASSERT THE BUG.
  //
  // It read: "the reason for the pick is shown", and it passed on an unanswered
  // card. But six of the seven headline items end "Lt. Gov. priority bill", so
  // what it was really asserting was that a party cue appears before the reader
  // answers, on a site whose entire claim is that the party is hidden. A test
  // can encode a defect as confidently as it encodes a requirement.
  check('the reason for the pick is NOT shown before answering',
    (await page.$$('.q-why')).length === 0,
    `${(await page.$$('.q-why')).length} .q-why on an unanswered card`);

  // The general guard, rather than a test for the one phrase that was found.
  // Everything a reader can see before committing is searched for anything that
  // names a party, a partisan officeholder, or a leadership priority.
  //
  // ACROSS ALL SEVEN, not just the one on screen. The leak was on every
  // headline item, and a check that only ever read question one would have
  // passed while six others still carried "Lt. Gov. priority bill". Whichever
  // question a defect lands on, some run has to open it.
  {
    const CUES = [
      'republican', 'democrat', 'gop', 'lt. gov', 'lt gov', 'lieutenant governor',
      'governor', 'abbott', 'patrick', 'priority bill', 'emergency item',
      'caucus', 'conservative', 'progressive',
    ];

    const dirty = [];
    let seen = 0;
    let whyAfterAnswer = null;

    for (let i = 0; i < 40; i++) {
      if (await onResult(page)) break;
      if (!(await page.isVisible('#q-card [data-answer="1"]'))) break;
      seen++;

      // Visible text and markup both: a cue parked in an attribute or a
      // collapsed panel is still a cue, and is still readable off the page.
      const [visible, markup] = await page.$eval('#q-card', (e) => [
        e.innerText.toLowerCase(), e.innerHTML.toLowerCase(),
      ]);
      const hit = CUES.filter((c) => visible.includes(c) || markup.includes(c));
      if (hit.length) dirty.push(`q${seen}: ${hit.join(', ')}`);

      if ((await page.$$('.q-why')).length) dirty.push(`q${seen}: .q-why rendered unanswered`);

      await page.click('#q-card [data-answer="1"]');
      await page.waitForTimeout(220);

      // Method information must be MOVED, not lost. Checked on the first
      // question, where the expected sentence is known.
      if (seen === 1) {
        whyAfterAnswer = (await page.$$('.q-why')).length
          ? (await page.$eval('.q-why', (e) => e.textContent.trim()))
          : '';
      }
      if (await page.isVisible('#q-next')) {
        await page.click('#q-next');
        await page.waitForTimeout(220);
      }
    }

    check('every question in the short quiz was opened', seen === 7, `${seen} of 7`);
    check('no party cue on ANY question before it is answered',
      dirty.length === 0, dirty.join(' | ') || `${seen} questions x ${CUES.length} cues`);

    // It must still appear once the answer is in, or the method information has
    // simply been lost rather than moved.
    check('the reason for the pick appears AFTER answering',
      /marquee fight/i.test(whyAfterAnswer ?? ''), whyAfterAnswer || 'missing');
  }
  // Back to a FRESH, unanswered question one for everything that follows.
  // Clicking Next would leave the run on question two, and every later check
  // here is written against the voucher bill. Five of them failed that way
  // before this line existed.
  await beginQuiz(page, URL_UNDER_TEST);

  // --- quiet text still has to be readable ----------------------------------
  //
  // Same r/texas thread as the party cue: "I wish that top line was darker.
  // Being greyed out made my eyes completely ignore it." --muted was 3.41:1
  // against the page, which fails WCAG AA for text this size, and --muted is
  // what every piece of method on the page is written in: the question counter,
  // the category, the note naming the official caption, the donation
  // disclosure. A palette that made the quiet things unreadable was quietly
  // undoing the disclosure the whole site argues for.
  //
  // So the ratio is computed from what the browser actually renders, walking up
  // for the first non-transparent background rather than assuming the body's.
  // Asserting the hex would pass while a parent changed underneath it.
  {
    const contrasts = await page.evaluate(() => {
      const srgb = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
      const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
      const parse = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const opaqueBg = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c.length >= 3 && (c[3] === undefined || c[3] > 0)) return c;
        }
        return [255, 255, 255];
      };
      const out = [];
      for (const sel of ['.q-count', '.q-cat', '.q-ask', '.q-prompt']) {
        const el = document.querySelector(sel);
        if (!el || !el.textContent.trim()) continue;
        const cs = getComputedStyle(el);
        const [a, b] = [lum(parse(cs.color)), lum(opaqueBg(el))].sort((x, y) => y - x);
        out.push({
          sel,
          ratio: (a + 0.05) / (b + 0.05),
          px: parseFloat(cs.fontSize),
          weight: Number(cs.fontWeight) || 400,
        });
      }
      return out;
    });

    check('the question card reports text to measure', contrasts.length === 4,
      `${contrasts.length} of 4`);

    for (const { sel, ratio, px, weight } of contrasts) {
      // WCAG's large-text allowance: 18.66px bold, or 24px at any weight.
      const large = px >= 24 || (px >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      check(`${sel} meets WCAG AA (${need}:1)`,
        ratio >= need, `${ratio.toFixed(2)}:1 at ${px}px/${weight}`);
    }
  }

  // --- the plain-language gloss ---------------------------------------------
  // The one field on the page written by us rather than copied from the record.
  // In a blind quiz the wording IS the question, so the reader must be able to
  // see which words are the state's and which are ours — the official caption
  // has to remain present, and the gloss has to be labelled.
  // The question a reader is asked is now the plain-language one. The official
  // caption used to be the headline, in bold, up to 42 words of it, with the
  // readable version fifth on the card.
  const asked = await page.$eval('.q-ask', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check('the question asked is the plain-language one',
    /state-funded accounts/i.test(asked) && !/^Relating to/i.test(asked), asked.slice(0, 66));
  check('the official caption is NOT the headline',
    !(await page.$('.q-ask[lang="en"]')) ||
      !/Relating to the establishment/i.test(asked));

  // It is still one tap away, and it still says whose words are whose — that
  // labelling used to sit beside the gloss and would otherwise have been lost
  // when the gloss became the question.
  check('the official wording is not on screen until asked for',
    (await page.$$('.q-caption')).length === 0);
  await page.click('#official-btn');
  await page.waitForTimeout(200);
  const official = await page.$eval('.q-caption', (e) => e.textContent);
  check('the official caption is one tap away',
    /Relating to the establishment of an education savings account program/i.test(official),
    official.replace(/\s+/g, ' ').slice(0, 60));
  const officialNote = await page.$eval('.q-official .q-note', (e) => e.textContent.replace(/\s+/g, ' '));
  check('it says which words are ours and which are the record\'s',
    /our plain-language summary/i.test(officialNote) && /word for word/i.test(officialNote),
    officialNote.slice(0, 74));
  check('the official caption is marked as English on both pages',
    await page.$eval('.q-caption', (e) => e.getAttribute('lang')) === 'en');
  await page.click('#official-btn');
  await page.waitForTimeout(150);

  // Showing a state ranking before the vote would steer the answer, which is the
  // one thing a blind quiz cannot do.
  check('outcomes hidden before any answer', await page.$eval('#outcome-card', (e) => e.hidden));
  check('no candidate reveal before any answer', (await page.$$('.cand-reveal')).length === 0);

  // --- the candidate reveal -------------------------------------------------
  // The payoff of a blind quiz: commit with no party cue, then see who stood
  // where. Q1 is SB 2 and all three candidates voted Nay, so answering Nay is a
  // known 3-of-3 and pins both the vote text and the agreement wording.
  await page.click('[data-answer="-1"]');
  await page.waitForTimeout(350);
  check('candidate reveal appears after answering', (await page.$$('.cand-reveal')).length === 1);
  check('the reveal names the bill just answered',
    /SB 2/.test(await page.$eval('.cand-reveal .outc-cat', (e) => e.textContent)),
    await page.$eval('.cand-reveal .outc-cat', (e) => e.textContent.trim()));
  // Scoped to the candidates' own list: a second .cand-revs now holds the
  // Republican comparators, and an unscoped selector counted all six rows.
  const revRows = await page.$$eval('.cand-revs:not(.rep-revs) .cand-rev', (rs) =>
    rs.map((r) => ({
      cls: r.className,
      vote: r.querySelector('.cr-vote').textContent.trim(),
      match: r.querySelector('.cr-match').textContent.trim(),
    })),
  );
  check('one row per candidate', revRows.length === 3, `${revRows.length} rows`);
  check('all three voted Nay on SB 2 and are marked as matching',
    revRows.every((r) => /Nay/.test(r.vote) && /same as you/.test(r.match)),
    revRows.map((r) => `${r.vote}/${r.match}`).join(' | '));
  const revSum = await page.$eval('.cand-rev-sum', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check('the summary counts 3 of 3 and echoes your own answer',
    /3 of 3/.test(revSum) && /You voted Against/.test(revSum), revSum);
  // Two vocabularies, deliberately kept apart: the reader votes For or Against,
  // a member voted Yea or Nay. The reader's own answer must never be reported in
  // the record's words -- that would put the House's language in their mouth for
  // a vote they never cast.
  check('the reader\'s own answer is not given the record\'s word for it',
    !/You voted (Yea|Nay)/.test(revSum), revSum);

  // Next has to be reachable WITHOUT scrolling.
  //
  // Measured on the live site at 390x844 before this was fixed: the reveal
  // pushes the card to about 1.9 screens and Next landed near 1,400px, so
  // it was off-screen after 7 of 7 answers and cost 613-676px of scrolling
  // every single time. It is a fixed bar now. The reveal is the payoff and
  // is still there to read — reading it is a choice, not a toll on the way
  // to the next question.
  const reach = await page.evaluate(() => {
    const e = document.getElementById('q-next');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return {
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight + 1,
      top: Math.round(r.top),
      viewport: window.innerHeight,
    };
  });
  check('the way to the next question needs no scrolling',
    Boolean(reach?.inViewport),
    reach ? `Next at y=${reach.top} of ${reach.viewport}` : 'no Next button');

  // The bar is FIXED, so content passes behind it as you scroll — that is what
  // a fixed bar does, and asserting nothing is ever behind it fails by
  // definition on any scrollable page. The invariant that matters is that the
  // END of the reveal is reachable: scroll to the bottom and check the last
  // line is not trapped underneath.
  const trapped = await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    const bar = document.querySelector('.q-next-bar');
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    return [...document.querySelectorAll('#q-card *')]
      .filter((n) => n.children.length === 0 && n.textContent.trim())
      .map((n) => n.getBoundingClientRect())
      .filter((b) => b.bottom > r.top + 2 && b.top < r.top && b.height < 400).length;
  });
  check('scrolled to the end, nothing is trapped behind the bar',
    trapped === 0, `${trapped ?? '?'} text nodes still underneath`);
  await page.evaluate(() => window.scrollTo(0, 0));

  // The reveal belongs to the question just answered, and holds until Next.
  check('answering holds the card rather than advancing',
    (await page.$$('#q-card [data-answer]')).length === 0 && Boolean(await page.$('#q-next')));
  const stillQ1 = await page.$eval('.q-top', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check('the reveal sits under the question it belongs to', /^1 of 7/.test(stillQ1), stillQ1);

  // Answer the opposite way on Q2 so the disagreement branch is exercised too —
  // a reveal that can only render agreement proves nothing.
  await page.click('#q-next');
  await page.waitForTimeout(200);
  await page.click('[data-answer="1"]');
  await page.waitForTimeout(350);
  const diffRows = await page.$$eval('.cand-revs:not(.rep-revs) .cand-rev', (rs) => rs.map((r) => r.className + '|' +
    r.querySelector('.cr-match').textContent.trim()));
  check('a disagreement renders as its own state, not as a match',
    diffRows.some((r) => /cr-diff/.test(r) && /opposite to you/.test(r)) ||
    diffRows.every((r) => /cr-none/.test(r)),
    diffRows.join(' ; '));

  // An absence is a fact about the record, not a position. It must never be
  // counted as disagreement, and it must not enter the denominator.
  await toResult(page, URL_UNDER_TEST);
  await page.click('#mode-full');
  await page.waitForTimeout(400);
  let absence = null;
  for (let i = 0; i < 80 && !absence; i++) {
    if (await page.isVisible('#q-next')) { await page.click('#q-next'); await page.waitForTimeout(50); }
    if (!(await page.isVisible('#q-card [data-answer="1"]'))) break;
    await page.click('#q-card [data-answer="1"]');
    await page.waitForTimeout(60);
    const none = await page.$$eval('.cand-revs:not(.rep-revs) .cand-rev.cr-none', (rs) =>
      rs.map((r) => r.querySelector('.cr-vote').textContent.trim() + '|' +
        r.querySelector('.cr-match').textContent.trim()));
    if (none.length) {
      absence = { rows: none, sum: await page.$eval('.cand-rev-sum', (e) => e.textContent.replace(/\s+/g, ' ').trim()) };
    }
  }
  if (!absence) {
    check('an absence renders as "no vote recorded"', false, 'none encountered in 40 answers');
  } else {
    check('an absence renders as "no vote recorded"',
      absence.rows.every((r) => /no vote recorded/.test(r)), absence.rows.join(' ; '));
    check('an absence is never called a disagreement',
      absence.rows.every((r) => !/opposite to you/.test(r)), absence.rows.join(' ; '));
    check('the summary excludes absences from the denominator and pluralises',
      /\d+ of \d+ voted/.test(absence.sum) && /(one has|\d+ have) no recorded vote/.test(absence.sum),
      absence.sum);
  }

  // --- the way past the quiz, offered before it -------------------------------
  //
  // Everything checked above this line lives behind the Start button. A reader
  // who came for the outcomes, the member lookup or the method rather than for
  // seven questions needs a door that is not Start, and it has to be on the
  // FIRST screen: the same label sat on the question card for a while, which
  // meant finding the exit required entering. Tested on a fresh load so the
  // start screen is genuinely the start screen.
  await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
  const lookVisible = await page.isVisible('#start-look');
  check('the opening screen offers a way past the quiz', lookVisible,
    lookVisible ? await page.$eval('#start-look', (e) => e.textContent.trim()) : 'no #start-look');
  if (lookVisible) {
    await page.click('#start-look');
    await page.waitForTimeout(300);
    const landed = await page.evaluate(() => ({
      start: document.getElementById('start-view').hidden,
      quiz: document.getElementById('quiz-view').hidden,
      result: document.getElementById('result-view').hidden,
    }));
    check('it lands on the rest of the site, not on a question',
      landed.start === true && landed.quiz === true && landed.result === false,
      `start hidden ${landed.start}, quiz hidden ${landed.quiz}, result hidden ${landed.result}`);
  }

  // A fresh load IS the seven-issue mode, and lands in the quiz. Clicking
  // #mode-short from the result does nothing when the mode has not changed —
  // setMode returns early — which would leave the run stranded on the result
  // view with no question to answer.
  await beginQuiz(page, URL_UNDER_TEST);

  // --- balance: both parties, and the opponents ------------------------------
  // Three Democrats alone made the reveal read as a panel. The caucus split is
  // symmetric by construction and present on every question; the opponent block
  // attaches wherever a veto or priority designation names the same bill.
  await page.click('[data-answer="-1"]');
  await page.waitForTimeout(350);
  const cmpClosed = await page.$eval('details.cmp', (d) => !d.open);
  check('the comparators start collapsed so the three races lead', cmpClosed);
  const cmpSummary = await page.$eval('details.cmp > summary', (e) =>
    e.textContent.replace(/\s+/g, ' ').trim());
  check('the disclosure says what is inside it',
    /six other House members/i.test(cmpSummary) && /three from each party/i.test(cmpSummary),
    cmpSummary);
  await page.click('details.cmp > summary');
  await page.waitForTimeout(200);

  // The candidate rows must name the RACE, not just the person — that is what
  // makes these three read as the subject rather than three names among nine.
  const candTags = await page.$$eval('.cand-revs:not(.rep-revs) .cand-rev .cr-name small',
    (ss) => ss.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  check('each candidate row names the office and the opponent',
    candTags.length === 3 &&
      candTags.some((t) => /Governor/.test(t) && /Abbott/.test(t)) &&
      candTags.some((t) => /U\.S\. Senate/.test(t) && /Paxton/.test(t)),
    candTags.join(' | '));

  // Three House Republicans, in the same vote tier as the candidates. These are
  // the only genuinely comparable Republican signal — the opponents cast no House
  // votes — so the reveal must show them voting on this exact bill.
  const repRows = await page.$$eval('.rep-revs .cand-rev', (rs) =>
    rs.map((r) => {
      const tag = r.querySelector('.cr-name small');
      return {
        // The party/role tag is its own element; reading it directly avoids
        // depending on how textContent concatenates "DeAyala" and "R ·".
        party: (tag?.textContent ?? '').split('·')[0].trim(),
        role: (tag?.textContent ?? '').split('·')[1]?.trim() ?? '',
        vote: r.querySelector('.cr-vote').textContent.trim(),
      };
    }),
  );
  // The rule must run on BOTH caucuses. Applying it to Republicans only, while the
  // three Democrats above are named individuals, is a double standard however it
  // is argued — so this asserts the symmetry, not just the presence of Republicans.
  const rRows = repRows.filter((r) => r.party === 'R');
  const dRows = repRows.filter((r) => r.party === 'D');
  check('the comparator rule runs on both caucuses, three from each',
    rRows.length === 3 && dRows.length === 3,
    `${rRows.length} R, ${dRows.length} D`);
  check('the same three roles are used for each caucus', (() => {
    // "median Republican" / "median Democrat" differ only by the party word, so
    // normalise it away before comparing the two role sets.
    const roles = (rs) => rs.map((r) => r.role.replace(/^median .*/, 'median')).sort().join(',');
    return roles(rRows) === roles(dRows) && roles(rRows) === 'median,most crossover,most party-line';
  })(), `R: ${rRows.map((r) => r.role).join(' / ')}  D: ${dRows.map((r) => r.role).join(' / ')}`);
  check('every comparator has a real recorded vote on this bill',
    repRows.every((r) => /voted (Yea|Nay)|no vote recorded/.test(r.vote)),
    repRows.map((r) => r.vote).join(' | '));
  const repNote = await page.$eval('.rep-note', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check('the page says none of them is on the ballot and names the shared rule',
    /is on the ballot/i.test(repNote) && /same rule on both sides/i.test(repNote),
    repNote.slice(0, 90));
  // And the candidates' own provenance must be stated, because it is NOT a rule.
  // A choice presented without comment reads as a measurement.
  const method = await page.$eval('#method', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check('the page names the three races it is about',
    /Governor/.test(method) && /Lieutenant Governor/.test(method) && /U\.S\. Senate/.test(method),
    /Who is on this page[^.]*\./.exec(method)?.[0] ?? method.slice(0, 80));
  // Scope is editorial and must say so — but as a statement, not an apology.
  check('and says choosing them was editorial, not a measurement',
    /editorial decision, not a measurement/i.test(method), 'stated');

  const psLabels = await page.$$eval('.ps-label', (ls) => ls.map((l) => l.textContent.trim()));
  check('the reveal shows BOTH caucuses, not just the candidates',
    psLabels.includes('Republicans') && psLabels.includes('Democrats'), psLabels.join(', '));
  const psNums = await page.$$eval('.ps-num', (ns) => ns.map((n) => n.textContent.trim()));
  check('each caucus shows its own Yea share',
    psNums.length === 2 && psNums.every((n) => /^\d+% Yea$/.test(n)), psNums.join(' / '));

  // Walk the seven to SB 3 — the one bill carrying BOTH a Patrick priority
  // designation and an Abbott veto, which is the intra-Republican split the
  // evidence model exists to surface.
  let sb3 = null;
  for (let i = 0; i < 8 && !sb3; i++) {
    if (await page.isVisible('#q-next')) { await page.click('#q-next'); await page.waitForTimeout(120); }
    if (!(await page.isVisible('#q-card [data-answer="-1"]'))) break;
    await page.click('#q-card [data-answer="-1"]');
    await page.waitForTimeout(200);
    // Which bill was that? The reveal names it, and the reveal is now attached
    // to the question just answered rather than to the one after it.
    const meta = await page.$eval('.cand-reveal .outc-cat', (e) => e.textContent);
    if (/SB 3\b/.test(meta)) {
      sb3 = await page.$$eval('.opp-row', (rs) =>
        rs.map((r) => ({
          who: r.querySelector('.opp-name').textContent.trim(),
          act: r.querySelector('.opp-act').textContent.trim(),
          side: r.querySelector('.opp-side').textContent.trim(),
          src: r.querySelector('.opp-src')?.getAttribute('href') ?? null,
        })),
      );
    }
  }
  if (!sb3) {
    check('SB 3 reveals both Republican leaders', false, 'never reached SB 3');
  } else {
    check('SB 3 shows both Patrick and Abbott', sb3.length === 2,
      sb3.map((r) => r.who.split('Lieutenant')[0].split('Governor')[0]).join(' | '));
    check('Patrick made it a priority, Abbott vetoed it',
      sb3.some((r) => /Patrick/.test(r.who) && /priority/.test(r.act)) &&
      sb3.some((r) => /Abbott/.test(r.who) && /vetoed/.test(r.act)),
      sb3.map((r) => r.act).join(' | '));
    // The whole point: two Republicans landed on opposite sides of one bill, so
    // one must read as agreeing with a Nay and the other as opposing it.
    check('the two Republicans are shown on OPPOSITE sides of the same bill',
      new Set(sb3.map((r) => r.side)).size === 2, sb3.map((r) => r.side).join(' | '));
    check('every opponent action links to its source',
      sb3.every((r) => /^https?:\/\//.test(r.src ?? '')), sb3.map((r) => r.src).join(' | '));
    const note = await page.$eval('.opp-note', (e) => e.textContent.replace(/\s+/g, ' ').trim());
    // A one-sided list can state a side on a named bill and can never be turned
    // into an agreement rate. The page has to say that where it shows the acts.
    check('the one-sidedness caveat is on screen with the acts',
      /not votes/i.test(note) && /not counted above/i.test(note) && /never a percentage/i.test(note),
      note.slice(0, 90));
  }

  // ---------------------------------------------------------------------------
  // The Governor's record, both directions
  //
  // A reader pointed out that Dan Patrick appeared all over the page as the man
  // who wanted bills PASSED while Greg Abbott appeared once, as the man who
  // killed one. Every bill reaching a governor is signed, vetoed, or left to
  // become law unsigned, so his record can run both ways — but only if the page
  // refuses to score the third case, which is a refusal to endorse something he
  // also declined to stop.
  {
    await toResult(page, URL_UNDER_TEST);
    await page.click('#mode-full');
    await page.waitForTimeout(400);

    const kinds = { signed: null, unsigned: null, vetoed: null };
    for (let i = 0; i < 70; i++) {
      if (await page.isVisible('#q-next')) { await page.click('#q-next'); await page.waitForTimeout(35); }
      if (!(await page.isVisible('#q-card [data-answer="1"]'))) break;
      await page.click('#q-card [data-answer="1"]');
      await page.waitForTimeout(90);
      const rows = await page.$$eval('.opp-row', (rs) => rs.map((r) => ({
        cls: r.className,
        act: r.querySelector('.opp-act')?.textContent?.trim() ?? '',
        side: r.querySelector('.opp-side')?.textContent?.trim() ?? '',
        note: r.closest('.opp-block')?.querySelector('.opp-signed-note')?.textContent?.trim() ?? null,
      })));
      for (const r of rows) {
        if (/signed it/i.test(r.act) && !kinds.signed) kinds.signed = r;
        if (/unsigned/i.test(r.act) && !kinds.unsigned) kinds.unsigned = r;
        if (/vetoed/i.test(r.act) && !kinds.vetoed) kinds.vetoed = r;
      }
      if (kinds.signed && kinds.unsigned && kinds.vetoed) break;
    }

    check('gov: the Governor is shown signing bills, not only killing them',
      Boolean(kinds.signed), kinds.signed ? `"${kinds.signed.act}" — ${kinds.signed.side}` : 'no signature found');
    check('gov: a veto still reads as opposition',
      Boolean(kinds.vetoed) && /opposite/i.test(kinds.vetoed.side),
      kinds.vetoed ? kinds.vetoed.side : 'no veto found');

    // The one that must not be scored.
    check('gov: a bill left unsigned takes NO side',
      Boolean(kinds.unsigned) && /took no side/i.test(kinds.unsigned.side) &&
        /op-none/.test(kinds.unsigned.cls),
      kinds.unsigned ? `${kinds.unsigned.side} [${kinds.unsigned.cls}]` : 'none found');
    check('gov: and is never counted as agreement or disagreement',
      Boolean(kinds.unsigned) && !/same side|opposite side/i.test(kinds.unsigned.side),
      kinds.unsigned ? kinds.unsigned.side : 'none found');

    // A signature is the weakest of the three and has to say so where it shows.
    check('gov: a signature carries the caveat that he signs most of what reaches him',
      Boolean(kinds.signed?.note) && /signs most of what reaches him/i.test(kinds.signed.note ?? ''),
      (kinds.signed?.note ?? '(no caveat)').slice(0, 76));
  }

  // ---------------------------------------------------------------------------
  // The incumbency card
  //
  // This is the page's answer to "you only scored the people who have voting
  // records", and it is the first thing a reporter asks. It has to be present
  // and complete on load — not revealed, not collapsed — so it is checked the
  // same way the receipts are.
  // ---------------------------------------------------------------------------

  {
    const bias = await page.$('#bias-card');
    check('the incumbency card is on the page', Boolean(bias));

    if (bias) {
      const txt = (await bias.innerText()).replace(/\s+/g, ' ');

      // Every opponent must be named WITH a reason. Naming two of three would
      // read as picking the convenient ones.
      const names = ['Dan Patrick', 'Greg Abbott', 'Ken Paxton'];
      const missing = names.filter((n) => !txt.includes(n));
      check('every opponent is named with why they have no votes',
        missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : names.join(', '));

      // The refusal has to be explicit. "We don't score them" is the claim;
      // an absence of a score is not self-explanatory to a suspicious reader.
      check('it says plainly that opponents get no score',
        /no number at all/i.test(txt) && /made up/i.test(txt));

      // Both caucuses, stated on the card itself.
      check('it states the comparators come from both parties',
        /Republicans and/i.test(txt) && /Democrats/i.test(txt) && /same rule on both sides/i.test(txt));

      // The failure this card exists to prevent: an earlier draft lowercased a
      // two-sentence payload string and shipped "broke ranks. the same rule".
      check('the comparator rule keeps its sentence case',
        /\. The same rule on both sides/.test(txt),
        /\. the same rule/.test(txt) ? 'lowercased mid-string' : '');

      // A pronoun with no antecedent: the payload sentence opens "Every bill on
      // that list is one he wanted passed" and needs its owner named first.
      check('the one-sided-list caveat names whose list it is',
        /(Patrick|Abbott|Paxton) is the clearest case/.test(txt));

      check('it hands over the payload to argue with', /quiz_\w+\.json/.test(txt));
      check('it points at the authorship disclosure',
        Boolean(await bias.$('a[href="#author-card"]')));
    }
  }

  // ---------------------------------------------------------------------------
  // The authorship disclosure
  //
  // Static HTML, so it must be present without JS having rendered anything.
  // Every claim checked here is one that costs the project everything if it is
  // ever quietly dropped: the funding statement, the employer-overlap
  // disclosure, and above all the donation disclosure, which is public record
  // at the FEC and the Texas Ethics Commission and will be found whether or not
  // the page says it. Found undisclosed, it ends the project. So it is treated
  // as load-bearing content and not as copy.
  // ---------------------------------------------------------------------------

  {
    const author = await page.$('#author-card');
    check('the authorship card is on the page', Boolean(author));

    if (author) {
      const txt = (await author.innerText()).replace(/\s+/g, ' ');

      check('it names the author', /Marco Arras/.test(txt));

      check('it discloses the party donation',
        /donate to the Democratic Party/i.test(txt));

      // Position matters as much as presence: buried, it is the undisclosed
      // case with extra steps. It must land before the method defence it
      // motivates and before the editorial-choice paragraph.
      const iDonation = txt.search(/donate to the Democratic Party/i);
      const iRaces = txt.search(/I picked these three races/i);
      check('the donation is disclosed before the editorial-choice defence',
        iDonation > -1 && iRaces > -1 && iDonation < iRaces,
        `donation at ${iDonation}, races at ${iRaces}`);

      check('it states nobody funded it',
        /Nobody paid for it/i.test(txt) && /no PAC/i.test(txt));

      check('it discloses the employment overlap',
        /energy/i.test(txt) && /utilities votes/i.test(txt) &&
        /no involvement/i.test(txt));

      check('it disclaims paid political work',
        /no paid political work/i.test(txt));

      check('it owns the three-race choice as editorial',
        /editorial decision, not a measurement/i.test(txt));

      check('it gives a working contact for corrections',
        Boolean(await author.$('a[href^="mailto:"]')));
    }
  }

  // The page body must never scroll sideways, and the opponent rows are the
  // widest thing in the reveal — they overflowed below 420px before this check.
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 1200 });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => ({
      body: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rows: [...document.querySelectorAll('.opp-row,.ps-row,.cand-rev')]
        .filter((e) => e.scrollWidth > e.clientWidth + 1).length,
    }));
    check(`no horizontal overflow at ${w}px`, !r.body && r.rows === 0,
      `body=${r.body} overflowing-rows=${r.rows}`);
  }
  await page.setViewportSize({ width: 1180, height: 1000 });
  await page.waitForTimeout(200);
  // The profile presets are result-view controls, so the run has to be on the
  // result before it can click one.
  await toResult(page, URL_UNDER_TEST);

  for (const [name, want] of Object.entries(EXPECT)) {
    await page.click(`[data-preset="${name}"]`);
    await page.waitForTimeout(300);
    const got = await page.evaluate(() => ({
      stats: [...document.querySelectorAll('.stat-val')].map((x) => x.textContent.trim()),
      head: document.querySelector('.readout-head').textContent.trim(),
      cands: [...document.querySelectorAll('.cand-score')].map((x) => x.textContent.trim()),
    }));
    const [lean, cross, load] = got.stats;
    check(`${name}: lean — ${want.lean.want}`, want.lean.ok(lean), `got ${lean}`);
    check(`${name}: crossover — ${want.cross.want}`, want.cross.ok(cross), `got ${cross}`);
    check(`${name}: load — ${want.load.want}`, want.load.ok(load), `got ${load}`);
    check(`${name}: headline`, want.head.test(got.head), got.head);
    if (name === 'consistent') {
      check('consistent: all three candidates converge above +0.80',
        got.cands.length === 3 && got.cands.every((c) => num(c) >= 0.80), got.cands.join(' '));
    }
  }

  // Clear now returns to the opening screen; the mode switch is in the result.
  await toResult(page, URL_UNDER_TEST);
  await page.click('#mode-full');
  await page.waitForTimeout(400);
  const fullMeta = await page.$eval('.q-count', (e) => e.textContent.trim());
  const total = /^1 of (\d+)$/.exec(fullMeta)?.[1];
  check('full mode offers the whole item set', Number(total) > 7, fullMeta);
  // Read the headline value and its caption separately: the caption carries the
  // rule version now that the value says "a written rule" in plain language.
  const prov = await page.$$eval('.prov dd', (ds) =>
    ds.map((d) => ({
      value: d.childNodes[0].textContent.trim(),
      caption: d.querySelector('small')?.textContent.trim() ?? '',
    })),
  );
  const provText = prov.map((p) => `${p.value} (${p.caption})`).join(' | ');
  check('provenance rescopes to the full set', prov[0].value === total, `${provText} vs ${total} items`);
  // Format-agnostic: assert that a journal count out of the total is reported at
  // all, not the exact punctuation between the two numbers.
  check('provenance reports journal-sourced coverage',
    /^\d+\D+\d+$/.test(prov[1].value) && prov[1].value.includes(total), prov[1].value);
  // The version must appear SOMEWHERE in that tile — value or caption. Pinning it
  // to the value broke the moment the value became plain English, even though the
  // page was still naming the rule.
  check('provenance names the selection rule version',
    /sel-\d{4}-\d{2}-\d{2}/.test(prov[3].value + ' ' + prov[3].caption),
    `${prov[3].value} / ${prov[3].caption}`);

  for (let i = 0; i < 6; i++) {
    if (await page.isVisible('#q-next')) { await page.click('#q-next'); await page.waitForTimeout(60); }
    if (!(await page.isVisible('#q-card [data-answer="1"]'))) break;
    await page.click('#q-card [data-answer="1"]');
    await page.waitForTimeout(90);
  }
  // The outcomes live in the result view, which is where a reader ends up.
  await answerAll(page);
  await page.waitForTimeout(300);
  check('outcomes appear after answering', !(await page.$eval('#outcome-card', (e) => e.hidden)));
  const rows = await page.$$eval('.outc-row', (ds) => ds.length);
  check('at least one sourced indicator shown', rows > 0, `${rows} rows`);

  // The box follows the reader, not outcomes.ts's array order.
  //
  // Captured from the run rather than re-derived from the payload: repeating
  // buildQueue's sort here would let the two drift apart and still agree with
  // each other. The category is read off each question as it is answered, then
  // the panel is asserted to present those categories in the same relative
  // order.
  //
  // What this is really protecting is the balance. The array order opened with
  // five straight `bottom` standings, so a reader who did not scroll saw a
  // panel that only indicted, which outcomes.ts says is the way to get the
  // whole thing dismissed as advocacy.
  {
    const oc = await browser.newContext({ viewport: { width: 1180, height: 1000 } });
    const op = await oc.newPage();
    await beginQuiz(op, URL_UNDER_TEST);

    // The question is mapped back to its category through the payload, because
    // ".q-cat" renders the item's LABEL when it has one ("School vouchers"),
    // not the category the outcomes are keyed by. Reading the question text and
    // looking it up is observation; re-implementing buildQueue's sort here
    // would be duplication that could drift and still agree with itself.
    const qp = JSON.parse(readFileSync(join(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
    const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const catOf = new Map();
    for (const it of qp.items) {
      if (it.plain) catOf.set(norm(it.plain), it.category.toLowerCase());
      if (it.caption) catOf.set(norm(it.caption), it.category.toLowerCase());
    }

    const asked = [];
    let unmapped = 0;
    for (let i = 0; i < 40; i++) {
      if (await op.isVisible('#readout')) break;
      if (await op.isVisible('#q-card [data-answer="1"]')) {
        const cat = catOf.get(norm(await op.$eval('.q-ask', (e) => e.textContent)));
        if (cat) { if (!asked.includes(cat)) asked.push(cat); } else unmapped++;
        await op.click('#q-card [data-answer="1"]');
        await op.waitForTimeout(80);
        continue;
      }
      if (await op.isVisible('#q-next')) { await op.click('#q-next'); await op.waitForTimeout(80); continue; }
      break;
    }
    // If the lookup silently failed, `asked` would be empty and every ordering
    // assertion below would pass on nothing.
    check('every question asked was matched to a category',
      unmapped === 0 && asked.length > 0, `${asked.length} categories, ${unmapped} unmatched`);
    await op.waitForTimeout(300);

    // ".outc-cat" is "Category · Label"; only the category half is wanted.
    const shownCats = (await op.$$eval('.outc-row .outc-cat',
      (ds) => ds.map((d) => d.textContent.split('·')[0].trim().toLowerCase())))
      .filter((c, i, a) => a.indexOf(c) === i);

    const expected = asked.filter((c) => shownCats.includes(c));
    check('the indicators follow the order the questions were asked in',
      shownCats.join('|') === expected.join('|'),
      `shown: ${shownCats.join(', ')}`);
    check('and every indicator shown belongs to a category that was asked about',
      shownCats.every((c) => asked.includes(c)),
      shownCats.filter((c) => !asked.includes(c)).join(', ') || `${shownCats.length} checked`);

    await oc.close();
  }
  const src = await page.$eval('.outc-src a', (e) => e.getAttribute('href'));
  check('every indicator links to its source', /^https?:\/\//.test(src), src);

  // The label has to read as the subject of the number, not as its filing code.
  // It was 11.5px in --muted, the faintest type in the row, and a reader said
  // the figure it named "looks like a side note". Both halves are asserted:
  // dark enough to read, and set below the value so the number still leads.
  {
    const m = await page.evaluate(() => {
      const srgb = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
      const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
      const parse = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const opaqueBg = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c.length >= 3 && (c[3] === undefined || c[3] > 0)) return c;
        }
        return [255, 255, 255];
      };
      const read = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const [a, b] = [lum(parse(cs.color)), lum(opaqueBg(el))].sort((x, y) => y - x);
        return { ratio: (a + 0.05) / (b + 0.05), px: parseFloat(cs.fontSize) };
      };
      return { cat: read('.outc-row .outc-cat'), val: read('.outc-row .outc-val') };
    });

    check('the indicator label is dark enough to read',
      m.cat && m.cat.ratio >= 4.5, m.cat ? `${m.cat.ratio.toFixed(2)}:1 at ${m.cat.px}px` : 'no label');
    check('and the value still leads it',
      m.cat && m.val && m.val.px > m.cat.px,
      m.cat && m.val ? `value ${m.val.px}px vs label ${m.cat.px}px` : 'missing');
  }

  await page.click('#table-toggle');
  await page.waitForTimeout(250);
  const cols = await page.$$eval('#table thead th', (ts) => ts.map((t) => t.textContent));
  check('table view exposes the receipts',
    ['R Yea', 'D Yea', 'Valence', 'Source'].every((c) => cols.includes(c)), cols.join(','));

  // ---------------------------------------------------------------------------
  // What a crawler sees
  //
  // These are asserted because they are invisible to a human reading the page.
  // The three candidate names appeared NOWHERE in the static html for the first
  // two days — they render client-side from the payload, so the queries this
  // page answers best ("James Talarico voting record") had nothing for a
  // crawler to match. And the title said "The Purple Strip — PlainRecord",
  // which contains no term anybody searches for.
  // ---------------------------------------------------------------------------

  {
    const title = await page.title();
    check('the title carries searchable terms',
      /Texas House/i.test(title) && /voting record|Historial de votos/i.test(title), title);

    const staticHtml = await page.evaluate(() => document.documentElement.outerHTML);
    const names = ['Goodwin', 'Hinojosa', 'Talarico'];
    const missing = names.filter((n) => !staticHtml.includes(n));
    check('the candidates are named in the markup', missing.length === 0,
      missing.length ? `missing ${missing.join(', ')}` : names.join(', '));

    const ld = await page.$$eval('script[type="application/ld+json"]',
      (els) => els.map((e) => e.textContent));
    check('structured data is present', ld.length > 0, `${ld.length} block(s)`);
    if (ld.length) {
      let graph = [];
      try { graph = JSON.parse(ld[0])['@graph'] ?? []; } catch { /* reported below */ }
      const types = graph.map((g) => g['@type']);
      check('structured data parses and declares a Dataset',
        types.includes('Dataset'), types.join(' + ') || 'unparseable');
      const ds = graph.find((g) => g['@type'] === 'Dataset');
      check('the Dataset points at the real payload',
        ds?.distribution?.[0]?.contentUrl?.endsWith('/data/quiz_89R.json'),
        ds?.distribution?.[0]?.contentUrl ?? '(none)');
      // The structured-data licence must MATCH a licence the project actually
      // grants. This check was previously the inverse — asserting the field was
      // absent, because the block declared CC0 before any licence existed. Now
      // it asserts the pair: the machine-readable claim and the human-readable
      // one have to move together, or a reuser is told two different things.
      check('the Dataset declares CC0',
        ds?.license === 'https://creativecommons.org/publicdomain/zero/1.0/',
        ds?.license ?? '(none)');
      const method = await page.$eval('#method', (e) => e.textContent.replace(/\s+/g, ' '));
      check('the page states the same licence a human can read',
        /CC0/.test(method) && /MIT/.test(method),
        /CC0/.test(method) ? 'CC0 + MIT in "How this is built"' : 'not stated on the page');
    }
  }

  // ---------------------------------------------------------------------------
  // The district lookup
  //
  // The load-bearing check here is the cross-check: district 47 is Vikki
  // Goodwin, who is ALSO one of the three candidates, so the same person is
  // reachable by two code paths. If they disagree the estimator has been
  // reimplemented somewhere, which is the exact failure src/quiz-data.ts exists
  // to prevent — and it would be invisible, because both numbers look
  // plausible on their own.
  // ---------------------------------------------------------------------------

  {
    await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // Nothing fetched before it is asked for. The record is 10.7 KB gzipped and
    // most visitors never open the panel.
    const earlyFetch = await page.evaluate(() =>
      performance.getEntriesByType('resource').some((r) => /members_89R/.test(r.name)));
    check('rep: the member record is not fetched on load', !earlyFetch);
    const earlyZips = await page.evaluate(() =>
      performance.getEntriesByType('resource').some((r) => /zips_89R/.test(r.name)));
    check('rep: the ZIP crosswalk is not fetched on load', !earlyZips);

    await toResult(page, URL_UNDER_TEST);
    await page.click('#mode-full');
    await page.waitForTimeout(300);
    for (let i = 0; i < 15; i++) {
      if (await page.isVisible('#q-next')) { await page.click('#q-next'); await page.waitForTimeout(50); }
      if (!(await page.isVisible('#q-card button[data-answer="1"]'))) break;
      await page.click('#q-card button[data-answer="1"]');
      await page.waitForTimeout(70);
    }
    // Stop early rather than answering all 67. This is the affordance a reader
    // needs too: the estimator shrinks a thin answer set toward zero and says
    // so, which is a better deal than withholding the result until question 67.
    check('a reader can leave the questions early once a few are answered',
      await page.isVisible('#q-result-now'));
    if (await page.isVisible('#q-result-now')) await page.click('#q-result-now');
    await page.waitForTimeout(300);
    check('the early exit lands on the result', await onResult(page));

    const input = await page.$('#rep-district');
    check('rep: the district input appears once answers exist', Boolean(input));

    if (input) {
      // TYPED, not filled. The first version of the panel rebuilt the whole
      // card's innerHTML on every input event, which replaced the very input
      // the reader was typing into: focus was lost after one keystroke and a
      // three-digit district was impossible to enter. fill() sets the value in
      // a single action and so passed against that build without noticing.
      // This types digit by digit and then asserts the element the page is
      // still focused on is the same one, and that it kept every digit.
      await input.click();
      await page.keyboard.type('147', { delay: 60 });
      await page.waitForTimeout(500);
      const typed = await page.evaluate(() => {
        const a = document.activeElement;
        const d = document.getElementById('rep-district');
        return { value: d ? d.value : null, focused: a === d, active: a ? a.id || a.tagName : null };
      });
      check('rep: typing survives the re-render',
        typed.value === '147' && typed.focused,
        `value "${typed.value}", focus on ${typed.active}`);

      await input.fill('47');
      await page.waitForTimeout(1400);

      const txt = async (sel) => {
        try { return (await page.$eval(sel, (e) => e.textContent.trim())); } catch { return null; }
      };
      const repName = await txt('#rep-card .cand-name');
      const repScore = await txt('#rep-card .cand-score');
      const repN = await txt('#rep-card .cand-n');
      check('rep: district 47 resolves to a named member', Boolean(repName), repName ?? '(none)');

      const cands = await page.$$eval('#cands .cand', (cs) => cs.map((c) => ({
        name: c.querySelector('.cand-name').textContent.trim(),
        score: c.querySelector('.cand-score').textContent.trim(),
        n: c.querySelector('.cand-n').textContent.trim(),
      })));
      const twin = cands.find((c) => c.name === repName);
      check('rep: the same member scores identically by both paths',
        Boolean(twin) && twin.score === repScore && twin.n === repN,
        twin
          ? `candidate card ${twin.score} ${twin.n} vs district ${repScore} ${repN}`
          : `${repName} is not one of the candidates — cross-check skipped`);

      // Both denominators in one sentence, so they cannot be read as
      // contradicting each other. An earlier version put "the same 7 votes" in
      // the lede and "63 of the 67" underneath it.
      const cov = await txt('#rep-card .rep-note');
      check('rep: coverage states both scales together',
        Boolean(cov) && /of the 67/.test(cov) && /overlap what you answered/.test(cov),
        cov ? cov.slice(0, 74) : '(none)');
      const lede = await txt('#rep-card .lede');
      check('rep: the lede quotes no item count',
        Boolean(lede) && !/\b\d+ votes\b/.test(lede), lede ? lede.slice(-40) : '(none)');

      // A member who cast none of the items must not be filed under a band.
      await input.fill('83');
      await page.waitForTimeout(700);
      const zeroScore = await txt('#rep-card .cand-score');
      const zeroNote = await txt('#rep-card .rep-note');
      check('rep: a member with no votes reports an absence, not a score',
        zeroScore === '—' && /none of the/.test(zeroNote ?? ''),
        `${zeroScore} · ${(zeroNote ?? '').slice(0, 50)}`);

      await input.fill('999');
      await page.waitForTimeout(400);
      const oor = await page.$eval('#rep-card', (e) => e.textContent);
      check('rep: an out-of-range district is refused', /districts 1 to 150/.test(oor));

      // --- the name search is GONE, deliberately ------------------------
      //
      // It offered a third way into one panel and was the one nobody could use:
      // you cannot look your representative up by a name you do not know yet.
      // It also disagreed with itself — typing a name produced a LIST while the
      // member card below went on showing whoever was looked up last, so the two
      // halves of the panel contradicted each other until you clicked.
      //
      // Five checks used to run here, wrapped in "if (nameBox)". With the field
      // removed they did not fail — they silently stopped running, which is the
      // quiet way a suite loses coverage. One assertion that the field is absent
      // is worth more than five that skip.
      check('rep: the confusing name search is gone',
        (await page.$$('#rep-name')).length === 0);
      const repLabels = await page.$$eval('#rep-card .rep-field label',
        (ls) => ls.map((l) => l.textContent.trim()));
      check('rep: two ways in, the ZIP first',
        repLabels.length === 2 && /ZIP/i.test(repLabels[0] ?? '') &&
          /district/i.test(repLabels[1] ?? ''),
        repLabels.join('  ·  '));

      check('rep: it says who it excludes',
        /not in this lookup/.test(await page.$eval('#rep-card', (e) => e.textContent)));

      // ---------------------------------------------------------------------
      // The ZIP path
      //
      // A ZIP is what readers actually know about themselves, and it is also
      // the input most able to produce a confidently wrong answer: ZIPs and
      // districts do not nest, so 46% of Texas ZIPs touch more than one
      // district. The checks below are mostly about refusing to guess.

      const zipBox = await page.$('#rep-zip');
      check('rep: the ZIP input appears alongside the district one', Boolean(zipBox));

      if (zipBox) {
        // Same keystroke-survival trap the district box fell into.
        await zipBox.click();
        await page.keyboard.type('78730', { delay: 45 });
        await page.waitForTimeout(1500);
        const zTyped = await page.evaluate(() => {
          const a = document.activeElement;
          const e = document.getElementById('rep-zip');
          return { value: e ? e.value : null, focused: a === e };
        });
        check('rep: typing a ZIP survives the re-render',
          zTyped.value === '78730' && zTyped.focused,
          `value "${zTyped.value}", focused ${zTyped.focused}`);

        // 78730 lies wholly in HD-47, and HD-47 is Vikki Goodwin, who is also
        // one of the three candidates. So this exercises the whole chain —
        // ZIP to district to member to score — against a number the candidate
        // card shows independently.
        const zipName = await txt('#rep-card .cand-name');
        const zipScore = await txt('#rep-card .cand-score');
        const whole = await page.$eval('#rep-card', (e) => e.textContent);
        check('rep: a ZIP inside one district resolves straight to its member',
          zipName === 'Vikki Goodwin' && /All of 78730 sits in District 47/.test(whole),
          `${zipName} ${zipScore}`);
        const twinZip = cands.find((c) => c.name === zipName);
        check('rep: the ZIP path scores the same as the candidate card',
          Boolean(twinZip) && twinZip.score === zipScore,
          twinZip ? `${twinZip.score} vs ${zipScore}` : 'no candidate twin');
        const boxAfter = await page.$eval('#rep-district', (e) => e.value);
        check('rep: a resolved ZIP leaves no stale district number in the box',
          boxAfter === '47', `box shows "${boxAfter}"`);

        // A split ZIP must ASK, not answer. 78704 is 52/48 between HD-49 and
        // HD-51: picking the larger share would be wrong for nearly half the
        // people who live there.
        await zipBox.fill('');
        await zipBox.click();
        await page.keyboard.type('78704', { delay: 45 });
        await page.waitForTimeout(1200);
        const splitTxt = await page.$eval('#rep-card', (e) => e.textContent);
        const options = await page.$$eval('#rep-card .rep-split button',
          (bs) => bs.map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
        check('rep: a split ZIP offers a choice',
          options.length === 2 && /split across 2 House districts/.test(splitTxt),
          options.join('  |  '));
        const guessed = await txt('#rep-card .cand-name');
        check('rep: a split ZIP shows NO score until one is picked',
          guessed === null, guessed ? `it guessed ${guessed}` : 'nothing shown');

        await page.click('#rep-card .rep-split button');
        await page.waitForTimeout(700);
        const picked = await txt('#rep-card .cand-name');
        check('rep: picking from a split ZIP scores that member',
          picked !== null && /Hinojosa|Flores/.test(picked ?? ''), picked ?? '(none)');

        // 75001 is 100% HD-115 and a rounding-to-nothing sliver of HD-112. The
        // sliver is kept on purpose, so it must not read as "0% of this ZIP".
        await zipBox.fill('');
        await zipBox.click();
        await page.keyboard.type('75001', { delay: 45 });
        await page.waitForTimeout(1200);
        // Compare the share labels EXACTLY, not as substrings of the whole
        // card. A substring test cannot express this one: "100% of this ZIP"
        // CONTAINS "0% of this ZIP", so the obvious negative assertion is
        // wrong rather than merely weak — it passed here for that reason,
        // against a card that really did render both labels.
        const shares = await page.$$eval('#rep-card .rep-share',
          (ns) => ns.map((n) => n.textContent.trim()));
        check('rep: a sliver district is labelled, not shown as 0%',
          shares.includes('under 1% of this ZIP') && !shares.includes('0% of this ZIP'),
          shares.join('  ·  ') || '(no share labels)');

        await zipBox.fill('');
        await zipBox.click();
        await page.keyboard.type('90210', { delay: 45 });
        await page.waitForTimeout(1000);
        const notTx = await page.$eval('#rep-card', (e) => e.textContent);
        check('rep: a ZIP outside Texas is refused',
          /90210 is not a Texas ZIP code/.test(notTx),
          /not a Texas/.test(notTx) ? 'refused' : notTx.slice(0, 70));
      }
    }
  }

  check('analytics script is requested ON LOAD, with no interaction',
    insightsOnLoad.requested,
    insightsOnLoad.requested
      ? `/_vercel/insights/ -> ${insightsOnLoad.status ?? insights.status}`
      : 'not requested on a plain page load — inject() is not at module top level');
  if ((insightsOnLoad.status ?? insights.status) === 404) {
    console.log('  [ -- ] Web Analytics not enabled yet' +
      '  — /_vercel/insights/ 404s until it is switched on in the Vercel dashboard');
  }

  const realErrs = errs.filter((e) => !isInsightsNoise(e));
  check('no console errors', realErrs.length === 0, realErrs.join(' | '));

  // ---------------------------------------------------------------------------
  // The answers never leave the browser
  //
  // This is the page's strongest privacy claim and the only one a reader cannot
  // verify for themselves: they can read the payload, check a roll call and
  // recompute a score, but they cannot prove their answers were not sent
  // somewhere. So the build proves it instead.
  //
  // It asserts the ABSENCE of a request, which is a check that passes trivially
  // if it is written carelessly — if the clicks silently fail to register, no
  // request happens and the check goes green while testing nothing. So it
  // asserts the answers were actually recorded first, and only then that the
  // network stayed silent.
  //
  // Two destinations are allowed and everything else is a failure: Google Fonts,
  // the single third party the CSP admits, and the page-view beacon at
  // /_vercel/insights/. The beacon is why this check INSPECTS requests rather
  // than merely counting them — an allowlist by path would let a future custom
  // event smuggle an answer out through a permitted URL. So every request in the
  // window, allowed or not, is searched for anything that looks like an answer:
  // an item id, a bill number, a candidate id, or the words the code uses for
  // the answer map.
  // ---------------------------------------------------------------------------

  {
    const payload = JSON.parse(readFileSync(join(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
    // Needles drawn from the real data, so this cannot pass by testing nothing.
    const NEEDLES = [
      ...payload.items.slice(0, 8).map((i) => i.id),
      ...payload.items.slice(0, 8).map((i) => i.billId.replace(' ', '')),
      ...payload.candidates.map((c) => c.id),
      'netLean', 'crossover', 'partisanLoad', 'answers',
    ].filter(Boolean);

    const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
    const BEACON = /\/_vercel\/insights\//;
    const seen = [];
    const carrying = [];
    const record = (r) => {
      const u = r.url();
      if (u.startsWith('data:') || u.startsWith('blob:')) return;

      // Inspect first, allow second. A permitted destination is still checked.
      let body = '';
      try { body = r.postData() ?? ''; } catch { body = ''; }
      const haystack = `${u} ${body}`;
      const hit = NEEDLES.find((n) => haystack.includes(n));
      if (hit) carrying.push(`${r.method()} ${u.slice(0, 60)} carries "${hit}"`);

      if (FONT_HOSTS.test(u) || BEACON.test(u)) return;
      seen.push(`${r.method()} ${u}`);
    };

    // Start from a clean page so load-time asset requests are not counted,
    // then press Start: a reload lands on the opening screen, and answering
    // nothing is exactly how this check goes vacuously green.
    await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.click('#start-btn');
    await page.waitForTimeout(150);
    // Past the guess screen. Skipped rather than answered, so this check stays
    // about the quiz: the guess is covered separately, including the assertion
    // that placing one sends nothing either.
    await page.click('#guess-skip');
    await page.waitForTimeout(200);
    const before = await page.$eval('.readout-caveat.mono', (e) => e.textContent.trim());

    page.on('request', record);
    let answered = 0;
    for (let i = 0; i < 5; i++) {
      // Advance past the reveal: answering holds the card until Next.
      if (await page.isVisible('#q-next')) { await page.click('#q-next'); await page.waitForTimeout(80); }
      if (!(await page.isVisible('#q-card button[data-answer="1"]'))) break;
      await page.click('#q-card button[data-answer="1"]');
      await page.waitForTimeout(150);
      answered++;
    }
    await page.waitForTimeout(700);
    page.off('request', record);

    const after = await page.$eval('.readout-caveat.mono', (e) => e.textContent.trim());

    // The guard against a vacuous pass: the clicks must have done something.
    check('answering actually registers', answered === 5 && after !== before,
      `${answered} answered · readout "${before}" -> "${after}"`);

    check('answering sends nothing beyond fonts and the page-view beacon',
      seen.length === 0,
      seen.length ? `UNEXPECTED ${seen.length}: ${seen.slice(0, 3).join(' | ')}` : `${answered} answers`);

    // The one the page's own claim rests on. Checked against every request in
    // the window including the permitted ones, so a custom event that put an
    // answer into an allowed URL would still fail.
    check('no request carries an answer, a bill or a candidate',
      carrying.length === 0,
      carrying.length ? carrying.slice(0, 2).join(' | ') : `${NEEDLES.length} needles searched`);
  }

  // ---------------------------------------------------------------------------
  // The shareable result
  //
  // The link is the only artefact of this site that gets forwarded to people
  // who never visited it, so two things are asserted here.
  //
  // It must send NOTHING. The result rides in the URL fragment precisely so no
  // request is needed to mint a link, and a future change that quietly added
  // one would break the claim the whole page rests on without breaking any
  // other test.
  //
  // And the fragment must carry only the bin. A URL gets pasted into group
  // chats by people who are not thinking about what is in it.
  // ---------------------------------------------------------------------------

  {
    const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
    const BEACON = /\/_vercel\/insights\//;
    const out = [];
    const record = (r) => {
      const u = r.url();
      if (u.startsWith('data:') || u.startsWith('blob:')) return;
      if (FONT_HOSTS.test(u) || BEACON.test(u)) return;
      out.push(`${r.method()} ${u}`);
    };

    await beginQuizWithGuess(page, URL_UNDER_TEST, -0.6);
    await answerAll(page, 1);
    await page.waitForTimeout(300);

    // Headless Chromium has no navigator.share, so this is the desktop
    // fallback path: a copy button, the three prefilled links, and the URL in
    // a selectable box.
    // The label IS the action now: the button reads "Challenge someone with
    // these seven" and only becomes a copy confirmation after it is pressed.
    const copyBtn = page.locator('#readout button', { hasText: /challenge someone/i }).first();
    check('invite: the result screen offers the challenge control', (await copyBtn.count()) > 0);

    const shareUrl = await page.$eval('.share-url', (e) => e.value).catch(() => '');
    check('share: the link is shown so it can be selected by hand', shareUrl.length > 0,
      shareUrl.slice(0, 80));

    const urlPart = shareUrl.split(/\s+/).filter((w) => w.startsWith('http')).pop() ?? '';
    check('invite: the link carries a c= fragment and nothing else',
      /\/#c=[0-9a-z]{1,3}$/.test(urlPart), urlPart);
    check('invite: no query string, so nothing reaches a server',
      urlPart.length > 0 && !urlPart.includes('?'), urlPart);
    check('invite: it carries no answer text, id or score',
      urlPart.length > 0 && !/qid|answer|netLean|crossover|partisanLoad|verdict|ocd-/i.test(urlPart),
      urlPart);

    // THE POINT OF THE FRAGMENT. A server, and therefore any link preview,
    // sees only the site root. Asserted rather than assumed, because the whole
    // blind design rests on it.
    check('invite: everything before the # is just the site root',
      urlPart.split('#')[0] === new URL('/', URL_UNDER_TEST).href,
      urlPart.split('#')[0]);

    const targets = await page.$$eval('.share-targets a', (as) =>
      as.map((a) => ({ href: a.href, rel: a.rel, target: a.target })));
    check('share: three prefilled fallback links', targets.length === 3, String(targets.length));
    check('share: each opens in a new tab with noopener noreferrer',
      targets.every((t) => t.target === '_blank' && /noopener/.test(t.rel) && /noreferrer/.test(t.rel)));
    check('share: none of them is loaded by the page itself',
      targets.every((t) => t.href.startsWith('https://')));

    // THE ONE THAT MATTERS.
    page.on('request', record);
    await copyBtn.click();
    await page.waitForTimeout(1200);
    page.off('request', record);
    check('share: making and copying a link sends nothing at all',
      out.length === 0, out.slice(0, 3).join(' | ') || 'silent');
  }

  // ---------------------------------------------------------------------------
  // The funnel count, and the line it rests on
  //
  // privacy.body now says: "Reaching the end is counted; what you answered is
  // not, and the two are never connected." Both halves are asserted, because a
  // reader will not infer that distinction and it is the only thing making the
  // counting acceptable.
  //
  // If the beacon does not fire under this harness the checks say so rather
  // than passing. A silently absent beacon looks exactly like a clean one.
  // ---------------------------------------------------------------------------

  {
    const beacons = [];
    const watch = (r) => {
      if (!/\/_vercel\/insights\//.test(r.url())) return;
      let body = '';
      try { body = r.postData() ?? ''; } catch { body = ''; }
      beacons.push({ url: r.url(), body });
    };

    const ctx = await browser.newContext({ viewport: { width: 1180, height: 1000 } });
    const fp = await ctx.newPage();
    fp.on('request', watch);

    await fp.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
    await fp.waitForTimeout(400);
    await fp.click('#start-btn');
    await fp.waitForTimeout(300);
    await fp.click('#guess-skip');
    await fp.waitForTimeout(300);
    await answerAll(fp, 1);
    await fp.waitForTimeout(900);

    const all = beacons.map((b) => `${b.url} ${b.body}`).join(' ');

    // ASSERTED ON THE QUEUE, NOT ON THE WIRE, and that is not a shortcut.
    //
    // `pageview()` dispatches through `window.va`, which the injected script
    // defines. That script lives at /_vercel/insights/script.js, which only
    // Vercel's edge serves: under this harness the path falls through to
    // index.html, `va` never exists, and every call sits in `window.vaq`
    // unsent. So nothing about the beacon can be verified locally.
    //
    // The queue is the right thing to check anyway. It is what THIS code
    // controls: did the page ask for the right three paths, once each, and
    // with nothing else attached. Whether Vercel then delivers them is
    // Vercel's to get right, and is visible in the dashboard.
    const queued = await fp.evaluate(() =>
      (window.vaq ?? []).map((entry) => JSON.stringify(entry)));
    const queue = queued.join(' ');

    check('funnel: the page queued page views at all',
      queued.length > 0, queued.length ? `${queued.length} queued` :
        'NONE — pageview() was never called, so the funnel counts nothing');

    if (queued.length > 0) {
      for (const step of ['/quiz/guess', '/quiz/started', '/quiz/result']) {
        const hits = queued.filter((q) => q.includes(step)).length;
        check(`funnel: ${step} is counted exactly once`, hits === 1, `${hits} time(s)`);
      }
      check('funnel: nothing but the three steps is queued',
        queued.length === 3, `${queued.length} entries: ${queue.slice(0, 120)}`);
      check('funnel: no queued view carries an answer or a score',
        !/qid|netLean|crossover|partisanLoad|verdict|ocd-|agree/i.test(queue),
        queue.slice(0, 90));
    }

    {

      // The half that matters. A funnel beacon may carry a path and nothing
      // whatever about what was answered.
      const payload = JSON.parse(readFileSync(join(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
      const NEEDLES = [
        ...payload.items.slice(0, 10).map((i) => i.id),
        ...payload.items.slice(0, 10).map((i) => i.billId.replace(' ', '')),
        ...payload.candidates.map((c) => c.id),
        'netLean', 'crossover', 'partisanLoad', 'verdict', 'answers', 'agree',
      ].filter(Boolean);
      const carried = NEEDLES.filter((n) => all.includes(n));
      check('funnel: no beacon carries an answer, a bill, a candidate or a score',
        carried.length === 0, carried.slice(0, 3).join(', ') || `${NEEDLES.length} needles searched`);
    }

    await ctx.close();
  }

  // ---------------------------------------------------------------------------
  // What the native share sheet is handed
  //
  // Headless Chromium has no navigator.share, so it is stubbed and the payload
  // captured. Worth doing because the failure it guards against is invisible
  // from here: navigator.share({ text, url }) is inconsistent across targets,
  // and several of them, mail clients especially, take the url and drop the
  // text. The recipient then gets a bare link with no idea it is a challenge.
  // That happened to a real person. So the message and the link now travel as
  // one string, and this asserts it rather than trusting the comment saying so.
  //
  // On its OWN page, with addInitScript, because the stub has to exist before
  // the module first renders the control and Playwright cannot remove an init
  // script afterwards. Re-rendering the live page instead is not available:
  // switching modes drops the reader back into the quiz and hides the control.
  // ---------------------------------------------------------------------------

  {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 1000 } });
    await ctx.addInitScript(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (data) => { window.__shared.push(data); return Promise.resolve(); },
      });
    });
    const np = await ctx.newPage();

    await np.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
    await np.click('#start-btn');
    await np.waitForTimeout(150);
    await np.click('#guess-skip');
    await np.waitForTimeout(200);
    await answerAll(np, 1);
    await np.waitForTimeout(400);

    const btn = np.locator('#readout button', { hasText: /challenge someone/i }).first();
    check('native share: the control renders when navigator.share exists',
      (await btn.count()) > 0);
    // And the desktop fallback must NOT also be present, or a reader gets two
    // controls doing the same thing.
    check('native share: the copy-box fallback is not rendered as well',
      (await np.locator('#readout .share-url').count()) === 0);

    await btn.click();
    await np.waitForTimeout(400);

    const payloads = await np.evaluate(() => window.__shared ?? []);
    check('native share: pressing it calls navigator.share once',
      payloads.length === 1, `${payloads.length} call(s)`);

    const p0 = payloads[0] ?? {};
    check('native share: the payload carries a text field', typeof p0.text === 'string',
      Object.keys(p0).join(', '));
    check('native share: the text explains what the link is, not just the link',
      /answer the same 7|blind quiz/i.test(p0.text ?? ''), (p0.text ?? '').slice(0, 66));
    check('native share: and the link is INSIDE that text',
      /#c=[0-9a-z]{1,3}/.test(p0.text ?? ''), (p0.text ?? '').slice(-38));

    // The bug itself. A separate url field is what a mail client latches onto
    // while discarding the text, so there must not be one.
    check('native share: no separate url field for a target to take on its own',
      p0.url === undefined, String(p0.url));
    check('native share: a title is set, which mail uses as the subject',
      typeof p0.title === 'string' && p0.title.length > 0, String(p0.title));

    await ctx.close();
  }

  // ---------------------------------------------------------------------------
  // Arriving on an invite, and the blind rule
  //
  // The rule is that the sender's result is not visible until the recipient has
  // answered the same votes. That is worth asserting hard, because the failure
  // is silent: a page that leaked it would look completely normal to anyone who
  // had not been sent a link.
  //
  // So the opening screen is checked for the sender's position in the RENDERED
  // TEXT AND IN THE MARKUP, not just for the absence of a compare card. The
  // five position words are the thing that would leak, so they are the thing
  // searched for.
  // ---------------------------------------------------------------------------

  {
    // A goto that changes only the fragment is a SAME-DOCUMENT navigation, so
    // the module never re-runs. about:blank first forces a real load.
    const freshHash = async (hash) => {
      await page.goto('about:blank');
      await page.goto(`${URL_UNDER_TEST}${hash}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
    };

    // "all seven answered yes" — bits 0..6 set plus mask bits 7..13, base36.
    const ALL_YES = ((1 << 14) - 1).toString(36);

    await freshHash(`#c=${ALL_YES}`);

    const intro = await page.$eval('#shared-intro', (e) => ({ hidden: e.hidden, text: e.textContent.trim() }));
    check('invite: the opening screen says a challenge is waiting',
      !intro.hidden && intro.text.length > 0, intro.text.slice(0, 90));

    // The load-bearing check. None of the five position words may appear
    // anywhere a reader or a scraper could see before they have answered.
    const POSITIONS = [
      'well over on the Democratic side', 'a little toward the Democratic side',
      'about the middle',
      'a little toward the Republican side', 'well over on the Republican side',
    ];
    const leaked = await page.evaluate((words) => {
      const text = document.body.innerText;
      const html = document.documentElement.outerHTML;
      return words.filter((w) => text.includes(w) || html.includes(w));
    }, POSITIONS);
    check('invite: the sender\'s position is nowhere on the opening screen',
      leaked.length === 0, leaked.join(' | ') || `${POSITIONS.length} phrases searched`);

    check('invite: and no compare card is showing yet',
      await page.$eval('#compare-card', (e) => e.hidden));
    check('invite: the fragment is cleared from the address bar',
      (await page.evaluate(() => location.hash)) === '', await page.evaluate(() => location.hash));

    // Now answer, and the compare appears.
    await page.click('#start-btn');
    await page.waitForTimeout(150);
    await page.click('#guess-skip');
    await page.waitForTimeout(200);
    await answerAll(page, 1);
    await page.waitForTimeout(300);

    check('compare: the card appears once the reader has answered',
      !(await page.$eval('#compare-card', (e) => e.hidden)));
    const compare = await page.$eval('#compare-card', (e) => e.textContent);
    // The sender answered yes to all seven and so did this run, so they agree
    // on all seven. A wrong denominator or a mis-ordered code shows up here.
    check('compare: it reports agreement on all seven',
      /every one of the 7|7 of the 7/i.test(compare), compare.replace(/\s+/g, ' ').slice(0, 110));
    check('compare: the strip legend now describes their mark',
      !(await page.$eval('#legend-them', (e) => e.hidden)));

    // The compare is what somebody who arrived on a challenge came for, so it
    // must sit ahead of the reader's own readout rather than below it.
    const order = await page.evaluate(() => {
      const c = document.getElementById('compare-card');
      const r = document.getElementById('readout');
      if (!c || !r) return null;
      // Node.DOCUMENT_POSITION_FOLLOWING === 4: r comes after c.
      return (c.compareDocumentPosition(r) & 4) !== 0;
    });
    check('compare: the card comes BEFORE the reader\'s own readout', order === true, String(order));

    // The bead marking the other person must not sit on an axis label. It used
    // to hang below the axis at exactly the tick labels' height, so a result
    // near +0.5 half-covered the "+0.5". Measured from the rendered SVG at the
    // reader's actual position rather than computed from the constants.
    const clash = await page.evaluate(() => {
      const svg = document.querySelector('#strip');
      const bead = [...svg.querySelectorAll('g[role="img"] circle')]
        .find((c) => c.getAttribute('fill') !== 'transparent'
          && Number(c.getAttribute('stroke-width')) >= 2);
      if (!bead) return { found: false };
      const b = bead.getBoundingClientRect();
      const hits = [];
      for (const label of svg.querySelectorAll('text')) {
        const l = label.getBoundingClientRect();
        if (l.width === 0) continue;
        const over = !(b.right < l.left || b.left > l.right || b.bottom < l.top || b.top > l.bottom);
        if (over) hits.push(label.textContent.trim());
      }
      return { found: true, hits };
    });
    check('compare: their bead was found on the strip', clash.found === true);
    check('compare: and it overlaps no axis label at all',
      (clash.hits ?? []).length === 0, (clash.hits ?? []).join(', ') || 'clear');
    check('compare: and offers a way to challenge somebody else',
      /challenge somebody else/i.test(compare));

    // A DIFFERENT sender must produce a different comparison, or the check
    // above passes on whatever the card happens to say.
    // "all seven answered no": mask bits only.
    const ALL_NO = (((1 << 7) - 1) << 7).toString(36);
    await freshHash(`#c=${ALL_NO}`);
    await page.click('#start-btn');
    await page.waitForTimeout(150);
    await page.click('#guess-skip');
    await page.waitForTimeout(200);
    await answerAll(page, 1);
    await page.waitForTimeout(300);
    const opposite = await page.$eval('#compare-card', (e) => e.textContent);
    check('compare: an opposite sender reads as no agreement',
      /agreed on 0 of the 7/i.test(opposite), opposite.replace(/\s+/g, ' ').slice(0, 110));
    check('compare: the two comparisons genuinely differ', opposite !== compare);

    // A visitor with no invite sees no compare at all.
    await page.goto('about:blank');
    await toResult(page, URL_UNDER_TEST);
    await page.waitForTimeout(300);
    check('compare: a plain visitor sees no compare card',
      await page.$eval('#compare-card', (e) => e.hidden));
    check('compare: and no legend entry for a mark that is not there',
      await page.$eval('#legend-them', (e) => e.hidden));

    // Nonsense in the fragment is ignored rather than half-read.
    await freshHash('#c=zzzz');
    check('invite: an out-of-range code is ignored', await page.$eval('#shared-intro', (e) => e.hidden));
    await freshHash('#method');
    check('invite: an unrelated fragment shows nothing', await page.$eval('#shared-intro', (e) => e.hidden));
  }

  // ---------------------------------------------------------------------------
  // The guess screen
  //
  // Two things have to hold. It must not be possible to record a prediction
  // nobody made — a range input starts in the middle, and dead centre is the
  // most flattering position on the strip, so the button is gated on the input
  // event rather than on the value. And skipping has to work, because the whole
  // screen is optional by design.
  //
  // The disabled-button check ASSERTS THE ENABLED CASE TOO. "Button is
  // disabled" passes just as well when the selector is wrong, when the screen
  // never rendered, or when the button does not exist at all, so it is paired
  // with a move of the slider that must enable it.
  // ---------------------------------------------------------------------------

  {
    await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.click('#start-btn');
    await page.waitForTimeout(200);

    check('guess: Start opens the guess screen, not a question',
      (await page.isVisible('#guess-view')) && !(await page.isVisible('#q-card')));

    const goDisabledBefore = await page.$eval('#guess-go', (e) => e.disabled);
    const readoutBefore = await page.$eval('#guess-readout', (e) => e.textContent.trim());

    await page.evaluate(() => {
      const el = document.getElementById('guess-slider');
      el.value = '0.7';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);
    const goDisabledAfter = await page.$eval('#guess-go', (e) => e.disabled);
    const readoutAfter = await page.$eval('#guess-readout', (e) => e.textContent.trim());

    check('guess: the button is disabled until the marker is moved',
      goDisabledBefore === true, `disabled=${goDisabledBefore}`);
    check('guess: and moving it enables the button',
      goDisabledAfter === false, `disabled=${goDisabledAfter}`);
    check('guess: the readout changes when the marker moves',
      readoutAfter !== readoutBefore, `"${readoutBefore}" -> "${readoutAfter}"`);
    check('guess: the slider gets an aria-valuetext a screen reader can read',
      Boolean(await page.$eval('#guess-slider', (e) => e.getAttribute('aria-valuetext'))),
      (await page.$eval('#guess-slider', (e) => e.getAttribute('aria-valuetext'))) ?? 'absent');

    // Skipping.
    await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
    await page.click('#start-btn');
    await page.waitForTimeout(150);
    await page.click('#guess-skip');
    await page.waitForTimeout(200);
    check('guess: skipping goes straight to the first question',
      (await page.isVisible('#q-card')) && !(await page.isVisible('#guess-view')));

    // Skipped: no marker, no legend entry, no comparison sentence.
    await answerAll(page, 1);
    check('guess: skipped, so the strip legend does not describe a marker',
      await page.$eval('#legend-guess', (e) => e.hidden));
    const skippedReadout = await page.$eval('#readout', (e) => e.textContent);
    check('guess: skipped, so the readout makes no comparison',
      !/guessed/i.test(skippedReadout));

    // Predicted: marker, legend, sentence.
    await beginQuizWithGuess(page, URL_UNDER_TEST, -0.8);
    await answerAll(page, 1);
    check('guess: predicted, so the legend describes the marker',
      !(await page.$eval('#legend-guess', (e) => e.hidden)));
    const guessedReadout = await page.$eval('#readout', (e) => e.textContent);
    check('guess: predicted, so the readout compares guess with result',
      /guessed/i.test(guessedReadout),
      guessedReadout.replace(/\s+/g, ' ').slice(0, 110));
    check('guess: the two readouts genuinely differ',
      guessedReadout !== skippedReadout);

    // Answering yes to everything leans right; the guess was well left, so this
    // must be the comparison sentence and not the "that is where you landed"
    // one. Without this the check above would pass on either sentence.
    check('guess: a wrong prediction is reported as a difference, not a match',
      !/that is where you landed/i.test(guessedReadout),
      guessedReadout.replace(/\s+/g, ' ').slice(0, 140));
  }

  // ---------------------------------------------------------------------------
  // The opt-in share, and the claim in privacy.body that rests on it
  //
  // privacy.body now says: no network request at all while you answer, and if
  // you tap the button, one request carrying where you landed, three numbers,
  // and which way you answered each vote. A paragraph that describes a request
  // is worth less than a test that watches for it, so both halves are asserted.
  //
  // The answering window is covered further up. What is new is the RESULT
  // screen: the reader is now sitting on a page that has a button wired to an
  // endpoint, and nothing may leave until they press it.
  // ---------------------------------------------------------------------------

  {
    const payload = JSON.parse(readFileSync(join(ROOT, 'public/data/quiz_89R.json'), 'utf8'));
    const itemIds = payload.items.map((i) => i.id);

    const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
    const BEACON = /\/_vercel\/insights\//;

    const posts = [];
    const other = [];
    const record = (r) => {
      const u = r.url();
      if (u.startsWith('data:') || u.startsWith('blob:')) return;
      if (FONT_HOSTS.test(u) || BEACON.test(u)) return;
      let body = '';
      try { body = r.postData() ?? ''; } catch { body = ''; }
      if (r.method() === 'POST' && u.includes('/api/share')) posts.push({ u, body });
      else other.push(`${r.method()} ${u}`);
    };

    await beginQuizWithGuess(page, URL_UNDER_TEST, 0.4);
    await answerAll(page, 1);
    await page.waitForTimeout(300);

    const btn = page.locator('#readout button', { hasText: /add my result/i }).first();
    check('share: the result screen offers the opt-in', (await btn.count()) > 0);
    // Held as a handle, because the label is the thing under test further down:
    // a locator that matches on "add my result" stops matching the moment the
    // button reports what happened, which is the behaviour being checked.
    const btnEl = await btn.elementHandle();

    // Sitting on the result with the button unpressed.
    page.on('request', record);
    await page.waitForTimeout(1200);
    check('share: nothing is sent while the button sits unpressed',
      posts.length === 0 && other.length === 0,
      posts.length
        ? `${posts.length} POST(s)`
        : other.length ? `UNEXPECTED ${other.slice(0, 2).join(' | ')}` : 'silent');

    // THIS BUTTON IS NOT A TEST FIXTURE. It is the real opt-in, wired to the
    // real endpoint, and everything above this line is passive observation
    // while everything below it WRITES.
    //
    // Pointed at https://rightnleft.com this section once posted a fabricated
    // submission into the production tally: seven invented "yes" answers and a
    // 0.4 prediction, which scored into lean bin 8 and became the only
    // right-of-centre reading in a set of thirty-one. A counter cannot be
    // edited from the page that fed it, and the published finding at the time
    // was that nobody had landed right of centre. One stray test run is enough
    // to make a dataset lie, which is the reason a verifier of a site whose
    // whole claim is that the numbers are real must never be able to add to
    // them.
    //
    // So the press is refused anywhere but a local target. The passive checks
    // above still run against production, because watching that nothing leaves
    // an unpressed page is exactly the assertion worth making about the live
    // site.
    if (!LOCAL_TARGET) {
      page.off('request', record);
      console.log(`  [SKIP] share: not pressing the opt-in against ${new URL(URL_UNDER_TEST).host}`);
      console.log('         the send path writes to the real tally; run it locally');
    } else {

    // Now press it. There is no API under `vite preview`, so the request fails
    // and the button has to say so — which is the path worth checking, because
    // the success path tells the reader the truth by accident and the failure
    // path has to be built on purpose.
    await btnEl?.click();
    await page.waitForTimeout(1800);
    page.off('request', record);

    check('share: pressing it sends exactly one request',
      posts.length === 1, `${posts.length} POST(s), ${other.length} other`);
    check('share: and nothing else goes out with it',
      other.length === 0, other.slice(0, 2).join(' | ') || 'nothing');

    const sent = posts[0]?.body ?? '';
    let parsed = null;
    try { parsed = JSON.parse(sent); } catch { /* asserted immediately below */ }

    check('share: the body is JSON', parsed !== null, sent.slice(0, 80));
    if (parsed) {
      check('share: it carries the mode',
        parsed.mode === 'short' || parsed.mode === 'full', String(parsed.mode));
      check('share: it carries the guess that was made',
        typeof parsed.guess === 'number' && Math.abs(parsed.guess - 0.4) < 0.001,
        String(parsed.guess));
      check('share: it carries one entry per answered vote',
        Array.isArray(parsed.answers) && parsed.answers.length === 7,
        `${parsed.answers?.length} answers`);
      check('share: every entry is a real item id and a boolean',
        parsed.answers.every((a) => itemIds.includes(a.qid) && typeof a.agree === 'boolean'));

      // What it may NOT carry. The point of posting answers rather than a
      // position is that the server recomputes the reading, so none of the
      // page's own numbers belong in here — and if one ever appears, the tally
      // has quietly become a record of what browsers assert about themselves.
      const keys = Object.keys(parsed);
      check('share: it carries nothing but mode, guess and answers',
        keys.length === 3 && keys.every((k) => ['mode', 'guess', 'answers'].includes(k)),
        keys.join(', '));
      for (const banned of ['netLean', 'crossover', 'partisanLoad', 'verdict', 'bin']) {
        check(`share: the body does not carry ${banned}`, !sent.includes(banned));
      }

      // No prose. A caption or a bill title in the body would mean the page is
      // sending content rather than counts.
      const captions = payload.items.slice(0, 12).map((i) => i.caption).filter(Boolean);
      const leaked = captions.find((c) => sent.includes(c.slice(0, 24)));
      check('share: the body carries no bill text',
        !leaked, leaked ? leaked.slice(0, 40) : `${captions.length} captions checked`);
    }

    const label = ((await btnEl?.textContent()) ?? '').trim();
    check('share: a failed send says so, rather than leaving the reader to assume',
      /go through|nothing was counted/i.test(label), label);

    }
  }

  // ---------------------------------------------------------------------------
  // Accessibility: the parts a rendering check cannot reach
  //
  // An axe pass over every view and both themes is clean, and axe finding
  // nothing is roughly where the guarantee stops. The three things below are
  // the ones it structurally cannot see, and all three were broken here.
  //
  // Its own context, so nothing above depends on where this leaves the page.
  // ---------------------------------------------------------------------------
  {
    const a11yCtx = await browser.newContext({ viewport: { width: 1180, height: 1000 } });
    const ap = await a11yCtx.newPage();
    await ap.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });

    // --- 1. Every colour used for text, measured from the tokens -------------
    //
    // NOT from what happens to be rendered, which is how three of these got
    // through: --good, --warn and --pole-blue all failed AA in light mode while
    // axe reported a clean page, because the badges and labels that use them
    // only appear for outcome categories a given run does not always pull in. A
    // contrast failure that depends on which questions you answered is still a
    // contrast failure, and it should not take the right quiz to find it.
    const TEXT_TOKENS = ['--ink', '--ink-2', '--muted',
      '--pole-red-ink', '--pole-blue-ink', '--good-ink', '--warn-ink'];

    for (const theme of ['light', 'dark']) {
      await ap.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await ap.waitForTimeout(80);
      const worst = await ap.evaluate((tokens) => {
        const srgb = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
        const hex = (s) => {
          const m = s.trim().match(/^#?([0-9a-f]{6})$/i);
          if (!m) return null;
          const n = parseInt(m[1], 16);
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        };
        const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
        const cs = getComputedStyle(document.documentElement);
        const grounds = ['--page', '--surface']
          .map((g) => [g, hex(cs.getPropertyValue(g))]).filter(([, v]) => v);
        let worst = null;
        for (const tok of tokens) {
          const fg = hex(cs.getPropertyValue(tok));
          if (!fg) { return { tok, ratio: 0, ground: 'UNDEFINED' }; }
          for (const [gName, bg] of grounds) {
            const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
            const ratio = (a + 0.05) / (b + 0.05);
            if (!worst || ratio < worst.ratio) worst = { tok, ratio, ground: gName };
          }
        }
        return worst;
      }, TEXT_TOKENS);

      check(`${theme}: every text colour meets WCAG AA against both grounds`,
        worst && worst.ratio >= 4.5,
        worst ? `worst is ${worst.tok} on ${worst.ground} at ${worst.ratio.toFixed(2)}:1` : 'nothing measured');
    }
    await ap.evaluate(() => document.documentElement.removeAttribute('data-theme'));

    // --- 2. Focus survives every screen change -------------------------------
    //
    // This whole quiz is one document swapping its own contents, so a control
    // that is pressed is usually destroyed by what it triggers, and focus falls
    // to <body>. Measured before it was fixed: lost on Start, lost on the
    // guess, and lost on all seven answers. Keyboard-only, that means being
    // returned to the top of the document and tabbing past the header to reach
    // Next, every question; with a screen reader it means silence, because
    // nothing was focused and nothing was marked live.
    const focused = () => ap.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body || a === document.documentElement) return 'BODY';
      return `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.className ? '.' + String(a.className).split(' ')[0] : ''}`;
    });

    await ap.click('#start-btn');
    await ap.waitForTimeout(250);
    let f = await focused();
    check('focus moves into the guess screen, not to the body', f !== 'BODY', f);

    await ap.evaluate(() => {
      const el = document.getElementById('guess-slider');
      el.value = '0.4';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await ap.click('#guess-go');
    await ap.waitForTimeout(250);
    f = await focused();
    check('focus lands on the question itself once the quiz starts',
      /q-ask/.test(f), f);

    await ap.click('#q-card [data-answer="1"]');
    await ap.waitForTimeout(250);
    f = await focused();
    check('focus lands on the reveal after answering, so it is read aloud',
      /q-reveal|q-ask/.test(f), f);

    await ap.click('#q-next');
    await ap.waitForTimeout(250);
    f = await focused();
    check('focus lands on the next question, not back at the top', /q-ask/.test(f), f);

    // --- 3. Nothing you have to hit is smaller than 24x24 --------------------
    //
    // WCAG 2.2 AA. The inline exception is real and is applied rather than
    // worked around: a link inside a sentence is sized by the line-height of
    // the prose around it, and padding it would break the paragraph. Only
    // standalone controls are held to the floor. "X" in the share row was the
    // worst at 9x20, which is a link you would have to aim at.
    for (let i = 0; i < 40; i++) {
      if (await ap.isVisible('#readout')) break;
      if (await ap.isVisible('#q-card [data-answer="1"]')) {
        await ap.click('#q-card [data-answer="1"]'); await ap.waitForTimeout(70); continue;
      }
      if (await ap.isVisible('#q-next')) { await ap.click('#q-next'); await ap.waitForTimeout(70); continue; }
      break;
    }
    await ap.waitForTimeout(300);

    const small = await ap.evaluate(() => {
      const inProse = (el) => {
        const p = el.parentElement;
        if (!p) return false;
        // A link is "inline" when the element around it holds text of its own.
        const own = [...p.childNodes]
          .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
        return own.length > 0;
      };
      const out = [];
      for (const e of document.querySelectorAll('a[href],button,input,select,summary,[role=button]')) {
        if (e.offsetParent === null) continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.width >= 24 && r.height >= 24) continue;
        if (e.tagName === 'A' && inProse(e)) continue;
        out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0] || '?'} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    check('every standalone control is at least 24x24',
      small.length === 0, small.join(', ') || 'result view swept');

    await a11yCtx.close();
  }

  // ---------------------------------------------------------------------------
  // The Spanish page
  //
  // Only runs if the build emitted one — scripts/build_locales.mjs holds /es/
  // back until every string is approved and the payload sidecar exists, and a
  // verifier that failed when Spanish was deliberately withheld would be
  // reporting the gate as a defect.
  //
  // The check that matters most here is the LAST one. A half-translated page is
  // the failure mode this whole effort has to avoid: Spanish headings over
  // English sentences reads as machine output, on a site whose entire argument
  // is that it is careful. So the English phrases that would leak are named and
  // asserted absent, rather than trusting that the wiring caught them all.
  // ---------------------------------------------------------------------------

  const esUrl = new URL('es/', URL_UNDER_TEST).href;
  const esPage = await (await browser.newContext({ viewport: { width: 1180, height: 1000 } })).newPage();
  const esErrs = [];
  esPage.on('pageerror', (e) => esErrs.push('PAGEERROR ' + e.message));
  esPage.on('console', (m) => { if (m.type() === 'error') esErrs.push('CONSOLE ' + m.text()); });

  // The Spanish page loads the same bundle, so it makes the same insights request
  // and gets the same 404 until Web Analytics is switched on. It needs its own
  // tracker: the English one is bound to a different page object, and reusing it
  // would have filtered the Spanish 404 on the strength of an English response.
  const esInsights = { requested: false, status: null };
  const ES_INSIGHTS = /\/_vercel\/insights\//;
  esPage.on('request', (r) => {
    if (ES_INSIGHTS.test(r.url())) esInsights.requested = true;
  });
  esPage.on('response', (r) => {
    if (ES_INSIGHTS.test(r.url())) esInsights.status = r.status();
  });

  const esRes = await esPage.goto(esUrl, { waitUntil: 'networkidle' });
  await esPage.waitForTimeout(400);
  const esLang = await esPage.$eval('html', (e) => e.lang);

  if (esRes?.status() !== 200 || esLang !== 'es') {
    console.log(`\n  [ -- ] Spanish page not built — skipping (lang="${esLang}")\n`);
  } else {
    console.log('');
    check('es: document is lang="es"', esLang === 'es');
    check('es: title is Spanish', /Franja Morada/.test(await esPage.title()), await esPage.title());
    // No trailing slash: vercel.json sets trailingSlash:false, so /es/ 308s to
    // /es and a canonical with the slash would name a URL that redirects.
    const esCanonical = await esPage.$eval('link[rel=canonical]', (e) => e.getAttribute('href'));
    check('es: canonical is /es with no trailing slash',
      esCanonical === 'https://rightnleft.com/es', esCanonical);
    const esAlt = await esPage.$$eval('link[rel=alternate]',
      (ls) => ls.map((l) => l.getAttribute('href')));
    check('es: no hreflang names a URL that would redirect',
      !esAlt.some((h) => /\/es\/$/.test(h)), esAlt.join(' '));

    const alts = await esPage.$$eval('link[rel=alternate]', (ls) => ls.map((l) => l.hreflang));
    check('es: hreflang names en, es and x-default',
      ['en', 'es', 'x-default'].every((h) => alts.includes(h)), alts.join(', '));

    const sw = await esPage.$eval('.langswitch a', (e) => ({ text: e.textContent.trim(), href: e.getAttribute('href') }));
    check('es: language switch offers English and links to /',
      /english/i.test(sw.text) && sw.href === '/', `"${sw.text}" -> ${sw.href}`);

    // Present, and NOT above the title. It used to render directly under the
    // language switch, so on a phone the first thing a Spanish reader saw was a
    // disclaimer — before the page had said what it was.
    const note = await esPage.$eval('.xl-note', (e) => e.textContent);
    check('es: separates our words from the record',
      /escribimos nosotros/i.test(note) && /se quedan en ingl[eé]s/i.test(note));
    const noteAboveTitle = await esPage.evaluate(() => {
      const n = document.querySelector('.xl-note');
      const h = document.querySelector('h1');
      return !!(n && h) && (n.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    check('es: the notice does not precede the title', !noteAboveTitle);

    // The share card is a rendered image, so it needs its own per locale. A
    // Spanish og:title over a picture reading "The Purple Strip" is the
    // half-translation this build exists to refuse, and it is invisible on the
    // page itself — it only shows up when somebody shares the link.
    const meta = async (sel) => esPage.$eval(sel, (e) => e.getAttribute('content'));
    check('es: og:image is the Spanish card',
      /\/og\.es\.png$/.test(await meta('meta[property="og:image"]')),
      await meta('meta[property="og:image"]'));
    check('es: twitter:image is the Spanish card',
      /\/og\.es\.png$/.test(await meta('meta[name="twitter:image"]')));
    check('es: og:title is Spanish',
      /Franja Morada/.test(await meta('meta[property="og:title"]')),
      await meta('meta[property="og:title"]'));
    check('es: og:image:alt is Spanish',
      /Franja Morada/.test(await meta('meta[property="og:image:alt"]')));
    check('es: meta description is Spanish',
      /cuestionario a ciegas/i.test(await meta('meta[name="description"]')));

    // The record stays the record. A translated caption is not the caption, and
    // the lang attribute is what makes a screen reader switch voice for it.
    await esPage.click('#start-btn');
    await esPage.waitForTimeout(200);
    await esPage.click('#guess-skip');
    await esPage.waitForTimeout(200);
    await esPage.click('#official-btn');
    await esPage.waitForTimeout(200);
    const cap = await esPage.$eval('.q-caption', (e) => ({ text: e.textContent.trim(), lang: e.lang }));
    check('es: official caption is still English', /^Relating to/i.test(cap.text), cap.text.slice(0, 56));
    check('es: official caption carries lang="en"', cap.lang === 'en', cap.lang || '(unset)');

    // The disclosure, in Spanish, still ahead of the editorial-choice defence.
    const author = (await esPage.$eval('#author-card', (e) => e.innerText)).replace(/\s+/g, ' ');
    check('es: donation disclosed', /dono al Partido Dem[oó]crata/i.test(author));
    check('es: donation still precedes the editorial-choice defence',
      author.search(/dono al Partido/i) < author.search(/escog[ií] estas tres/i));

    // Payload prose came through the sidecar, not the English payload.
    const bias = (await esPage.$eval('#bias-card', (e) => e.innerText)).replace(/\s+/g, ' ');
    check('es: payload comparator rule is Spanish',
      /De cada bancada/i.test(bias), bias.slice(0, 70));

    // The leak test. Each of these is a sentence the page renders somewhere; if
    // one shows up on /es/, a render path was missed.
    //
    // CASE-INSENSITIVE, and that is the whole reason this works. innerText
    // applies CSS text-transform, so every .eyebrow, .prov dt and .stat-label
    // comes back UPPERCASED — six of these nine phrases were absent from the
    // ENGLISH page too when this compared exact case, which made them pass for
    // the wrong reason. Asserted against the English page below so the check
    // cannot go vacuous again if the copy is reworded.
    const bodyOf = async (pg) => {
      const text = await pg.evaluate(() => {
        const ids = ['start-view', 'quiz-view', 'result-view', 'how-panel', 'table-panel'];
        const was = ids.map((id) => {
          const e = document.getElementById(id);
          return { e, hidden: e ? e.hidden : null };
        });
        for (const w of was) if (w.e) w.e.hidden = false;
        const out = document.body.innerText;
        for (const w of was) if (w.e && w.hidden !== null) w.e.hidden = w.hidden;
        return out;
      });
      return text.replace(/\s+/g, ' ').toLowerCase();
    };
    // Every phrase here must render in BOTH modes and on every question, since
    // the page has been switched to full mode by the checks above. An earlier
    // list included "the seven biggest fights" (7-issue mode only) and "in plain
    // terms" (headline bills only), which the meta-check below flagged as
    // vacuous — the reason it exists.
    const PHRASES = [
      "doesn't this favour", 'who made this, who paid',
      'texas lawmakers vote yes or no', 'from each caucus',
      'official caption, word for word', 'straight from the record',
      'which way you lean', 'how this is built',
      'of your answers land on the opposite side',
      // Both of these leaked past an earlier version of this list and were only
      // caught by looking at a screenshot: a bare "of" hardcoded between two
      // numbers in a provenance tile, and the SVG axis labels on the strip.
      // Neither is a sentence, which is exactly why a prose-shaped leak list
      // missed them.
      'democratic-coded', 'republican-coded',
    ];
    // Drive both to the result, in full mode, with the disclosures open: that
    // is the state that actually contains the chrome this test is looking for.
    // Comparing two start screens would pass by having almost no text at all.
    const expose = async (pg, url) => {
      // Start from a fresh load rather than from wherever the previous check
      // left this page. Every click below is .catch()ed, so inherited state
      // does not fail — it silently skips, and the page never reaches the
      // state holding the phrases this test looks for. That is precisely what
      // happened when the share checks began leaving the page on the result
      // view, and the vacuity guard below is the only reason it was noticed.
      await pg.goto(url, { waitUntil: 'networkidle' });
      await pg.waitForTimeout(200);
      await pg.click('#start-btn').catch(() => {});
      await pg.waitForTimeout(150);
      // Past the guess screen, which now sits between Start and question one.
      await pg.click('#guess-skip').catch(() => {});
      await pg.waitForTimeout(150);
      await pg.click('#official-btn').catch(() => {});
      await pg.waitForTimeout(100);
      for (let i = 0; i < 200; i++) {
        if (!(await pg.evaluate(() => !document.getElementById('result-view')?.hidden))) {
          if (await pg.isVisible('#q-next')) { await pg.click('#q-next'); await pg.waitForTimeout(40); continue; }
          if (await pg.isVisible('#q-card [data-answer="1"]')) {
            await pg.click('#q-card [data-answer="1"]'); await pg.waitForTimeout(40); continue;
          }
        }
        break;
      }
      await pg.click('#mode-full').catch(() => {});
      await pg.waitForTimeout(300);
      for (let i = 0; i < 200; i++) {
        if (await pg.evaluate(() => !document.getElementById('result-view')?.hidden)) break;
        if (await pg.isVisible('#q-next')) { await pg.click('#q-next'); await pg.waitForTimeout(30); continue; }
        if (await pg.isVisible('#q-card [data-answer="1"]')) {
          await pg.click('#q-card [data-answer="1"]'); await pg.waitForTimeout(30); continue;
        }
        break;
      }
      await pg.click('#table-toggle').catch(() => {});
      await pg.waitForTimeout(200);
    };
    await expose(page, URL_UNDER_TEST);
    await expose(esPage, esUrl);

    const enBody = await bodyOf(page);
    const notOnEnglish = PHRASES.filter((p) => !enBody.includes(p));
    check('es: the leak phrases are all really on the English page',
      notOnEnglish.length === 0,
      notOnEnglish.length ? `vacuous checks: ${notOnEnglish.join(' | ')}` : `${PHRASES.length} phrases`);

    const esBody = await bodyOf(esPage);
    const leaks = PHRASES.filter((p) => esBody.includes(p));
    check('es: no English chrome left on the page', leaks.length === 0,
      leaks.length ? `LEAKED: ${leaks.join(' | ')}` : `${esBody.length} chars checked`);

    check('es: analytics script is requested on load', esInsights.requested,
      `/_vercel/insights/ -> ${esInsights.status}`);
    // Same local-only noise as the English page; same narrow filter.
    const esReal = esErrs.filter((e) => !isInsightsNoise(e));
    check('es: no console errors', esReal.length === 0, esReal.join(' | '));
  }
  await esPage.close();
} finally {
  await browser.close();
  if (server) await new Promise((r) => server.close(r));
}

console.log(
  fails === 0
    ? `\n  === the rendered site is correct${withHeaders ? ' under the production headers' : ''} ===\n`
    : `\n  === ${fails} MISMATCH(ES) ===\n`,
);
process.exit(fails === 0 ? 0 : 1);
