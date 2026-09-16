/**
 * Projection of edit-mode affordances. Floor coordinates in, scene units out.
 *
 * Kept out of the components so the grid, the boundary and the selection box
 * are computed once per layout change rather than once per React render, and
 * so no coordinate conversion ends up inside JSX.
 */
import { pointInPolygon } from '../domain/geometry'
import { placementBounds, type SpatialPlacement } from '../domain/placement'
import type { Point } from '../domain/spatial'
import { gridPoints, type EditableArea } from './layoutDraft'
import { project, projectedPoints, rectangle } from './scene'

export interface EditOverlayGeometry {
  /** projected grid intersections */
  dots: Point[]
  /** projected boundary outline */
  boundary: string
}

export function buildEditOverlay(area: EditableArea): EditOverlayGeometry {
  const inside = (point: Point) => pointInPolygon(point, area.boundary.polygon)
  return {
    dots: gridPoints(area, inside).map((p) => project(p)),
    boundary: projectedPoints(area.boundary.polygon),
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
