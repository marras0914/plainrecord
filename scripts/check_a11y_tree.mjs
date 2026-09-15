/**
 * PlainRecord — what a screen reader actually gets
 *
 *   node scripts/check_a11y_tree.mjs            # against `npm run preview` on :4173
 *   node scripts/check_a11y_tree.mjs --url http://localhost:5173
 *
 * `verify_site.mjs` proves the page renders and computes the right numbers. It
 * says nothing about the accessibility tree, which is a genuinely different
 * artifact: a screen reader never sees the screen. It reads roles, accessible
 * names and text, in DOM order. Three classes of bug live only in that tree.
 *
 *   1. THE BLIND PREMISE CAN LEAK. The whole site rests on the reader not
 *      knowing the party before they answer. We already shipped one bug where
 *      `q-why` put "Lt. Gov. priority bill" on every headline question. CSS can
 *      hide a thing from the screen and leave it in the tree, so "it is not
 *      visible" and "it is not announced" are separate claims and only the
 *      second one matters to a blind reader. This file asserts the second.
 *   2. AN IN-PLACE UPDATE CAN BE SILENT. Answering a question replaces the card.
 *      Sighted readers see it; a screen reader announces nothing unless focus
 *      moves or a live region fires. This file follows focus across every
 *      transition and fails if it lands nowhere.
 *   3. A CONTROL CAN BE ANONYMOUS. An icon button with no accessible name is
 *      announced as "button", which is useless. This file walks every
 *      interactive node and requires a name.
 *
 * Every absence-assertion here carries a CONTROL that must come out TRUE, because
 * an absence is trivially satisfied by a snapshot that failed to capture
 * anything. "No party words in the tree" passes beautifully against an empty
 * tree. So each leak check first proves the question text IS present, and the
 * party check proves the same words DO appear once the answer is locked in.
 * If the control fails, the finding is void, not green.
 *
 * This is not a substitute for listening to the page. It proves the tree is
 * well-formed and does not leak; it cannot tell you whether the result reads
 * aloud as a sentence a person would want to hear. That part needs ears.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname, sep } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const urlArg = argv[argv.indexOf('--url') + 1];
const BASE = argv.includes('--url') && urlArg ? urlArg : 'http://127.0.0.1:4173';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed. `npm i -D playwright` then `npx playwright install chromium`.');
  process.exit(1);
}

let pass = 0;
let fail = 0;
const failures = [];

const ok = (label, detail = '') => {
  pass++;
  console.log(`  [PASS] ${label}${detail ? '  — ' + detail : ''}`);
};
const bad = (label, detail = '') => {
  fail++;
  failures.push(label + (detail ? ' — ' + detail : ''));
  console.log(`  [FAIL] ${label}${detail ? '  — ' + detail : ''}`);
};
const check = (cond, label, detail = '') => (cond ? ok(label, detail) : bad(label, detail));
const section = (name) => console.log(`\n${name}`);

/* ------------------------------------------------------------------ *
 * The words that would give the party away before an answer is locked.
 * Derived from the shipped copy where possible rather than typed from
 * memory, so a reworded string cannot silently empty this list.
 * ------------------------------------------------------------------ */
const copy = JSON.parse(readFileSync(join(ROOT, 'i18n', 'copy.json'), 'utf8'));
const partyWordsEn = ['Republican', 'Democrat', 'GOP', 'Lt. Gov.', 'Lieutenant Governor', 'priority bill', 'Governor'];
const partyWordsEs = ['republicano', 'demócrata', 'Vicegobernador', 'prioritario'];

// Control on the needle list itself: these words must genuinely occur in the
// shipped English copy, otherwise the leak check is filtering for nothing.
const copyBlob = JSON.stringify(copy);
const needlesPresentInCopy = partyWordsEn.filter((w) => copyBlob.includes(w));

