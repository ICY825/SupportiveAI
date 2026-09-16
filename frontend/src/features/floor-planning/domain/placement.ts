/**
 * Where a spatial entity sits on a floor, and whether that is allowed.
 *
 * Placement is deliberately separate from the entity itself. `Workstation`
 * carries identity, provenance and business meaning; a `SpatialPlacement`
 * carries only "this id occupies this footprint, turned this way". Nothing
 * here is workstation-specific, so meeting tables, cabinets, printers and
 * partitions can reuse it unchanged when they are introduced.
 *
 *   Workstation
 *   ├── identity      id, code, clusterId, zoneId
 *   ├── metadata      verification, source, notes
 *   └── placement     SpatialPlacement  ← this file
 *
 * All coordinates are FLOOR coordinates (PDF user-space points, top-left
 * origin) — never SVG pixels and never viewport pixels. See ../workspace/scene
 * for the projection that turns these into what the camera draws.
 */
import {
  bboxesOverlap,
  bboxesTouch,
  bboxOfPoints,
  GEOMETRY_EPSILON,
  polygonContainsBBox,
  rectangle,
  rotateQuarter,
} from './geometry'
import type { BBox, Point } from './spatial'

export type QuarterRotation = 0 | 90 | 180 | 270

export const QUARTER_ROTATIONS: QuarterRotation[] = [0, 90, 180, 270]

export interface SpatialPlacement {
  entityId: string
  /** centre of the footprint, floor coordinates */
  x: number
  y: number
  /** footprint size at rotation 0: `width` along X, `depth` along Y */
  width: number
  depth: number
  rotation: QuarterRotation
}

/** A logical grid, not a drawn one. The renderer reads it; it does not own it. */
export interface SpatialGrid {
  origin: Point
  /** floor points */
  cellSize: number
}

export type PlacementIssue = { type: 'overlap'; entityId: string } | { type: 'outside-boundary' }

export interface PlacementValidation {
  valid: boolean
  reasons: PlacementIssue[]
}

/**
 * The area a placement is allowed to occupy, plus where that area came from.
 * `kind` exists so the UI can be honest about how strong the constraint is
 * instead of presenting every polygon as if it were a surveyed room outline.
 */
export interface PlacementBoundary {
  polygon: Point[]
  bbox: BBox
  /**
   * `zone-annotation`  a reviewer-drawn department area on the source drawing.
   *                    Real and source-verified, but NOT an architectural room
   *                    or wall outline: it says which area a department owns,
   *                    not where a desk physically fits.
   * `scene-scope`      the current camera crop only. Not a floor boundary.
   */
  kind: 'zone-annotation' | 'scene-scope'
  /** id of the entity the polygon came from, when there is one */
  sourceId: string | null
}

export interface PlacementContext {
  /** every other placement that can be collided with */
  others: readonly SpatialPlacement[]
  boundary: PlacementBoundary | null
  /**
   * How far two objects may interpenetrate, in floor units, before it counts.
   *
   * Extracted footprints are not exact modules — the same "1200x600" desk comes
   * out of the drawing between 595 and 609 mm deep — so snapping two of them
   * into adjacent grid cells leaves a millimetre-scale sliver. Reporting that
   * as a conflict would make the editor unusable on real extracted data. It
   * defaults to float tolerance; callers with a real scale pass a real one.
   */
  tolerance?: number
}

export const PLACEMENT_VALID: PlacementValidation = { valid: true, reasons: [] }

export function normalizeRotation(deg: number): QuarterRotation {
  const turns = Math.round(deg / 90)
  return ((((turns % 4) + 4) % 4) * 90) as QuarterRotation
}

/** Rotation swaps the footprint: a 1200×600 desk turned 90° occupies 600×1200. */
export function placementFootprint(placement: SpatialPlacement): { width: number; depth: number } {
  return placement.rotation % 180 === 0
    ? { width: placement.width, depth: placement.depth }
    : { width: placement.depth, depth: placement.width }
}

export function placementBounds(placement: SpatialPlacement): BBox {
  const { width, depth } = placementFootprint(placement)
  return [placement.x - width / 2, placement.y - depth / 2, placement.x + width / 2, placement.y + depth / 2]
}

export const placementPolygon = (placement: SpatialPlacement): Point[] => rectangle(placementBounds(placement))

export function placementAt(placement: SpatialPlacement, [x, y]: Point): SpatialPlacement {
  return placement.x === x && placement.y === y ? placement : { ...placement, x, y }
}

