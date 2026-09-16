import type { BaseLayer, BBox, FloorDataset, Point, Workstation } from '../domain/spatial'

/** Camera crop, NOT a room or floor outline. Only these three complete source clusters are in the spike. */
export const SPIKE_CLUSTER_IDS = ['cluster-16-13', 'cluster-16-17', 'cluster-16-18']
export const SPIKE_CROP: BBox = [900, 225, 1008, 294]

const AZIMUTH = Math.PI / 6
const ELEVATION = Math.PI / 4
const C = Math.cos(AZIMUTH)
const S = Math.sin(AZIMUTH)
const E = Math.sin(ELEVATION)

/** True orthographic projection. All inputs retain the dataset's PDF-point units. */
export function project([x, y]: Point, z = 0): Point {
  const dx = x - SPIKE_CROP[0]
  const dy = y - SPIKE_CROP[1]
  return [C * dx - S * dy, E * (S * dx + C * dy) - Math.cos(ELEVATION) * z]
}

/** The same projection as project(), for unmodified source SVG paths. */
export function planeTransform(z = 0): string {
  const [x, y] = project([0, 0], z)
  return `matrix(${C} ${E * S} ${-S} ${E * C} ${x} ${y})`
}

export const points = (polygon: Point[]) => polygon.map((p) => p.join(',')).join(' ')
export const projectedPoints = (polygon: Point[], z = 0) => points(polygon.map((p) => project(p, z)))
export const rectangle = ([x0, y0, x1, y1]: BBox): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

const intersects = (a: BBox, b: BBox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]

/**
 * Cull complete source subpaths without resampling their geometry. The generated
 * CAD paths use absolute M/L/C/Z commands; cubic control bounds are conservative.
 * Unknown syntax stays intact and is clipped by SVG, never silently reinterpreted.
 */
export function cropSourcePath(d: string, crop: BBox): string {
  if (/[A-Za-z]/.test(d.replace(/[MLCZ]/g, ''))) return d
  return (d.match(/M[^M]*/g) ?? []).filter((part) => {
    const numbers = (part.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    const xs = numbers.filter((_, i) => i % 2 === 0)
    const ys = numbers.filter((_, i) => i % 2 === 1)
    return xs.length > 0 && intersects([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], crop)
  }).join('')
}

export function buildSpikeScene(dataset: FloorDataset) {
  const clusterIds = new Set(dataset.layout.floor.id === 'floor-16' ? SPIKE_CLUSTER_IDS : [])
  const workstations = dataset.workstations.filter((w) => clusterIds.has(w.clusterId))
  const layers: BaseLayer[] = dataset.layout.layers
    .filter((l) => ['facade', 'structure', 'walls', 'partitions', 'doors'].includes(l.id))
    .map((l) => ({ ...l, d: cropSourcePath(l.d, SPIKE_CROP) }))
  return {
    workstations,
    layers,
    zones: dataset.zones.filter((z) => intersects(z.bbox, SPIKE_CROP)),
    rooms: dataset.rooms.filter((r) => intersects(r.bbox, SPIKE_CROP)),
    // Heights are restrained presentation dimensions; plan geometry is never changed.
    deskHeight: 750 / dataset.layout.floor.mmPerPt,
    chairHeight: 450 / dataset.layout.floor.mmPerPt,
  }
}

export type SpikeScene = ReturnType<typeof buildSpikeScene>

/** Where the marker discs sit above the chair seat, and how wide they are. */
export const MARKER_ELEVATION = 5
export const MARKER_RADIUS = 1.85
/** Anchors of the two captions drawn inside the scene. */
export const ZONE_LABEL_ANCHOR: Point = [924, 230]
export const CROP_LABEL_ANCHOR: Point = [940, 293]
export const CROP_LABEL_OFFSET = 5
/** Half-width / height allowed for a caption, in scene units. */
const LABEL_ALLOWANCE: Point = [17, 2]

/**
 * Projected bounds of everything the scene draws, in scene units.
 *
 * Derived from the geometry rather than measured from the DOM so the first
 * paint is already framed correctly and the value is testable. Text labels are
 * given a generous allowance because their width depends on the font.
 */
export function sceneBounds(scene: SpikeScene): BBox {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const add = ([x, y]: Point) => {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }

  // ground plate, at the elevation it is actually drawn at
  for (const corner of rectangle(SPIKE_CROP)) add(project(corner, -0.8))
  // furniture tops and the marker discs that float above the chairs
  for (const ws of scene.workstations) {
    for (const corner of ws.polygon) add(project(corner, scene.deskHeight))
    const [mx, my] = project(ws.chair?.center ?? ws.center, scene.chairHeight + MARKER_ELEVATION)
    add([mx - MARKER_RADIUS, my - MARKER_RADIUS])
    add([mx + MARKER_RADIUS, my + MARKER_RADIUS])
  }
  // the two in-scene captions
  const [zx, zy] = project(ZONE_LABEL_ANCHOR)
  add([zx, zy - LABEL_ALLOWANCE[1]])
  add([zx + LABEL_ALLOWANCE[0], zy])
  const [cx, cy] = project(CROP_LABEL_ANCHOR)
  add([cx - LABEL_ALLOWANCE[0], cy + CROP_LABEL_OFFSET])
  add([cx + LABEL_ALLOWANCE[0], cy + CROP_LABEL_OFFSET + LABEL_ALLOWANCE[1]])

  return [x0, y0, x1, y1]
}


/**
 * A viewBox that fills `view` with `bounds` at the largest scale that still
 * leaves `padding` screen pixels of margin. Returned as SVG viewBox order.
 */
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

export interface MemoizedPrismFace {
  points: string
  fill: string
}

export interface MemoizedPrism {
  faces: MemoizedPrismFace[]
  topPoints: string
}

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
  depth: number
  ws: Workstation
  deskGeom?: MemoizedDesk
  chairGeom?: MemoizedChair
}

