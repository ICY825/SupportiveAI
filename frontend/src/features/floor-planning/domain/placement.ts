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
  polygonContainsPolygon,
  polygonContainsBBox,
  polygonArea,
  polygonsOverlap,
  rectangle,
  rotatePoint,
  rotateQuarter,
  segmentsCross,
} from './geometry'
import type { BBox, FloorObstacle, Point, Room, Segment, VerificationState, Zone } from './spatial'

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
  /** Real clockwise angle in degrees. Quarter turns remain exact integers. */
  rotation: number
  /** Optional chair seating footprint (nominal 1 tile / 600mm) */
  chair?: {
    bbox: BBox
    center?: Point
    /** Optional oriented chair polygon carried through edited scenes. */
    polygon?: Point[]
    width?: number
    depth?: number
    rotation?: number
  } | null
  /** Optional seated side override ('north' | 'south' | 'east' | 'west' | 'top' | 'bottom' | 'left' | 'right') */
  seatedSide?: 'north' | 'south' | 'east' | 'west' | 'top' | 'bottom' | 'left' | 'right'
  /** A persisted human decision that this placement may disagree with the drawing. */
  override?: PlacementOverride | null
}

export interface PlacementOverride {
  reason: string
  conflicts: PlacementIssue[]
  actorId?: string | null
  recordedAt?: string | null
}

/** A logical grid, not a drawn one. The renderer reads it; it does not own it. */
export interface SpatialGrid {
  origin: Point
  /** floor points */
  cellSize: number
}

export type PlacementBoundaryKind =
  | 'floor-plate'
  | 'room-boundary'
  | 'department-zone'
  | 'zone-annotation'
  | 'scene-scope'

export type PlacementIssueSeverity = 'hard' | 'overridable'
export type PlacementIssue =
  | { type: 'overlap'; entityId: string; target?: 'desk' | 'chair'; severity?: PlacementIssueSeverity }
  | { type: 'outside-boundary'; target?: 'desk' | 'chair'; severity?: PlacementIssueSeverity }
  | { type: 'invalid-dimensions'; severity?: PlacementIssueSeverity }
  | { type: 'outside-room-boundary'; roomId?: string; roomName?: string; target?: 'desk' | 'chair'; severity?: PlacementIssueSeverity }
  | { type: 'outside-department-zone'; zoneId?: string; zoneName?: string; target?: 'desk' | 'chair'; severity?: PlacementIssueSeverity }
  | { type: 'obstacle-collision'; obstacleId: string; obstacleKind: 'column' | 'wall'; obstacleName?: string; target?: 'desk' | 'chair'; severity?: PlacementIssueSeverity }
  | { type: 'clearance-conflict'; obstacleId: string; obstacleKind: 'door-clearance'; obstacleName?: string; target?: 'desk' | 'chair'; severity?: PlacementIssueSeverity }

