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
async function beginQuiz(pg, url) {
  await pg.goto(url, { waitUntil: 'networkidle' });
  await pg.click('#start-btn');
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

  const howOnQuiz = await howVisible(page);
  check('the method is still one tap away once the quiz starts',
    howOnQuiz.length === 1, howOnQuiz.join(' + ') || 'none visible');

  const meta = await page.$eval('.q-top', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check('boots in 7-issue mode', /^1 of 7/.test(meta), meta);
  check('question 1 is the school voucher vote', /School vouchers/.test(meta), meta);
  check('the reason for the pick is shown',
    /marquee fight/i.test(await page.$eval('.q-why', (e) => e.textContent.trim())));

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
    /3 of 3/.test(revSum) && /You said No/.test(revSum), revSum);
  check('the reader\'s own answer is not given the record\'s word for it',
    !/You said Nay/.test(revSum), revSum);

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
  const src = await page.$eval('.outc-src a', (e) => e.getAttribute('href'));
  check('every indicator links to its source', /^https?:\/\//.test(src), src);

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
    const expose = async (pg) => {
      await pg.click('#start-btn').catch(() => {});
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
    await expose(page);
    await expose(esPage);

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
