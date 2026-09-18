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
  clipPolygonToBBox,
  GEOMETRY_EPSILON,
  pointInPolygon,
  polygonArea,
  polygonContainsBBox,
  rectangle,
  rotateQuarter,
} from './geometry'
import type { BBox, FloorObstacle, Point, Room, Zone } from './spatial'

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
  /** Optional chair seating footprint (nominal 1 tile / 600mm) */
  chair?: { bbox: BBox; center?: Point } | null
  /** Optional seated side override ('north' | 'south' | 'east' | 'west' | 'top' | 'bottom' | 'left' | 'right') */
  seatedSide?: 'north' | 'south' | 'east' | 'west' | 'top' | 'bottom' | 'left' | 'right'
}

/** A logical grid, not a drawn one. The renderer reads it; it does not own it. */
export interface SpatialGrid {
  origin: Point
  /** floor points */
  cellSize: number
}

export type PlacementBoundaryKind =
  | 'room-boundary'
  | 'department-zone'
  | 'zone-annotation'
  | 'scene-scope'

export type PlacementIssue =
  | { type: 'overlap'; entityId: string; target?: 'desk' | 'chair' }
  | { type: 'outside-boundary'; target?: 'desk' | 'chair' }
  | { type: 'outside-room-boundary'; roomId?: string; roomName?: string; target?: 'desk' | 'chair' }
  | { type: 'outside-department-zone'; zoneId?: string; zoneName?: string; target?: 'desk' | 'chair' }
  | { type: 'obstacle-collision'; obstacleId: string; obstacleKind: 'column' | 'wall'; obstacleName?: string; target?: 'desk' | 'chair' }
  | { type: 'clearance-conflict'; obstacleId: string; obstacleKind: 'door-clearance'; obstacleName?: string; target?: 'desk' | 'chair' }

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
   * `room-boundary`    an architectural room outline derived from physical walls.
   * `department-zone`  an organizational department territory.
   * `zone-annotation`  a reviewer-drawn department area on the source drawing.
   * `scene-scope`      the current camera crop only. Not a floor boundary.
   */
  kind: PlacementBoundaryKind
  /** id of the entity the polygon came from, when there is one */
  sourceId: string | null
  /** human-readable name of the boundary */
  name?: string | null
  obstacles?: readonly FloorObstacle[]
  roomBoundary?: PlacementBoundary | null
  departmentZone?: PlacementBoundary | null
  chairTileSize?: number
}