export interface MemoizedSceneGeometry {
  items: MemoizedSceneItem[]
  markers: Array<{
    ws: Workstation
    pos: Point
  }>
  selectionPolygons: Map<string, string>
  zoneCaptionPos: Point
  cropCaptionPos: Point
}

export function createPrismGeometry(polygon: Point[], height: number, bottom: number): MemoizedPrism {
  const faces = polygon
    .map((a, i) => {
      const b = polygon[(i + 1) % polygon.length]
      return {
        a,
        b,
        depth: project(a)[1] + project(b)[1],
      }
    })
    .sort((a, b) => a.depth - b.depth)
    .map(({ a, b }, i) => ({
      points: points([project(a, bottom), project(b, bottom), project(b, height), project(a, height)]),
      fill: i % 2 ? '#bbc7d0' : '#d2dbe1',
    }))

  return {
    faces,
    topPoints: projectedPoints(polygon, height),
  }
}

function buildSceneGeometry(scene: SpikeScene): MemoizedSceneGeometry {
  const rawItems: MemoizedSceneItem[] = []
  const selectionPolygons = new Map<string, string>()

  for (const ws of scene.workstations) {
    const deskPrism = createPrismGeometry(ws.polygon, scene.deskHeight, scene.deskHeight - 0.5)
    const [cx, cy] = ws.center
    const deskGeom: MemoizedDesk = {
      shadowPoints: projectedPoints(ws.polygon),
      legs: ws.polygon.map(([px, py]) => {
        const p: Point = [px + (cx - px) * 0.14, py + (cy - py) * 0.14]
        return { a: project(p, 0), b: project(p, scene.deskHeight) }
      }),
      prism: deskPrism,
      codePos: project(ws.center, scene.deskHeight + 0.5),
    }

    rawItems.push({
      id: ws.id,
      kind: 'desk',
      depth: project(ws.center)[1],
      ws,
      deskGeom,
    })

    if (ws.chair) {
      const { center, bbox } = ws.chair
      const polygon = rectangle(bbox)
      const dx = center[0] - ws.center[0]
      const dy = center[1] - ws.center[1]
      const back =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? [polygon[1], polygon[2]]
            : [polygon[3], polygon[0]]
          : dy > 0
          ? [polygon[2], polygon[3]]
          : [polygon[0], polygon[1]]

      const chairPrism = createPrismGeometry(polygon, scene.chairHeight, scene.chairHeight - 0.5)
      const chairGeom: MemoizedChair = {
        shadowPoints: projectedPoints(polygon),
        stem: { a: project(center, 0.5), b: project(center, scene.chairHeight) },
        prism: chairPrism,
        backPoints: points([
          project(back[0], scene.chairHeight),
          project(back[1], scene.chairHeight),
          project(back[1], scene.chairHeight + 3),
          project(back[0], scene.chairHeight + 3),
        ]),
      }

      rawItems.push({
        id: ws.id,
        kind: 'chair',
        depth: project(center)[1],
        ws,
        chairGeom,
      })
    }

    selectionPolygons.set(ws.id, projectedPoints(ws.polygon, scene.deskHeight + 0.15))
  }

  rawItems.sort((a, b) => a.depth - b.depth)

  const markers = scene.workstations.map((ws) => ({
    ws,
    pos: project(ws.chair?.center ?? ws.center, scene.chairHeight + MARKER_ELEVATION),
  }))

  return {
    items: rawItems,
    markers,
    selectionPolygons,
    zoneCaptionPos: project(ZONE_LABEL_ANCHOR),
    cropCaptionPos: project(CROP_LABEL_ANCHOR),
  }
}

const sceneGeometryCache = new WeakMap<SpikeScene, MemoizedSceneGeometry>()

/**
 * Returns pre-projected, depth-sorted geometry for the 2.5D spatial scene.
 * Memoized by scene dataset identity to eliminate redundant geometry calculations
 * during continuous zoom and pan frames.
 */
export function memoizeSceneGeometry(scene: SpikeScene): MemoizedSceneGeometry {
  let geom = sceneGeometryCache.get(scene)
  if (!geom) {
    geom = buildSceneGeometry(scene)
    sceneGeometryCache.set(scene, geom)
  }
  return geom
}

