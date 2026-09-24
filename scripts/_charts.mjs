/**
 * PlainRecord — the charts, drawn at build time as static SVG
 *
 * Used by build_charts.mjs (the /charts page) and build_bill_pages.mjs (the seat
 * chart on each bill page). No chart library and no client JavaScript: the site's
 * CSP is script-src 'self', the pages are static, and an SVG written here is the
 * same bytes for every reader and every crawler.
 *
 * COLOUR IS TOKENS, NOT HEX. Every fill is a CSS variable from _page_shell.mjs,
 * so dark mode is its own validated set of steps rather than a flipped image.
 * The party pair is the site's existing blue and red. The purple ramp is for the
 * map, where a blue ramp would read as "more Democratic" on a political map, and
 * both ramps were run through the dataviz validator (--ordinal) against the card
 * and the page surface in each mode before anything used them.
 *
 * HOVER IS <title>, the browser's own tooltip, because there is no script to do
 * better. It enhances and never gates: every chart has a table or list twin on
 * its page, and every figure named in a caption is also in that table.
 */

import { readFileSync } from 'node:fs';
import { esc } from './_page_shell.mjs';

const f1 = (n) => Math.round(n * 10) / 10;
const pct = (x) => `${Math.round(x * 100)}%`;
const nfmt = (x, lang) => x.toLocaleString(lang === 'es' ? 'en-US' : 'en-US');

// ---------------------------------------------------------------------------
// Crossing rates over the WHOLE corpus
// ---------------------------------------------------------------------------
//
// Same definition as the district pages, over a different set of votes. There it
// is the 67 selected items; here it is every roll call in votes_89R.json where
// the two caucus majorities took opposite sides, so no reader can say the
// selection rule produced the pattern. A member's rate is their breaks over the
// contested votes they actually cast, so a member who missed votes is not
// counted as loyal on them.
export function crossingRates(bulk, roster) {
  const retired = new Map((roster.retired ?? []).map((r) => [r.id, r]));
  const contested = bulk.items.filter((it) => (it.dYea > 0.5) !== (it.rYea > 0.5));
  const rows = bulk.memberOrder.map((id, k) => {
    const m = bulk.members[id];
    const gone = retired.get(id);
    let cast = 0, broke = 0;
    for (const it of contested) {
      const c = it.v[k];
      if (c !== 'y' && c !== 'n') continue;
      cast++;
      const caucusYea = m.p === 'R' ? it.rYea > 0.5 : it.dYea > 0.5;
      if ((c === 'y') !== caucusYea) broke++;
    }
    return {
      id, n: m.n ?? gone?.name, d: m.d ?? gone?.district, p: m.p,
      left: gone?.until ?? null, cast, broke, rate: cast ? broke / cast : null,
    };
  });
  for (const r of rows) if (!r.n || !r.d) throw new Error(`crossingRates: no name or district for ${r.id}`);
  return { rows, contested: contested.length, total: bulk.items.length };
}

// ---------------------------------------------------------------------------
// 1. How far apart the parties were, across every recorded vote
// ---------------------------------------------------------------------------

export function gapBins(bulk) {
  const bins = Array.from({ length: 10 }, () => 0);
  for (const it of bulk.items) {
    const g = Math.abs(it.rYea - it.dYea);
    if (!Number.isFinite(g)) throw new Error(`gapBins: ${it.id} has no caucus shares`);
    bins[Math.min(9, Math.floor(g * 10))]++;
  }
  return bins;
}