export interface PlacementValidation {
  valid: boolean
  reasons: PlacementIssue[]
  /** True when the only conflicts can be saved after explicit confirmation. */
  requiresOverride?: boolean
  hardReasons?: PlacementIssue[]
  overridableReasons?: PlacementIssue[]
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
  verification?: VerificationState
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
  floorBoundary?: PlacementBoundary | null
  roomBoundary?: PlacementBoundary | Room | null
  departmentZone?: PlacementBoundary | Zone | null
  room?: PlacementBoundary | Room | null
  zone?: PlacementBoundary | Zone | null
  boundaries?: readonly PlacementBoundary[]
  obstacles?: readonly FloorObstacle[]
  /** Straight extracted wall/partition runs used for physical collision checks. */
  wallSegments?: readonly Segment[]
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

const issue = <T extends PlacementIssue>(value: T, severity: PlacementIssueSeverity): T => {
  // Keep the old structural shape for callers that construct and compare
  // issues, while exposing the policy to new callers through normal property
  // access and serializing it explicitly at the persistence boundary.
  Object.defineProperty(value, 'severity', { value: severity, enumerable: false, configurable: true })
  return value
}

const policy = (reasons: PlacementIssue[]): PlacementValidation => {
  const hardReasons = reasons.filter((reason) => reason.severity !== 'overridable')
  const overridableReasons = reasons.filter((reason) => reason.severity === 'overridable')
  if (reasons.length === 0) return PLACEMENT_VALID
  const result: PlacementValidation = { valid: hardReasons.length === 0, reasons }
  Object.defineProperties(result, {
    requiresOverride: { value: hardReasons.length === 0 && overridableReasons.length > 0, enumerable: false },
    hardReasons: { value: hardReasons, enumerable: false },
    overridableReasons: { value: overridableReasons, enumerable: false },
  })
  return result
}

export const hardPlacementReasons = (validation: PlacementValidation): PlacementIssue[] =>
  validation.hardReasons ?? validation.reasons.filter((reason) => reason.severity !== 'overridable')

export const overridablePlacementReasons = (validation: PlacementValidation): PlacementIssue[] =>
  validation.overridableReasons ?? validation.reasons.filter((reason) => reason.severity === 'overridable')

export function normalizeRotation(deg: number): QuarterRotation {
  const turns = Math.round(deg / 90)
  return ((((turns % 4) + 4) % 4) * 90) as QuarterRotation
}

/**
 * Wraps a measured angle into [0, 360) without snapping it to a quarter.
 *
 * The counterpart to `normalizeRotation`: use that one where a value must be
 * one of the four editable facings, and this one wherever the angle the
 * drawing actually carries has to survive. Floor 16 has 18 desks measured at
 * 44.5°–45.5° along the angled facade, and `Math.round(45 / 90)` is 1 — so
 * rounding reports them as turned a full quarter from where they are drawn.
 */
export const wrapRotation = (deg: number): number => ((deg % 360) + 360) % 360

/** Rotation swaps the footprint: a 1200×600 desk turned 90° occupies 600×1200. */
export function placementFootprint(placement: SpatialPlacement): { width: number; depth: number } {
  const quarter = ((placement.rotation % 360) + 360) % 360
  if (quarter === 0 || quarter === 180) return { width: placement.width, depth: placement.depth }
  if (quarter === 90 || quarter === 270) return { width: placement.depth, depth: placement.width }
  const radians = (placement.rotation * Math.PI) / 180
  return {
    width: Math.abs(placement.width * Math.cos(radians)) + Math.abs(placement.depth * Math.sin(radians)),
    depth: Math.abs(placement.width * Math.sin(radians)) + Math.abs(placement.depth * Math.cos(radians)),
  }
}

/** The four corners of the actual oriented footprint, clockwise on screen. */
export function placementCorners(placement: SpatialPlacement): Point[] {
  const normalized = ((placement.rotation % 360) + 360) % 360
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    const { width, depth } = placementFootprint(placement)
    return rectangle([placement.x - width / 2, placement.y - depth / 2, placement.x + width / 2, placement.y + depth / 2])
  }
  const halfWidth = placement.width / 2
  const halfDepth = placement.depth / 2
  const origin: Point = [placement.x, placement.y]
  const corners: Point[] = [
    [placement.x - halfWidth, placement.y - halfDepth],
    [placement.x + halfWidth, placement.y - halfDepth],
    [placement.x + halfWidth, placement.y + halfDepth],
    [placement.x - halfWidth, placement.y + halfDepth],
  ]
  return corners.map((point) => rotatePoint(point, origin, placement.rotation))
}

function placementLeadingCorner(placement: SpatialPlacement): Point {
  const normalized = ((placement.rotation % 360) + 360) % 360
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    const [x0, y0] = placementBounds(placement)
    return [x0, y0]
  }
  return placementCorners(placement)[0]
}

export function placementBounds(placement: SpatialPlacement): BBox {
  return bboxOfPoints(placementCorners(placement))
}

export const placementPolygon = (placement: SpatialPlacement): Point[] => placementCorners(placement)

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
        polygon: placement.chair.polygon?.map(([x, y]) => [x + dx, y + dy] as Point),
        center: placement.chair.center
          ? ([placement.chair.center[0] + dx, placement.chair.center[1] + dy] as Point)
          : undefined,
      }
    : placement.chair
  return { ...placement, x: placement.x + dx, y: placement.y + dy, chair }
}

