/**
 * PlainRecord — finding a reader's Texas House district and county from a
 * coordinate.
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
 * See scripts/build_boundaries.mjs for where the boundaries come from, why they
 * are not simplified, and why both layers ride in one file.
 */

/** Lower-48 sanity, wide enough for any Texas coordinate and nothing absurd. */
const LON_RANGE = [-110, -88] as const;
const LAT_RANGE = [24, 38] as const;

export const BOUNDARIES_URL = '/data/boundaries_tx.topo.json';

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
      properties: Record<string, string>;
    }>;
  }>;
}

/** An area, as rings of absolute [lon, lat], plus a bounding box. */
export interface Area<Id> {
  id: Id;
  /** Only counties carry one; districts are known by number. */
  name?: string;
  polygons: number[][][][];
  bbox: [number, number, number, number];
}

export type District = Area<number>;
export type County = Area<string>;

/** Both layers, decoded from the one file. */
export interface Boundaries {
  districts: District[];
  counties: County[];
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
function decode(topo: Topology): Boundaries {
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

  // Named, not "the first object". Both layers live in one topology so they can
  // share arcs, and reading whichever happens to come first would silently
  // answer district questions with counties the day mapshaper changes its
  // ordering.
  const layerOf = <Id>(
    name: string,
    idOf: (p: Record<string, string>) => Id,
    nameOf?: (p: Record<string, string>) => string,
  ): Array<Area<Id>> => {
    const layer = topo.objects[name];
    if (!layer) throw new Error(`boundaries: no "${name}" layer in the file`);
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
      return {
        id: idOf(g.properties),
        ...(nameOf ? { name: nameOf(g.properties) } : {}),
        polygons: polys,
        bbox: [a, b, c, d] as [number, number, number, number],
      };
    });
  };

  return {
    districts: layerOf('districts', (p) => Number(p.SLDLST)),
    counties: layerOf('counties', (p) => String(p.GEOID), (p) => String(p.NAME)),
  };
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

/** The first area whose box contains the point and whose rings do too. */
function areaAt<Id>(areas: Array<Area<Id>>, lon: number, lat: number): Area<Id> | null {
  for (const a of areas) {
    const [x0, y0, x1, y1] = a.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    for (const poly of a.polygons) {
      if (inPolygon(lon, lat, poly)) return a;
    }
  }
  return null;
}

/**
 * Which district contains this point, or null if none does.
 *
 * null is a real answer and not an error: a reader in Oklahoma, or a few metres
 * out to sea, is genuinely in no Texas House district, and the caller should say
 * so rather than reaching for the nearest one.
 */
export function districtAt(districts: District[], lon: number, lat: number): number | null {
  return areaAt(districts, lon, lat)?.id ?? null;
}

/**
 * The county containing a point, by name, or null.
 *
 * The NAME rather than the FIPS code, because the name is what the page says
 * out loud and what a reader would type into the state's own finder. null is a
 * real answer: somebody in Oklahoma is in no Texas county, and the caller must
 * say so rather than reaching for the nearest.
 */
export function countyAt(counties: County[], lon: number, lat: number): string | null {
  return areaAt(counties, lon, lat)?.name ?? null;
}

/**
 * How far around a coordinate the county answer has to hold, in degrees.
 *
 * 0.0007 is about 78 metres. Measured, not picked: probing points nudged off
 * real county-line vertices, the shipped geometry disagrees with the
 * unsimplified Census source 1.30% of the time at 56m from a line, 0.49% at
 * 223m and 0.11% at 1.1km. Every radius from 78m upward removed 100% of those
 * disagreements, so the smallest one is the cheapest: it silences 0.83% of
 * Texas rather than the 2.17% a 245m radius would.
 */
const COUNTY_AGREE_RADIUS = 0.0007;

/**
 * The county containing a point, but ONLY when the answer is not borderline.
 *
 * WHY THIS EXISTS. The shipped boundaries are quantised so the file stays at
 * 536 KB, and quantisation moves county lines by tens of metres. Deep inside a
 * county that is invisible: 0 of 4,000 uniformly sampled Texas points disagree
 * with the Census source, and 12 of 12 city-hall landmarks resolve correctly.
 * Within about 50 metres of a line it is wrong 1.3% of the time.
 *
 * That band is small and the consequence in it is not. The sentence this feeds
 * tells somebody which county's early voting locations they may use, they
 * cannot correct it the way they can retype a district number, and being
 * confidently wrong about where a person may vote is the one failure this
 * whole block exists to avoid.
 *
 * So rather than qualifying the sentence, this declines to produce one. The
 * coordinate and four points a radius away must all land in the same county;
 * if they disagree, the reader is near a line, and near a line this data cannot
 * answer. They still get the dates, the election-day note and the state's own
 * link, which is what they had before the county feature existed.
 *
 * Five point-in-polygon tests instead of one, on boundaries already decoded and
 * in memory.
 */
export function countyIfUnambiguous(
  counties: County[],
  lon: number,
  lat: number,
): string | null {
  const here = countyAt(counties, lon, lat);
  if (here === null) return null;
  const r = COUNTY_AGREE_RADIUS;
  for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    if (countyAt(counties, lon + dx, lat + dy) !== here) return null;
  }
  return here;
}

export function plausibleCoord(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat)
    && lon >= LON_RANGE[0] && lon <= LON_RANGE[1]
    && lat >= LAT_RANGE[0] && lat <= LAT_RANGE[1];
}

let cache: Promise<Boundaries> | null = null;

/**
 * Fetched on demand and only once.
 *
 * 122 KB gzipped is cheap for a reader who asked to be located and pure waste
 * for everyone else, and most readers never touch this. main.ts reaches this
 * module through a dynamic import for the same reason, so the decoder is a
 * separate chunk too and nothing here is in the main bundle.
 */
export function loadBoundaries(fetchImpl: typeof fetch = fetch): Promise<Boundaries> {
  if (!cache) {
    cache = fetchImpl(BOUNDARIES_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`boundaries: HTTP ${r.status}`);
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
