/**
 * PlainRecord — dimensionality check (offline analysis, not shipped to the client)
 *
 * Run this against a session's roll calls BEFORE trusting any alignment score.
 *
 * If the first principal component explains ~90%+ of the variance in the
 * member-by-item vote matrix, then every vector-alignment method — yours
 * included — is measuring one latent axis, and that axis is party. The quiz
 * would be re-deriving the party label it promised to hide.
 *
 * That doesn't kill the project. It changes the honest claim from "find your
 * match" to "find where you sit on the axis the legislature actually votes on,"
 * and it argues for up-weighting items that load on PC2 — the intra-party
 * splits, where a blind test can tell voters something they didn't know.
 *
 * Usage:  npx tsx scripts/analyze_dimensions.ts data/tx_bills_89R.json
 */

import { readFileSync } from 'node:fs';
import type { VoteItem, LegislatorId } from './scoring';
import { isEligible, DEFAULT_OPTIONS } from './scoring';

interface Matrix {
  members: LegislatorId[];
  itemIds: string[];
  /** members x items, mean-centered per item; missing votes imputed to 0. */
  data: number[][];
}

function buildMatrix(items: VoteItem[]): Matrix {
  const eligible = items.filter((it) => isEligible(it, DEFAULT_OPTIONS));
  const members = [...new Set(eligible.flatMap((it) => Object.keys(it.votes)))].sort();
  const index = new Map(members.map((m, i) => [m, i]));

  const data = members.map(() => new Array(eligible.length).fill(0));

  eligible.forEach((item, j) => {
    const cast: number[] = [];
    for (const [id, v] of Object.entries(item.votes)) {
      if (v == null || !index.has(id)) continue;
      cast.push(v);
    }
    const mean = cast.length ? cast.reduce((s, v) => s + v, 0) / cast.length : 0;
    for (const [id, v] of Object.entries(item.votes)) {
      const i = index.get(id);
      if (i === undefined) continue;
      // Missing -> 0 after centering, i.e. imputed to the chamber mean.
      data[i][j] = v == null ? 0 : v - mean;
    }
  });

  return { members, itemIds: eligible.map((it) => it.id), data };
}

/** Top-k eigenvalues of the item covariance via power iteration with deflation. */
function principalComponents(m: Matrix, k: number) {
  const nItems = m.itemIds.length;
  const nMembers = m.members.length;

  // Covariance across items: C = XᵀX / (nMembers - 1)
  const C: number[][] = Array.from({ length: nItems }, () => new Array(nItems).fill(0));
  for (let a = 0; a < nItems; a++) {
    for (let b = a; b < nItems; b++) {
      let s = 0;
      for (let i = 0; i < nMembers; i++) s += m.data[i][a] * m.data[i][b];
      const v = s / Math.max(1, nMembers - 1);
      C[a][b] = v;
      C[b][a] = v;
    }
  }
  const totalVariance = C.reduce((s, row, i) => s + row[i], 0);

  const components: { eigenvalue: number; loadings: number[] }[] = [];
  const work = C.map((r) => [...r]);

  for (let c = 0; c < k; c++) {
    let v = new Array(nItems).fill(0).map((_, i) => Math.sin(i + 1 + c)); // deterministic start
    let lambda = 0;
    for (let iter = 0; iter < 500; iter++) {
      const next = new Array(nItems).fill(0);
      for (let a = 0; a < nItems; a++) {
        let s = 0;
        for (let b = 0; b < nItems; b++) s += work[a][b] * v[b];
        next[a] = s;
      }
      const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-12) break;
      const normalized = next.map((x) => x / norm);
      const delta = normalized.reduce((s, x, i) => s + Math.abs(x - v[i]), 0);
      v = normalized;
      lambda = norm;
      if (delta < 1e-10) break;
    }
    components.push({ eigenvalue: lambda, loadings: v });
    // Deflate so the next iteration finds the following component.
    for (let a = 0; a < nItems; a++) {
      for (let b = 0; b < nItems; b++) work[a][b] -= lambda * v[a] * v[b];
    }
  }

  return { components, totalVariance };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: analyze_dimensions.ts <bills.json>');
    process.exit(1);
  }

  const items: VoteItem[] = JSON.parse(readFileSync(path, 'utf8'));
  const matrix = buildMatrix(items);
  const { components, totalVariance } = principalComponents(matrix, 3);

  console.log(`members: ${matrix.members.length}   eligible items: ${matrix.itemIds.length}`);
  components.forEach((c, i) => {
    const pct = (100 * c.eigenvalue) / totalVariance;
    console.log(`PC${i + 1}: ${pct.toFixed(1)}% of variance`);
  });

  const pc1 = (100 * components[0].eigenvalue) / totalVariance;
  if (pc1 >= 85) {
    console.log(
      '\nPC1 dominates. The alignment score is effectively a one-dimensional ' +
        'party detector. Consider up-weighting the items below, which load on PC2.',
    );
  }

  // Items that load hardest on PC2 are the intra-party splits worth surfacing.
  const pc2 = components[1];
  if (pc2) {
    const ranked = matrix.itemIds
      .map((id, j) => ({ id, load: Math.abs(pc2.loadings[j]) }))
      .sort((a, b) => b.load - a.load)
      .slice(0, 15);
    console.log('\nTop PC2 loadings (candidate items for a second-dimension quiz):');
    for (const r of ranked) console.log(`  ${r.id}  ${r.load.toFixed(3)}`);
  }
}

main();
