/**
 * The editable layer over an authoritative floor dataset.
 *
 *   authoritative dataset (read-only, extracted from the source drawing)
 *        │
 *        ├── base placements        derived once, never mutated
 *        │
 *        └── LayoutDraft            what the editor changes
 *                 │  save
 *                 ▼
 *            LayoutStore            where a committed layout goes
 *
 * The dataset is never written to. Editing produces placements; the renderer
 * derives geometry from them. Nothing in this file touches React or the DOM.
 */
import { bboxOfPoints, pointInPolygon, rectangle } from '../domain/geometry'
import { roomParts } from '../domain/roomOutline'
import {
  normalizeRotation,
  placementCorners,
  placementBounds,
  placementsEqual,
  placementTransform,
  transformBBox,
  validatePlacement,
  wrapRotation,
  type PlacementBoundary,
  type PlacementValidation,
  type SpatialGrid,
  type SpatialPlacement,
} from '../domain/placement'
import type { BBox, FloorDataset, FloorObstacle, Point, Segment, Workstation } from '../domain/spatial'
import { sceneWallSegments, type WorkspaceSceneModel } from './scene'

/** Planning module for the edit grid. One desk depth; a desk is two cells wide. */
export const GRID_CELL_MM = 600

/**
 * Interpenetration allowed before two objects count as overlapping.
 *
 * The extractor reports nominally identical desks as 595–609 mm deep, so two
 * of them snapped into adjacent 600 mm cells can share a few millimetres. That
 * is drawing tolerance, not a layout conflict.
 */
export const PLACEMENT_TOLERANCE_MM = 40

/**
 * How far an object may sit outside a zone or room outline before it counts.
 *
 * Those outlines are PDF annotations drawn by hand over the CAD sheet, not
 * measured geometry — Floor 16's own zone edges are up to 2° off the axis they
 * were aimed at. Judged at furniture tolerance, the extraction contradicts
 * itself: the chairs of `ws-16-367` and `ws-16-369` sit 79 mm and 44 mm past
 * the AI zone line, so Area F opened with two desks already invalid and Save
 * blocked, before anyone had moved anything.
 *
 * 100 mm clears the worst observed drafting error with margin and is a sixth of
 * a desk depth, so nothing can drift out of its zone behind it.
 */
export const ANNOTATION_TOLERANCE_MM = 100

/**
 * How near a wall has to be before "align to the nearest wall" will use it.
 *
 * Measured against Floor 16: the desks that follow the angled facade sit
 * 0.59-3.10 m from the run they follow, so 4 m reaches the wall a desk is
 * plainly beside and stops short of one across the room. Past this the action
 * does nothing, which is the honest outcome — there is no wall to align to.
 */
export const WALL_ALIGN_MAX_DISTANCE_MM = 4000

export interface LayoutDraft {
  placements: Record<string, SpatialPlacement>
}

/* ------------------------------------------------------- base placements */

/**
 * Disambiguates a workstation's canonical 4-way quarter rotation (0°, 90°, 180°, 270°)
 * from its paired chair position relative to desk center.
 */
export function determineWorkstationRotation(ws: Workstation): number {
  if (ws.rotationDeg % 90 !== 0) return wrapRotation(ws.rotationDeg)
  if (ws.chair) {
    const dx = ws.chair.center[0] - ws.center[0]
    const dy = ws.chair.center[1] - ws.center[1]
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 270 : 90
    } else {
      return dy > 0 ? 0 : 180
    }
  }
  return normalizeRotation(ws.rotationDeg)
}

/**
 * A workstation's placement as the source drawing has it.
 *
 * `width`/`depth` are the footprint at rotation 0, so the stored bbox is read
 * back through the entity's own `rotationDeg`: a desk drawn turned 90° has a
 * 5.6×11.2 pt bbox but is still a 1200×600 desk.
 *
 * The centre comes from the bbox, not from `Workstation.center` (rounded in
 * the dataset), and is derived corner-plus-half-footprint — the same arithmetic
 * snapPlacementToGrid uses. Any other spelling of the midpoint differs by an
 * ULP, and then a desk nudged away and back would never compare equal to where
 * it started.
 */