export interface PlacementContext {
  /** every other placement that can be collided with */
  others: readonly SpatialPlacement[]
  boundary?: PlacementBoundary | null
  roomBoundary?: PlacementBoundary | Room | null
  departmentZone?: PlacementBoundary | Zone | null
  room?: PlacementBoundary | Room | null
  zone?: PlacementBoundary | Zone | null
  boundaries?: readonly PlacementBoundary[]
  obstacles?: readonly FloorObstacle[]
  /**
   * How far two objects may interpenetrate, in floor units, before it counts.
   * Defaults to float tolerance; callers with a real scale pass a real one.
   */
  tolerance?: number
  /**
   * How far an object may sit outside a containing boundary before it counts,
   * in floor units. Defaults to `tolerance`.
   *
   * Zone and room outlines are PDF annotations somebody drew over the sheet,
   * not measured geometry, so they carry the drafting error of a hand — Floor
   * 16's own zone edges are up to 2° off the axis they were aimed at. Judging
   * containment at furniture tolerance makes the extraction disagree with
   * itself: two chairs on that floor sit 44 mm and 79 mm past the line.
   */
  boundaryTolerance?: number
  /**
   * Tile size in floor units for occupant chair space calculation (e.g. 600 mm / mmPerPt).
   */
  chairTileSize?: number
  /** Whether to evaluate chair seating space */
  validateChair?: boolean
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

export function transformBBox(bbox: BBox, transform: (point: Point) => Point): BBox {
  return bboxOfPoints(rectangle(bbox).map(transform))
}

export function placementAt(placement: SpatialPlacement, [x, y]: Point): SpatialPlacement {
  if (placement.x === x && placement.y === y) return placement
  return translatePlacement(placement, x - placement.x, y - placement.y)
}

export function translatePlacement(placement: SpatialPlacement, dx: number, dy: number): SpatialPlacement {
  if (dx === 0 && dy === 0) return placement
  const chair = placement.chair
    ? {
        ...placement.chair,
        bbox: [
          placement.chair.bbox[0] + dx,
          placement.chair.bbox[1] + dy,
          placement.chair.bbox[2] + dx,
          placement.chair.bbox[3] + dy,
        ] as BBox,
        center: placement.chair.center
          ? ([placement.chair.center[0] + dx, placement.chair.center[1] + dy] as Point)
          : undefined,
      }
    : placement.chair
  return { ...placement, x: placement.x + dx, y: placement.y + dy, chair }
}

export function rotatePlacementBy(placement: SpatialPlacement, deg: number): SpatialPlacement {
  const rotation = normalizeRotation(placement.rotation + deg)
  if (rotation === placement.rotation) return placement
  const turn = normalizeRotation(deg)
  const origin: Point = [placement.x, placement.y]
  const chair = placement.chair
    ? {
        ...placement.chair,
        bbox: transformBBox(placement.chair.bbox, (p) => rotateQuarter(p, origin, turn)),
        center: placement.chair.center ? rotateQuarter(placement.chair.center, origin, turn) : undefined,
      }
    : placement.chair
  return { ...placement, rotation, chair }
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

/* ------------------------------------------------------------------ chair */

/**
 * Resolves or derives the chair seating space bounding box for a placement.
 * Projects 1 tile (600 mm or chairTileSize) along the desk's seated edge.
 */
export function getChairBounds(
  placement: SpatialPlacement,
  chairTileSize?: number,
): BBox | null {
  if (placement.chair?.bbox) {
    return placement.chair.bbox
  }
  const side = placement.seatedSide
  if (!side && (!chairTileSize || chairTileSize <= 0)) {
    return null
  }
  const bounds = placementBounds(placement)
  const [x0, y0, x1, y1] = bounds
  const tileSize =
    chairTileSize && chairTileSize > 0
      ? chairTileSize
      : placement.rotation % 180 === 0
        ? placement.depth
        : placement.width

  let dir: 'south' | 'west' | 'north' | 'east' = 'south'
  if (side) {
    if (side === 'south' || side === 'bottom') dir = 'south'
    else if (side === 'north' || side === 'top') dir = 'north'
    else if (side === 'west' || side === 'left') dir = 'west'
    else if (side === 'east' || side === 'right') dir = 'east'
  } else {
    switch (placement.rotation) {
      case 90:
        dir = 'west'
        break
      case 180:
        dir = 'north'
        break
      case 270:
        dir = 'east'
        break
      default:
        dir = 'south'
        break
    }
  }

  switch (dir) {
    case 'south':
      return [x0, y1, x1, y1 + tileSize]
    case 'north':
      return [x0, y0 - tileSize, x1, y0]
    case 'west':
      return [x0 - tileSize, y0, x0, y1]
    case 'east':
      return [x1, y0, x1 + tileSize, y1]
  }
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
 * Evaluates whether an axis-aligned box (desk or chair) collides with an obstacle.
 * Supports exact zero-gap flush contact and tolerance-recessed polygonal clipping.
 */
export function obstacleIntersects(
  candidateBounds: BBox,
  obstacle: FloorObstacle,
  tolerance = GEOMETRY_EPSILON,
): boolean {
  if (!bboxesTouch(candidateBounds, obstacle.bbox, tolerance)) return false

  // Fast path for axis-aligned rectangular obstacles (e.g. columns, orthogonal walls)
  const [ox0, oy0, ox1, oy1] = obstacle.bbox
  const isAABB =
    obstacle.polygon.length === 4 &&
    obstacle.polygon.every(
      ([x, y]) =>
        (Math.abs(x - ox0) < GEOMETRY_EPSILON || Math.abs(x - ox1) < GEOMETRY_EPSILON) &&
        (Math.abs(y - oy0) < GEOMETRY_EPSILON || Math.abs(y - oy1) < GEOMETRY_EPSILON),
    )

  if (isAABB) {
    return bboxesOverlap(candidateBounds, obstacle.bbox, tolerance)
  }

  // Tolerance-recessed clipping for general polygons (e.g. door clearances, angled walls)
  const halfW = (candidateBounds[2] - candidateBounds[0]) / 2
  const halfD = (candidateBounds[3] - candidateBounds[1]) / 2
  const effectiveTol = Math.min(tolerance, halfW - GEOMETRY_EPSILON, halfD - GEOMETRY_EPSILON)

  if (effectiveTol <= 0) {
    const clipped = clipPolygonToBBox(obstacle.polygon, candidateBounds)
    if (clipped.length >= 3 && polygonArea(clipped) > GEOMETRY_EPSILON) return true
    const center: Point = [
      (candidateBounds[0] + candidateBounds[2]) / 2,
      (candidateBounds[1] + candidateBounds[3]) / 2,
    ]
    return pointInPolygon(center, obstacle.polygon)
  }

  const shrunkBounds: BBox = [
    candidateBounds[0] + effectiveTol,
    candidateBounds[1] + effectiveTol,
    candidateBounds[2] - effectiveTol,
    candidateBounds[3] - effectiveTol,
  ]

  const clipped = clipPolygonToBBox(obstacle.polygon, shrunkBounds)
  if (clipped.length >= 3 && polygonArea(clipped) > GEOMETRY_EPSILON) return true

  const shrunkCenter: Point = [
    (shrunkBounds[0] + shrunkBounds[2]) / 2,
    (shrunkBounds[1] + shrunkBounds[3]) / 2,
  ]
  return pointInPolygon(shrunkCenter, obstacle.polygon)
}

/**
 * Geometry only. Issues are returned as data so wording lives in the UI layer
 * and the same rules can be reported in a log, an API response or a tooltip.
 */
export function validatePlacement(candidate: SpatialPlacement, context: PlacementContext): PlacementValidation {
  const reasons: PlacementIssue[] = []
  const deskBounds = placementBounds(candidate)
  const tolerance = context.tolerance ?? GEOMETRY_EPSILON
  const boundaryTolerance = context.boundaryTolerance ?? tolerance
  const chairBounds = getChairBounds(candidate, context.chairTileSize)

  const checkContainment = (
    polygon: Point[],
    onDeskOutside: () => void,
    onChairOutside: () => void,
  ) => {
    if (!polygonContainsBBox(polygon, deskBounds, boundaryTolerance)) {
      onDeskOutside()
    } else if (chairBounds && !polygonContainsBBox(polygon, chairBounds, boundaryTolerance)) {
      onChairOutside()
    }
  }

  // 1. Room boundary containment
  const room = context.roomBoundary ?? context.room
  if (room) {
    const roomId = ('sourceId' in room ? room.sourceId : room.id) ?? undefined
    const roomName = room.name ?? undefined
    checkContainment(
      room.polygon,
      () => reasons.push({ type: 'outside-room-boundary', roomId, roomName }),
      () => reasons.push({ type: 'outside-room-boundary', roomId, roomName, target: 'chair' }),
    )
  }

  // 2. Department zone containment
  const deptZone = context.departmentZone ?? context.zone
  if (deptZone) {
    const zoneId = ('sourceId' in deptZone ? deptZone.sourceId : deptZone.id) ?? undefined
    const zoneName = deptZone.name ?? undefined
    checkContainment(
      deptZone.polygon,
      () => reasons.push({ type: 'outside-department-zone', zoneId, zoneName }),
      () => reasons.push({ type: 'outside-department-zone', zoneId, zoneName, target: 'chair' }),
    )
  }

  // 3. Multi-boundaries array
  if (context.boundaries) {
    for (const b of context.boundaries) {
      if (b.kind === 'room-boundary') {
        checkContainment(
          b.polygon,
          () => reasons.push({ type: 'outside-room-boundary', roomId: b.sourceId ?? undefined, roomName: b.name ?? undefined }),
          () => reasons.push({ type: 'outside-room-boundary', roomId: b.sourceId ?? undefined, roomName: b.name ?? undefined, target: 'chair' }),
        )
      } else if (b.kind === 'department-zone') {
        checkContainment(
          b.polygon,
          () => reasons.push({ type: 'outside-department-zone', zoneId: b.sourceId ?? undefined, zoneName: b.name ?? undefined }),
          () => reasons.push({ type: 'outside-department-zone', zoneId: b.sourceId ?? undefined, zoneName: b.name ?? undefined, target: 'chair' }),
        )
      } else {
        if (!polygonContainsBBox(b.polygon, deskBounds, tolerance)) {
          reasons.push({ type: 'outside-boundary' })
        }
      }
    }
  }

  // 4. Legacy single boundary
  if (context.boundary && !room && !deptZone && !context.boundaries) {
    if (context.boundary.kind === 'room-boundary') {
      checkContainment(
        context.boundary.polygon,
        () => reasons.push({ type: 'outside-room-boundary', roomId: context.boundary!.sourceId ?? undefined, roomName: context.boundary!.name ?? undefined }),
        () => reasons.push({ type: 'outside-room-boundary', roomId: context.boundary!.sourceId ?? undefined, roomName: context.boundary!.name ?? undefined, target: 'chair' }),
      )
    } else if (context.boundary.kind === 'department-zone') {
      checkContainment(
        context.boundary.polygon,
        () => reasons.push({ type: 'outside-department-zone', zoneId: context.boundary!.sourceId ?? undefined, zoneName: context.boundary!.name ?? undefined }),
        () => reasons.push({ type: 'outside-department-zone', zoneId: context.boundary!.sourceId ?? undefined, zoneName: context.boundary!.name ?? undefined, target: 'chair' }),
      )
    } else {
      if (!polygonContainsBBox(context.boundary.polygon, deskBounds, tolerance)) {
        reasons.push({ type: 'outside-boundary' })
      }
    }
  }

  // 5. Workstation-to-Workstation and Chair Overlaps
  for (const other of context.others) {
    if (other.entityId === candidate.entityId) continue
    const otherDeskBounds = placementBounds(other)
    const otherChairBounds = getChairBounds(other, context.chairTileSize)

    // Desk-to-Desk
    if (bboxesTouch(deskBounds, otherDeskBounds, tolerance) && bboxesOverlap(deskBounds, otherDeskBounds, tolerance)) {
      reasons.push({ type: 'overlap', entityId: other.entityId })
      continue
    }

    // Candidate Chair vs Other Desk
    if (
      chairBounds &&
      bboxesTouch(chairBounds, otherDeskBounds, tolerance) &&
      bboxesOverlap(chairBounds, otherDeskBounds, tolerance)
    ) {
      reasons.push({ type: 'overlap', entityId: other.entityId, target: 'chair' })
      continue
    }

    // Candidate Desk vs Other Chair
    if (
      otherChairBounds &&
      bboxesTouch(deskBounds, otherChairBounds, tolerance) &&
      bboxesOverlap(deskBounds, otherChairBounds, tolerance)
    ) {
      reasons.push({ type: 'overlap', entityId: other.entityId, target: 'chair' })
      continue
    }

    // Candidate Chair vs Other Chair
    if (
      chairBounds &&
      otherChairBounds &&
      bboxesTouch(chairBounds, otherChairBounds, tolerance) &&
      bboxesOverlap(chairBounds, otherChairBounds, tolerance)
    ) {
      reasons.push({ type: 'overlap', entityId: other.entityId, target: 'chair' })
    }
  }

  // 6. Obstacles: Solid (columns, walls) and Clearance (door clearances)
  if (context.obstacles) {
    for (const obs of context.obstacles) {
      const deskCollided = obstacleIntersects(deskBounds, obs, tolerance)
      const chairCollided = !deskCollided && chairBounds ? obstacleIntersects(chairBounds, obs, tolerance) : false

      if (deskCollided) {
        if (obs.kind === 'door-clearance') {
          reasons.push({
            type: 'clearance-conflict',
            obstacleId: obs.id,
            obstacleKind: 'door-clearance',
            obstacleName: obs.name ?? undefined,
          })
        } else {
          reasons.push({
            type: 'obstacle-collision',
            obstacleId: obs.id,
            obstacleKind: obs.kind,
            obstacleName: obs.name ?? undefined,
          })
        }
      } else if (chairCollided) {
        if (obs.kind === 'door-clearance') {
          reasons.push({
            type: 'clearance-conflict',
            obstacleId: obs.id,
            obstacleKind: 'door-clearance',
            obstacleName: obs.name ?? undefined,
            target: 'chair',
          })
        } else {
          reasons.push({
            type: 'obstacle-collision',
            obstacleId: obs.id,
            obstacleKind: obs.kind,
            obstacleName: obs.name ?? undefined,
            target: 'chair',
          })
        }
      }
    }
  }

  return reasons.length === 0 ? PLACEMENT_VALID : { valid: false, reasons }
}

/**
 * Validates every placement against every other. O(n²) on purpose: the edited
 * scope is tens of objects, and a spatial index here would be untested weight.
 */
export function validateAll(
  placements: readonly SpatialPlacement[],
  boundaryOrContext: PlacementBoundary | PlacementContext | null,
  tolerance?: number,
): Map<string, PlacementValidation> {
  const contextBase: Partial<PlacementContext> =
    boundaryOrContext && 'others' in boundaryOrContext
      ? boundaryOrContext
      : { boundary: boundaryOrContext, tolerance }

  const result = new Map<string, PlacementValidation>()
  for (const placement of placements) {
    result.set(
      placement.entityId,
      validatePlacement(placement, {
        ...contextBase,
        others: placements,
        tolerance: contextBase.tolerance ?? tolerance,
      }),
    )
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
