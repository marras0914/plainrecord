/**
 * PlainRecord: the Texas Catholic bishops' positions on 89th Legislature bills
 *
 *   npm run data:faith:tccb
 *
 * Reads the two bill-position pages of the Texas Catholic Conference of Bishops
 * (TCCB), saved to data/faith_sources/ (gitignored, theirs to distribute), and
 * writes data/faith/tccb_89_positions.json (committed): every bill on which the
 * bishops posted "supports" or "opposes", with their own words for it.
 *
 * WHY ONLY BILLS THE BISHOPS NAMED. Marco decided (13 Nov 2026) that a party's
 * vote is compared with a church only where the church itself took a side on
 * that bill. We never judge which way a church's teaching points on a bill. In
 * Texas, only the TCCB publishes a bill-by-bill list, so only the Catholic
 * tradition has one; the pages say so for the other four.
 *
 * THREE SOURCES, all the bishops' own: the two bill-position web pages and
 * the Sine Die Report they published at the end of the session (PDF, run
 * through pdftotext -layout into tccb_89_sine_die.txt).
 *
 * THE RULES, all mechanical:
 *  1. On the web pages, an entry is a paragraph that starts with the bishops'
 *     approve or reject icon. The icon is the position. Every bill linked in
 *     the paragraph (companions included, "HB 37 | HB 2058") takes it.
 *  2. Most web entries also say it in words ("The TCCB supports this bill").
 *     Where the words disagree with the icon, the bill is a CONFLICT.
 *  3. In the Sine Die Report, the stance follows from the report's own
 *     definitions of Win, Loss and Progress (see parseSineDie).
 *  4. A bill named in several entries or sources must have one position across
 *     all of them. If not, it is a CONFLICT.
 *  5. Conflicts are not counted. They are listed on the page, with the bishops'
 *     own words, so a reader can see what was left out and why.
 *  6. The link shown is the bishops' by-number page when the bill is on it
 *     (the list they point to as complete), else the priority-area page, else
 *     the Sine Die Report.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FAITH_SOURCE_DIR, decodeEntities } from './faith_sources';
import { WORK_DIR } from './paths';

export const TCCB_PAGES = {
  byArea: { url: 'https://txcatholic.org/public-policy-2/89th-legislature-bill-positions/', file: 'tccb_89_bill_positions.html' },
  byNumber: { url: 'https://txcatholic.org/bill-positions-89th-legislature/', file: 'tccb_89_by_number.html' },
  sineDie: { url: 'https://txcatholic.org/wp-content/uploads/2025/07/89th-FULL-Sine-Die-Report.pdf', file: 'tccb_89_sine_die.txt' },
} as const;

/**
 * The Sine Die Report (July 2025, pdftotext -layout) lists bills as "Win:",
 * "Loss:" or "Progress:" entries and defines those words itself: "Wins include
 * the passage of supported bills and opposed bills' failure to pass. Progress is
 * counted if a supported bill passed through its original chamber ... Losses
 * include the passage of an opposed bill, the failure of a supported bill to
 * pass". So a stance follows from the entry by the report's own definitions:
 *  - "we opposed" / "we supported" in the entry: that, as stated;
 *  - Progress: supports;
 *  - Win or Loss with the bill passed (and nothing about dying): Win supports,
 *    Loss opposes; with the bill dead or failed (and nothing about passing):
 *    Win opposes, Loss supports;
 *  - anything else: no stance, and the entry adds nothing.
 */
