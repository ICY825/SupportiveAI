/**
 * Planar geometry in FLOOR coordinates — PDF user-space points, top-left
 * origin, the space `Workstation.polygon` and `Zone.polygon` already use.
 *
 * Nothing here knows about SVG, the camera, React or the office domain, so the
 * same helpers serve desks today and tables, cabinets or partitions later.
 *
 * Touching is not overlapping: desks in an extracted cluster share edges
 * exactly, so every containment and intersection test below is strict and
 * carries a tolerance rather than using `<=`.
 */
import type { BBox, Point } from './spatial'

/** Floor points. Smaller than any real drawing error, larger than float noise. */
export const GEOMETRY_EPSILON = 1e-6

export const rectangle = ([x0, y0, x1, y1]: BBox): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

export function bboxOfPoints(points: readonly Point[]): BBox {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of points) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

/** True only when the boxes share area. Flush edges return false. */
export function bboxesOverlap(a: BBox, b: BBox, epsilon = GEOMETRY_EPSILON): boolean {
  return a[0] < b[2] - epsilon && b[0] < a[2] - epsilon && a[1] < b[3] - epsilon && b[1] < a[3] - epsilon
}

/** Cheap pre-filter: true when the boxes share area OR merely touch. */
export function bboxesTouch(a: BBox, b: BBox, epsilon = GEOMETRY_EPSILON): boolean {
  return a[0] <= b[2] + epsilon && b[0] <= a[2] + epsilon && a[1] <= b[3] + epsilon && b[1] <= a[3] + epsilon
}

/** Ray casting. Points exactly on an edge are not guaranteed either way. */
export function pointInPolygon([x, y]: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Proper intersection only: shared endpoints and collinear touching are false. */
export function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point, epsilon = GEOMETRY_EPSILON): boolean {
  const d1 = cross(b1, b2, a1)
  const d2 = cross(b1, b2, a2)
  const d3 = cross(a1, a2, b1)
  const d4 = cross(a1, a2, b2)
  return (
    ((d1 > epsilon && d2 < -epsilon) || (d1 < -epsilon && d2 > epsilon)) &&
    ((d3 > epsilon && d4 < -epsilon) || (d3 < -epsilon && d4 > epsilon))
  )
}

/**
 * Exact for an axis-aligned box against a simple polygon: every corner is
 * inside and no polygon edge cuts through a box edge. A corner-only test would
 * accept a box that straddles a concave notch, which real zone outlines have.
 */
export function polygonContainsBBox(polygon: readonly Point[], bbox: BBox, epsilon = GEOMETRY_EPSILON): boolean {
  if (polygon.length < 3) return false
  const shrunk: BBox = [bbox[0] + epsilon, bbox[1] + epsilon, bbox[2] - epsilon, bbox[3] - epsilon]
  // Both tests run against the same shrunk box. Testing corners shrunk but
  // edges full-size spends the tolerance twice over: a boundary grazing the box
  // by less than epsilon would pass the corner test and then be rejected as a
  // crossing, so the caller's stated tolerance would only half apply.
  const corners = rectangle(shrunk)
  for (const corner of corners) {
    if (!pointInPolygon(corner, polygon)) return false
  }
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    for (let k = 0; k < 4; k++) {
      if (segmentsCross(a, b, corners[k], corners[(k + 1) % 4], epsilon)) return false
    }
  }
  return true
}

/**
 * Sutherland–Hodgman against an axis-aligned rectangle. The subject may be
 * concave; the clip must be convex, which a BBox always is.
 */
export function clipPolygonToBBox(polygon: readonly Point[], clip: BBox): Point[] {
  const edges: Array<(p: Point) => boolean> = [
    ([x]) => x >= clip[0],
    ([x]) => x <= clip[2],
    ([, y]) => y >= clip[1],
    ([, y]) => y <= clip[3],
  ]
  const cut: Array<(a: Point, b: Point) => Point> = [
    (a, b) => [clip[0], a[1] + ((b[1] - a[1]) * (clip[0] - a[0])) / (b[0] - a[0])],
    (a, b) => [clip[2], a[1] + ((b[1] - a[1]) * (clip[2] - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (clip[1] - a[1])) / (b[1] - a[1]), clip[1]],
    (a, b) => [a[0] + ((b[0] - a[0]) * (clip[3] - a[1])) / (b[1] - a[1]), clip[3]],
  ]

  let output = [...polygon]
  for (let e = 0; e < edges.length && output.length > 0; e++) {
    const input = output
    output = []
    for (let i = 0; i < input.length; i++) {
      const current = input[i]
      const previous = input[(i + input.length - 1) % input.length]
      const currentIn = edges[e](current)
      const previousIn = edges[e](previous)
      if (currentIn) {
        if (!previousIn) output.push(cut[e](previous, current))
        output.push(current)
      } else if (previousIn) {
        output.push(cut[e](previous, current))
      }
    }
  }
  return output
}

/**
 * Planar polygon area using Gauss's Shoelace formula.
 * Used to evaluate obstacle interpenetration area after polygon clipping.
 */
export function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j][0] * points[i][1] - points[i][0] * points[j][1]
  }
  return Math.abs(area) / 2
}

