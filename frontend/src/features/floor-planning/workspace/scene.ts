import { bboxOfPoints, rectangle } from '../domain/geometry'
import { roomLabelPoint } from '../domain/roomOutline'
import type { BaseLayer, BaseLayerId, BBox, FloorDataset, FloorObstacle, Point, Room, Segment, Workstation, Zone } from '../domain/spatial'
import { resolveWorkspaceScope, workstationInScope, type ResolvedWorkspaceScope, type WorkspaceScope } from './scope'

export { rectangle }

const AZIMUTH = Math.PI / 6
const ELEVATION = Math.PI / 4
const C = Math.cos(AZIMUTH)
const S = Math.sin(AZIMUTH)
const E = Math.sin(ELEVATION)

/** Orthographic projection from canonical floor coordinates. No viewport origin is baked in. */
export function project([x, y]: Point, z = 0): Point {
  return [C * x - S * y, E * (S * x + C * y) - Math.cos(ELEVATION) * z]
}

/** Inverse of project()'s linear part for pointer displacement. */
export function unprojectDelta([dx, dy]: Point): Point {
  return [C * dx + (S / E) * dy, -S * dx + (C / E) * dy]
}

/** Inverse projection back to canonical floor coordinates. */
export function unproject([px, py]: Point, z = 0): Point {
  return unprojectDelta([px, py + Math.cos(ELEVATION) * z])
}

/** The same projection as project(), expressed for source SVG paths. */
export function planeTransform(z = 0): string {
  return `matrix(${C} ${E * S} ${-S} ${E * C} 0 ${-Math.cos(ELEVATION) * z})`
}

export const points = (polygon: readonly Point[]) => polygon.map((p) => p.join(',')).join(' ')
export const projectedPoints = (polygon: readonly Point[], z = 0) => points(polygon.map((p) => project(p, z)))

export const bboxesIntersect = (a: BBox, b: BBox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]

