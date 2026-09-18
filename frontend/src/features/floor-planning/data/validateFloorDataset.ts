import type { FloorDataset, Point } from '../domain/spatial'
import { validateDisplayAreaDefinitions } from '../workspace/displayAreas'

export interface ValidationIssue {
  level: 'error' | 'warning'
  entityId?: string
  message: string
}

export function pointInPolygon([x, y]: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Semantic invariants of a floor dataset. Errors mean the data must not be
 * shown as-is; warnings are surfaced in debug mode for Admin review.
 */
export function validateFloorDataset(ds: FloorDataset): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const floorId = ds.layout.floor.id
  const ids = new Set<string>()
  const all = [...ds.zones, ...ds.rooms, ...ds.clusters, ...ds.workstations, ...ds.objects]

  for (const e of all) {
    if (ids.has(e.id)) issues.push({ level: 'error', entityId: e.id, message: 'duplicate id' })
    ids.add(e.id)
    if (e.floorId !== floorId) issues.push({ level: 'error', entityId: e.id, message: `floorId ${e.floorId} != ${floorId}` })
  }

  const zoneById = new Map(ds.zones.map((z) => [z.id, z]))
  const clusterById = new Map(ds.clusters.map((c) => [c.id, c]))
  const { width, height } = ds.layout.floor

  for (const w of ds.workstations) {
    if (!/^ws-\d+-\d{3,}$/.test(w.id)) issues.push({ level: 'error', entityId: w.id, message: 'workstation id format' })
    const cluster = clusterById.get(w.clusterId)
    if (!cluster) issues.push({ level: 'error', entityId: w.id, message: `unknown cluster ${w.clusterId}` })
    else if (!cluster.workstationIds.includes(w.id)) {
      issues.push({ level: 'error', entityId: w.id, message: 'cluster does not list workstation' })
    }
    if (w.zoneId) {
      const zone = zoneById.get(w.zoneId)
      if (!zone) issues.push({ level: 'error', entityId: w.id, message: `unknown zone ${w.zoneId}` })
      else if (!pointInPolygon(w.center, zone.polygon)) {
        issues.push({ level: 'error', entityId: w.id, message: 'centre outside its zone polygon' })
      }
    } else {
      issues.push({ level: 'warning', entityId: w.id, message: 'workstation is outside every source zone' })
    }
    const [x, y] = w.center
    if (x < 0 || y < 0 || x > width || y > height) issues.push({ level: 'error', entityId: w.id, message: 'outside sheet' })
    if (w.classification === 'WORKSTATION' && w.verification !== 'EXTRACTED' && w.verification !== 'SOURCE_VERIFIED') {
      issues.push({ level: 'error', entityId: w.id, message: 'workstation classified without confident verification state' })
    }
  }

  for (const c of ds.clusters) {
    for (const wid of c.workstationIds) {
      if (!ids.has(wid)) issues.push({ level: 'error', entityId: c.id, message: `unknown workstation ${wid}` })
    }
  }

  for (const z of ds.zones) {
    if (z.polygon.length < 3) issues.push({ level: 'error', entityId: z.id, message: 'zone polygon has < 3 points' })
    if (!z.name) issues.push({ level: 'warning', entityId: z.id, message: 'zone has no source label (UNKNOWN)' })
    if (z.name && z.verification === 'UNKNOWN') issues.push({ level: 'warning', entityId: z.id, message: 'named zone marked UNKNOWN' })
  }

  for (const o of ds.objects) {
    if (o.classification === 'UNKNOWN' && o.verification !== 'UNKNOWN') {
      issues.push({ level: 'error', entityId: o.id, message: 'UNKNOWN object must carry UNKNOWN verification' })
    }
  }

  for (const issue of validateDisplayAreaDefinitions(ds)) issues.push(issue)

  return issues
}
