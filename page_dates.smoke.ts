/**
 * PlainRecord: the sitemap's lastmod is the day each page last changed (17 Nov 2026)
 *
 * data/page_dates.json holds each static page's hash and date, and the build
 * stamps a changed page with today. This fails if the committed record does not
 * match the committed pages, which means the build was not run before a commit,
 * or its updated record was left out of it.
 *
 * The two economy explore pages are skipped: their timeline runs to the build
 * day, so they change daily and are reverted before each commit by design.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// @ts-ignore: plain .mjs
import { hashOf, loadRecord, today } from './scripts/_page_dates.mjs';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`);
}

const DAILY = new Set(['/economy/explore', '/economia/explorar']);
const root = new URL('.', import.meta.url);
const paths = execFileSync('git', ['ls-files', 'public/**/index.html'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').map((f) => '/' + f.replace(/^public\//, '').replace(/\/index\.html$/, ''));
const record = loadRecord();

check('the record covers every committed static page', paths.every((p) => record[p]), paths.filter((p) => !record[p]).slice(0, 5).join(', ') || `${paths.length} pages`);
const stale = paths.filter((p) => !DAILY.has(p) && record[p] && record[p].sha !== hashOf(p));
check('every page\'s recorded hash matches its committed HTML (run the build, commit data/page_dates.json)', stale.length === 0, stale.slice(0, 5).join(', ') || 'all match');
const badDates = Object.entries(record).filter(([, v]: any) => !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || v.date > today());
check('every date is a real day, none in the future', badDates.length === 0, badDates.slice(0, 3).map(([k]) => k).join(', '));
const tampered = { ...record, '/charts': { ...record['/charts'], sha: '0'.repeat(64) } };
const caught = paths.filter((p) => !DAILY.has(p) && tampered[p] && tampered[p].sha !== hashOf(p));
check('(the hash check catches a page whose record is out of date)', caught.length === 1 && caught[0] === '/charts', caught.join(', '));

const sm = new URL('./dist/sitemap.xml', import.meta.url);
if (existsSync(sm)) {
  const xml = readFileSync(sm, 'utf8');
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const undated = urls.filter((u) => !/<lastmod>/.test(u)).map((u) => u.match(/<loc>([^<]+)/)![1]);
  // The home pages and the quiz are built by vite, not from public/, and carry no date.
  check('the built sitemap dates every static page', undated.length === 4, undated.join(', '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