export function histogramSvg(bins, L) {
  // The axis title is HTML under the figure, not SVG text: in Spanish it is wider
  // than the chart once phone type sizes apply, and HTML wraps.
  const W = 608, H = 290, left = 58, right = 14, top = 22, bottom = 48;
  const pw = W - left - right, ph = H - top - bottom;
  const max = Math.ceil(Math.max(...bins) / 500) * 500;
  const y = (v) => top + ph - (v / max) * ph;
  const slot = pw / bins.length;
  const bw = Math.min(24, slot * 0.62);
  const total = bins.reduce((a, b) => a + b, 0);

  let g = '';
  for (let t = 0; t <= max; t += 500) {
    g += `<line class="grid" x1="${left}" x2="${W - right}" y1="${f1(y(t))}" y2="${f1(y(t))}"/>`
      + `<text class="tick" x="${left - 6}" y="${f1(y(t) + 4)}" text-anchor="end">${nfmt(t)}</text>`;
  }
  let bars = '';
  bins.forEach((v, i) => {
    const x = left + slot * i + (slot - bw) / 2;
    const h = (v / max) * ph;
    // 4px rounded data-end, square at the baseline: a path, since rx rounds both.
    const r = Math.min(4, h / 2, bw / 2);
    const x0 = f1(x), x1 = f1(x + bw), yb = f1(top + ph), yt = f1(top + ph - h);
    const d = `M${x0},${yb}V${f1(yt + r)}Q${x0},${yt} ${f1(x0 + r)},${yt}H${f1(x1 - r)}Q${x1},${yt} ${x1},${f1(yt + r)}V${yb}Z`;
    const range = L.band(i * 10, i * 10 + 10);
    bars += `<path class="bar" d="${d}"><title>${esc(L.barTip(range, v, total))}</title></path>`;
    // Ticks at bin EDGES, since a column is a range, not a point.
    g += `<text class="tick" x="${f1(left + slot * i)}" y="${top + ph + 16}" text-anchor="middle">${i * 10}</text>`;
  });
  g += `<text class="tick" x="${f1(left + slot * bins.length)}" y="${top + ph + 16}" text-anchor="middle">100</text>`;
  // Selective direct labels: the tallest column and the party-line end, which
  // are the two the caption talks about. The rest are in the tooltip and table.
  const lab = (i, text) => {
    const x = left + slot * i + slot / 2;
    return `<text class="val" x="${f1(x)}" y="${f1(y(bins[i]) - 7)}" text-anchor="middle">${esc(text)}</text>`;
  };
  g += lab(0, nfmt(bins[0])) + lab(9, nfmt(bins[9]));
  g += `<line class="axis" x1="${left}" x2="${W - right}" y1="${top + ph}" y2="${top + ph}"/>`
    + `<text class="note" x="${left}" y="${H - 6}">${esc(L.leftEnd)}</text>`
    + `<text class="note" x="${W - right}" y="${H - 6}" text-anchor="end">${esc(L.rightEnd)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="hist-t"><title id="hist-t">${esc(L.alt)}</title>${g}${bars}</svg>`;
}

// ---------------------------------------------------------------------------
// 2. Who breaks ranks: one dot per member, a row per party
// ---------------------------------------------------------------------------

