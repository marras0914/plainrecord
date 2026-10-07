/**
 * PlainRecord — the classroom worksheet PDFs
 *
 *   node scripts/build_worksheet_pdf.mjs              both languages, into public/
 *   node scripts/build_worksheet_pdf.mjs --review DIR  Spanish draft into DIR only
 *
 * Renders classroom/worksheet.mjs to a letter-size PDF per language, with a
 * page-one PNG beside each:
 *   public/classroom/texas-house-worksheet.pdf    (English)
 *   public/maestros/hoja-de-trabajo.pdf           (Spanish)
 * Run by hand after editing the worksheet or i18n/classroom.json, then commit
 * the outputs: like the share cards, the build on Vercel has no browser.
 *
 * Two refusals. Spanish is never written into public/ while any string in
 * i18n/classroom.json is unapproved, the same rule as the site's Spanish gate;
 * --review renders it somewhere else so it can be read on a phone first. And
 * nothing is written if a page's content runs into its footer, which is
 * absolutely positioned and so invisible to an ordinary overflow check.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { worksheetHtml, unapprovedSpanish, OUTPUTS } from '../classroom/worksheet.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reviewAt = process.argv.indexOf('--review');
const reviewDir = reviewAt > 0 ? resolve(process.argv[reviewAt + 1] ?? '') : null;


const jobs = [];
if (reviewDir) {
  jobs.push(['es', reviewDir]);
} else {
  const pending = unapprovedSpanish();
  if (pending.length) {
    throw new Error(`i18n/classroom.json: ${pending.length} Spanish strings not approved (${pending.slice(0, 4).join(', ')}...). Use --review DIR to render a draft outside public/.`);
  }
  jobs.push(['en', resolve(ROOT, OUTPUTS.en.dir)], ['es', resolve(ROOT, OUTPUTS.es.dir)]);
}

const b = await chromium.launch();
try {
  for (const [lang, dir] of jobs) {
    mkdirSync(dir, { recursive: true });
    const p = await b.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 1.5 });
    await p.setContent(worksheetHtml(lang), { waitUntil: 'load' });
    const gaps = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg) => {
      const foot = pg.querySelector('.foot').getBoundingClientRect().top;
      const kids = [...pg.children].filter((c) => !c.classList.contains('foot'));
      return Math.round(foot - Math.max(...kids.map((c) => c.getBoundingClientRect().bottom)));
    }));
    if (gaps.length !== 2 || gaps.some((g) => g < 8)) {
      throw new Error(`${lang} worksheet layout: want 2 pages with >= 8px above each footer, got ${JSON.stringify(gaps)}`);
    }
    const o = OUTPUTS[lang];
    await p.pdf({ path: resolve(dir, o.pdf), format: 'Letter', printBackground: true, preferCSSPageSize: true });
    await p.screenshot({ path: resolve(dir, o.png), clip: { x: 0, y: 0, width: 816, height: 1056 } });
    if (reviewDir) await p.screenshot({ path: resolve(dir, 'hoja-pagina-2.png'), fullPage: true, clip: { x: 0, y: 1056, width: 816, height: 1056 } });
    console.log(`  ${lang} worksheet written to ${dir} (footer clearance ${gaps.join(', ')} px)`);
    await p.close();
  }
} finally {
  await b.close();
}
