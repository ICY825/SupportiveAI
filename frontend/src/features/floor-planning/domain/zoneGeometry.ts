/**
 * Display geometry for zone annotations.
 *
 * Zone outlines are not drawn geometry. They come from PDF annotations a person
 * made over the CAD sheet: `Highlight` annotations are dragged boxes and come
 * out clean, but `Polygon` annotations are lassoed by hand and carry two
 * artefacts of the pointing device.
 *
 * Measured on Floor 16:
 *
 *   near-miss edges   ten of Smart City's fourteen edges sit within 2.04° of
 *                     horizontal or vertical. They were meant to be straight.
 *                     Across its 378 pt edge, 0.51° is 3.4 pt of drift, which
 *                     reads as a slant against orthogonal CAD linework.
 *
 *   stub vertices     segments of 2.42, 6.83 and 10.08 pt at unrelated angles —
 *                     stray clicks while lassoing. These are the notches at the
 *                     corners.
 *
 * Both are corrected here, for drawing only. `Zone.polygon` stays exactly as
 * extracted: it is what the annotation says, and the verification view exists
 * to report that faithfully.
 *
 * What must survive: the ~43.3° and ~44.4° edges are a real chamfer following
 * the building's diagonal wall. Snapping to multiples of 45° rather than 90°
 * keeps them, and cleans them to a true 45° at the same time.
 */
import type { Point } from './spatial'

/**
 * Longest segment treated as a stray click. The longest measured stub is
 * 10.08 pt and the shortest deliberate edge is 47.64 pt, so the gap this sits
 * in is wide.
 */
export const STUB_MAX_PT = 12

/**
 * How far an edge may miss a multiple of 45° and still be considered as having
 * been aimed at it. The worst measured near-miss is 2.04°; the real chamfers
 * are within 1.7° of 45° and so snap to it rather than away from it.
 */
export const ANGLE_TOLERANCE_DEG = 3

const TAU = Math.PI * 2
const QUARTER = Math.PI / 4

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1])

/**
 * Drops vertices that sit at the end of a stub segment.
 *
 * Removing the later endpoint keeps the earlier vertex, which is the one the
 * two long neighbouring edges were drawn from. Runs to a fixed point because
 * removing one stub can expose another.
 */
function dropStubs(polygon: readonly Point[], maxLength: number): Point[] {
  let result = [...polygon]
  let changed = true
  while (changed && result.length > 4) {
    changed = false
    for (let i = 0; i < result.length; i++) {
      const next = (i + 1) % result.length
      if (distance(result[i], result[next]) >= maxLength) continue
      result = result.filter((_, index) => index !== next)
      changed = true
      break
    }
  }
  return result
}

/** The edge's direction, snapped to the nearest multiple of 45° when close. */
function snappedDirection(a: Point, b: Point, toleranceRad: number): Point {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
  const nearest = Math.round(angle / QUARTER) * QUARTER
  const deviation = Math.abs(((angle - nearest + Math.PI) % TAU + TAU) % TAU - Math.PI)
  const used = deviation <= toleranceRad ? nearest : angle
  return [Math.cos(used), Math.sin(used)]
}

/** Where two infinite lines cross, or null when they are parallel enough to be unusable. */
function intersect(p: Point, u: Point, q: Point, v: Point): Point | null {
  const cross = u[0] * v[1] - u[1] * v[0]
  if (Math.abs(cross) < 1e-9) return null
  const t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / cross
  return [p[0] + u[0] * t, p[1] + u[1] * t]
}

/**
 * The polygon to draw for a zone: stubs removed, near-orthogonal and
 * near-diagonal edges straightened, corners rebuilt where the straightened
 * edges actually meet.
 *
 * Each edge is anchored on its own midpoint rather than an endpoint, so
 * straightening pivots the edge in place instead of swinging its far end.
 * Corners then come from intersecting consecutive edge lines — rotating
 * segments individually would leave the outline open at every joint.
 */
export function regularizeZonePolygon(
  polygon: readonly Point[],
  { stubMaxPt = STUB_MAX_PT, angleToleranceDeg = ANGLE_TOLERANCE_DEG } = {},
): Point[] {
  if (polygon.length < 4) return [...polygon]
  const base = dropStubs(polygon, stubMaxPt)
  if (base.length < 4) return base

  const toleranceRad = (angleToleranceDeg * Math.PI) / 180
  const edges = base.map((a, i) => {
    const b = base[(i + 1) % base.length]
    return { midpoint: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point, direction: snappedDirection(a, b, toleranceRad) }
  })

  // Vertex i joins edge i-1 to edge i, so it is where those two lines meet.
  return base.map((original, i) => {
    const previous = edges[(i - 1 + edges.length) % edges.length]
    const current = edges[i]
    return intersect(previous.midpoint, previous.direction, current.midpoint, current.direction) ?? original
  })
}

const cache = new WeakMap<object, Point[]>()

/**
 * Memoised per zone object. Zones are rebuilt when the dataset is rebuilt, so
 * identity is the right key and a customised zone recomputes on its own.
 */
export function zoneDisplayPolygon(zone: { polygon: Point[] }): Point[] {
  let display = cache.get(zone)
  if (!display) {
    display = regularizeZonePolygon(zone.polygon)
    cache.set(zone, display)
  }
  return display
}