/** Cull complete absolute source subpaths to a scoped floor bbox. */
export function clipSourcePathToBBox(d: string, bbox: BBox): string {
  if (/[A-Za-z]/.test(d.replace(/[MLCZ]/g, ''))) return d
  return (d.match(/M[^M]*/g) ?? []).filter((part) => {
    const numbers = (part.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    const xs = numbers.filter((_, i) => i % 2 === 0)
    const ys = numbers.filter((_, i) => i % 2 === 1)
    return xs.length > 0 && bboxesIntersect([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], bbox)
  }).join('')
}

/**
 * Which base layers count as something a desk can be aligned against.
 *
 * `structure` and `doors` are deliberately absent: a column grid and a door
 * leaf are obstacles to avoid, not surfaces to sit against. The angled runs
 * the diagonal desks follow live in `walls` and `facade` — Floor 16's `walls`
 * layer alone carries 185 non-axis-aligned segments, 68 of them at 45°.
 */
const ALIGNABLE_LAYERS = new Set<BaseLayerId>(['walls', 'partitions', 'facade'])
const COLLISION_LAYERS = new Set<BaseLayerId>(['walls', 'partitions'])

/**
 * Straight segments of an absolute `M`/`L` source path, in floor coordinates.
 *
 * Returns nothing for a path carrying curves rather than failing: the caller
 * is offering an alignment hint, and a hint that cannot be derived is simply
 * unavailable. Segments shorter than `minLength` are dropped — a 1 pt stub is
 * drafting residue whose angle means nothing.
 */
export function sourcePathSegments(d: string, minLength = 1): Segment[] {
  const segments: Segment[] = []
  for (const part of d.match(/M[^M]*/g) ?? []) {
    // Skip the subpath, never the whole layer. Floor 16's facade holds 378
    // curve commands among 28,653 subpaths; discarding the layer over them
    // throws away every straight run the angled desks are drawn against.
    if (/[A-Za-z]/.test(part.replace(/[MLZ]/g, ''))) continue
    const numbers = (part.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    for (let i = 0; i + 3 < numbers.length; i += 2) {
      const a: Point = [numbers[i], numbers[i + 1]]
      const b: Point = [numbers[i + 2], numbers[i + 3]]
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= minLength) segments.push([a, b])
    }
  }
  return segments
}

/** Alignable straight edges of a scene's architecture, already scope-clipped. */
export function sceneWallSegments(layers: readonly BaseLayer[]): Segment[] {
  return layers.filter((layer) => ALIGNABLE_LAYERS.has(layer.id)).flatMap((layer) => sourcePathSegments(layer.d))
}

/** Physical wall runs used for collision validation; facade stays an alignment hint. */
export function sceneCollisionWallSegments(layers: readonly BaseLayer[]): Segment[] {
  return layers.filter((layer) => COLLISION_LAYERS.has(layer.id)).flatMap((layer) => sourcePathSegments(layer.d))
}

export interface WorkspaceSceneModel {
  scope: WorkspaceScope
  resolvedScope: ResolvedWorkspaceScope
  scopeBounds: BBox
  contextBounds: BBox
  scopePolygons: Point[][]
  workstations: Workstation[]
  contextWorkstations: Workstation[]
  obstacles: FloorObstacle[]
  layers: BaseLayer[]
  zones: Zone[]
  rooms: Room[]
  deskHeight: number
  chairHeight: number
}

const CONTEXT_LAYERS = new Set(['facade', 'structure', 'walls', 'partitions', 'doors'])

export interface WorkspaceSceneOptions {
  /** Explicit target membership for a UI display area. */
  workstationIds?: readonly string[]
  /** Larger camera/architecture window; never a physical editing boundary. */
  contextBounds?: BBox
  /** Draw nearby canonical desks as muted, non-interactive context. */
  includeContextWorkstations?: boolean
}

const normalizedBounds = ([x0, y0, x1, y1]: BBox): BBox => [
  Math.min(x0, x1),
  Math.min(y0, y1),
  Math.max(x0, x1),
  Math.max(y0, y1),
]

export function buildWorkspaceScene(dataset: FloorDataset, scope: WorkspaceScope, options: WorkspaceSceneOptions = {}): WorkspaceSceneModel {
  const resolvedScope = resolveWorkspaceScope(dataset, scope)
  const targetIds = options.workstationIds ? new Set(options.workstationIds) : null
  const workstations = dataset.workstations.filter((workstation) => targetIds
    ? targetIds.has(workstation.id)
    : workstationInScope(workstation, resolvedScope))
  const contextBounds = normalizedBounds(options.contextBounds ?? resolvedScope.bbox)
  const contextWorkstations = options.includeContextWorkstations
    ? dataset.workstations.filter((workstation) => !targetIds?.has(workstation.id) && bboxesIntersect(workstation.bbox, contextBounds))
    : []
  const zones = scope.kind === 'bbox'
    ? dataset.zones.filter((zone) => bboxesIntersect(zone.bbox, contextBounds))
    : dataset.zones.filter((zone) => resolvedScope.zoneIds.includes(zone.id))
  const layers = dataset.layout.layers
    .filter((layer) => CONTEXT_LAYERS.has(layer.id))
    .map((layer) => ({ ...layer, d: clipSourcePathToBBox(layer.d, contextBounds) }))

  return {
    scope,
    resolvedScope,
    scopeBounds: resolvedScope.bbox,
    contextBounds,
    scopePolygons: resolvedScope.polygons,
    workstations,
    contextWorkstations,
    obstacles: dataset.obstacles.filter((obstacle) => bboxesIntersect(obstacle.bbox, contextBounds)),
    layers,
    zones,
    rooms: dataset.rooms.filter((room) => bboxesIntersect(room.bbox, contextBounds)),
    deskHeight: 750 / dataset.layout.floor.mmPerPt,
    chairHeight: 450 / dataset.layout.floor.mmPerPt,
  }
}

/** Where status marker discs sit above the chair seat, and how wide they are. */
export const MARKER_ELEVATION = 5
export const MARKER_RADIUS = 1.85

/**
 * A caption belongs to the view only when its anchor sits inside the window the
 * camera frames.
 *
 * Architecture is clipped to `contextBounds`, but captions are drawn outside
 * that clip, so a zone whose polygon merely reaches into the window would put
 * its name wherever the annotation anchored it. On Floor 16 the AI department's
 * anchor is 270 pt north of Area F, and reserving room for it there fits the
 * area at half the scale its desks deserve.
 */
export const labelAnchorInView = ([x, y]: Point, [x0, y0, x1, y1]: BBox) =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1

/** Rooms are captioned inside their own outline, not at an authored anchor. */
export const roomLabelAnchor = (room: Pick<Room, 'polygon' | 'extraPolygons'>): Point => roomLabelPoint(room)

const addTextAllowance = (add: (point: Point) => void, anchor: Point, text: string, size = 1.6) => {
  const [x, y] = project(anchor)
  const halfWidth = Math.max(4, text.length * size * 0.32)
  add([x - halfWidth, y - size])
  add([x + halfWidth, y + size * 0.4])
}

/** Projected bounds of scoped geometry, furniture, markers, and dynamic labels. */
export function sceneBounds(scene: WorkspaceSceneModel): BBox {
  const projected: Point[] = []
  const add = (point: Point) => projected.push(point)

  for (const point of rectangle(scene.contextBounds)) add(project(point, -0.8))
  for (const polygon of scene.scopePolygons) for (const point of polygon) add(project(point, -0.8))
  for (const workstation of [...scene.contextWorkstations, ...scene.workstations]) {
    for (const corner of workstation.polygon) add(project(corner, scene.deskHeight))
    const [mx, my] = project(workstation.chair?.center ?? workstation.center, scene.chairHeight + MARKER_ELEVATION)
    add([mx - MARKER_RADIUS, my - MARKER_RADIUS])
    add([mx + MARKER_RADIUS, my + MARKER_RADIUS])
  }
  for (const zone of scene.zones) {
    if (zone.name && labelAnchorInView(zone.labelAnchor, scene.contextBounds)) {
      addTextAllowance(add, zone.labelAnchor, zone.name)
    }
  }
  for (const room of scene.rooms) {
    const anchor = roomLabelAnchor(room)
    if (labelAnchorInView(anchor, scene.contextBounds)) addTextAllowance(add, anchor, room.name, 1.35)
  }

  return projected.length ? bboxOfPoints(projected) : [0, 0, 1, 1]
}

/** Fit scoped projected bounds into an SVG stage while preserving its aspect ratio. */
export function fitViewBox(bounds: BBox, view: { width: number; height: number }, padding: number): BBox {
  const contentWidth = Math.max(bounds[2] - bounds[0], 1e-6)
  const contentHeight = Math.max(bounds[3] - bounds[1], 1e-6)
  const usableWidth = Math.max(view.width - padding * 2, 1)
  const usableHeight = Math.max(view.height - padding * 2, 1)
  const scale = Math.min(usableWidth / contentWidth, usableHeight / contentHeight)
  const width = Math.max(view.width, 1) / scale
  const height = Math.max(view.height, 1) / scale
  return [
    (bounds[0] + bounds[2]) / 2 - width / 2,
    (bounds[1] + bounds[3]) / 2 - height / 2,
    width,
    height,
  ]
}

/**
 * Compares the user's zoom across scopes. A small area fitted to the same
 * stage is already magnified relative to the department overview.
 */
export const effectiveZoom = (zoom: number, referenceWidth: number, frameWidth: number) =>
  frameWidth > 0 ? zoom * (referenceWidth / frameWidth) : zoom

/**
 * The floor-space footprint of the fitted camera. The scene's projected
 * viewBox is inverted through its viewport transform and then unprojected.
 */
export function cameraFootprint(frame: BBox, origin: Point, pan: Point, zoom: number): Point[] {
  const [fx, fy, fw, fh] = frame
  const scale = zoom > 0 ? zoom : 1
  const corners: Point[] = [[fx, fy], [fx + fw, fy], [fx + fw, fy + fh], [fx, fy + fh]]
  return corners.map(([sx, sy]) => unproject([
    origin[0] + (sx - pan[0] - origin[0]) / scale,
    origin[1] + (sy - pan[1] - origin[1]) / scale,
  ]))
}

/** Floor-space point currently at the centre of the fitted viewport. */
export function cameraCenter(frame: BBox, origin: Point, pan: Point, zoom: number): Point {
  const scale = zoom > 0 ? zoom : 1
  const viewportCenter: Point = [frame[0] + frame[2] / 2, frame[1] + frame[3] / 2]
  // Invert the content transform at the viewport centre before converting the
  // projected point back to floor space. `origin` normally equals this centre,
  // but keeping both inputs makes the relationship explicit and testable.
  return unproject([
    origin[0] + (viewportCenter[0] - pan[0] - origin[0]) / scale,
    origin[1] + (viewportCenter[1] - pan[1] - origin[1]) / scale,
  ])
}

export type WorkspaceDetailTier = 'far' | 'medium' | 'close'
export const MEDIUM_DETAIL_ZOOM = 1.3
export const CLOSE_DETAIL_ZOOM = 2

export function detailTierForZoom(zoom: number): WorkspaceDetailTier {
  if (zoom >= CLOSE_DETAIL_ZOOM) return 'close'
  if (zoom >= MEDIUM_DETAIL_ZOOM) return 'medium'
  return 'far'
}

export interface MemoizedPrismFace { points: string; fill: string }
export interface MemoizedPrism { faces: MemoizedPrismFace[]; topPoints: string }
export interface MemoizedDesk {
  shadowPoints: string
  legs: Array<{ a: Point; b: Point }>
  prism: MemoizedPrism
  codePos: Point
}
export interface MemoizedChair {
  shadowPoints: string
  stem: { a: Point; b: Point }
  prism: MemoizedPrism
  backPoints: string
}
export interface MemoizedSceneItem {
  id: string
  kind: 'desk' | 'chair'
  context: boolean
  depth: number
  ws: Workstation
  deskGeom?: MemoizedDesk
  chairGeom?: MemoizedChair
}
export interface MemoizedSceneGeometry {
  items: MemoizedSceneItem[]
  markers: Array<{ ws: Workstation; pos: Point }>
  selectionPolygons: Map<string, string>
}

export function createPrismGeometry(polygon: Point[], height: number, bottom: number): MemoizedPrism {
  const faces = polygon
    .map((a, i) => {
      const b = polygon[(i + 1) % polygon.length]
      return { a, b, depth: project(a)[1] + project(b)[1] }
    })
    .sort((a, b) => a.depth - b.depth)
    .map(({ a, b }, i) => ({
      points: points([project(a, bottom), project(b, bottom), project(b, height), project(a, height)]),
      fill: i % 2 ? '#bbc7d0' : '#d2dbe1',
    }))
  return { faces, topPoints: projectedPoints(polygon, height) }
}

function buildSceneGeometry(scene: WorkspaceSceneModel): MemoizedSceneGeometry {
  const items: MemoizedSceneItem[] = []
  const selectionPolygons = new Map<string, string>()
  const targetIds = new Set(scene.workstations.map((workstation) => workstation.id))
  for (const ws of [...scene.contextWorkstations, ...scene.workstations]) {
    const context = !targetIds.has(ws.id)
    const deskPrism = createPrismGeometry(ws.polygon, scene.deskHeight, scene.deskHeight - 0.5)
    const [cx, cy] = ws.center
    items.push({
      id: ws.id,
      kind: 'desk',
      context,
      depth: project(ws.center)[1],
      ws,
      deskGeom: {
        shadowPoints: projectedPoints(ws.polygon),
        legs: ws.polygon.map(([px, py]) => {
          const point: Point = [px + (cx - px) * 0.14, py + (cy - py) * 0.14]
          return { a: project(point, 0), b: project(point, scene.deskHeight) }
        }),
        prism: deskPrism,
        codePos: project(ws.center, scene.deskHeight + 0.5),
      },
    })

    if (ws.chair) {
      const { center, bbox } = ws.chair
      const polygon = ws.chair.polygon ?? rectangle(bbox)
      const dx = center[0] - ws.center[0]
      const dy = center[1] - ws.center[1]
      const back = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? [polygon[1], polygon[2]] : [polygon[3], polygon[0]])
        : (dy > 0 ? [polygon[2], polygon[3]] : [polygon[0], polygon[1]])
      items.push({
        id: ws.id,
        kind: 'chair',
        context,
        depth: project(center)[1],
        ws,
        chairGeom: {
          shadowPoints: projectedPoints(polygon),
          stem: { a: project(center, 0.5), b: project(center, scene.chairHeight) },
          prism: createPrismGeometry(polygon, scene.chairHeight, scene.chairHeight - 0.5),
          backPoints: points([
            project(back[0], scene.chairHeight),
            project(back[1], scene.chairHeight),
            project(back[1], scene.chairHeight + 3),
            project(back[0], scene.chairHeight + 3),
          ]),
        },
      })
    }
    if (!context) selectionPolygons.set(ws.id, projectedPoints(ws.polygon, scene.deskHeight + 0.15))
  }
  items.sort((a, b) => a.depth - b.depth)
  return {
    items,
    markers: scene.workstations.map((ws) => ({
      ws,
      pos: project(ws.chair?.center ?? ws.center, scene.chairHeight + MARKER_ELEVATION),
    })),
    selectionPolygons,
  }
}

const sceneGeometryCache = new WeakMap<WorkspaceSceneModel, MemoizedSceneGeometry>()

export function memoizeSceneGeometry(scene: WorkspaceSceneModel): MemoizedSceneGeometry {
  let geometry = sceneGeometryCache.get(scene)
  if (!geometry) {
    geometry = buildSceneGeometry(scene)
    sceneGeometryCache.set(scene, geometry)
  }
  return geometry
}
