/**
 * PlainRecord: what members of each tradition say, from Pew's 2023-24
 * Religious Landscape Study public use file
 *
 *   npm run data:faith:pew -- "<path to 2023-24 RLS Public Use File Feb 19.csv>"
 *
 * Marco asked (16 Nov 2026) whether each religion's members follow its
 * teachings. The site shows what members say beside what their church says;
 * it computes no "agrees with" score.
 *
 * The public file has Pew's broad tradition (RELTRAD) but NOT the denomination
 * (DENOMREC2, FAMILY, PROTFAM) or the Jewish movement (BRANCH): Pew blanks
 * them for confidentiality. So this computes only what the file can say:
 * Catholics, Jews as a whole, and, for checking against Pew's own published
 * figures, the national total and Pew's three Protestant traditions. The
 * denominations' figures come from Pew's site instead (faith_positions.ts).
 *
 * Percentages are weighted (WEIGHT) over everyone in the group who was asked,
 * with "don't know/refused" in the base, as Pew reports them. The margin of
 * error is 1.96 standard errors from the 500 bootstrap replicate weights
 * (REPWT_001..500), the design Pew's readme specifies.
 *
 * The file is 240 MB and is not committed; its output, data/faith/pew_rls.json,
 * is. Pew Research Center bears no responsibility for the analyses or
 * interpretations of the data presented here.
 */

import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

export const PEW_FILE = new URL('../data/faith/pew_rls.json', import.meta.url);

/** The four questions that touch the site's issues, with Pew's wording and codes. */
export const QUESTIONS = {
  abortion: {
    variable: 'ABRTLGL', issueId: 'abortion', wording: 'Do you think abortion should be...',
    answers: { 1: 'Legal in all cases', 2: 'Legal in most cases', 3: 'Illegal in most cases', 4: 'Illegal in all cases', 99: "Don't know/refused" },
  },
  environment: {
    variable: 'QB2C', issueId: 'environment', wording: 'Which statement comes closer to your view, even if neither is exactly right?',
    answers: { 1: 'Stricter environmental laws and regulations cost too many jobs and hurt the economy.', 2: 'Stricter environmental laws and regulations are worth the cost.', 99: "Don't know/refused" },
  },
  poverty: {
    variable: 'POORASSIST', issueId: 'poverty', wording: 'Should government provide more assistance to people in need, less assistance, or is it providing about the right amount of assistance?',
    answers: { 1: 'Should provide more assistance.', 2: 'Should provide less assistance.', 3: 'Is providing about the right amount of assistance.', 99: "Don't know/refused" },
  },
  // The question Pew charts as "Views of growing population of immigrants"
  // (CHNG_A), not OPENIDEN, so the figures here and on Pew's pages are the same.
  immigration: {
    variable: 'CHNG_A', issueId: 'immigration', wording: 'Thinking about changes in our society over the last 50 years, all in all, do you think a growing population of immigrants has been a change for the better, a change for the worse, or hasn\'t made much difference?',
    answers: { 1: 'Change for the better', 2: 'Change for the worse', 3: "Hasn't made much difference", 99: "Don't know/refused" },
  },
} as const;

/** RELTRAD codes (codebook). */
export const GROUPS = {
  all: null,
  catholic: 10000,
  jewish: 50000,
  evangelical: 1100,
  mainline: 1200,
  historicallyBlack: 1300,
} as const;

const REPS = 500;

type Acc = { n: number; total: number; totalRep: Float64Array; byCode: Map<number, { w: number; rep: Float64Array }> };

