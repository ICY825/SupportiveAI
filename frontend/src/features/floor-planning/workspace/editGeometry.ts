/**
 * Projection of edit-mode affordances. Floor coordinates in, scene units out.
 *
 * Kept out of the components so the grid, the boundary and the selection box
 * are computed once per layout change rather than once per React render, and
 * so no coordinate conversion ends up inside JSX.
 */
import { bboxesTouch, pointInPolygon } from '../domain/geometry'
import { placementBounds, type SpatialGrid, type SpatialPlacement } from '../domain/placement'
import type { Point } from '../domain/spatial'
import { gridPoints, type EditableArea } from './layoutDraft'
import { project, projectedPoints, rectangle } from './scene'

export interface EditOverlayDoorClearance {
  id: string
  points: string
  name?: string | null
}

export interface EditOverlayGeometry {
  /** projected grid intersections */
  dots: Point[]
  /** projected boundary outline */
  boundary: string
  /** projected door swing clearance polygons */
  doorClearances: EditOverlayDoorClearance[]
}

/**
 * `grid` is the lattice the selected object actually snaps to, so the dots the
 * person sees are the positions it can land on — not a decorative overlay.
 */
export function buildEditOverlay(area: EditableArea, grid: SpatialGrid): EditOverlayGeometry {
  const inside = (point: Point) => pointInPolygon(point, area.boundary.polygon)
  const bbox = area.boundary.bbox
  const doorClearances: EditOverlayDoorClearance[] = (area.obstacles ?? [])
    .filter((o) => o.kind === 'door-clearance')
    .filter((o) => !bbox || !o.bbox || bboxesTouch(o.bbox, [bbox[0] - 25, bbox[1] - 25, bbox[2] + 25, bbox[3] + 25]))
    .map((o) => ({
      id: o.id,
      points: projectedPoints(o.polygon, 0),
      name: o.name,
    }))

  return {
    dots: gridPoints(area, grid, inside).map((p) => project(p)),
    boundary: projectedPoints(area.boundary.polygon),
    doorClearances,
  }
}

/** Footprint outline of a placement, projected at elevation `z`. */
export const placementOutline = (placement: SpatialPlacement, z = 0): string =>
  projectedPoints(rectangle(placementBounds(placement)), z)

/**
 * Where the rotate handle sits: the projected corner of the footprint that is
 * furthest right on screen, so the control never covers the desk's own code.
 */
export function rotateHandleAnchor(placement: SpatialPlacement, z: number): Point {
  const corners = rectangle(placementBounds(placement)).map((p) => project(p, z))
  return corners.reduce((best, p) => (p[0] > best[0] ? p : best), corners[0])
}