export function translatePlacement(placement: SpatialPlacement, dx: number, dy: number): SpatialPlacement {
  return dx === 0 && dy === 0 ? placement : { ...placement, x: placement.x + dx, y: placement.y + dy }
}

export function rotatePlacementBy(placement: SpatialPlacement, deg: number): SpatialPlacement {
  const rotation = normalizeRotation(placement.rotation + deg)
  return rotation === placement.rotation ? placement : { ...placement, rotation }
}

export function placementsEqual(a: SpatialPlacement, b: SpatialPlacement): boolean {
  return (
    a.entityId === b.entityId &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.depth === b.depth &&
    a.rotation === b.rotation
  )
}

/* ------------------------------------------------------------------ grid */

const snapScalar = (value: number, origin: number, cell: number) => origin + Math.round((value - origin) / cell) * cell

export function snapPointToGrid([x, y]: Point, grid: SpatialGrid): Point {
  if (!(grid.cellSize > 0)) return [x, y]
  return [snapScalar(x, grid.origin[0], grid.cellSize), snapScalar(y, grid.origin[1], grid.cellSize)]
}

/**
 * Snaps the footprint's leading CORNER, not its centre. Desks are whole
 * multiples of the cell, so corner snapping keeps neighbours flush; centre
 * snapping would leave half-cell seams between desks of different depths.
 */
export function snapPlacementToGrid(placement: SpatialPlacement, grid: SpatialGrid): SpatialPlacement {
  if (!(grid.cellSize > 0)) return placement
  const [x0, y0] = placementBounds(placement)
  const [sx, sy] = snapPointToGrid([x0, y0], grid)
  // Derived from the snapped corner rather than nudged by the difference, so
  // the same cell always yields bit-identical coordinates however it was
  // reached — otherwise a re-drag leaves float residue and looks like a move.
  const { width, depth } = placementFootprint(placement)
  return placementAt(placement, [sx + width / 2, sy + depth / 2])
}

/* ------------------------------------------------------------- validation */

/** Share area. Two placements flush against each other do NOT intersect. */
export function intersects(a: SpatialPlacement, b: SpatialPlacement, tolerance = GEOMETRY_EPSILON): boolean {
  return bboxesOverlap(placementBounds(a), placementBounds(b), tolerance)
}

/**
 * Geometry only. Issues are returned as data so wording lives in the UI layer
 * and the same rules can be reported in a log, an API response or a tooltip.
 */
export function validatePlacement(candidate: SpatialPlacement, context: PlacementContext): PlacementValidation {
  const reasons: PlacementIssue[] = []
  const bounds = placementBounds(candidate)
  const tolerance = context.tolerance ?? GEOMETRY_EPSILON

  if (context.boundary && !polygonContainsBBox(context.boundary.polygon, bounds, tolerance)) {
    reasons.push({ type: 'outside-boundary' })
  }
  for (const other of context.others) {
    if (other.entityId === candidate.entityId) continue
    if (!bboxesTouch(bounds, placementBounds(other), tolerance)) continue
    if (intersects(candidate, other, tolerance)) reasons.push({ type: 'overlap', entityId: other.entityId })
  }

  return reasons.length === 0 ? PLACEMENT_VALID : { valid: false, reasons }
}

/**
 * Validates every placement against every other. O(n²) on purpose: the edited
 * scope is tens of objects, and a spatial index here would be untested weight.
 */
export function validateAll(
  placements: readonly SpatialPlacement[],
  boundary: PlacementBoundary | null,
  tolerance?: number,
): Map<string, PlacementValidation> {
  const result = new Map<string, PlacementValidation>()
  for (const placement of placements) {
    result.set(placement.entityId, validatePlacement(placement, { others: placements, boundary, tolerance }))
  }
  return result
}

/* -------------------------------------------------------------- transform */

/**
 * The rigid transform that carries geometry drawn for `base` onto `current`.
 * Used to move a workstation's own outline, and anything attached to it such
 * as its chair, without re-deriving either from the placement rectangle.
 */
export function placementTransform(base: SpatialPlacement, current: SpatialPlacement): (point: Point) => Point {
  const turn = normalizeRotation(current.rotation - base.rotation)
  const origin: Point = [base.x, base.y]
  const dx = current.x - base.x
  const dy = current.y - base.y
  if (turn === 0 && dx === 0 && dy === 0) return (point) => point
  return (point) => {
    const [rx, ry] = rotateQuarter(point, origin, turn)
    return [rx + dx, ry + dy]
  }
}

export const transformBBox = (bbox: BBox, transform: (point: Point) => Point): BBox =>
  bboxOfPoints(rectangle(bbox).map(transform))