export function parseSineDie(raw: string): Entry[] {
  // Page numbers are lines of digits alone, and pages end in a form feed; neither is the bishops' text.
  const text = raw.replace(/\f/g, '\n').replace(/^[ \t]*\d{1,3}[ \t]*$/gm, '');
  const out: Entry[] = [];
  // Section headings are lines holding only one of the eight area names.
  const heading = new RegExp(`^\\s*(${TCCB_AREAS.join('|')})\\s*$`, 'gm');
  const heads = [...text.matchAll(heading)].map((m) => ({ at: m.index!, area: m[1] }));
  let at = 0;
  for (const raw of text.split(/\n(?=\s*(?:Win|Loss|Progress)\s*:)/)) {
    const start = at;
    at += raw.length + 1;
    if (!/^\s*(?:Win|Loss|Progress)\s*:/.test(raw)) continue;
    const area = heads.filter((h) => h.at < start).pop()?.area ?? null;
    // Stop at the next section heading, if one falls inside this chunk.
    const cut = raw.search(new RegExp(`\\n\\s*(?:${TCCB_AREAS.join('|')})\\s*\\n`));
    const e = (cut > 0 ? raw.slice(0, cut) : raw).replace(/\s+/g, ' ').trim();
    const kind = e.match(/^(Win|Loss|Progress)/)![1];
    // The bills are named before the entry's second colon: "Win: HB 37 (HB 2058): This bill ..."
    const colon2 = e.indexOf(':', e.indexOf(':') + 1);
    const head = colon2 > 0 ? e.slice(0, colon2) : e.slice(0, 80);
    const bills = [...new Set([...head.matchAll(/\b(HJR|SJR|HCR|SCR|HB|SB|HR|SR)\s?(\d+)\b/g)].map((m) => `${m[1]} ${m[2]}`))];
    if (!bills.length) continue;
    let stance: Position | null = null;
    if (/\bwe (?:publicly )?opposed\b/i.test(e)) stance = 'opposes';
    else if (/\bwe (?:publicly )?supported\b/i.test(e)) stance = 'supports';
    else if (kind === 'Progress') stance = 'supports';
    else {
      const passed = /\b(?:was passed|bill passed|bills passed|passed\.)/i.test(e);
      const died = /\b(?:died|failed)\b/i.test(e);
      if (passed && !died) stance = kind === 'Win' ? 'supports' : 'opposes';
      else if (died && !passed) stance = kind === 'Win' ? 'opposes' : 'supports';
    }
    if (!stance) continue;
    out.push({ page: 'sineDie', area, icon: stance, words: null, bills, text: e });
  }
  return out;
}

export const TCCB_FILE = join(WORK_DIR, 'faith', 'tccb_89_positions.json');

/** The bishops' eight priority areas, as their pages name them. */
export const TCCB_AREAS = ['Life and Family Life', 'Immigration', 'Restorative Justice', 'Education', 'Healthcare', 'Social Concerns', 'Religious Liberty', 'Creation'];

/** The date the two pages were saved. Their positions can change; this is the copy we read. */
export const TCCB_SAVED = '2026-11-13';

export type Position = 'supports' | 'opposes';

export interface Entry {
  page: keyof typeof TCCB_PAGES;
  area: string | null;
  icon: Position;
  /** What the words say, if they say it; null when the entry has no such sentence. */
  words: string | null;
  bills: string[];
  text: string;
  /** Written bill to the different real bill its link points to. */
  linkElsewhere?: Record<string, string>;
}

const ICON: Record<string, Position> = { approve: 'supports', reject: 'opposes' };

/** "HB00037" or "HB 37" to "HB 37". */
export const normBill = (s: string) => {
  const m = s.replace(/\s+/g, '').toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  if (!m) throw new Error(`not a bill number: ${s}`);
  return `${m[1]} ${m[2]}`;
};

const plain = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** The verb in "The TCCB supports this bill", or null. Anything but supports/opposes is reported as it stands. */
export function wordsOf(text: string): string | null {
  const m = text.match(/\bTCCB\s+(\w+)\s*this\s+(?:bill|resolution|constitutional amendment)/i)
    ?? text.match(/\bTCCB\s+(\w+)this\s+bill/i);
  if (!m) return null;
  const v = m[1].toLowerCase();
  if (v === 'supports' || v === 'support') return 'supports';
  if (v === 'opposes' || v === 'oppose') return 'opposes';
  return v;
}

/**
 * Every bill link in a piece of HTML: the bill the bishops WROTE (the link's
 * text) and the bill it points to. The written number is the one used. Ten
 * links point to "HB 0", a broken link, and are read by their text; a link that
 * points to some other real bill makes the written bill a conflict, because
 * the entry then names two bills and we cannot tell which was meant.
 */