/** Flatten an aria snapshot (YAML-ish string) to searchable text. */
const treeText = (snapshot) => String(snapshot || '');

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  section('Preconditions');
  check(
    needlesPresentInCopy.length >= 3,
    'the party-word needles really occur in the shipped copy',
    `${needlesPresentInCopy.length} of ${partyWordsEn.length}: ${needlesPresentInCopy.join(', ')}`,
  );

  await page.goto(BASE, { waitUntil: 'networkidle' });
  check((await page.title()).length > 0, 'the page loaded', await page.title());

  // META-CHECK: the name auditor must actually catch an anonymous control.
  // It once reported two properly <label for>-ed inputs as unnamed, and after
  // that was fixed the opposite failure became the risk: a resolver generous
  // enough to name anything can never fail. Inject a genuinely nameless button,
  // confirm it is caught, and confirm a labelled one beside it is not.
  const meta = await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = '__a11y_probe';
    host.innerHTML =
      '<button id="__anon"></button>' +
      '<label for="__named">Named probe</label><input id="__named">';
    document.body.appendChild(host);
    return true;
  });
  const probe = await collectAnonymous(page);
  await page.evaluate(() => document.getElementById('__a11y_probe')?.remove());
  check(
    meta && probe.includes('button#__anon') && !probe.some((n) => n.includes('__named')),
    'META: the name auditor catches an anonymous control and clears a labelled one',
    `flagged: ${probe.join(', ') || 'nothing'}`,
  );

  /* ---------------------------------------------------------------- *
   * Document-level structure
   * ---------------------------------------------------------------- */
  section('Document structure');

  const lang = await page.getAttribute('html', 'lang');
  check(lang === 'en', 'the English page declares lang="en"', String(lang));

  // Multiple <main> elements exist by design (one per view, toggled with
  // `hidden`). What matters to a screen reader is how many are EXPOSED.
  const mains = await page.locator('main').count();
  const visibleMains = await page.locator('main:not([hidden])').count();
  check(
    visibleMains === 1,
    'exactly one main landmark is exposed at a time',
    `${visibleMains} visible of ${mains} in the document`,
  );

  const h1s = await page.locator('main:not([hidden]) h1').count();
  check(h1s === 1, 'the visible view has exactly one h1', String(h1s));

  /* ---------------------------------------------------------------- *
   * Every interactive control has an accessible name
   * ---------------------------------------------------------------- */
  section('Named controls (start view)');
  await auditNames(page, 'start view');

  /* ---------------------------------------------------------------- *
   * THE BLIND PREMISE, in the accessibility tree
   * ---------------------------------------------------------------- */
  section('The blind premise: party must not reach the tree before the answer');

  // Get into the quiz. The guess step sits between start and question 1.
  await startQuiz(page);

  const askedText = (await page.locator('#q-card .q-ask').first().textContent()) || '';
  check(askedText.trim().length > 10, 'CONTROL: a question is on screen', askedText.trim().slice(0, 60) + '…');

  const beforeTree = treeText(await page.locator('#quiz-view').ariaSnapshot());

  // Control: the snapshot is real. If the question text is not in the tree, the
  // absence assertions below are meaningless and must not be trusted.
  const askedNeedle = askedText.trim().slice(0, 24);
  check(
    askedNeedle.length > 5 && beforeTree.includes(askedNeedle),
    'CONTROL: the captured tree really contains the question',
    `${beforeTree.length} chars captured`,
  );

  const leakedBefore = partyWordsEn.filter((w) => beforeTree.includes(w));
  check(
    leakedBefore.length === 0,
    'no party word is in the tree before the reader answers',
    leakedBefore.length ? 'LEAKED: ' + leakedBefore.join(', ') : 'clean',
  );

  // Belt and braces: nothing hidden-but-announced anywhere in the card.
  const ariaLabelled = await page.locator('#q-card [aria-label], #q-card [title]').count();
  check(ariaLabelled === 0, 'the unanswered card carries no aria-label or title text', String(ariaLabelled));

  /* ---------------------------------------------------------------- *
   * Answering: does anything get announced?
   * ---------------------------------------------------------------- */
  section('Answering announces something');

  await page.locator('#q-card button.vote[data-answer="1"]').first().click();
  await page.waitForTimeout(250);

  const afterFocus = await focusInfo(page);
  check(
    afterFocus.tag !== 'BODY',
    'focus moves off body when an answer is locked in',
    `${afterFocus.tag}.${afterFocus.cls} "${afterFocus.text.slice(0, 50)}"`,
  );

  const afterTree = treeText(await page.locator('#quiz-view').ariaSnapshot());

  // THE CONTROL THAT MAKES THE LEAK CHECK MEAN ANYTHING. If party words never
  // appear even after the answer, the check above was filtering for a string
  // this page simply never contains, and it proves nothing.
  const shownAfter = partyWordsEn.filter((w) => afterTree.includes(w));
  check(
    shownAfter.length > 0,
    'CONTROL: party words DO reach the tree once the answer is locked in',
    shownAfter.length ? shownAfter.join(', ') : 'NONE — the leak check above is vacuous',
  );

  section('Named controls (answered card)');
  await auditNames(page, 'answered card');

  /* ---------------------------------------------------------------- *
   * Moving on announces the next question
   * ---------------------------------------------------------------- */
  section('Advancing announces the next question');

  const nextBtn = page.locator('#q-next');
  if (await nextBtn.count()) {
    const before = (await page.locator('#q-card .q-ask').first().textContent()) || '';
    await nextBtn.click();
    await page.waitForTimeout(250);
    const after = (await page.locator('#q-card .q-ask').first().textContent()) || '';
    check(after !== before, 'the card advanced to a new question', after.trim().slice(0, 50) + '…');

    const f = await focusInfo(page);
    check(
      f.tag !== 'BODY',
      'focus moves off body on advance',
      `${f.tag}.${f.cls} "${f.text.slice(0, 50)}"`,
    );
    check(
      f.text.trim().slice(0, 20) === after.trim().slice(0, 20),
      'focus lands on the new question, so it is what gets read',
      `focused "${f.text.trim().slice(0, 40)}"`,
    );

    // And the new, unanswered card must be clean again.
    const t2 = treeText(await page.locator('#quiz-view').ariaSnapshot());
    const leak2 = partyWordsEn.filter((w) => t2.includes(w));
    check(leak2.length === 0, 'the next unanswered question is clean too', leak2.join(', ') || 'clean');
  } else {
    bad('a next-question control exists', '#q-next not found');
  }

  /* ---------------------------------------------------------------- *
   * The result: the strip is the whole point, and it is a picture
   * ---------------------------------------------------------------- */
  section('The result view');

  await finishQuiz(page);

  const strip = page.locator('#strip');
  if (await strip.count()) {
    const role = await strip.getAttribute('role');
    check(role === 'img', 'the strip declares role="img"', String(role));
    const name = await strip.evaluate((el) => {
      const id = el.getAttribute('aria-labelledby');
      if (id) {
        const parts = id.split(/\s+/).map((i) => document.getElementById(i)?.textContent || '');
        return parts.join(' ').trim();
      }
      return el.getAttribute('aria-label') || '';
    });
    check(name.length > 0, 'the strip has a non-empty accessible name', name.slice(0, 80));
  } else {
    bad('the strip exists on the result view');
  }

  // "Has a heading" is too weak an assertion for the page the whole quiz leads
  // to. What a screen reader user needs is an outline they can jump through:
  // one h1 naming the result, and an h2 on each section under it.
  const outline = await page.evaluate(() => {
    const view = document.getElementById('result-view');
    if (!view || view.hidden) return null;
    return [...view.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter((h) => !h.closest('[hidden]') && h.getBoundingClientRect().height > 0)
      .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent || '').trim().slice(0, 44) }));
  });

  if (!outline) {
    bad('the result view is visible so its outline can be read');
  } else {
    const h1s = outline.filter((h) => h.level === 1);
    check(h1s.length === 1, 'the result view has exactly one h1', h1s.map((h) => `"${h.text}"`).join(', ') || 'none');
    check(
      h1s.length === 1 && h1s[0].text.length > 0,
      'the result h1 is the reader\'s verdict, not an empty node',
      h1s[0] ? `"${h1s[0].text}"` : 'none',
    );
    const h2s = outline.filter((h) => h.level === 2);
    check(h2s.length >= 4, 'each result section carries an h2 to jump to', `${h2s.length} section headings`);

    // No skipped levels, which is what makes an outline navigable rather than
    // merely present.
    let skipped = null;
    for (let i = 1; i < outline.length; i++) {
      if (outline[i].level - outline[i - 1].level > 1) {
        skipped = `h${outline[i - 1].level} "${outline[i - 1].text}" -> h${outline[i].level} "${outline[i].text}"`;
        break;
      }
    }
    check(skipped === null, 'the result outline skips no heading level', skipped || `${outline.length} headings, in order`);
  }

  section('Named controls (result view)');
  await auditNames(page, 'result view');

  /* ---------------------------------------------------------------- *
   * Spanish
   * ---------------------------------------------------------------- */
  section('Spanish page');
  await page.goto(BASE + '/es/', { waitUntil: 'networkidle' });
  const esLang = await page.getAttribute('html', 'lang');
  check(esLang === 'es', 'the Spanish page declares lang="es"', String(esLang));

  await startQuiz(page);
  const esAsk = page.locator('#q-card .q-ask').first();
  if (await esAsk.count()) {
    const esTree = treeText(await page.locator('#quiz-view').ariaSnapshot());
    const esAskText = ((await esAsk.textContent()) || '').trim();
    check(esAskText.length > 10, 'CONTROL: a Spanish question is on screen', esAskText.slice(0, 50) + '…');
    const esLeak = [...partyWordsEs, ...partyWordsEn].filter((w) => esTree.includes(w));
    check(esLeak.length === 0, 'no party word reaches the Spanish tree before the answer', esLeak.join(', ') || 'clean');

    // Bill text stays in English and is marked as such, so a Spanish voice does
    // not read English aloud with Spanish phonemes.
    const askLang = await esAsk.getAttribute('lang');
    check(
      askLang === null || askLang === 'en',
      'an English-language question is marked lang="en" for the synthesiser',
      askLang === null ? 'plain-language question, no marker needed' : 'lang="en"',
    );
  } else {
    bad('the Spanish quiz renders a question');
  }

  check(consoleErrors.length === 0, 'no uncaught page errors during the walk', consoleErrors.join('; ') || 'none');

  await browser.close();

  console.log(`\n  ${pass} checks passed, ${fail} failed`);
  if (fail) {
    console.log('\n  Failures:');
    for (const f of failures) console.log('   - ' + f);
  }
  process.exit(fail ? 1 : 0);
}

