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

try {
  await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  console.log('');
  const meta = await page.$eval('.q-meta .eyebrow', (e) => e.textContent.trim());
  check('boots in 7-issue mode', /^1 of 7 /.test(meta), meta);
  check('question 1 is SB 2, school vouchers', /SB 2 · School vouchers/.test(meta), meta);
  check('the reason for the pick is shown',
    /marquee fight/i.test(await page.$eval('.headline-why', (e) => e.textContent.trim())));

  // --- the plain-language gloss ---------------------------------------------
  // The one field on the page written by us rather than copied from the record.
  // In a blind quiz the wording IS the question, so the reader must be able to
  // see which words are the state's and which are ours — the official caption
  // has to remain present, and the gloss has to be labelled.
  const plain = await page.$eval('.q-plain', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check('SB 2 carries a plain-language description',
    /education savings|state-funded accounts/i.test(plain), plain.slice(0, 70));
  check('the gloss is labelled as ours, not the official text',
    /In plain terms/i.test(plain) && /not the official text/i.test(plain), plain.slice(-60));
  check('the official caption is still shown above it',
    /Relating to the establishment of an education savings account program/i.test(
      await page.$eval('.q-caption', (e) => e.textContent),
    ));

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
    /3 of 3/.test(revSum) && /You said Nay/.test(revSum), revSum);

  // Answer the opposite way on Q2 so the disagreement branch is exercised too —
  // a reveal that can only render agreement proves nothing.
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
  await page.click('[data-preset="reset"]');
  await page.waitForTimeout(200);
  await page.click('#mode-full');
  await page.waitForTimeout(400);
  let absence = null;
  for (let i = 0; i < 40 && !absence; i++) {
    await page.click('[data-answer="1"]');
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

  await page.click('[data-preset="reset"]');
  await page.waitForTimeout(200);
  await page.click('#mode-short');
  await page.waitForTimeout(350);

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
    const meta = await page.$eval('.q-meta .eyebrow', (e) => e.textContent);
    await page.click('[data-answer="-1"]');
    await page.waitForTimeout(160);
    if (/SB 3 /.test(meta)) {
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
  await page.click('[data-preset="reset"]');
  await page.waitForTimeout(250);

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

  await page.click('[data-preset="reset"]');
  await page.waitForTimeout(200);
  await page.click('#mode-full');
  await page.waitForTimeout(400);
  const fullMeta = await page.$eval('.q-meta .eyebrow', (e) => e.textContent.trim());
  const total = /^1 of (\d+) /.exec(fullMeta)?.[1];
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
    await page.click('[data-answer="1"]');
    await page.waitForTimeout(90);
  }
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

  check('no console errors', errs.length === 0, errs.join(' | '));

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

    check('es: says its Spanish is unofficial',
      /traducci[oó]n nuestra/i.test(await esPage.$eval('.xl-note', (e) => e.textContent)));

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
    const bodyOf = async (pg) =>
      (await pg.$eval('body', (e) => e.innerText)).replace(/\s+/g, ' ').toLowerCase();
    // Every phrase here must render in BOTH modes and on every question, since
    // the page has been switched to full mode by the checks above. An earlier
    // list included "the seven biggest fights" (7-issue mode only) and "in plain
    // terms" (headline bills only), which the meta-check below flagged as
    // vacuous — the reason it exists.
    const PHRASES = [
      "doesn't this favour", 'who made this, who paid',
      'texas lawmakers vote yes or no', 'from each caucus',
      'official bill caption', 'straight from the record',
      'which way you lean', 'how this is built',
      'of your answers land on the opposite side',
      // Both of these leaked past an earlier version of this list and were only
      // caught by looking at a screenshot: a bare "of" hardcoded between two
      // numbers in a provenance tile, and the SVG axis labels on the strip.
      // Neither is a sentence, which is exactly why a prose-shaped leak list
      // missed them.
      'democratic-coded', 'republican-coded',
    ];
    const enBody = await bodyOf(page);
    const notOnEnglish = PHRASES.filter((p) => !enBody.includes(p));
    check('es: the leak phrases are all really on the English page',
      notOnEnglish.length === 0,
      notOnEnglish.length ? `vacuous checks: ${notOnEnglish.join(' | ')}` : `${PHRASES.length} phrases`);

    const esBody = await bodyOf(esPage);
    const leaks = PHRASES.filter((p) => esBody.includes(p));
    check('es: no English chrome left on the page', leaks.length === 0,
      leaks.length ? `LEAKED: ${leaks.join(' | ')}` : `${esBody.length} chars checked`);

    check('es: no console errors', esErrs.length === 0, esErrs.join(' | '));
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
