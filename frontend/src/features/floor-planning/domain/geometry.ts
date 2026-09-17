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