/** Names every interactive node in the visible view; returns the anonymous ones. */
async function auditNames(page, where) {
  const anon = await collectAnonymous(page);
  const total = await page.locator('button, a[href], input').count();
  check(
    anon.length === 0,
    `every visible control in the ${where} has an accessible name`,
    anon.length ? 'UNNAMED: ' + anon.join(', ') : `${total} controls in document`,
  );
}

/** The selectors of every visible, interactive, un-named element. */
async function collectAnonymous(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    // Accessible-name resolution, in the order the accname spec applies it.
    // The first version of this skipped native <label> entirely and reported
    // two correctly-labelled inputs as anonymous. A name check that does not
    // know how names are computed invents defects; resolve every source.
    const name = (el) => {
      const labelled = el.getAttribute('aria-labelledby');
      if (labelled) {
        const t = labelled
          .split(/\s+/)
          .map((i) => document.getElementById(i)?.textContent || '')
          .join(' ')
          .trim();
        if (t) return t;
      }
      if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label').trim();

      // Native labels: <label for=id>, and a <label> wrapping the control.
      if (el.id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
      }
      const wrapping = el.closest('label');
      if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();

      if (el.textContent?.trim()) return el.textContent.trim();
      return (
        el.getAttribute('title') ||
        el.getAttribute('alt') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('value') ||
        ''
      );
    };
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')) {
      if (el.closest('[hidden]')) continue;
      if (!visible(el)) continue;
      if (!name(el)) out.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
    }
    return out;
  });
}

async function focusInfo(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return { tag: 'NONE', cls: '', text: '' };
    return {
      tag: a.tagName,
      cls: String(a.className || '').split(' ')[0],
      text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });
}

/** Start view -> guess step -> first question. */
async function startQuiz(page) {
  const start = page.locator('#start-view:not([hidden]) button').first();
  if (await start.count()) await start.click();
  await page.waitForTimeout(200);
  const skipGuess = page.locator('#guess-skip');
  if ((await skipGuess.count()) && (await skipGuess.isVisible())) {
    await skipGuess.click();
    await page.waitForTimeout(250);
  }
}

/** Answer whatever is left until the result view appears. */
async function finishQuiz(page) {
  for (let i = 0; i < 80; i++) {
    if (await page.locator('#result-view:not([hidden])').count()) return;
    const yes = page.locator('#q-card button.vote[data-answer="1"]');
    const next = page.locator('#q-next');
    const done = page.locator('#q-result-now');
    if (await yes.count()) await yes.first().click();
    else if (await next.count()) await next.first().click();
    else if (await done.count()) await done.first().click();
    else break;
    await page.waitForTimeout(120);
  }
}

await main();
