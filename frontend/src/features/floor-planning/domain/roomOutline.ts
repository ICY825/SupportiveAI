/**
 * Snapping for room outlines clicked corner by corner.
 *
 * Office walls run horizontally, vertically or at 45°: Floor 16's middle wing
 * is bounded by chamfered walls on both sides. Each new edge therefore snaps
 * to the nearest multiple of 45° from the previous corner, and the corner is
 * pulled onto a 45° line through the first corner when it is close, so the
 * closing edge comes out straight too.
 */
import { polygonArea, polygonLabelPoint } from './geometry'
import type { Point, Room } from './spatial'

const QUARTER = Math.PI / 4

/** Unit direction of the multiple of 45° nearest to `from → to`. */
function snappedDirection(from: Point, to: Point): Point {
  const angle = Math.round(Math.atan2(to[1] - from[1], to[0] - from[0]) / QUARTER) * QUARTER
  const x = Math.cos(angle)
  const y = Math.sin(angle)
  // Exact axes and diagonals: cos/sin leave 1e-17 residue that later reads as a slant.
  return [Math.abs(x) < 1e-9 ? 0 : Math.round(x * 1e9) / 1e9, Math.abs(y) < 1e-9 ? 0 : Math.round(y * 1e9) / 1e9]
}

function intersect(p: Point, u: Point, q: Point, v: Point): Point | null {
  const det = u[0] * v[1] - u[1] * v[0]
  if (Math.abs(det) < 1e-9) return null
  const t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / det
  return [p[0] + u[0] * t, p[1] + u[1] * t]
}

const DIRECTIONS: readonly Point[] = [
  [1, 0],
  [0, 1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
]

/**
 * Where the next corner goes for a pointer at `cursor`.
 *
 * `toleranceFloor` is the pull radius in floor units; callers derive it from a
 * fixed screen distance so snapping feels the same at every zoom.
 */
export function snapOutlineCorner(
  path: readonly Point[],
  cursor: Point,
  toleranceFloor: number,
  free = false,
  existingCorners: readonly Point[] = [],
): Point {
  if (free) return cursor
  // Corners already drawn win over angle snapping, so neighbouring outlines share exact corners.
  const nearby = nearestWithin(existingCorners, cursor, toleranceFloor)
  if (nearby) return nearby
  if (path.length === 0) return cursor
  const previous = path[path.length - 1]
  const direction = snappedDirection(previous, cursor)
  const along = (cursor[0] - previous[0]) * direction[0] + (cursor[1] - previous[1]) * direction[1]
  const onRay: Point = [previous[0] + direction[0] * along, previous[1] + direction[1] * along]
  if (path.length < 2) return onRay

  const first = path[0]
  if (Math.hypot(onRay[0] - first[0], onRay[1] - first[1]) <= toleranceFloor) return first
  let best: Point = onRay
  let bestDistance = toleranceFloor
  for (const guide of DIRECTIONS) {
    const hit = intersect(previous, direction, first, guide)
    if (!hit) continue
    const distance = Math.hypot(hit[0] - onRay[0], hit[1] - onRay[1])
    if (distance <= bestDistance) {
      best = hit
      bestDistance = distance
    }
  }
  return best
}

/** True when a click at `corner` should close the outline rather than add a corner. */
export function closesOutline(path: readonly Point[], corner: Point, toleranceFloor: number): boolean {
  if (path.length < 3) return false
  return Math.hypot(corner[0] - path[0][0], corner[1] - path[0][1]) <= toleranceFloor
}

/** Drops corners that sit on a straight run, so a room keeps only its real corners. */
export function simplifyOutline(path: readonly Point[], epsilon = 1e-6): Point[] {
  let result = [...path]
  let changed = true
  while (changed && result.length > 3) {
    changed = false
    for (let i = 0; i < result.length; i++) {
      const a = result[(i - 1 + result.length) % result.length]
      const b = result[i]
      const c = result[(i + 1) % result.length]
      const crossZ = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
      const same = Math.hypot(b[0] - a[0], b[1] - a[1]) <= epsilon
      if (same || Math.abs(crossZ) <= epsilon * Math.max(1, Math.hypot(c[0] - a[0], c[1] - a[1]))) {
        result = result.filter((_, k) => k !== i)
        changed = true
        break
      }
    }
  }
  return result
}

/** Every piece of a room's floor area. */
export function roomParts(room: Pick<Room, 'polygon' | 'extraPolygons'>): Point[][] {
  return [room.polygon, ...(room.extraPolygons ?? [])]
}

/** One caption per room, inside its largest piece. */
export function roomLabelPoint(room: Pick<Room, 'polygon' | 'extraPolygons'>): Point {
  const parts = roomParts(room)
  const largest = parts.reduce((best, part) => (polygonArea(part) > polygonArea(best) ? part : best), parts[0])
  return polygonLabelPoint(largest)
}

function nearestWithin(points: readonly Point[], target: Point, tolerance: number): Point | null {
  let best: Point | null = null
  let bestDistance = tolerance
  for (const point of points) {
    const distance = Math.hypot(point[0] - target[0], point[1] - target[1])
    if (distance <= bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}