export async function computePew(file: string) {
  const rl = createInterface({ input: createReadStream(file) });
  let col: Record<string, number> | null = null;
  const acc: Record<string, Record<string, Acc>> = {};
  for (const g of Object.keys(GROUPS)) {
    acc[g] = {};
    for (const q of Object.keys(QUESTIONS)) acc[g][q] = { n: 0, total: 0, totalRep: new Float64Array(REPS), byCode: new Map() };
  }
  let rows = 0;
  for await (const line of rl) {
    // The file has no quoted commas in the columns read here; check the header
    // width on every row so a quoted field would fail loudly, not shift columns.
    const cells = line.split(',');
    if (!col) {
      col = Object.fromEntries(cells.map((c, i) => [c.replace(/^"|"$/g, ''), i]));
      for (const need of ['RELTRAD', 'WEIGHT', 'REPWT_001', `REPWT_${REPS}`, ...Object.values(QUESTIONS).map((q) => q.variable)]) {
        if (!(need in col)) throw new Error(`compute_pew_rls: no ${need} column`);
      }
      continue;
    }
    if (cells.length !== Object.keys(col).length) throw new Error(`compute_pew_rls: row ${rows + 1} has ${cells.length} cells, header ${Object.keys(col).length}`);
    rows++;
    const reltrad = Number(cells[col.RELTRAD]);
    const w = Number(cells[col.WEIGHT]);
    const rep = new Float64Array(REPS);
    for (let r = 0; r < REPS; r++) rep[r] = Number(cells[col[`REPWT_${String(r + 1).padStart(3, '0')}`]]);
    for (const [g, code] of Object.entries(GROUPS)) {
      if (code !== null && reltrad !== code) continue;
      for (const [q, def] of Object.entries(QUESTIONS)) {
        const raw = cells[col[def.variable]];
        if (raw === '' || raw === undefined) continue; // not asked
        const a = acc[g][q];
        const v = Number(raw);
        if (!(v in def.answers)) throw new Error(`compute_pew_rls: ${def.variable} has unknown code ${raw}`);
        a.n++; a.total += w;
        for (let r = 0; r < REPS; r++) a.totalRep[r] += rep[r];
        let b = a.byCode.get(v);
        if (!b) { b = { w: 0, rep: new Float64Array(REPS) }; a.byCode.set(v, b); }
        b.w += w;
        for (let r = 0; r < REPS; r++) b.rep[r] += rep[r];
      }
    }
  }
  if (rows !== 36908) throw new Error(`compute_pew_rls: ${rows} respondents, expected 36,908`);

  const pct = (x: number) => Math.round(x * 1000) / 10;
  const groups = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, Object.fromEntries(Object.entries(QUESTIONS).map(([q, def]) => {
    const a = acc[g][q];
    const answers = Object.entries(def.answers).map(([code, label]) => {
      const b = a.byCode.get(Number(code)) ?? { w: 0, rep: new Float64Array(REPS) };
      const p = b.w / a.total;
      let ss = 0;
      for (let r = 0; r < REPS; r++) ss += (b.rep[r] / a.totalRep[r] - p) ** 2;
      return { code: Number(code), label, pct: pct(p), moe: pct(1.96 * Math.sqrt(ss / REPS)) };
    });
    return [q, { asked: a.n, answers }];
  }))]));
  return {
    source: 'Pew Research Center, 2023-24 Religious Landscape Study, public use file (Feb. 19, 2025 release); fielded July 17, 2023 to March 4, 2024; N=36,908.',
    sourceUrl: 'https://www.pewresearch.org/religious-landscape-study/',
    disclaimer: 'Pew Research Center bears no responsibility for the analyses or interpretations of the data presented here.',
    method: 'Weighted with WEIGHT over everyone in the group asked the question, with don\'t know/refused in the base; margin of error is 1.96 standard errors from the 500 bootstrap replicate weights.',
    questions: QUESTIONS,
    groups,
  };
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('usage: npm run data:faith:pew -- "<path to the RLS public use CSV>"');
  const out = await computePew(file);
  writeFileSync(PEW_FILE, JSON.stringify(out, null, 2) + '\n');
  for (const [g, qs] of Object.entries(out.groups)) {
    console.log(`\n  ${g}`);
    for (const [q, r] of Object.entries(qs)) console.log(`    ${q.padEnd(12)} n=${String(r.asked).padStart(5)}  ${r.answers.map((a) => `${a.code}:${a.pct}±${a.moe}`).join('  ')}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
