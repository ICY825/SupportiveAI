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
import { bboxOfPoints, clipPolygonToBBox } from '../domain/geometry'
import {
  normalizeRotation,
  placementBounds,
  placementsEqual,
  placementTransform,
  transformBBox,
  validateAll,
  type PlacementBoundary,
  type PlacementValidation,
  type SpatialGrid,
  type SpatialPlacement,
} from '../domain/placement'
import type { BBox, FloorDataset, Point, Workstation } from '../domain/spatial'
import { SPIKE_CROP, type SpikeScene } from './scene'

/** Planning module for the edit grid. One desk depth; a desk is two cells wide. */
export const GRID_CELL_MM = 600

/**
 * Interpenetration allowed before two objects count as overlapping.
 *
 * The extractor reports nominally identical desks as 595–609 mm deep, so two
 * of them snapped into adjacent 600 mm cells can share a few millimetres. That
 * is drawing tolerance, not a layout conflict.
 */
export const PLACEMENT_TOLERANCE_MM = 25

export interface LayoutDraft {
  placements: Record<string, SpatialPlacement>
}

/* ------------------------------------------------------- base placements */

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
  const turned = normalizeRotation(ws.rotationDeg) % 180 !== 0
  return {
    entityId: ws.id,
    x: x0 + (x1 - x0) / 2,
    y: y0 + (y1 - y0) / 2,
    width: turned ? y1 - y0 : x1 - x0,
    depth: turned ? x1 - x0 : y1 - y0,
    rotation: normalizeRotation(ws.rotationDeg),
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
  return { origin: [x0, y0], cellSize: grid.cellSize }
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

export const validateDraft = (
  draft: LayoutDraft,
  boundary: PlacementBoundary | null,
  tolerance?: number,
): Map<string, PlacementValidation> => validateAll(draftList(draft), boundary, tolerance)

export const draftIsValid = (validation: ReadonlyMap<string, PlacementValidation>) =>
  [...validation.values()].every((v) => v.valid)

/* ------------------------------------------------------- editable area */

export interface EditableArea {
  boundary: PlacementBoundary
  grid: SpatialGrid
  /** see PLACEMENT_TOLERANCE_MM */
  tolerance: number
}

/**
 * Where layout editing is allowed, and the grid it snaps to.
 *
 * LIMITATION — this is NOT a surveyed floor boundary. The polygon is the
 * department zone a reviewer drew on the source PDF as an annotation, clipped
 * to the camera crop the spatial scene currently shows. It states which area a
 * department owns; it does not encode walls, doors, columns, circulation or
 * clearance. The extraction pipeline does not yet produce a room polygon
 * derived from wall geometry, so `outside-boundary` here means "outside the
 * department area on the drawing", nothing stronger.
 *
 * Falls back to the crop alone (`kind: 'scene-scope'`) when the scene's
 * workstations carry no zone, which is a camera limit and not a real rule.
 */
export function deriveEditableArea(dataset: FloorDataset, scene: SpikeScene): EditableArea {
  const zoneId = scene.workstations.find((w) => w.zoneId)?.zoneId ?? null
  const zone = zoneId ? dataset.zones.find((z) => z.id === zoneId) : undefined
  const clipped = zone ? clipPolygonToBBox(zone.polygon, SPIKE_CROP) : []
  const polygon: Point[] = clipped.length >= 3 ? clipped : clipPolygonToBBox(rectPoints(SPIKE_CROP), SPIKE_CROP)
  const bbox = bboxOfPoints(polygon)

  return {
    boundary: {
      polygon,
      bbox,
      kind: clipped.length >= 3 ? 'zone-annotation' : 'scene-scope',
      sourceId: clipped.length >= 3 ? (zone?.id ?? null) : null,
    },
    tolerance: PLACEMENT_TOLERANCE_MM / dataset.layout.floor.mmPerPt,
    grid: {
      // Anchored on the existing layout's leading corner so the first desk is
      // already on-grid. The extracted desks are not on a regular module, so
      // the others do shift when they are first moved: that is snapping, and
      // it is what makes an edited layout regular.
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

function gridOrigin(scene: SpikeScene): Point {
  if (scene.workstations.length === 0) return [SPIKE_CROP[0], SPIKE_CROP[1]]
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
  const [bx0, by0, bx1, by1] = area.boundary.bbox
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
  scene: SpikeScene,
  base: Record<string, SpatialPlacement>,
  placements: Record<string, SpatialPlacement>,
): SpikeScene {
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
      rotationDeg: normalizeRotation(ws.rotationDeg + (to.rotation - from.rotation)),
      chair: ws.chair ? { center: move(ws.chair.center), bbox: transformBBox(ws.chair.bbox, move) } : null,
    }
  })
  return touched ? { ...scene, workstations } : scene
}

/** Bounds a draft placement occupies, for renderers that only need the box. */
export const draftBounds = (placement: SpatialPlacement): BBox => placementBounds(placement)

/* ------------------------------------------------------------ persistence */

export interface LayoutStore {
  read(floorId: string): Record<string, SpatialPlacement> | null
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
    memory.set(floorId, { ...placements })
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