export function dotPlotSvg(rates, L, districtHref) {
  // Row names sit ABOVE each row, not in a left gutter: "Bancada republicana" is
  // wider than any gutter that leaves room for the dots.
  const W = 608, left = 22, right = 22, xMax = 0.6;
  const pw = W - left - right;
  const x = (r) => left + (r / xMax) * pw;
  const R = 4, pitch = 9, bucket = 0.015;
  const parties = [['D', L.dem], ['R', L.rep]];

  // Stack dots that share a bucket upward from the row's baseline. Height comes
  // from the data, so a crowded bucket makes the row taller rather than overlap.
  const stacks = parties.map(([p]) => {
    const rows = rates.filter((r) => r.p === p && r.rate !== null).sort((a, b) => a.rate - b.rate);
    const byB = new Map();
    const placed = rows.map((r) => {
      const b = Math.floor(r.rate / bucket);
      const k = byB.get(b) ?? 0;
      byB.set(b, k + 1);
      return { ...r, bx: x((b + 0.5) * bucket), k };
    });
    return { placed, depth: Math.max(...byB.values()) };
  });

  const topPad = 52, gap = 58, axisH = 40;
  const rowH = stacks.map((s) => s.depth * pitch + 10);
  const H = topPad + rowH[0] + gap + rowH[1] + axisH;
  let out = '';
  let base = topPad;
  const baselines = [];
  stacks.forEach((s, i) => {
    base += rowH[i];
    baselines.push(base);
    const [p, name] = parties[i];
    out += `<line class="grid" x1="${left}" x2="${W - right}" y1="${base}" y2="${base}"/>`
      + `<text class="lab" x="0" y="${base - s.depth * pitch - 12}">${esc(name)}</text>`;
    const med = s.placed[Math.floor((s.placed.length - 1) / 2)].rate;
    const ceil = base - s.depth * pitch - 6;
    out += `<line class="med" x1="${f1(x(med))}" x2="${f1(x(med))}" y1="${ceil}" y2="${base + 3}"/>`
      + `<text class="note" x="${f1(x(med) + 4)}" y="${ceil + 8}">${esc(L.median(pct(med)))}</text>`;
    for (const r of s.placed) {
      const cy = base - R - 1 - r.k * pitch;
      // No link for a member whose seat has no page (HD-93 is vacant).
      const dot = `<circle class="dot ${p}" cx="${f1(r.bx)}" cy="${f1(cy)}" r="${R}"><title>${esc(L.dotTip(r))}</title></circle>`;
      const h = districtHref(r);
      out += h ? `<a href="${h}">${dot}</a>` : dot;
    }
    // One direct label per row: the member who breaks ranks most often.
    const top1 = s.placed[s.placed.length - 1];
    const ty = base - R - 1 - top1.k * pitch;
    // Above everything in the row, with a leader down to the dot, so the label
    // never sits on top of a neighbouring stack.
    const ly = ceil - 4;
    out += `<line class="lead" x1="${f1(top1.bx)}" x2="${f1(top1.bx)}" y1="${f1(ty - 6)}" y2="${f1(ly + 3)}"/>`
      + `<text class="note" x="${f1(top1.bx + 3)}" y="${f1(ly)}" text-anchor="end">${esc(L.topLabel(top1))}</text>`;
    base += gap;
  });
  const axisY = H - axisH + 12;
  for (let t = 0; t <= xMax + 1e-9; t += 0.1) {
    out += `<text class="tick" x="${f1(x(t))}" y="${axisY}" text-anchor="middle">${Math.round(t * 100)}%</text>`;
  }
  out += `<text class="note" x="${f1(left + pw / 2)}" y="${H - 4}" text-anchor="middle">${esc(L.xTitle)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="dots-t"><title id="dots-t">${esc(L.alt)}</title>${out}</svg>`;
}

// ---------------------------------------------------------------------------
// 3. The seat chart on each bill page
// ---------------------------------------------------------------------------
//
// Grouped by how they voted, coloured by party, Democrats first in each group to
// match the site's blue-to-red axis. A no-vote square is the party colour at low
// opacity: its group label already says what it is, so the tint only has to say
// "not a vote", and it keeps the party readable inside the group.
export function seatChartSvg(rows, L) {
  // Each group's label sits on its own line ABOVE its squares: a label gutter
  // beside them overlapped "No recorded vote" at desktop and everything on a
  // phone. The legend is HTML for the same reason as the map's: it wraps.
  const W = 608, sq = 13, pitch = 16, perRow = Math.floor((W + (pitch - sq)) / pitch);
  const groups = [
    ['y', L.yea], ['n', L.nay], ['.', L.noVote],
  ].map(([mark, label]) => ({
    mark, label,
    list: rows.filter((r) => r.mark === mark).sort((a, b) => (a.p === b.p ? a.d - b.d : a.p === 'D' ? -1 : 1)),
  })).filter((g) => g.list.length);

  let y = 0, out = '';
  for (const g of groups) {
    const d = g.list.filter((r) => r.p === 'D').length;
    const r = g.list.length - d;
    out += `<text class="lab" x="0" y="${y + 14}">${esc(g.label)} · ${g.list.length}`
      + `<tspan class="note" dx="10">${esc(L.split(d, r))}</tspan></text>`;
    y += 24;
    g.list.forEach((m, i) => {
      const cx = (i % perRow) * pitch;
      const cy = y + Math.floor(i / perRow) * pitch;
      out += `<rect class="sq ${m.p}${g.mark === '.' ? ' none' : ''}" x="${cx}" y="${cy}" width="${sq}" height="${sq}" rx="2">`
        + `<title>${esc(L.tip(m))}</title></rect>`;
    });
    y += Math.ceil(g.list.length / perRow) * pitch + 16;
  }
  const svg = `<svg viewBox="0 0 ${W} ${y}" role="img" aria-labelledby="seat-t"><title id="seat-t">${esc(L.alt)}</title>${out}</svg>`;
  const legendHtml = `<ul class="legend"><li><span class="sw D"></span>${esc(L.dem)}</li><li><span class="sw R"></span>${esc(L.rep)}</li></ul>`;
  return { svg, legendHtml };
}