export function billLinks(html: string): { bill: string; href: string }[] {
  // Case-insensitive: about 225 of the links are written "sB00256".
  return [...html.matchAll(/<a [^>]*href="[^"]*History\.aspx\?LegSess=89R&amp;Bill=([A-Za-z]+\d+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => {
    // Some link texts carry the author too ("Goodwin, VikkiHJR 131").
    const written = [...plain(m[2]).matchAll(/(HJR|SJR|HCR|SCR|HB|SB|HR|SR)\s?0*(\d+)/gi)];
    if (written.length > 1) throw new Error(`a link names several bills: ${plain(m[2])}`);
    const href = normBill(m[1]);
    return { bill: written.length ? normBill(written[0][1] + written[0][2]) : href, href };
  });
}

export function parsePage(html: string, page: keyof typeof TCCB_PAGES): Entry[] {
  // Priority-area tabs: each panel's index matches its label's.
  const labels = new Map<string, string>();
  for (const m of html.matchAll(/id="(fl-tabs-[\w-]+)-label-(\d+)"[\s\S]{0,400}?<span[^>]*>([^<]+)</g)) {
    labels.set(`${m[1]}-${m[2]}`, decodeEntities(m[3]).trim());
  }
  const panels = [...html.matchAll(/id="(fl-tabs-[\w-]+)-panel-(\d+)"/g)].map((m) => ({ at: m.index!, key: `${m[1]}-${m[2]}` }));
  const areaAt = (i: number) => {
    let key: string | null = null;
    for (const p of panels) if (p.at < i) key = p.key;
    return key ? labels.get(key) ?? null : null;
  };

  const out: Entry[] = [];
  for (const m of html.matchAll(/<p>((?:(?!<\/p>)[\s\S])*?<img[^>]*src="[^"]*\/(approve|reject)[^"]*"[\s\S]*?)<\/p>/g)) {
    const body = m[1];
    const links = billLinks(body);
    const bills = [...new Set(links.map((l) => l.bill))];
    if (!bills.length) continue;
    const text = plain(body);
    const linkElsewhere: Record<string, string> = {};
    for (const l of links) if (l.href !== l.bill && l.href !== 'HB 0') linkElsewhere[l.bill] = l.href;
    out.push({ page, area: page === 'byArea' ? areaAt(m.index!) : null, icon: ICON[m[2]], words: wordsOf(text), bills, text, linkElsewhere });
  }
  return out;
}

/**
 * The bishops' own words are NOT written to the committed file or shipped:
 * their entries run to 150 words, and the faith pages quote others' text only
 * in short excerpts. The pages show the bill's official caption instead, and
 * link to the bishops' entry.
 */
export interface BillPosition {
  bill: string;
  position: Position;
  areas: string[];
  /** On a web page, whether the entry also says it in words ("The TCCB supports this bill"). */
  stated: boolean;
  /** The other bills in that entry. */
  with: string[];
  source: string;
  /** Which of the three sources name it. */
  in: (keyof typeof TCCB_PAGES)[];
}

export interface Conflict {
  bill: string;
  /** link: written bill and link differ; words: icon vs sentence; pages / report: one source gives both; pagesVsReport. */
  kind: 'link' | 'words' | 'pages' | 'report' | 'pagesVsReport';
  /** For link, the bill linked; for words, the verb the sentence uses. */
  other?: string;
  why: string;
  entries: { page: string; icon: Position; words: string | null }[];
}

export function buildPositions(entries: Entry[]) {
  const byBill = new Map<string, Entry[]>();
  for (const e of entries) for (const b of e.bills) byBill.set(b, [...(byBill.get(b) ?? []), e]);

  const positions: BillPosition[] = [];
  const conflicts: Conflict[] = [];
  for (const [bill, es] of byBill) {
    const said = new Set(es.flatMap((e) => [e.icon, ...(e.words ? [e.words] : [])]));
    const elsewhere = es.find((e) => e.linkElsewhere?.[bill]);
    if (elsewhere) {
      conflicts.push({
        bill,
        kind: 'link', other: elsewhere.linkElsewhere![bill],
        why: `the bishops wrote ${bill}, but the link goes to ${elsewhere.linkElsewhere![bill]}`,
        entries: es.map((e) => ({ page: TCCB_PAGES[e.page].url, icon: e.icon, words: e.words })),
      });
      continue;
    }
    if (said.size !== 1) {
      const inner = es.find((e) => e.words && e.words !== e.icon);
      const pages = new Set(es.filter((e) => e.page !== 'sineDie').map((e) => e.icon));
      const report = new Set(es.filter((e) => e.page === 'sineDie').map((e) => e.icon));
      conflicts.push({
        bill,
        kind: inner ? 'words' : pages.size > 1 ? 'pages' : report.size > 1 ? 'report' : 'pagesVsReport',
        ...(inner ? { other: inner.words! } : {}),
        why: inner ? `icon says ${inner.icon}, words say "${inner.words}"`
          : pages.size > 1 ? 'the bill-position pages give it both positions'
          : report.size > 1 ? 'the Sine Die Report gives it both positions'
          : `the bill-position pages say ${[...pages][0]}, the Sine Die Report says ${[...report][0]}`,
        entries: es.map((e) => ({ page: TCCB_PAGES[e.page].url, icon: e.icon, words: e.words })),
      });
      continue;
    }
    const shown = es.find((e) => e.page === 'byNumber') ?? es.find((e) => e.page === 'byArea') ?? es[0];
    positions.push({
      bill,
      position: es[0].icon,
      areas: [...new Set(es.map((e) => e.area).filter((a): a is string => !!a))],
      stated: es.some((e) => e.page !== 'sineDie' && e.words !== null),
      with: shown.bills.filter((b) => b !== bill),
      source: TCCB_PAGES[shown.page].url,
      in: [...new Set(es.map((e) => e.page))],
    });
  }
  const order = (b: string) => { const [t, n] = b.split(' '); return `${t.padEnd(4)}${n.padStart(5, '0')}`; };
  positions.sort((a, b) => order(a.bill).localeCompare(order(b.bill)));
  conflicts.sort((a, b) => order(a.bill).localeCompare(order(b.bill)));
  return { positions, conflicts };
}

function main(): void {
  const entries: Entry[] = [];
  const pages: Record<string, { url: string; sha256: string; entries: number }> = {};
  for (const [k, p] of Object.entries(TCCB_PAGES) as [keyof typeof TCCB_PAGES, (typeof TCCB_PAGES)[keyof typeof TCCB_PAGES]][]) {
    const html = readFileSync(join(FAITH_SOURCE_DIR, p.file), 'utf8');
    const es = k === 'sineDie' ? parseSineDie(html) : parsePage(html, k);
    if (k !== 'sineDie') {
      // Every bill link on the page must land in an entry, or the parser missed one.
      const linked = new Set(billLinks(html).map((l) => l.bill));
      const hrefs = (html.match(/History\.aspx\?LegSess=89R&amp;Bill=/g) ?? []).length;
      if (hrefs !== billLinks(html).length) throw new Error(`${p.file}: ${hrefs} bill hrefs but ${billLinks(html).length} parsed links`);
      const got = new Set(es.flatMap((e) => e.bills));
      const lost = [...linked].filter((b) => !got.has(b));
      if (lost.length) throw new Error(`${p.file}: ${lost.length} linked bill(s) in no entry: ${lost.join(', ')}`);
    } else {
      // Every Win/Loss/Progress entry must either yield a stance or be listed as not yielding one.
      const all = (html.match(/^\s*(?:Win|Loss|Progress)\s*:/gm) ?? []).length;
      console.log(`  sine die: ${all} entries, ${es.length} with a stance by the report's own definitions`);
    }
    entries.push(...es);
    pages[k] = { url: p.url, sha256: createHash('sha256').update(html).digest('hex'), entries: es.length };
  }
  const { positions, conflicts } = buildPositions(entries);
  const out = {
    about: 'Every bill of the 89th Texas Legislature (2025) on which the Texas Catholic Conference of Bishops took a side, from its two bill-position pages and its Sine Die Report, with a link to the entry. Bills whose entries contradict each other are listed under conflicts and not counted.',
    saved: TCCB_SAVED,
    pages,
    caveat: 'The TCCB does not take positions on all bills in any legislative session. The analysis of the bills is made at various phases of the legislative process and may not accurately reflect the final status of the bill.',
    counts: {
      supports: positions.filter((p) => p.position === 'supports').length,
      opposes: positions.filter((p) => p.position === 'opposes').length,
      conflicts: conflicts.length,
      /** Named only in the Sine Die Report, so the stance comes from its Win/Loss definitions. */
      fromReportOnly: positions.filter((p) => p.in.length === 1 && p.in[0] === 'sineDie').length,
      /** On a web page whose entry has the icon but no "The TCCB supports/opposes" sentence. */
      fromIconOnly: positions.filter((p) => (p.in.includes('byNumber') || p.in.includes('byArea')) && !p.stated).length,
    },
    positions,
    conflicts,
  };
  writeFileSync(TCCB_FILE, JSON.stringify(out, null, 1) + '\n');
  console.log(`\n  ${TCCB_FILE}  ${out.counts.supports} supports, ${out.counts.opposes} opposes, ${out.counts.conflicts} conflicts (${out.counts.fromReportOnly} from the report only, ${out.counts.fromIconOnly} from the icon only)\n`);
  for (const c of conflicts) console.log(`  CONFLICT ${c.bill}: ${c.why}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