export function rotatePlacementBy(placement: SpatialPlacement, deg: number): SpatialPlacement {
  const rotation = wrapRotation(placement.rotation + deg)
  if (rotation === placement.rotation) return placement
  const origin: Point = [placement.x, placement.y]
  const chair = placement.chair
    ? {
        ...placement.chair,
        bbox: transformBBox(placement.chair.bbox, (p) => rotatePoint(p, origin, deg)),
        polygon: placement.chair.polygon?.map((p) => rotatePoint(p, origin, deg)),
        center: placement.chair.center ? rotatePoint(placement.chair.center, origin, deg) : undefined,
        rotation: placement.chair.rotation === undefined ? undefined : wrapRotation(placement.chair.rotation + deg),
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
  const corners = getChairCorners(placement, chairTileSize)
  return corners ? bboxOfPoints(corners) : null
}

/** Oriented chair/occupant clearance used by preview, validation and render. */
export function getChairCorners(
  placement: SpatialPlacement,
  chairTileSize?: number,
): Point[] | null {
  if (placement.chair?.polygon && placement.chair.polygon.length >= 3) return placement.chair.polygon
  if (placement.chair?.center && placement.chair.width && placement.chair.depth) {
    const center = placement.chair.center
    const halfWidth = placement.chair.width / 2
    const halfDepth = placement.chair.depth / 2
    const chairRotation = placement.chair.rotation ?? placement.rotation
    const corners: Point[] = [
      [center[0] - halfWidth, center[1] - halfDepth],
      [center[0] + halfWidth, center[1] - halfDepth],
      [center[0] + halfWidth, center[1] + halfDepth],
      [center[0] - halfWidth, center[1] + halfDepth],
    ]
    return corners.map((point) => rotatePoint(point, center, chairRotation))
  }
  if (placement.chair?.bbox) return rectangle(placement.chair.bbox)
  const side = placement.seatedSide
  if (!side && (!chairTileSize || chairTileSize <= 0)) {
    return null
  }
  // Preserve the established world-facing fallback for old quarter-turn
  // callers that do not carry seatedSide. New placements carry a side and use
  // the oriented path below; measured diagonal desks use the default local
  // south side so their chair rotates with the desk.
  if (!side && [0, 90, 180, 270].includes(((placement.rotation % 360) + 360) % 360)) {
    const tile = chairTileSize ?? placement.depth
    const [x0, y0, x1, y1] = placementBounds(placement)
    switch (((placement.rotation % 360) + 360) % 360) {
      case 90: return rectangle([x0 - tile, y0, x0, y1])
      case 180: return rectangle([x0, y0 - tile, x1, y0])
      case 270: return rectangle([x1, y0, x1 + tile, y1])
      default: return rectangle([x0, y1, x1, y1 + tile])
    }
  }
  const tileSize =
    chairTileSize && chairTileSize > 0
      ? chairTileSize
      : placement.depth
  const localSide = side === 'north' || side === 'top' ? 'north'
    : side === 'west' || side === 'left' ? 'west'
      : side === 'east' || side === 'right' ? 'east' : 'south'
  const direction = localSide === 'north' ? [0, -1] : localSide === 'west' ? [-1, 0] : localSide === 'east' ? [1, 0] : [0, 1]
  // East/west leave through the local X edge; north/south leave through Y.
  const normalDistance = (localSide === 'north' || localSide === 'south')
    ? placement.depth / 2 + tileSize / 2
    : placement.width / 2 + tileSize / 2
  const center = rotatePoint([
    placement.x + direction[0] * normalDistance,
    placement.y + direction[1] * normalDistance,
  ], [placement.x, placement.y], placement.rotation)
  const half = tileSize / 2
  const localCorners: Point[] = [
    [center[0] - half, center[1] - half],
    [center[0] + half, center[1] - half],
    [center[0] + half, center[1] + half],
    [center[0] - half, center[1] + half],
  ]
  return localCorners.map((point) => rotatePoint(point, center, placement.rotation))
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
  if (placement.rotation % 90 === 0) {
    const [x0, y0] = placementBounds(placement)
    const [sx, sy] = snapPointToGrid([x0, y0], grid)
    const { width, depth } = placementFootprint(placement)
    return placementAt(placement, [sx + width / 2, sy + depth / 2])
  }
  const origin: Point = [placement.x, placement.y]
  const leadingCorner = placementLeadingCorner(placement)
  const localOrigin = rotatePoint(grid.origin, origin, -placement.rotation)
  const localCorner = rotatePoint(leadingCorner, origin, -placement.rotation)
  const snappedLocal = snapPointToGrid(localCorner, { origin: localOrigin, cellSize: grid.cellSize })
  const snappedCorner = rotatePoint(snappedLocal, origin, placement.rotation)
  return placementAt(placement, [
    placement.x + snappedCorner[0] - leadingCorner[0],
    placement.y + snappedCorner[1] - leadingCorner[1],
  ])
}

/* ------------------------------------------------------------- validation */

/** Share area. Two placements flush against each other do NOT intersect. */
export function intersects(a: SpatialPlacement, b: SpatialPlacement, tolerance = GEOMETRY_EPSILON): boolean {
  if (!bboxesTouch(placementBounds(a), placementBounds(b), tolerance)) return false
  return orientedPolygonsOverlap(placementPolygon(a), placementPolygon(b), tolerance)
}

/** Separating-axis collision for convex oriented rectangles (desk or chair). */
export function orientedPolygonsOverlap(
  a: readonly Point[],
  b: readonly Point[],
  tolerance = GEOMETRY_EPSILON,
): boolean {
  const axes: Point[] = []
  for (const polygon of [a, b]) {
    for (let index = 0; index < polygon.length; index++) {
      const point = polygon[index]
      const next = polygon[(index + 1) % polygon.length]
      const dx = next[0] - point[0]
      const dy = next[1] - point[1]
      const length = Math.hypot(dx, dy)
      if (length > GEOMETRY_EPSILON) axes.push([-dy / length, dx / length])
    }
  }
  for (const [nx, ny] of axes) {
    const project = (polygon: readonly Point[]) => polygon.reduce<[number, number]>((range, [x, y]) => {
      const value = x * nx + y * ny
      return [Math.min(range[0], value), Math.max(range[1], value)]
    }, [Infinity, -Infinity])
    const pa = project(a)
    const pb = project(b)
    if (pa[1] <= pb[0] + tolerance || pb[1] <= pa[0] + tolerance) return false
  }
  return true
}

/** A wall run a desk can be aligned against, and how far away it is. */
export interface NearestWall {
  /** Direction of the wall run itself, in [0, 180). A line has no facing. */
  angle: number
  /** Floor-unit distance from the placement centre to the closest point on it. */
  distance: number
  /** That closest point, which is what decides the side the desk backs onto. */
  foot: Point
}

/**
 * The closest alignable wall run to a placement, within `maxDistance`.
 *
 * Takes segments rather than obstacles on purpose. `FloorObstacle` only holds
 * what placement has to avoid — on Floor 16 that is 34 columns, 90 door
 * clearances and 4 axis-aligned wall rectangles, so an obstacle-derived angle
 * can never be anything but a quarter turn. The angled runs the diagonal desks
 * follow are in the `walls` and `facade` base layers; `sceneWallSegments`
 * reads them, already clipped to the scene's context window.
 *
 * `maxDistance` matters as much as the angle. Without it the nearest wall to a
 * desk in the middle of a floor plate is metres away and behind furniture, and
 * aligning to it moves the desk for a reason nobody can see on screen.
 */
export function nearestWall(
  placement: SpatialPlacement,
  segments: readonly Segment[],
  maxDistance = Infinity,
): NearestWall | null {
  let best: NearestWall | null = null
  for (const [a, b] of segments) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) continue
    const t = Math.max(0, Math.min(1, ((placement.x - a[0]) * dx + (placement.y - a[1]) * dy) / lengthSquared))
    const foot: Point = [a[0] + t * dx, a[1] + t * dy]
    const distance = Math.hypot(placement.x - foot[0], placement.y - foot[1])
    if (distance > maxDistance) continue
    if (best && distance >= best.distance) continue
    best = { angle: wrapRotation(Math.atan2(dy, dx) * 180 / Math.PI) % 180, distance, foot }
  }
  return best
}