export function placementFromWorkstation(ws: Workstation): SpatialPlacement {
  const [x0, y0, x1, y1] = ws.bbox
  // The extractor records the desk's footprint axis as 0/90. The paired chair
  // carries the missing facing direction, so preserve all four orientations in
  // the editor instead of making a new desk guess which side is occupied.
  const rotation = determineWorkstationRotation(ws)
  const sourceAngle = wrapRotation(ws.rotationDeg)
  const edges = ws.polygon.length >= 4
    ? ws.polygon.slice(0, 4).map((point, index) => {
      const next = ws.polygon[(index + 1) % 4]
      return { length: Math.hypot(next[0] - point[0], next[1] - point[1]), angle: wrapRotation(Math.atan2(next[1] - point[1], next[0] - point[0]) * 180 / Math.PI) }
    })
    : []
  const angleDistance = (a: number, b: number) => {
    const delta = Math.abs(((a - b + 90) % 180) - 90)
    return Math.min(delta, 180 - delta)
  }
  const widthEdge = edges.length >= 2 && angleDistance(edges[0].angle, sourceAngle) <= angleDistance(edges[1].angle, sourceAngle) ? edges[0] : edges[1]
  const depthEdge = edges.length >= 2 && widthEdge === edges[0] ? edges[1] : edges[0]
  const orthogonal = sourceAngle % 90 === 0
  const width = orthogonal
    ? (rotation % 180 === 0 ? x1 - x0 : y1 - y0)
    : (widthEdge?.length || ws.source?.nominalSizeMm?.[0] || x1 - x0)
  const depth = orthogonal
    ? (rotation % 180 === 0 ? y1 - y0 : x1 - x0)
    : (depthEdge?.length || ws.source?.nominalSizeMm?.[1] || y1 - y0)
  const chair = ws.chair
    ? {
      center: ws.chair.center,
      bbox: ws.chair.bbox,
      ...(orthogonal ? {} : { polygon: [...rectangle(ws.chair.bbox)] }),
    }
    : null
  return {
    entityId: ws.id,
    x: x0 + (x1 - x0) / 2,
    y: y0 + (y1 - y0) / 2,
    width,
    depth,
    rotation,
    chair,
  }
}

/**
 * The lattice ONE entity snaps to: the shared cell size, anchored on that
 * entity's own authoritative corner.
 *
 * A single floor-wide lattice cannot work on this data. The extracted desks
 * are not on a module — nominally identical desks come out 595–609 mm deep and
 * sit at irregular spacings — so a global origin puts almost every desk off
 * lattice, and the position it started in becomes unreachable: move it once and
 * it can never be put back. Anchoring per entity makes "move n cells and back"
 * exact, which is the behaviour the offset has to have.
 */
export const gridForEntity = (grid: SpatialGrid, base: SpatialPlacement | undefined): SpatialGrid => {
  if (!base) return grid
  const [x0, y0] = placementBounds(base)
  const origin = base.rotation % 90 === 0 ? [x0, y0] as Point : placementCorners(base)[0]
  return { origin, cellSize: grid.cellSize }
}

export function basePlacements(workstations: readonly Workstation[]): Record<string, SpatialPlacement> {
  const result: Record<string, SpatialPlacement> = {}
  for (const ws of workstations) result[ws.id] = placementFromWorkstation(ws)
  return result
}

/* -------------------------------------------------------------- the draft */

export const createDraft = (placements: Record<string, SpatialPlacement>): LayoutDraft => ({
  placements: { ...placements },
})

export const draftList = (draft: LayoutDraft): SpatialPlacement[] => Object.values(draft.placements)

export function setDraftPlacement(draft: LayoutDraft, placement: SpatialPlacement): LayoutDraft {
  const current = draft.placements[placement.entityId]
  if (current && placementsEqual(current, placement)) return draft
  return { placements: { ...draft.placements, [placement.entityId]: placement } }
}

/** Ids whose placement differs from the authoritative one. */
export function changedIds(draft: LayoutDraft, base: Record<string, SpatialPlacement>): string[] {
  return Object.keys(draft.placements).filter((id) => {
    const original = base[id]
    return !original || !placementsEqual(original, draft.placements[id])
  })
}

export const isDraftDirty = (draft: LayoutDraft, base: Record<string, SpatialPlacement>) =>
  changedIds(draft, base).length > 0