/**
 * Quarter turns only, applied as exact coordinate swaps. Going through
 * sin/cos would leave 1e-16 residue that snapping then rounds inconsistently.
 */
export function rotateQuarter([x, y]: Point, [cx, cy]: Point, deg: 0 | 90 | 180 | 270): Point {
  const dx = x - cx
  const dy = y - cy
  switch (deg) {
    case 90:
      return [cx - dy, cy + dx]
    case 180:
      return [cx - dx, cy - dy]
    case 270:
      return [cx + dy, cy - dx]
    default:
      return [x, y]
  }
}

/**
 * General clockwise rotation in floor coordinates. Keep `rotateQuarter` for
 * the common exact quarter-turn path; this helper is for measured CAD angles
 * and deliberately does not snap them.
 */
export function rotatePoint([x, y]: Point, [cx, cy]: Point, deg: number): Point {
  if (deg % 360 === 0) return [x, y]
  const radians = (deg * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

/** Polygon containment for an oriented rectangle or another simple subject. */
export function polygonContainsPolygon(
  container: readonly Point[],
  subject: readonly Point[],
  epsilon = GEOMETRY_EPSILON,
): boolean {
  if (container.length < 3 || subject.length < 3) return false
  const center = subject.reduce<Point>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
  center[0] /= subject.length
  center[1] /= subject.length
  const inset = Math.max(0, epsilon)
  const inside = subject.map(([x, y]) => {
    const dx = center[0] - x
    const dy = center[1] - y
    const length = Math.hypot(dx, dy)
    return length > GEOMETRY_EPSILON ? [x + (dx / length) * inset, y + (dy / length) * inset] as Point : [x, y] as Point
  })
  if (!inside.every((point) => pointInPolygon(point, container))) return false
  for (let i = 0; i < container.length; i++) {
    const a = container[i]
    const b = container[(i + 1) % container.length]
    for (let k = 0; k < inside.length; k++) {
      if (segmentsCross(a, b, inside[k], inside[(k + 1) % inside.length], epsilon)) return false
    }
  }
  return true
}

/** Twice the signed area. Positive is clockwise on screen, where y points down. */
function signedDoubleArea(points: readonly Point[]): number {
  let area = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j][0] * points[i][1] - points[i][0] * points[j][1]
  }
  return area
}

/**
 * True when no two non-adjacent edges touch and no edge doubles back on its
 * neighbour. A room outline clicked corner by corner can cross itself, and the
 * area and containment helpers above give meaningless answers for one that does.
 */
export function polygonIsSimple(polygon: readonly Point[], epsilon = GEOMETRY_EPSILON): boolean {
  const n = polygon.length
  if (n < 3 || polygonArea(polygon) <= epsilon) return false
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i]
    const a2 = polygon[(i + 1) % n]
    if (Math.hypot(a2[0] - a1[0], a2[1] - a1[1]) <= epsilon) return false
    for (let k = i + 1; k < n; k++) {
      const adjacent = k === i + 1 || (i === 0 && k === n - 1)
      const b1 = polygon[k]
      const b2 = polygon[(k + 1) % n]
      if (!adjacent && (segmentsCross(a1, a2, b1, b2, epsilon) || segmentsTouch(a1, a2, b1, b2, epsilon))) return false
      if (adjacent && foldsBack(a1, a2, b1, b2, epsilon)) return false
    }
  }
  return true
}

function onSegment(p: Point, a: Point, b: Point, epsilon: number): boolean {
  if (Math.abs(cross(a, b, p)) > epsilon * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]))) return false
  return (
    p[0] >= Math.min(a[0], b[0]) - epsilon &&
    p[0] <= Math.max(a[0], b[0]) + epsilon &&
    p[1] >= Math.min(a[1], b[1]) - epsilon &&
    p[1] <= Math.max(a[1], b[1]) + epsilon
  )
}

/** Any contact short of a proper crossing: an endpoint lying on the other segment. */
function segmentsTouch(a1: Point, a2: Point, b1: Point, b2: Point, epsilon: number): boolean {
  return onSegment(a1, b1, b2, epsilon) || onSegment(a2, b1, b2, epsilon) || onSegment(b1, a1, a2, epsilon) || onSegment(b2, a1, a2, epsilon)
}

/** Adjacent edges share one vertex; they fold back when they are collinear and point opposite ways. */
function foldsBack(a1: Point, a2: Point, b1: Point, b2: Point, epsilon: number): boolean {
  const shared = a2 === b1 || (a2[0] === b1[0] && a2[1] === b1[1]) ? a2 : a1
  const u = shared === a2 ? a1 : a2
  const v = shared === a2 ? b2 : b1
  const ux = u[0] - shared[0]
  const uy = u[1] - shared[1]
  const vx = v[0] - shared[0]
  const vy = v[1] - shared[1]
  const lengths = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  return Math.abs(ux * vy - uy * vx) <= epsilon * lengths && ux * vx + uy * vy > 0
}