/**
 * The rotation that lays a placement along `wall` with its occupant facing out.
 *
 * A wall run is a line, so it offers two rotations 180° apart. Picking either
 * one leaves the desk facing into the wall half the time, which is the same
 * defect as not aligning at all. The seated side — local +Y, the side
 * `getChairCorners` puts the chair on — is pointed away from the wall instead.
 */
export function rotationAlignedTo(placement: SpatialPlacement, wall: NearestWall): number {
  const toWall: Point = [wall.foot[0] - placement.x, wall.foot[1] - placement.y]
  const candidates = [wall.angle, wrapRotation(wall.angle + 180)]
  let bestRotation = candidates[0]
  let bestDot = Infinity
  for (const rotation of candidates) {
    const radians = (rotation * Math.PI) / 180
    // Local +Y (the seated side) carried into floor coordinates.
    const seated: Point = [-Math.sin(radians), Math.cos(radians)]
    const dot = seated[0] * toWall[0] + seated[1] * toWall[1]
    if (dot < bestDot) {
      bestDot = dot
      bestRotation = rotation
    }
  }
  return bestRotation
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

/** Collision path for an oriented desk or chair; keeps the AABB as broad phase. */
export function obstacleIntersectsPolygon(
  candidatePolygon: readonly Point[],
  obstacle: FloorObstacle,
  tolerance = GEOMETRY_EPSILON,
): boolean {
  if (!bboxesTouch(bboxOfPoints(candidatePolygon), obstacle.bbox, tolerance)) return false
  return polygonsOverlap(candidatePolygon, obstacle.polygon, tolerance)
}

/** True when a zero-width wall run enters a polygon's interior; flush contact is clear. */
export function wallSegmentIntersectsPolygon(
  segment: Segment,
  polygon: readonly Point[],
  tolerance = GEOMETRY_EPSILON,
): boolean {
  if (polygon.length < 3) return false
  const [a, b] = segment
  const strictlyInside = (point: Point) => {
    if (!pointInPolygon(point, polygon)) return false
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index]
      const end = polygon[(index + 1) % polygon.length]
      const length = Math.hypot(end[0] - start[0], end[1] - start[1])
      const cross = (point[0] - start[0]) * (end[1] - start[1]) - (point[1] - start[1]) * (end[0] - start[0])
      const along = (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1])
      if (Math.abs(cross) <= GEOMETRY_EPSILON * Math.max(length, 1) && along >= -GEOMETRY_EPSILON && along <= length * length + GEOMETRY_EPSILON) return false
    }
    return true
  }
  let intersectsInterior = strictlyInside(a) || strictlyInside(b)
  const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  intersectsInterior ||= strictlyInside(midpoint)
  for (let index = 0; index < polygon.length && !intersectsInterior; index += 1) {
    const edgeStart = polygon[index]
    const edgeEnd = polygon[(index + 1) % polygon.length]
    intersectsInterior = segmentsCross(a, b, edgeStart, edgeEnd)
  }
  if (!intersectsInterior) return false

  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (length <= GEOMETRY_EPSILON) return false
  let positive = 0
  let negative = 0
  for (const point of polygon) {
    const distance = ((point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0])) / length
    positive = Math.max(positive, distance)
    negative = Math.max(negative, -distance)
  }
  return Math.min(positive, negative) > tolerance
}