export function validateDraft(
  draft: LayoutDraft,
  boundaryOrArea: EditableArea | PlacementBoundary | null,
  tolerance?: number,
): Map<string, PlacementValidation> {
  const isArea = boundaryOrArea && 'grid' in boundaryOrArea
  const boundary = isArea ? boundaryOrArea.boundary : boundaryOrArea
  const roomBoundary = isArea ? boundaryOrArea.roomBoundary : null
  const departmentZone = isArea ? boundaryOrArea.departmentZone : null
  const obstacles = isArea ? boundaryOrArea.obstacles : (boundaryOrArea as any)?.obstacles ?? []
  const contextPlacements = isArea ? boundaryOrArea.contextPlacements ?? [] : []
  const effectiveTol = isArea ? boundaryOrArea.tolerance : tolerance
  const boundaryTolerance = isArea ? boundaryOrArea.boundaryTolerance : undefined
  const chairTileSize = isArea ? boundaryOrArea.chairTileSize : undefined

  const placements = draftList(draft)
  const others = contextPlacements.length ? [...placements, ...contextPlacements] : placements
  const editableIds = isArea ? boundaryOrArea.editableIds : undefined
  const editableSet = editableIds ? new Set(editableIds) : null
  const result = new Map<string, PlacementValidation>()
  for (const p of placements) {
    if (editableSet && !editableSet.has(p.entityId)) continue
    result.set(
      p.entityId,
      validatePlacement(p, {
        others,
        boundary,
        roomBoundary,
        departmentZone,
        obstacles,
        tolerance: effectiveTol,
        boundaryTolerance,
        chairTileSize,
      }),
    )
  }
  return result
}

export const draftIsValid = (validation: ReadonlyMap<string, PlacementValidation>) =>
  [...validation.values()].every((v) => v.valid)

/* ------------------------------------------------------- editable area */

export interface EditableArea {
  boundary: PlacementBoundary
  /** Target membership for the active UI area; absent means all placements. */
  editableIds?: readonly string[]
  /** Camera/edit affordance boundary, separate from physical validation geometry. */
  displayBoundary?: PlacementBoundary | null
  /** Canonical desks visible in context, but never editable or persisted. */
  contextPlacements?: readonly SpatialPlacement[]
  roomBoundary?: PlacementBoundary | null
  departmentZone?: PlacementBoundary | null
  obstacles: FloorObstacle[]
  /** Obstacles clipped to the visible context window for the edit overlay. */
  displayObstacles?: readonly FloorObstacle[]
  /** Alignable wall runs from the scene's architecture, for align-to-wall. */
  wallSegments?: readonly Segment[]
  /** see WALL_ALIGN_MAX_DISTANCE_MM */
  wallAlignMaxDistance?: number
  grid: SpatialGrid
  /** see PLACEMENT_TOLERANCE_MM */
  tolerance: number
  /** see ANNOTATION_TOLERANCE_MM */
  boundaryTolerance?: number
  chairTileSize?: number
}

/**
 * Where layout editing is allowed, and the grid it snaps to.
 *
 * Populates hierarchical roomBoundary, departmentZone, extracted obstacles,
 * and chairTileSize for full multi-layer collision validation.
 */