/**
 * Points just inside a simple polygon, one beside the middle of each edge.
 * Flush neighbours share edges, so testing these instead of vertices keeps
 * touching from counting as overlapping.
 */
function interiorSamples(polygon: readonly Point[], inset: number): Point[] {
  const orientation = signedDoubleArea(polygon) >= 0 ? 1 : -1
  const samples: Point[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length === 0) continue
    // With y pointing down, the interior of a clockwise outline is to the right of travel.
    const nx = (-(b[1] - a[1]) / length) * orientation
    const ny = ((b[0] - a[0]) / length) * orientation
    samples.push([(a[0] + b[0]) / 2 + nx * inset, (a[1] + b[1]) / 2 + ny * inset])
  }
  return samples
}

/**
 * True only when two simple polygons share area. Bounding boxes cannot answer
 * this for L-shaped or diagonal rooms: their boxes cover floor the room does not.
 */
export function polygonsOverlap(a: readonly Point[], b: readonly Point[], epsilon = GEOMETRY_EPSILON): boolean {
  if (a.length < 3 || b.length < 3 || !bboxesOverlap(bboxOfPoints(a), bboxOfPoints(b), epsilon)) return false
  for (let i = 0; i < a.length; i++) {
    for (let k = 0; k < b.length; k++) {
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[k], b[(k + 1) % b.length], epsilon)) return true
    }
  }
  // Small next to any real drawing error, far above float noise.
  const inset = 1e-3
  return interiorSamples(a, inset).some((p) => pointInPolygon(p, b)) || interiorSamples(b, inset).some((p) => pointInPolygon(p, a))
}

/**
 * Where to write a polygon's name. The centroid when it falls inside; for a
 * shape that wraps around its own centroid (an L or U), the middle of the
 * widest horizontal run through the centroid's height, then through the
 * bounding box's.
 */
export function polygonLabelPoint(polygon: readonly Point[]): Point {
  if (polygon.length === 0) return [0, 0]
  const box = bboxOfPoints(polygon)
  const twiceArea = signedDoubleArea(polygon)
  let centroid: Point = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
  if (Math.abs(twiceArea) > GEOMETRY_EPSILON) {
    let cx = 0
    let cy = 0
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const f = polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1]
      cx += (polygon[j][0] + polygon[i][0]) * f
      cy += (polygon[j][1] + polygon[i][1]) * f
    }
    centroid = [cx / (3 * twiceArea), cy / (3 * twiceArea)]
  }
  if (pointInPolygon(centroid, polygon)) return centroid
  for (const y of [centroid[1], (box[1] + box[3]) / 2]) {
    const run = widestRunAt(polygon, y)
    if (run) return [(run[0] + run[1]) / 2, y]
  }
  return centroid
}

function widestRunAt(polygon: readonly Point[], y: number): [number, number] | null {
  const xs: number[] = []
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi))
  }
  xs.sort((p, q) => p - q)
  let best: [number, number] | null = null
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]]
  }
  return best
}

function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function distanceToBoundary(point: Point, polygon: readonly Point[]): number {
  let best = Infinity
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) best = Math.min(best, distanceToSegment(point, polygon[j], polygon[i]))
  return best
}

/**
 * True when two simple polygons share floor deeper than `tolerance` from both
 * outlines. Outlines clicked by hand along the same wall never land on exactly
 * the same line; the sliver between them is drawing error, not overlap.
 *
 * Samples the shared bounding box on a grid finer than the tolerance, so any
 * overlap wider than twice the tolerance is always caught.
 */
export function polygonsOverlapBeyond(a: readonly Point[], b: readonly Point[], tolerance: number): boolean {
  if (tolerance <= 0) return polygonsOverlap(a, b)
  if (!polygonsOverlap(a, b)) return false
  const [ax0, ay0, ax1, ay1] = bboxOfPoints(a)
  const [bx0, by0, bx1, by1] = bboxOfPoints(b)
  const x0 = Math.max(ax0, bx0)
  const y0 = Math.max(ay0, by0)
  const x1 = Math.min(ax1, bx1)
  const y1 = Math.min(ay1, by1)
  // Cap the grid so a huge shared box stays cheap; the cap only coarsens very large overlaps.
  const step = Math.max(tolerance / 2, (x1 - x0) / 400, (y1 - y0) / 400)
  for (let y = y0 + step / 2; y < y1; y += step) {
    for (let x = x0 + step / 2; x < x1; x += step) {
      const p: Point = [x, y]
      if (pointInPolygon(p, a) && pointInPolygon(p, b) && distanceToBoundary(p, a) > tolerance && distanceToBoundary(p, b) > tolerance) return true
    }
  }
  return false
}