// ---------------------------------------------------------------------------
// 4. The district map, with metro insets
// ---------------------------------------------------------------------------
//
// Albers equal-area, Texas parallels, as in build_zip_flip_map.mjs. Arcs are
// projected and simplified ONCE per view and then assembled into rings, so two
// districts that share a border share the same simplified line and no sliver
// opens between them.

const RAD = Math.PI / 180;
const LAT1 = 27.5 * RAD, LAT2 = 35 * RAD, LAT0 = 31.25 * RAD, LON0 = -99.4 * RAD;
const N = (Math.sin(LAT1) + Math.sin(LAT2)) / 2;
const CC = Math.cos(LAT1) ** 2 + 2 * N * Math.sin(LAT1);
const RHO0 = Math.sqrt(CC - 2 * N * Math.sin(LAT0)) / N;
function albers(lon, lat) {
  const rho = Math.sqrt(CC - 2 * N * Math.sin(lat * RAD)) / N;
  const theta = N * (lon * RAD - LON0);
  return [rho * Math.sin(theta), rho * Math.cos(theta) - RHO0];
}

function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const dist = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (dist > best) { best = dist; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function loadTopo(path) {
  const topo = JSON.parse(readFileSync(path, 'utf8'));
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((arc) => {
    let ax = 0, ay = 0;
    return arc.map(([dx, dy]) => { ax += dx; ay += dy; return [ax * sx + tx, ay * sy + ty]; });
  });
  const geoms = topo.objects.districts.geometries.map((g) => ({
    d: Number(g.properties.SLDLST),
    polys: g.type === 'Polygon' ? [g.arcs] : g.arcs,
  }));
  return { arcs, geoms };
}

/** One view: a projection fitted to a lon/lat box, drawn into a w x h frame. */
function view(topo, box, w, h) {
  const [lon0, lat0, lon1, lat1] = box;
  const corners = [[lon0, lat0], [lon1, lat0], [lon0, lat1], [lon1, lat1], [(lon0 + lon1) / 2, lat1], [(lon0 + lon1) / 2, lat0]]
    .map(([a, b]) => albers(a, b));
  // albers() already returns y pointing DOWN (see its comment in build_zip_flip_map.mjs);
  // negating it again drew the panhandle at the bottom.
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min(w / (x1 - x0), h / (y1 - y0));
  const ox = (w - k * (x1 - x0)) / 2, oy = (h - k * (y1 - y0)) / 2;
  const project = (lon, lat) => { const [ax, ay] = albers(lon, lat); return [ox + (ax - x0) * k, oy + (ay - y0) * k]; };
  const cache = new Map();
  const arcPts = (i) => {
    const j = i >= 0 ? i : ~i;
    if (!cache.has(j)) cache.set(j, rdp(topo.arcs[j].map(([a, b]) => project(a, b)), 0.35));
    const pts = cache.get(j);
    return i >= 0 ? pts : [...pts].reverse();
  };
  const pathOf = (polys) => {
    let d = '';
    for (const poly of polys) {
      for (const ring of poly) {
        const pts = [];
        for (const i of ring) { const a = arcPts(i); pts.push(...(pts.length ? a.slice(1) : a)); }
        if (pts.length < 3) continue;
        let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
        for (const [px, py] of pts) { if (px < a) a = px; if (px > c) c = px; if (py < b) b = py; if (py > e) e = py; }
        if (c - a < 0.6 && e - b < 0.6) continue; // a coastal speck below a pixel
        d += 'M' + pts.map(([px, py]) => `${f1(px)},${f1(py)}`).join('L') + 'Z';
      }
    }
    return d;
  };
  return { project, pathOf };
}

export const RATE_BINS = [0.1, 0.2, 0.3, 0.4]; // edges; five classes
export const binOf = (rate) => (rate === null ? -1 : RATE_BINS.filter((e) => rate >= e).length);

export function mapSvg(topo, rates, L, districtHref, insets) {
  const byD = new Map(rates.map((r) => [r.d, r]));
  const drawDistricts = (v, filterBox) => topo.geoms
    .filter((g) => !filterBox || filterBox(g))
    .map((g) => {
      const r = byD.get(g.d);
      const b = r ? binOf(r.rate) : -1;
      const cls = b < 0 ? 'nodata' : `p${b + 1}`;
      const tip = r ? L.tip(r) : L.vacant(g.d);
      const path = `<path class="dist ${cls}" d="${v.pathOf(g.polys)}"><title>${esc(tip)}</title></path>`;
      const h = r ? districtHref(r) : null;
      return h ? `<a href="${h}">${path}</a>` : path;
    }).join('');

  // The state.
  const W = 608, H = 560;
  const state = view(topo, [-106.65, 25.84, -93.51, 36.5], W, H);
  let main = drawDistricts(state);
  for (const ins of insets) {
    const [a, b] = state.project(ins.box[0], ins.box[3]);
    const [c, d] = state.project(ins.box[2], ins.box[1]);
    main += `<rect class="inbox" x="${f1(Math.min(a, c))}" y="${f1(Math.min(b, d))}" width="${f1(Math.abs(c - a))}" height="${f1(Math.abs(d - b))}"/>`
      // Above its box, centred, with a surface halo so it reads over any shade.
      + `<text class="maplab" x="${f1((a + c) / 2)}" y="${f1(Math.min(b, d) - 4)}" text-anchor="middle">${esc(ins.name)}</text>`;
  }
  // Legend, in the empty Gulf corner.
  // The legend is HTML above the map rather than SVG in a corner: in Spanish, at
  // phone type sizes, it ran off the right edge, and HTML wraps.
  const legendHtml = `<p class="lab small">${esc(L.legendTitle)}</p><ul class="legend">`
    + L.classes.map((label, k) => `<li><span class="sw p${k + 1}"></span>${esc(label)}</li>`).join('')
    + `<li><span class="sw nodata"></span>${esc(L.noData)}</li></ul>`;
  const mainSvg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="map-t"><title id="map-t">${esc(L.alt)}</title>${main}</svg>`;

  // The metros, where the state map is too small to read.
  const IW = 296, IH = 230;
  const insetSvgs = insets.map((ins, idx) => {
    const v = view(topo, ins.box, IW, IH);
    const inBox = (g) => {
      // Cheap test: any vertex of the district's outer rings inside the box.
      for (const poly of g.polys) for (const i of poly[0]) {
        for (const [lon, lat] of topo.arcs[i >= 0 ? i : ~i]) {
          if (lon >= ins.box[0] && lon <= ins.box[2] && lat >= ins.box[1] && lat <= ins.box[3]) return true;
        }
      }
      return false;
    };
    return `<figure class="inset"><svg viewBox="0 0 ${IW} ${IH}" role="img" aria-labelledby="inset-${idx}">`
      + `<title id="inset-${idx}">${esc(L.insetAlt(ins.name))}</title>`
      + `<defs><clipPath id="clip-${idx}"><rect width="${IW}" height="${IH}" rx="8"/></clipPath></defs>`
      + `<g clip-path="url(#clip-${idx})">${drawDistricts(v, inBox)}</g></svg>`
      + `<figcaption class="small">${esc(ins.name)}</figcaption></figure>`;
  });
  return { mainSvg, insetSvgs, legendHtml };
}