export function deriveEditableArea(dataset: FloorDataset, scene: WorkspaceSceneModel): EditableArea {
  // Pick the zone the desks on screen actually stand in, not simply the first
  // the scope lists. A department can span several zones — AI Platform is split
  // in two by the lift cores — and `zoneIds[0]` would then bound editing by a
  // polygon most of the desks are outside of.
  //
  // A boundary is one polygon, so a scope covering two zones at once still
  // resolves to the busier one. That is why editing is entered from a focused
  // area, and each area lies inside a single zone.
  const zoneTally = new Map<string, number>()
  for (const workstation of scene.workstations) {
    if (!workstation.zoneId) continue
    zoneTally.set(workstation.zoneId, (zoneTally.get(workstation.zoneId) ?? 0) + 1)
  }
  const busiestZone = [...zoneTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const zoneId = busiestZone ?? scene.resolvedScope.zoneIds[0] ?? null
  const zone = zoneId ? dataset.zones.find((z) => z.id === zoneId) : undefined
  // A bbox is a camera/display scope, never a physical editing boundary.
  const clippedZone = zone ? [...zone.polygon] : []

  const roomIds = new Set(
    scene.workstations
      .map((workstation) => dataset.rooms.find((candidate) => roomParts(candidate).some((part) => pointInPolygon(workstation.center, part)))?.id)
      .filter((id): id is string => Boolean(id)),
  )
  const room = roomIds.size === 1 ? dataset.rooms.find((candidate) => candidate.id === [...roomIds][0]) : undefined
  // A room in several pieces bounds editing by the piece the desks stand in.
  const roomPart = room && roomParts(room).find((part) => scene.workstations.some((workstation) => pointInPolygon(workstation.center, part)))
  const clippedRoom = roomPart ? [...roomPart] : []

  const departmentZone: PlacementBoundary | null =
    clippedZone.length >= 3
      ? {
          polygon: clippedZone,
          bbox: bboxOfPoints(clippedZone),
          kind: 'department-zone',
          sourceId: zone?.id ?? null,
          name: zone?.name ?? null,
        }
      : null

  const roomBoundary: PlacementBoundary | null =
    clippedRoom.length >= 3
      ? {
          polygon: clippedRoom,
          bbox: bboxOfPoints(clippedRoom),
          kind: 'room-boundary',
          sourceId: room?.id ?? null,
          name: room?.name ?? null,
        }
      : null

  const fallbackPolygon: Point[] =
    departmentZone ? departmentZone.polygon : (scene.scopePolygons[0] ?? rectPoints(scene.scopeBounds))

  const chairTileSize = GRID_CELL_MM / dataset.layout.floor.mmPerPt
  const tolerance = PLACEMENT_TOLERANCE_MM / dataset.layout.floor.mmPerPt

  const boundary: PlacementBoundary = {
    polygon: fallbackPolygon,
    bbox: bboxOfPoints(fallbackPolygon),
    kind: departmentZone ? 'zone-annotation' : 'scene-scope',
    sourceId: departmentZone ? (zone?.id ?? null) : null,
    name: departmentZone ? (zone?.name ?? null) : null,
    obstacles: dataset.obstacles,
    roomBoundary,
    departmentZone,
    chairTileSize,
  }

  return {
    boundary,
    editableIds: scene.workstations.map((workstation) => workstation.id),
    displayBoundary: scene.scope.kind === 'bbox' && scene.scopePolygons[0]
      ? {
          polygon: [...scene.scopePolygons[0]],
          bbox: scene.scopeBounds,
          kind: 'scene-scope',
          sourceId: null,
          name: null,
        }
      : null,
    contextPlacements: [],
    departmentZone,
    roomBoundary,
    obstacles: dataset.obstacles,
    displayObstacles: scene.obstacles,
    // Derived from the scene's already-clipped layers, so this is the
    // architecture around the area being edited, not the whole floor plate.
    wallSegments: sceneWallSegments(scene.layers),
    wallAlignMaxDistance: WALL_ALIGN_MAX_DISTANCE_MM / dataset.layout.floor.mmPerPt,
    tolerance,
    boundaryTolerance: ANNOTATION_TOLERANCE_MM / dataset.layout.floor.mmPerPt,
    chairTileSize,
    grid: {
      origin: gridOrigin(scene),
      cellSize: GRID_CELL_MM / dataset.layout.floor.mmPerPt,
    },
  }
}

const rectPoints = ([x0, y0, x1, y1]: BBox): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

function gridOrigin(scene: WorkspaceSceneModel): Point {
  if (scene.workstations.length === 0) return [scene.scopeBounds[0], scene.scopeBounds[1]]
  const corners = scene.workstations.map((w) => [w.bbox[0], w.bbox[1]] as Point)
  const [x0, y0] = bboxOfPoints(corners)
  return [x0, y0]
}

/** Grid intersections inside the boundary, in floor coordinates. */
export function gridPoints(
  area: EditableArea,
  contains: (point: Point) => boolean,
): Point[]
export function gridPoints(
  area: EditableArea,
  grid: SpatialGrid,
  contains: (point: Point) => boolean,
): Point[]
export function gridPoints(
  area: EditableArea,
  gridOrContains: SpatialGrid | ((point: Point) => boolean),
  maybeContains?: (point: Point) => boolean,
): Point[] {
  const grid = typeof gridOrContains === 'function' ? area.grid : gridOrContains
  const contains = typeof gridOrContains === 'function' ? gridOrContains : (maybeContains ?? (() => true))
  const { cellSize, origin } = grid
  if (!(cellSize > 0)) return []
  const [bx0, by0, bx1, by1] = (area.displayBoundary ?? area.boundary).bbox
  const startX = origin[0] + Math.ceil((bx0 - origin[0]) / cellSize) * cellSize
  const startY = origin[1] + Math.ceil((by0 - origin[1]) / cellSize) * cellSize
  const result: Point[] = []
  for (let y = startY; y <= by1; y += cellSize) {
    for (let x = startX; x <= bx1; x += cellSize) {
      const point: Point = [x, y]
      if (contains(point)) result.push(point)
    }
  }
  return result
}

/* ------------------------------------------------ draft → renderable scene */

/**
 * Rebuilds the scene's workstations at their draft placements.
 *
 * The chair and the desk outline are carried by the same rigid transform, so
 * an edited desk keeps the geometry the extractor produced instead of being
 * redrawn from its bounding rectangle. Returns the scene unchanged — same
 * object identity, so the renderer's geometry memo still hits — when no
 * placement differs from the authoritative one.
 */
export function applyPlacements(
  scene: WorkspaceSceneModel,
  base: Record<string, SpatialPlacement>,
  placements: Record<string, SpatialPlacement>,
): WorkspaceSceneModel {
  let touched = false
  const workstations = scene.workstations.map((ws) => {
    const from = base[ws.id]
    const to = placements[ws.id]
    if (!from || !to || placementsEqual(from, to)) return ws
    touched = true
    const move = placementTransform(from, to)
    const polygon = ws.polygon.map(move)
    return {
      ...ws,
      polygon,
      center: move(ws.center),
      bbox: bboxOfPoints(polygon),
      // The quarter turn is the editor's; the base angle is the drawing's.
      // Composing them with normalizeRotation rounded the sum, so a desk drawn
      // at 45° and turned once was described as 180° — a facing it has never
      // had. For the orthogonal desks both spellings agree exactly.
      rotationDeg: wrapRotation(ws.rotationDeg + (to.rotation - from.rotation)),
      chair: ws.chair ? {
        center: move(ws.chair.center),
        bbox: transformBBox(ws.chair.bbox, move),
        polygon: ws.chair.polygon?.map(move),
      } : null,
    }
  })
  return touched ? { ...scene, workstations } : scene
}

/** Bounds a draft placement occupies, for renderers that only need the box. */
export const draftBounds = (placement: SpatialPlacement): BBox => placementBounds(placement)

/* ------------------------------------------------------------ persistence */

export interface LayoutStore {
  read(floorId: string): Record<string, SpatialPlacement> | null
  /**
   * Merges `placements` into the floor's stored layout. Ids that are absent
   * keep whatever they already had.
   *
   * A save covers one editing area, not the whole floor, so a store that
   * replaced its contents would drop every other area's committed positions.
   * An HTTP-backed store has to behave the same way: PATCH, never PUT.
   */
  write(floorId: string, placements: Record<string, SpatialPlacement>): Promise<void>
}

/**
 * NOT DURABLE. There is no layout endpoint yet, so a saved layout lives in this
 * module for the lifetime of the page and is gone on reload. It exists so the
 * editor has one real commit boundary to hand to an API later: replacing this
 * object with an HTTP-backed `LayoutStore` is the whole integration.
 */
const memory = new Map<string, Record<string, SpatialPlacement>>()

export const sessionLayoutStore: LayoutStore = {
  read: (floorId) => memory.get(floorId) ?? null,
  write: async (floorId, placements) => {
    memory.set(floorId, { ...(memory.get(floorId) ?? {}), ...placements })
  },
}

/** Test seam; also clears the "saved" banner state between floors in dev. */
export const clearSessionLayouts = () => memory.clear()

/**
 * Saved placements are only trusted for entities the current dataset still has.
 * A stored layout that predates a re-extraction must not resurrect deleted ids
 * or carry stale footprints.
 */
export function mergeStoredPlacements(
  base: Record<string, SpatialPlacement>,
  stored: Record<string, SpatialPlacement> | null,
): Record<string, SpatialPlacement> {
  if (!stored) return base
  const merged: Record<string, SpatialPlacement> = { ...base }
  for (const [id, placement] of Object.entries(stored)) {
    const original = base[id]
    if (!original) continue
    merged[id] = { ...placement, entityId: id, width: original.width, depth: original.depth }
  }
  return merged
}