/**
 * Geometry only. Issues are returned as data so wording lives in the UI layer
 * and the same rules can be reported in a log, an API response or a tooltip.
 */
export function validatePlacement(candidate: SpatialPlacement, context: PlacementContext): PlacementValidation {
  const reasons: PlacementIssue[] = []
  const geometrySeverity = (verification?: VerificationState): PlacementIssueSeverity =>
    verification === 'EXTRACTED' || verification === 'UNVERIFIED' ? 'overridable' : 'hard'
  const push = <T extends PlacementIssue>(value: T, severity: PlacementIssueSeverity = 'hard') => reasons.push(issue(value, severity))
  if (!Number.isFinite(candidate.width) || !Number.isFinite(candidate.depth) || candidate.width <= 0 || candidate.depth <= 0) {
    push({ type: 'invalid-dimensions' })
  }
  const deskBounds = placementBounds(candidate)
  const deskPolygon = placementPolygon(candidate)
  const tolerance = context.tolerance ?? GEOMETRY_EPSILON
  const boundaryTolerance = context.boundaryTolerance ?? tolerance
  const chairPolygon = getChairCorners(candidate, context.chairTileSize)
  const chairBounds = chairPolygon ? bboxOfPoints(chairPolygon) : null
  const contains = (polygon: Point[], subject: readonly Point[], bounds: BBox, epsilon: number) =>
    candidate.rotation % 90 === 0 ? polygonContainsBBox(polygon, bounds, epsilon) : polygonContainsPolygon(polygon, subject, epsilon)

  const checkContainment = (
    polygon: Point[],
    onDeskOutside: () => void,
    onChairOutside: () => void,
  ) => {
    if (!contains(polygon, deskPolygon, deskBounds, boundaryTolerance)) {
      onDeskOutside()
    } else if (chairPolygon && chairBounds && !contains(polygon, chairPolygon, chairBounds, boundaryTolerance)) {
      onChairOutside()
    }
  }

  // 1. Room boundary containment
  const room = context.roomBoundary ?? context.room
  if (room) {
    const roomId = ('sourceId' in room ? room.sourceId : room.id) ?? undefined
    const roomName = room.name ?? undefined
    const severity = geometrySeverity('verification' in room ? room.verification : undefined)
    checkContainment(
      room.polygon,
      () => push({ type: 'outside-room-boundary', roomId, roomName }, severity),
      () => push({ type: 'outside-room-boundary', roomId, roomName, target: 'chair' }, severity),
    )
  }

  // 2. Department zones are labels, not physical containment constraints.
  // 3. Multi-boundaries array
  if (context.boundaries) {
    for (const b of context.boundaries) {
      if (b.kind === 'room-boundary') {
        const severity = geometrySeverity(b.verification)
        checkContainment(
          b.polygon,
          () => push({ type: 'outside-room-boundary', roomId: b.sourceId ?? undefined, roomName: b.name ?? undefined }, severity),
          () => push({ type: 'outside-room-boundary', roomId: b.sourceId ?? undefined, roomName: b.name ?? undefined, target: 'chair' }, severity),
        )
      } else if (b.kind !== 'department-zone' && b.kind !== 'zone-annotation' && b.kind !== 'scene-scope') {
        if (!contains(b.polygon, deskPolygon, deskBounds, tolerance)) {
          push({ type: 'outside-boundary' })
        }
      }
    }
  }

  // 4. Legacy single boundary
  if (context.boundary && !room && !context.boundaries) {
    if (context.boundary.kind === 'room-boundary') {
      const severity = geometrySeverity(context.boundary.verification)
      checkContainment(
        context.boundary.polygon,
        () => push({ type: 'outside-room-boundary', roomId: context.boundary!.sourceId ?? undefined, roomName: context.boundary!.name ?? undefined }, severity),
        () => push({ type: 'outside-room-boundary', roomId: context.boundary!.sourceId ?? undefined, roomName: context.boundary!.name ?? undefined, target: 'chair' }, severity),
      )
    } else if (context.boundary.kind !== 'department-zone' && context.boundary.kind !== 'zone-annotation' && context.boundary.kind !== 'scene-scope') {
      if (!contains(context.boundary.polygon, deskPolygon, deskBounds, tolerance)) {
        push({ type: 'outside-boundary' })
      }
    }
  }

  // The floor plate is always a hard boundary, independent of zone confidence.
  if (context.floorBoundary && !contains(context.floorBoundary.polygon, deskPolygon, deskBounds, boundaryTolerance)) {
    push({ type: 'outside-boundary' })
  }

  // 4. Workstation-to-Workstation and Chair Overlaps
  for (const other of context.others) {
    if (other.entityId === candidate.entityId) continue
    const otherDeskBounds = placementBounds(other)
    const otherDeskPolygon = placementPolygon(other)
    const otherChairPolygon = getChairCorners(other, context.chairTileSize)
    const otherChairBounds = otherChairPolygon ? bboxOfPoints(otherChairPolygon) : null

    // Desk-to-Desk
    if (bboxesTouch(deskBounds, otherDeskBounds, tolerance) && orientedPolygonsOverlap(deskPolygon, otherDeskPolygon, tolerance)) {
      push({ type: 'overlap', entityId: other.entityId })
      continue
    }

    // Candidate Chair vs Other Desk
    if (
      chairPolygon && chairBounds &&
      bboxesTouch(chairBounds, otherDeskBounds, tolerance) &&
      orientedPolygonsOverlap(chairPolygon, otherDeskPolygon, tolerance)
    ) {
      push({ type: 'overlap', entityId: other.entityId, target: 'chair' })
      continue
    }

    // Candidate Desk vs Other Chair
    if (
      otherChairPolygon && otherChairBounds &&
      bboxesTouch(deskBounds, otherChairBounds, tolerance) &&
      orientedPolygonsOverlap(deskPolygon, otherChairPolygon, tolerance)
    ) {
      push({ type: 'overlap', entityId: other.entityId, target: 'chair' })
      continue
    }

    // Candidate Chair vs Other Chair
    if (
      chairPolygon && otherChairPolygon && chairBounds && otherChairBounds &&
      bboxesTouch(chairBounds, otherChairBounds, tolerance) &&
      orientedPolygonsOverlap(chairPolygon, otherChairPolygon, tolerance)
    ) {
      push({ type: 'overlap', entityId: other.entityId, target: 'chair' })
    }
  }

  // 5. Extracted wall runs. Flush contact is valid; interior penetration is
  // overridable because source paths may omit openings or carry drafting error.
  for (const [index, segment] of (context.wallSegments ?? []).entries()) {
    const deskCollided = wallSegmentIntersectsPolygon(segment, deskPolygon, tolerance)
    const chairCollided = !deskCollided && chairPolygon ? wallSegmentIntersectsPolygon(segment, chairPolygon, tolerance) : false
    if (deskCollided || chairCollided) {
      push({
        type: 'obstacle-collision',
        obstacleId: `wall-segment-${index}`,
        obstacleKind: 'wall',
        target: chairCollided ? 'chair' : undefined,
      }, 'overridable')
    }
  }

  // 6. Obstacles: Solid (columns, walls) and Clearance (door clearances)
  if (context.obstacles) {
    for (const obs of context.obstacles) {
      const severity = geometrySeverity(obs.verification)
      const deskCollided = obstacleIntersectsPolygon(deskPolygon, obs, tolerance)
      const chairCollided = !deskCollided && chairPolygon ? obstacleIntersectsPolygon(chairPolygon, obs, tolerance) : false

      if (deskCollided) {
        if (obs.kind === 'door-clearance') {
          push({
            type: 'clearance-conflict',
            obstacleId: obs.id,
            obstacleKind: 'door-clearance',
            obstacleName: obs.name ?? undefined,
          }, severity)
        } else {
          push({
            type: 'obstacle-collision',
            obstacleId: obs.id,
            obstacleKind: obs.kind,
            obstacleName: obs.name ?? undefined,
          }, severity)
        }
      } else if (chairCollided) {
        if (obs.kind === 'door-clearance') {
          push({
            type: 'clearance-conflict',
            obstacleId: obs.id,
            obstacleKind: 'door-clearance',
            obstacleName: obs.name ?? undefined,
            target: 'chair',
          }, severity)
        } else {
          push({
            type: 'obstacle-collision',
            obstacleId: obs.id,
            obstacleKind: obs.kind,
            obstacleName: obs.name ?? undefined,
            target: 'chair',
          }, severity)
        }
      }
    }
  }

  return policy(reasons)
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
  const turn = wrapRotation(current.rotation - base.rotation)
  const origin: Point = [base.x, base.y]
  const dx = current.x - base.x
  const dy = current.y - base.y
  if (turn === 0 && dx === 0 && dy === 0) return (point) => point
  return (point) => {
    const rotated = turn === 90 || turn === 180 || turn === 270
      ? rotateQuarter(point, origin, turn)
      : rotatePoint(point, origin, turn)
    const [rx, ry] = rotated
    return [rx + dx, ry + dy]
  }
}
