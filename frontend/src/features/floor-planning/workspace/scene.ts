import type { BaseLayer, BBox, FloorDataset, Point } from '../domain/spatial'

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
