/**
 * PlainRecord — the classroom worksheet PDF
 *
 *   node scripts/build_worksheet_pdf.mjs
 *
 * Renders classroom/worksheet.html to public/classroom/texas-house-worksheet.pdf
 * and a page-one preview PNG beside it. Run by hand after editing the worksheet,
 * then commit both: like the share cards, the build on Vercel has no browser, so
 * the PDF ships as a committed file rather than being made at deploy time.
 *
 * It refuses to write if either page's content runs into its footer. The footer
 * is absolutely positioned, so ordinary overflow checks miss exactly that case,
 * and it happened once while the worksheet was being laid out.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'classroom/worksheet.html');
const OUT = resolve(ROOT, 'public/classroom');
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
try {
  const p = await b.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 1.5 });
  await p.goto(pathToFileURL(SRC).href);
  const gaps = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg) => {
    const foot = pg.querySelector('.foot').getBoundingClientRect().top;
    const kids = [...pg.children].filter((c) => !c.classList.contains('foot'));
    return Math.round(foot - Math.max(...kids.map((c) => c.getBoundingClientRect().bottom)));
  }));
  if (gaps.length !== 2 || gaps.some((g) => g < 8)) {
    throw new Error(`worksheet layout: want 2 pages with >= 8px above each footer, got ${JSON.stringify(gaps)}`);
  }
  await p.pdf({ path: resolve(OUT, 'texas-house-worksheet.pdf'), format: 'Letter', printBackground: true, preferCSSPageSize: true });
  await p.screenshot({ path: resolve(OUT, 'worksheet-page-1.png'), clip: { x: 0, y: 0, width: 816, height: 1056 } });
  console.log(`  worksheet PDF written (footer clearance ${gaps.join(', ')} px)`);
} finally {
  await b.close();
}
