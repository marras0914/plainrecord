/**
 * PlainRecord — Governor's vetoes from the Legislative Reference Library
 *
 *   npx tsx scripts/fetch_vetoes.ts [outDir] [session...]
 *   npx tsx scripts/fetch_vetoes.ts data 89-0 88-0 87-0 86-0 85-0 84-0
 *
 * Why this matters: Greg Abbott has never served in a legislature, so he has no
 * roll-call record and cannot be placed on the same axis as the three House
 * Democrats by voting. A veto, however, IS a recorded position on a SPECIFIC
 * BILL — the same bill the House voted on. That makes it joinable to the exact
 * items the quiz already asks about, which no other Abbott signal is.
 *
 * Two limits that must reach the screen, not just this comment:
 *
 *   1. A veto list is ONE-SIDED. A governor only vetoes bills he opposes, and
 *      only bills that passed. So this measures "where do you sit on the bills
 *      Abbott killed," never "how often would Abbott agree with you."
 *      evidence.ts flags this via Coverage.oneSided and refuses to score it.
 *   2. A bill becoming law is NOT evidence of support. Texas governors routinely
 *      let bills take effect unsigned. Never synthesize a +1 from the absence of
 *      a veto — this script emits only the -1 positions it can actually see.
 *
 * Line-item vetoes of appropriations bills are tagged separately: striking one
 * funding line is not a position on the bill, so they must not be scored as one.
 *
 * Bonus: the LRL "Caption" column is the official bill caption — neutral by
 * construction, and a better starting point for item summaries than anything
 * generated. See DATA_PIPELINE.md § Neutral summaries.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Evidence } from '../evidence';
import { WORK_DIR } from './paths';
import { validateEvidence } from '../evidence';

/**
 * Person ids for non-legislators. LegiScan people_ids only exist for members, so
 * executive-branch candidates get stable slugs in their own namespace. Anything
 * joining these to legislator ids must go through billId, never id equality.
 */
export const GOVERNOR_ID = 'tx-gov-abbott-greg';

const UA = 'PlainRecord/0.1 (civic data ingest; rightnleft.com)';
const BASE = 'https://lrl.texas.gov';

/** Regular sessions of the 84th-89th Legislatures — Abbott's tenure, 2015-2025. */
export const DEFAULT_SESSIONS = ['89-0', '88-0', '87-0', '86-0', '85-0', '84-0'];

export interface VetoRow {
  bill: string;
  caption: string;
  lineItem: boolean;
  billUrl: string | null;
}

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Parse the vetoes table. The page renders a single `table#tableToSort` with a
 * Bill / Caption header row; each data row links the bill to its LRL detail page.
 */
export function parseVetoTable(html: string): VetoRow[] {
  const table = /<table[^>]*id=["']tableToSort["'][\s\S]*?<\/table>/i.exec(html);
  if (!table) {
    // A session with no vetoes, or a layout change. Distinguish the two: an empty
    // result is fine, a changed layout must not be silently read as "no vetoes."
    if (/no vetoes|not available|no records/i.test(html)) return [];
    throw new Error(
      'vetoes table (id="tableToSort") not found and the page does not say there ' +
        'are none — the LRL layout may have changed. Refusing to report zero vetoes.',
    );
  }

  const rows: VetoRow[] = [];
  for (const tr of table[0].match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
    if (cells.length < 2) continue;
    const bill = strip(cells[0]);
    let caption = strip(cells[1]);
    if (!bill || /^bill$/i.test(bill)) continue; // header row

    // The page appends this marker to the caption rather than using a column.
    const lineItem = /line[- ]item veto/i.test(caption);
    caption = caption.replace(/\s*Line item veto\s*$/i, '').trim();

    const href = /href=["']([^"']+)["']/i.exec(tr)?.[1] ?? null;
    rows.push({
      bill: bill.replace(/\s+/g, ' '),
      caption,
      lineItem,
      billUrl: href ? (href.startsWith('http') ? href : BASE + href) : null,
    });
  }
  return rows;
}

/** LRL session code "89-0" -> the session label the rest of the app uses, "89R". */
export function sessionLabel(code: string): string {
  const [leg, special] = code.split('-');
  return special === '0' ? `${leg}R` : `${leg}-${special}`;
}

export function toEvidence(rows: VetoRow[], sessionCode: string, pageUrl: string): Evidence[] {
  const session = sessionLabel(sessionCode);
  return rows.map((r) => {
    const e: Evidence = {
      personId: GOVERNOR_ID,
      // A line-item veto strikes funding, not the bill's policy — kept, but tagged
      // so it can be excluded from scoring.
      kind: r.lineItem ? 'line_item_veto' : 'veto',
      position: -1, // a veto is only ever opposition
      billId: r.bill,
      session,
      date: null, // the session table gives no per-veto date
      sourceUrl: r.billUrl ?? pageUrl,
      topic: r.caption || undefined,
      note: r.lineItem ? 'line-item veto of an appropriations bill; not a bill position' : undefined,
    };
    validateEvidence(e);
    return e;
  });
}

async function fetchSession(code: string): Promise<{ rows: VetoRow[]; url: string }> {
  const url = `${BASE}/legis/vetoes/vetoesBySession.cfm?legSession=${encodeURIComponent(code)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return { rows: parseVetoTable(await res.text()), url };
}

async function main() {
  const args = process.argv.slice(2);
  const outDir = args[0] && !/^\d+-\d+$/.test(args[0]) ? args[0] : WORK_DIR;
  const sessions = args.filter((a) => /^\d+-\d+$/.test(a));
  const list = sessions.length ? sessions : DEFAULT_SESSIONS;

  const all: Evidence[] = [];
  console.log('');
  for (const code of list) {
    try {
      const { rows, url } = await fetchSession(code);
      const ev = toEvidence(rows, code, url);
      all.push(...ev);
      const li = ev.filter((e) => e.kind === 'line_item_veto').length;
      console.log(
        `  ${sessionLabel(code).padEnd(6)} ${String(ev.length).padStart(3)} vetoes` +
          (li ? `  (${li} line-item, excluded from scoring)` : ''),
      );
    } catch (err) {
      console.error(`  ${sessionLabel(code).padEnd(6)} FAILED: ${(err as Error).message}`);
      process.exitCode = 1;
    }
    // Be a polite guest on a public library's server.
    await new Promise((r) => setTimeout(r, 1200));
  }

  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'tx_evidence_vetoes.json');
  writeFileSync(out, JSON.stringify(all, null, 2));

  const scoreable = all.filter((e) => e.kind === 'veto').length;
  console.log(`\n  total ${all.length} veto records, ${scoreable} scoreable (non-line-item)`);
  console.log(`  -> ${out}`);
  console.log(
    '\n  Reminder: every one of these is position -1. evidence.ts will report this\n' +
      '  record as one-sided and refuse to turn it into an alignment score. Display\n' +
      '  it as "bills Abbott vetoed that you had an opinion about", not as a match.\n',
  );
}

if (process.argv[1] && /^fetch_vetoes\.(ts|js|mjs|cjs)$/.test(basename(process.argv[1]))) main();
