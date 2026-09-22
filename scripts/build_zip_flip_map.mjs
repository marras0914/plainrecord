/**
 * A map of the 108 Texas ZIPs where land area and people disagree about which
 * Texas House district the ZIP is in.
 *
 * WHY ALL 913 DOTS AND NOT JUST THE 108. The claim worth making is a
 * proportion — this happens in about one split ZIP in eight — and a map showing
 * only the flips would assert that instead of showing it. The other 805 split
 * ZIPs are drawn in neutral so the reader can see how much of the state is the
 * ordinary case.
 *
 * COLOR. Two marks, and the pair sits in the validator's 6–8 CVD band
 * (ΔE 8.2 protan against the neutral), which is legal only with a second
 * encoding. There are three here: the flips are drawn at nearly twice the
 * radius, they carry a page-coloured ring that separates them from the crowd
 * they sit inside, and four are directly labelled. The neutral is deliberately
 * below the chroma floor — it is meant to read as grey, because it is context
 * rather than a category.
 *
 * PROJECTION. Albers equal-area conic with standard parallels at 27.5°N and
 * 35°N, which is the usual Texas pair. Equal-area matters more than usual here:
 * the whole subject is land area, and a projection that inflated the panhandle
 * relative to the valley would be arguing against the map's own point.
 *
 * Run scripts/zip_flips.mjs first; this reads what that writes.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const FLIPS = 'private/zip_flips.json';
const TOPO = 'public/data/boundaries_tx.topo.json';
const OUT_DIR = 'private/map';
const OUT_SVG = `${OUT_DIR}/zip_flips.svg`;

const W = 2000;
const H = 1880;
const PAD = { top: 250, right: 70, bottom: 230, left: 70 };

const C = {
  page: '#faf7f1',
  ink: '#1a1714',
  ink2: '#57514a',
  muted: '#6f6a62',
  hair: '#d4c8b4',
  flip: '#c8352f',
  neutral: '#6f6a62',
};

// --- Albers equal-area conic ------------------------------------------------

const RAD = Math.PI / 180;
const LAT1 = 27.5 * RAD;
const LAT2 = 35.0 * RAD;
const LAT0 = 31.25 * RAD;
const LON0 = -99.4 * RAD;
const N = (Math.sin(LAT1) + Math.sin(LAT2)) / 2;
const CC = Math.cos(LAT1) ** 2 + 2 * N * Math.sin(LAT1);
const RHO0 = Math.sqrt(CC - 2 * N * Math.sin(LAT0)) / N;

/**
 * Returns SVG-ready coordinates: y already points DOWN.
 *
 * The textbook form is y = rho0 - rho*cos(theta), which grows northward because
 * it is written for a plane whose y axis points up. Screens do not have one, so
 * the sign is flipped here rather than in the fit — putting it in the fit is how
 * the first render came out with the panhandle in the Gulf.
 */
function albers(lon, lat) {
  const rho = Math.sqrt(CC - 2 * N * Math.sin(lat * RAD)) / N;
  const theta = N * (lon * RAD - LON0);
  return [rho * Math.sin(theta), rho * Math.cos(theta) - RHO0];
}

// --- TopoJSON, decoded the same way src/boundaries.ts does it ---------------

function decodeLayer(topo, name) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
  const ringOf = (indices) => {
    const out = [];
    for (const i of indices) {
      const forward = i >= 0;
      const arc = arcs[forward ? i : ~i];
      const pts = forward ? arc : [...arc].reverse();
      // Consecutive arcs share an endpoint; dropping it stops every join
      // repeating a vertex.
      out.push(...(out.length ? pts.slice(1) : pts));
    }
    return out;
  };
  const layer = topo.objects[name];
  if (!layer) throw new Error(`no "${name}" layer in ${TOPO}`);
  return layer.geometries.map((g) => (g.type === 'Polygon'
    ? [g.arcs.map(ringOf)]
    : g.arcs.map((poly) => poly.map(ringOf))));
}

// --- Fit -------------------------------------------------------------------

const flipData = JSON.parse(readFileSync(FLIPS, 'utf8'));
const topo = JSON.parse(readFileSync(TOPO, 'utf8'));
const districts = decodeLayer(topo, 'districts');

