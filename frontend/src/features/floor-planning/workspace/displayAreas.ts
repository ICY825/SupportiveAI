import { bboxOfPoints } from '../domain/geometry'
import type { BBox, DeskCluster, FloorDataset, Point, Workstation } from '../domain/spatial'
import { defaultWorkspaceScope, resolveWorkspaceScope, workstationInScope, type WorkspaceScope } from './scope'

/** UI-only grouping of extracted clusters; never a Zone or physical entity. */
export interface WorkspaceDisplayArea {
  id: string
  label: string
  clusterIds: readonly string[]
  short: string
  workstationIds: readonly string[]
  targetBBox: BBox
  contextBBox: BBox
  scope: WorkspaceScope
}

/** About 2.6 metres on Floor 16; intentionally one shared context rule. */
export const DISPLAY_CONTEXT_PADDING_PT = 25

const floorBounds = (dataset: FloorDataset): BBox => [0, 0, dataset.layout.floor.width, dataset.layout.floor.height]

const expandAndClamp = (bbox: BBox, padding: number, bounds: BBox): BBox => [
  Math.max(bounds[0], bbox[0] - padding),
  Math.max(bounds[1], bbox[1] - padding),
  Math.min(bounds[2], bbox[2] + padding),
  Math.min(bounds[3], bbox[3] + padding),
]

const workstationBounds = (workstations: readonly Workstation[]): BBox =>
  bboxOfPoints(workstations.flatMap((workstation) => workstation.polygon))

export interface DerivedWorkspaceSection {
  id: string
  clusterIds: readonly string[]
  workstationIds: readonly string[]
  bbox: BBox
  center: Point
}

const clusterGap = (a: DeskCluster, b: DeskCluster): number => {
  const dx = Math.max(a.bbox[0] - b.bbox[2], b.bbox[0] - a.bbox[2], 0)
  const dy = Math.max(a.bbox[1] - b.bbox[3], b.bbox[1] - a.bbox[3], 0)
  return Math.hypot(dx, dy)
}

const sectionBBox = (clusters: readonly DeskCluster[]): BBox => [
  Math.min(...clusters.map((cluster) => cluster.bbox[0])),
  Math.min(...clusters.map((cluster) => cluster.bbox[1])),
  Math.max(...clusters.map((cluster) => cluster.bbox[2])),
  Math.max(...clusters.map((cluster) => cluster.bbox[3])),
]

const sectionSort = (a: DerivedWorkspaceSection, b: DerivedWorkspaceSection): number =>
  a.center[1] - b.center[1] || a.center[0] - b.center[0] || a.id.localeCompare(b.id)

/** Pure, deterministic grouping of whole clusters into human-sized sections. */
export function deriveSectionsFromClusters(
  input: readonly DeskCluster[],
  targetDeskCount = 20,
): DerivedWorkspaceSection[] {
  if (input.length === 0) return []
  if (!(targetDeskCount > 0)) throw new Error('targetDeskCount must be positive')

  const ordered = [...input].sort((a, b) => a.center[1] - b.center[1] || a.center[0] - b.center[0] || a.id.localeCompare(b.id))
  const groups = ordered.map((cluster) => ({ clusters: [cluster] as DeskCluster[] }))
  const maxDeskCount = Math.max(targetDeskCount + 1, Math.ceil(targetDeskCount * 1.5))

  while (groups.length > 1) {
    let best: { left: number; right: number; score: number } | null = null
    for (let left = 0; left < groups.length; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const combined = groups[left].clusters.reduce((sum, cluster) => sum + cluster.workstationIds.length, 0)
          + groups[right].clusters.reduce((sum, cluster) => sum + cluster.workstationIds.length, 0)
        if (combined > maxDeskCount) continue
        const distance = Math.min(
          ...groups[left].clusters.flatMap((a) => groups[right].clusters.map((b) => clusterGap(a, b))),
        )
        // Spatial distance dominates; the remaining terms make ties stable.
        const score = distance * 1000 + Math.abs(targetDeskCount - combined) + left / 1000 + right / 1_000_000
        if (!best || score < best.score) best = { left, right, score }
      }
    }
    if (!best) break
    const merged = {
      clusters: [...groups[best.left].clusters, ...groups[best.right].clusters]
        .sort((a, b) => a.id.localeCompare(b.id)),
    }
    groups.splice(best.right, 1)
    groups.splice(best.left, 1, merged)
  }

  return groups.map(({ clusters }) => {
    const clusterIds = clusters.map((cluster) => cluster.id).sort()
    const bbox = sectionBBox(clusters)
    return {
      id: `section:${clusterIds.join(',')}`,
      clusterIds,
      workstationIds: clusters.flatMap((cluster) => cluster.workstationIds).sort(),
      bbox,
      center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] as Point,
    }
  }).sort(sectionSort)
}

/** Builds the default display scopes from canonical cluster/workstation membership. */
export function buildWorkspaceDisplayAreas(dataset: FloorDataset): WorkspaceDisplayArea[] {
  return buildWorkspaceDisplayAreasForScope(dataset, defaultWorkspaceScope(dataset))
}

/** Builds department scopes from derived sections, never authored bboxes. */
export function buildWorkspaceDisplayAreasForScope(dataset: FloorDataset, departmentScope: WorkspaceScope): WorkspaceDisplayArea[] {
  if (departmentScope.kind !== 'department') return []
  const resolved = resolveWorkspaceScope(dataset, departmentScope)
  const accepted = dataset.workstations.filter((workstation) => workstationInScope(workstation, resolved))
  const acceptedIds = new Set(accepted.map((workstation) => workstation.id))
  const bounds = floorBounds(dataset)
  const clustersByZone = new Map<string, DeskCluster[]>()

  for (const cluster of dataset.clusters) {
    const workstationIds = cluster.workstationIds.filter((id) => acceptedIds.has(id))
    if (workstationIds.length === 0) continue
    const zoneId = cluster.zoneId ?? cluster.zoneIds.find((id) => resolved.zoneIds.includes(id)) ?? ''
    if (!resolved.zoneIds.includes(zoneId)) continue
    clustersByZone.set(zoneId, [...(clustersByZone.get(zoneId) ?? []), { ...cluster, workstationIds }])
  }

  const sections = [...clustersByZone.entries()].flatMap(([, clusters]) =>
    deriveSectionsFromClusters(clusters).map((section) => ({ section })),
  ).sort((a, b) => sectionSort(a.section, b.section))

  return sections.flatMap(({ section }, index) => {
    const clusterSet = new Set(section.clusterIds)
    const workstations = accepted.filter((workstation) => clusterSet.has(workstation.clusterId))
    if (workstations.length === 0) return []
    const targetBBox = workstationBounds(workstations)
    return [{
      id: section.id,
      label: `Khu vực ${String.fromCharCode(65 + index)}`,
      short: String.fromCharCode(65 + index),
      clusterIds: section.clusterIds,
      workstationIds: workstations.map((workstation) => workstation.id),
      targetBBox,
      contextBBox: expandAndClamp(targetBBox, DISPLAY_CONTEXT_PADDING_PT, bounds),
      scope: { kind: 'bbox', bbox: targetBBox },
    }]
  })
}
