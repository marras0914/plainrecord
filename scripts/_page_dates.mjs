/**
 * PlainRecord: the date each static page last changed, for the sitemap's <lastmod>
 *
 * data/page_dates.json maps a page's path to the SHA-256 of its committed HTML
 * (public/<path>/index.html) and the day that HTML last changed. The sitemap
 * reads it, so a crawler is told which pages changed and when, and a deploy that
 * changes nothing claims nothing.
 *
 * WHY NOT THE BUILD DATE. A build date on every URL would claim the whole site
 * changed on every deploy, and an engine that catches a sitemap's lastmod being
 * wrong stops trusting it. Until 17 Nov 2026 only the district pages carried a
 * date, the day the ballot list was fetched (30 Sep), which by then was seven
 * weeks behind pages that had changed several times.
 *
 * HOW IT STAYS RIGHT. The pages are built locally and committed, so the build
 * that writes them also stamps any page whose hash changed with today's date
 * (America/Chicago) and saves the record. Vercel never writes it: it only reads,
 * and a page whose hash is not in the record falls back to today. npm test
 * fails if the committed record does not match the committed pages.
 *
 *   node scripts/_page_dates.mjs --backfill   # seed every page from git history
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = resolve(ROOT, 'data/page_dates.json');

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
export const pageFile = (path) => resolve(ROOT, 'public', path.replace(/^\//, ''), 'index.html');
export const hashOf = (path) => createHash('sha256').update(readFileSync(pageFile(path))).digest('hex');

export function loadRecord() {
  return existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')).pages : {};
}

function save(pages) {
  const sorted = Object.fromEntries(Object.keys(pages).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((k) => [k, pages[k]]));
  writeFileSync(RECORD, JSON.stringify({
    _meta: 'The day each static page last changed, keyed by path, with the SHA-256 of its committed HTML. Written by the build (scripts/_page_dates.mjs) and read for the sitemap lastmod. Do not edit by hand.',
    pages: sorted,
  }, null, 2) + '\n', 'utf8');
}

/**
 * The lastmod for each path. Stamps changed pages with today and, unless on
 * Vercel or told not to, saves the record.
 */
export function datesFor(paths, { write = !process.env.VERCEL } = {}) {
  const pages = loadRecord();
  let changed = 0;
  const out = {};
  for (const p of paths) {
    if (!existsSync(pageFile(p))) continue;
    const sha = hashOf(p);
    if (pages[p]?.sha !== sha) { pages[p] = { sha, date: today() }; changed++; }
    out[p] = pages[p].date;
  }
  if (changed && write) save(pages);
  return { dates: out, changed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--backfill')) {
  // Every committed static page, dated by the last commit that touched its HTML.
  const files = execFileSync('git', ['ls-files', 'public/**/index.html'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  const pages = {};
  for (const f of files) {
    const path = '/' + f.replace(/^public\//, '').replace(/\/index\.html$/, '');
    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', f], { cwd: ROOT, encoding: 'utf8' }).trim();
    pages[path] = { sha: hashOf(path), date };
  }
  save(pages);
  console.log(`  page_dates.json: ${Object.keys(pages).length} pages from git history`);
}
