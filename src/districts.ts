/**
 * PlainRecord — finding a reader's Texas House district from a coordinate.
 *
 * NOTHING IS SENT ANYWHERE. The browser's geolocation API hands the page a
 * latitude and longitude, the boundaries are a static file the page downloads,
 * and the containment test runs here. No request carries the position, no
 * service is asked to resolve it, and the answer never leaves the device unless
 * the reader chooses to do something with it. That is the same shape as the
 * blind compare, where the privacy comes from there being no transmission to
 * trust rather than from a promise about what happens at the other end.
 *
 * It is also why this is not done from the IP address, which would need no
 * permission prompt and would be much easier. Vercel's headers give a city at
 * best, mobile addresses resolve to the carrier's gateway rather than the
 * handset, and 80% of this site's readers are on phones. Houston alone holds
 * more than twenty of these districts. An IP guess would quietly show a large
 * share of readers a representative who is not theirs, and the reader would
 * have no way to tell. Asking permission and being right is the better trade.
 *
 * See scripts/build_districts.mjs for where the boundaries come from and why
 * they are not simplified.
 */

/** Lower-48 sanity, wide enough for any Texas coordinate and nothing absurd. */
const LON_RANGE = [-110, -88] as const;
const LAT_RANGE = [24, 38] as const;

export const DISTRICTS_URL = '/data/districts_tx_house.topo.json';

/** Census vintage of the boundaries, stated to the reader alongside the answer
 *  so "which map is this" is on the page rather than in a build script. */
export const DISTRICTS_VINTAGE = '2024';

interface Topology {
  type: 'Topology';
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: Record<string, {
    type: 'GeometryCollection';
    geometries: Array<{
      type: 'Polygon' | 'MultiPolygon';
      arcs: number[][] | number[][][];
      properties: { SLDLST: string };
    }>;
  }>;
}

/** A district, as rings of absolute [lon, lat], plus a bounding box. */
export interface District {
  id: number;
  polygons: number[][][][];
  bbox: [number, number, number, number];
}

/**
 * TopoJSON, decoded by hand.
 *
 * The format is small enough not to justify a dependency: arcs are quantised
 * integers stored as deltas from the previous point, `transform` maps them back
 * to degrees, and a ring is a list of arc indices where a NEGATIVE index means
 * "arc ~i, walked backwards". The one detail worth stating is that consecutive
 * arcs in a ring share an endpoint, so each arc after the first drops its first
 * point, otherwise every join is a duplicated vertex.
 */
function decode(topo: Topology): District[] {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;

  const arcs: number[][][] = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });

  const ringOf = (indices: number[]): number[][] => {
    const out: number[][] = [];
    for (const i of indices) {
      const forward = i >= 0;
      const arc = arcs[forward ? i : ~i];
      const pts = forward ? arc : [...arc].reverse();
      // The shared endpoint, dropped so joins do not repeat a vertex.
      out.push(...(out.length ? pts.slice(1) : pts));
    }
    return out;
  };

  const layer = topo.objects[Object.keys(topo.objects)[0]];
  return layer.geometries.map((g) => {
    const polys = g.type === 'Polygon'
      ? [(g.arcs as number[][]).map(ringOf)]
      : (g.arcs as number[][][]).map((poly) => poly.map(ringOf));

    let a = Infinity;
    let b = Infinity;
    let c = -Infinity;
    let d = -Infinity;
    for (const poly of polys) {
      for (const [x, y] of poly[0]) {
        if (x < a) a = x;
        if (x > c) c = x;
        if (y < b) b = y;
        if (y > d) d = y;
      }
    }
    return { id: Number(g.properties.SLDLST), polygons: polys, bbox: [a, b, c, d] };
  });
}

/** Ray casting. A point on an odd number of crossings is inside. */
function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Outer ring minus any hole the point also falls in. */
function inPolygon(lon: number, lat: number, rings: number[][][]): boolean {
  if (!inRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(lon, lat, rings[i])) return false;
  return true;
}

/**
 * Which district contains this point, or null if none does.
 *
 * null is a real answer and not an error: a reader in Oklahoma, or a few metres
 * out to sea, is genuinely in no Texas House district, and the caller should say
 * so rather than reaching for the nearest one.
 */
export function districtAt(districts: District[], lon: number, lat: number): number | null {
  for (const d of districts) {
    const [a, b, c, e] = d.bbox;
    if (lon < a || lon > c || lat < b || lat > e) continue;
    for (const poly of d.polygons) {
      if (inPolygon(lon, lat, poly)) return d.id;
    }
  }
  return null;
}

export function plausibleCoord(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat)
    && lon >= LON_RANGE[0] && lon <= LON_RANGE[1]
    && lat >= LAT_RANGE[0] && lat <= LAT_RANGE[1];
}

let cache: Promise<District[]> | null = null;

/**
 * Fetched on demand and only once.
 *
 * 122 KB gzipped is cheap for a reader who asked to be located and pure waste
 * for everyone else, and most readers never touch this. main.ts reaches this
 * module through a dynamic import for the same reason, so the decoder is a
 * separate chunk too and nothing here is in the main bundle.
 */
export function loadDistricts(fetchImpl: typeof fetch = fetch): Promise<District[]> {
  if (!cache) {
    cache = fetchImpl(DISTRICTS_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`districts: HTTP ${r.status}`);
        return r.json();
      })
      .then((t: Topology) => decode(t))
      .catch((e) => {
        // Not cached, so a reader who lost the network once can try again.
        cache = null;
        throw e;
      });
  }
  return cache;
}

export const _internals = { decode };