let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const polys of districts) {
  for (const rings of polys) {
    for (const [lon, lat] of rings[0]) {
      const [x, y] = albers(lon, lat);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
}

const boxW = W - PAD.left - PAD.right;
const boxH = H - PAD.top - PAD.bottom;
const k = Math.min(boxW / (x1 - x0), boxH / (y1 - y0));
const ox = PAD.left + (boxW - k * (x1 - x0)) / 2;
const oy = PAD.top + (boxH - k * (y1 - y0)) / 2;
const project = (lon, lat) => {
  const [x, y] = albers(lon, lat);
  return [ox + (x - x0) * k, oy + (y - y0) * k];
};

const f2 = (n) => Math.round(n * 10) / 10;

function pathOf(polys) {
  let d = '';
  for (const rings of polys) {
    for (const ring of rings) {
      // A ring below a pixel or so of extent is a coastal speck that costs more
      // bytes than it shows; the district it belongs to is drawn regardless.
      let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
      const pts = ring.map(([lon, lat]) => {
        const p = project(lon, lat);
        if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0];
        if (p[1] < b) b = p[1]; if (p[1] > e) e = p[1];
        return p;
      });
      if (c - a < 1.5 && e - b < 1.5) continue;
      d += 'M' + pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join('L') + 'Z';
    }
  }
  return d;
}

// --- Callouts ---------------------------------------------------------------

/**
 * Four of the 108, chosen for how far apart the two answers are and for being
 * spread across the state rather than stacked in one metro. `place` is the
 * city a reader would recognise; it is not in the data, so it is written here
 * and is the one thing on this map that is not derived.
 */
const CALLOUTS = [
  { zip: '78045', place: 'Laredo',          dx: -210, dy: -120 },
  { zip: '77845', place: 'College Station', dx: -520, dy: -90 },
  { zip: '78418', place: 'Corpus Christi',  dx: 150,  dy: 40 },
  { zip: '78521', place: 'Brownsville',     dx: 130,  dy: 30 },
];

const flipBy = new Map(flipData.flips.map((f) => [f.zip, f]));
const atBy = new Map(flipData.points.map((p) => [p.zip, p.at]));

const nf = (n) => n.toLocaleString('en-US');

// --- Draw -------------------------------------------------------------------

const base = districts.map((polys) => `<path d="${pathOf(polys)}"/>`).join('');

const dots = { plain: [], flip: [] };
for (const p of flipData.points) {
  const [x, y] = project(p.at[0], p.at[1]);
  dots[p.flip ? 'flip' : 'plain'].push([f2(x), f2(y)]);
}

const plainDots = dots.plain.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.1"/>`).join('');
const flipDots = dots.flip.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6"/>`).join('');

const callouts = CALLOUTS.map(({ zip, place, dx, dy }) => {
  const f = flipBy.get(zip);
  if (!f) throw new Error(`callout ${zip} is not one of the ${flipData.flips.length} flips`);
  const at = atBy.get(zip);
  const [x, y] = project(at[0], at[1]);
  const lx = x + dx, ly = y + dy;
  const anchor = dx < 0 ? 'end' : 'start';
  const tx = dx < 0 ? lx - 12 : lx + 12;
  return `<g class="callout">
    <line x1="${f2(x)}" y1="${f2(y)}" x2="${f2(lx)}" y2="${f2(ly)}"/>
    <text x="${f2(tx)}" y="${f2(ly)}" text-anchor="${anchor}">
      <tspan class="cz">${zip}</tspan><tspan class="cp" dx="10">${place}</tspan>
      <tspan class="cl" x="${f2(tx)}" dy="30">HD-${f.people.d} holds ${nf(f.people.people)} people on ${f.people.landPct.toFixed(0)}% of the land</tspan>
      <tspan class="cl" x="${f2(tx)}" dy="26">HD-${f.land.d} holds ${nf(f.land.people)} on ${f.land.landPct.toFixed(0)}%</tspan>
    </text>
  </g>`;
}).join('');

const legendY = H - 168;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
<title id="t">Texas ZIP codes where land area and population disagree about the House district</title>
<desc id="d">A map of Texas. Dots mark the 913 ZIP codes that span more than one Texas House district. ${flipData.flips.length} of them, drawn larger and in red, are ZIPs where ranking the districts by land area names a different district than ranking them by the number of residents.</desc>
<style>
  text { font-family: Newsreader, Georgia, 'Times New Roman', serif; }
  .h1 { font-size: 58px; fill: ${C.ink}; font-weight: 600; }
  .h2 { font-size: 31px; fill: ${C.ink2}; }
  .h3 { font-size: 26px; fill: ${C.muted}; }
  .foot { font-size: 22px; fill: ${C.muted}; }
  .lg { font-size: 27px; fill: ${C.ink2}; }
  .callout line { stroke: ${C.ink2}; stroke-width: 1.6; }
  /* paint-order puts the stroke down first, so this reads as a halo in the page
     colour rather than an outline, and a leader line or a dot passing behind a
     label cannot make it unreadable. */
  .callout text { fill: ${C.ink}; paint-order: stroke; stroke: ${C.page}; stroke-width: 6; stroke-linejoin: round; }
  .cz { font-size: 30px; font-weight: 600; }
  .cp { font-size: 30px; fill: ${C.ink2}; }
  .cl { font-size: 23px; fill: ${C.ink2}; }
</style>
<rect width="${W}" height="${H}" fill="${C.page}"/>

<text class="h1" x="${PAD.left}" y="96">One ZIP code, two answers</text>
<text class="h2" x="${PAD.left}" y="150">913 Texas ZIP codes cross a state House district line. In ${flipData.flips.length} of them the district holding the</text>
<text class="h2" x="${PAD.left}" y="190">most land is not the district holding the most people, so the two ways of naming “your district” disagree.</text>

<g fill="none" stroke="${C.hair}" stroke-width="1" stroke-linejoin="round">${base}</g>
<g fill="${C.neutral}" fill-opacity="0.42">${plainDots}</g>
<g fill="${C.flip}" stroke="${C.page}" stroke-width="2">${flipDots}</g>
${callouts}

<g>
  <circle cx="${PAD.left + 12}" cy="${legendY}" r="6" fill="${C.flip}" stroke="${C.page}" stroke-width="2"/>
  <text class="lg" x="${PAD.left + 34}" y="${legendY + 9}">${flipData.flips.length} ZIPs where land and people name different districts</text>
  <circle cx="${PAD.left + 12}" cy="${legendY + 44}" r="3.1" fill="${C.neutral}" fill-opacity="0.42"/>
  <text class="lg" x="${PAD.left + 34}" y="${legendY + 53}">${nf(dots.plain.length)} other ZIPs that cross a district line</text>
</g>

<text class="foot" x="${PAD.left}" y="${H - 62}">One dot per ZIP, at its Census internal point, so a dot marks where a ZIP is and not how big it is. 2020 Census blocks joined to the 2022 Texas House plan:</text>
<text class="foot" x="${PAD.left}" y="${H - 32}">blocks nest inside both, so this is an ID join, not a polygon overlay, and the land shares are exact rather than rounded. Data, method and sources: rightnleft.com</text>
</svg>`;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_SVG, svg);
console.log(`  ${OUT_SVG}  ${(svg.length / 1024).toFixed(0)} KB`);
console.log(`  ${dots.plain.length} neutral dots, ${dots.flip.length} highlighted, ${districts.length} districts`);

// A north/south sanity check, because a projection that is upside down still
// produces a plausible-looking blob. Amarillo must sit above Brownsville.
const [, yAmarillo] = project(-101.83, 35.22);
const [, yBrownsville] = project(-97.50, 25.90);
if (!(yAmarillo < yBrownsville)) throw new Error('the map is upside down: Amarillo renders below Brownsville');

if (process.env.MAP_ANCHORS) {
  for (const { zip, place } of CALLOUTS) {
    const [x, y] = project(...atBy.get(zip));
    console.log(`  ${zip} ${place}: x=${Math.round(x)} y=${Math.round(y)}`);
  }
}
