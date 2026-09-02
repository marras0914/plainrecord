/**
 * PlainRecord — shared CSV plumbing for the ingest adapters
 *
 * Both ingest paths (LegiScan bulk archives, Open States session exports) read
 * CSV bundles whose exact column names are not contractually stable. The shared
 * rule: never index a column blindly. `col()` tries several plausible spellings
 * and throws with the headers it actually found, so a renamed column fails the
 * build instead of silently filling a field with undefined.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

/** RFC4180-ish parser: handles quoted fields containing commas, quotes, newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  // Strip a UTF-8 BOM, which otherwise corrupts the first header name.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

export interface Table {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
}

export function loadTable(path: string): Table {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  if (rows.length === 0) throw new Error(`${path}: empty`);
  const headers = rows[0].map((h) => h.trim());
  return {
    name: basename(path),
    headers,
    rows: rows.slice(1).map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h, j) => (o[h] = (r[j] ?? '').trim()));
      return o;
    }),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Case/underscore-insensitive column lookup across several candidate names. */
export function col(table: Table, candidates: string[]): string {
  for (const want of candidates) {
    const hit = table.headers.find((h) => norm(h) === norm(want));
    if (hit) return hit;
  }
  throw new Error(
    `${table.name}: none of [${candidates.join(', ')}] found.\n` +
      `  headers present: ${table.headers.join(', ')}\n` +
      `  Add the real name to the candidate list in the adapter.`,
  );
}

/** Same as `col`, but returns '' instead of throwing when the column is optional. */
export function optionalCol(table: Table, candidates: string[]): string {
  try {
    return col(table, candidates);
  } catch {
    return '';
  }
}

/** Every .csv under dir, recursively. */
export function listCsvs(dir: string): string[] {
  const found: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.toLowerCase().endsWith('.csv')) found.push(p);
    }
  };
  walk(dir);
  return found;
}

/**
 * Find a CSV whose basename matches one of the given stems. Matching ignores a
 * leading state/session prefix, so both `votes.csv` (LegiScan) and
 * `tx_89_votes.csv` (Open States) resolve from the stem `votes`.
 */
export function findCsv(dir: string, stems: string[]): string {
  const found = listCsvs(dir);
  for (const stem of stems) {
    const exact = found.find((p) => norm(basename(p, '.csv')) === norm(stem));
    if (exact) return exact;
  }
  for (const stem of stems) {
    const suffix = found.find((p) => norm(basename(p, '.csv')).endsWith(norm(stem)));
    if (suffix) return suffix;
  }
  throw new Error(
    `no CSV matching [${stems.join(', ')}] under ${dir}\n` +
      `  found: ${found.map((p) => basename(p)).join(', ') || '(none)'}`,
  );
}

/** As findCsv, but returns null for an optional table. */
export function findCsvOptional(dir: string, stems: string[]): string | null {
  try {
    return findCsv(dir, stems);
  } catch {
    return null;
  }
}
