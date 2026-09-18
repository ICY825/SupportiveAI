import { bboxOfPoints } from '../domain/geometry'
import type { BBox, FloorDataset, Workstation } from '../domain/spatial'
import { defaultWorkspaceScope, resolveWorkspaceScope, workstationInScope, type WorkspaceScope } from './scope'

/**
 * UI-only grouping of extracted clusters. These are display/editing areas, not
 * business zones or new physical entities.
 */
interface DisplayAreaDefinition {
  id: string
  label: string
  short: string
  clusterIds: readonly string[]
}

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

const AI_AREA_DEFINITIONS: readonly DisplayAreaDefinition[] = [
  { id: 'ai-area-a', label: 'Khu vực A', short: 'A', clusterIds: ['cluster-16-13', 'cluster-16-18', 'cluster-16-22', 'cluster-16-30'] },
  { id: 'ai-area-b', label: 'Khu vực B', short: 'B', clusterIds: ['cluster-16-16', 'cluster-16-17', 'cluster-16-27', 'cluster-16-28'] },
  { id: 'ai-area-c', label: 'Khu vực C', short: 'C', clusterIds: ['cluster-16-25', 'cluster-16-26'] },
  { id: 'ai-area-d', label: 'Khu vực D', short: 'D', clusterIds: ['cluster-16-32', 'cluster-16-33', 'cluster-16-34', 'cluster-16-35'] },
  { id: 'ai-area-e', label: 'Khu vực E', short: 'E', clusterIds: ['cluster-16-52', 'cluster-16-54', 'cluster-16-56'] },
  { id: 'ai-area-f', label: 'Khu vực F', short: 'F', clusterIds: ['cluster-16-58', 'cluster-16-59', 'cluster-16-60', 'cluster-16-61'] },
]

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

/** Removes source capacity figures from labels used as spatial UI names. */
const cleanAreaLabel = (label: string | null | undefined, fallback: string) =>
  label?.replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim() || fallback

/** Builds the default display scopes from canonical cluster/workstation membership. */
export function buildWorkspaceDisplayAreas(dataset: FloorDataset): WorkspaceDisplayArea[] {
  return buildWorkspaceDisplayAreasForScope(dataset, defaultWorkspaceScope(dataset))
}

/**
 * Builds UI view scopes for any canonical workspace scope. AI keeps its six
 * curated display areas; other departments fall back to one area per physical
 * zone, without inventing new workstation membership.
 */
export function buildWorkspaceDisplayAreasForScope(dataset: FloorDataset, departmentScope: WorkspaceScope): WorkspaceDisplayArea[] {
  if (departmentScope.kind !== 'department') return []
  const resolved = resolveWorkspaceScope(dataset, departmentScope)
  const accepted = dataset.workstations.filter((workstation) => workstationInScope(workstation, resolved))
  const byCluster = new Map<string, Workstation[]>()
  for (const workstation of accepted) {
    const list = byCluster.get(workstation.clusterId) ?? []
    list.push(workstation)
    byCluster.set(workstation.clusterId, list)
  }
  const bounds = floorBounds(dataset)

  const curated = departmentScope.departmentId === 'dept-ai-data'
    ? AI_AREA_DEFINITIONS
    : resolved.zoneIds.map((zoneId, index) => ({
        id: `zone-area-${zoneId}`,
        label: cleanAreaLabel(dataset.zones.find((zone) => zone.id === zoneId)?.name, `Khu vực ${index + 1}`),
        short: String(index + 1),
        clusterIds: dataset.clusters.filter((cluster) => cluster.zoneId === zoneId).map((cluster) => cluster.id),
      }))

  /**
   * Any accepted cluster no definition claims still needs somewhere to be.
   *
   * The six AI areas were drawn around the block east of the lift cores. When
   * the team named the western block as the same department, its five clusters
   * — 38 desks — belonged to a department whose area picker could not reach
   * them: visible on the overview, impossible to focus, impossible to edit.
   *
   * Collecting the remainder by zone keeps that from recurring. Re-extraction
   * that finds a new cluster, or another zone joining a department, lands in an
   * area instead of vanishing from the picker.
   */
  const claimed = new Set(curated.flatMap((definition) => definition.clusterIds))
  const leftoverByZone = new Map<string, string[]>()
  for (const [clusterId, workstations] of byCluster) {
    if (claimed.has(clusterId)) continue
    const zoneId = workstations[0]?.zoneId
    if (!zoneId) continue
    leftoverByZone.set(zoneId, [...(leftoverByZone.get(zoneId) ?? []), clusterId])
  }
  const definitions = [
    ...curated,
    ...[...leftoverByZone.entries()].map(([zoneId, clusterIds], index) => ({
      id: `zone-area-${zoneId}`,
      // Carry on the same lettering the curated areas use, so the picker reads
      // as one sequence rather than two naming schemes.
      label: `Khu vực ${String.fromCharCode(65 + curated.length + index)}`,
      short: String.fromCharCode(65 + curated.length + index),
      clusterIds,
    })),
  ]

  return definitions.flatMap((definition) => {
    const workstations = definition.clusterIds.flatMap((clusterId) => byCluster.get(clusterId) ?? [])
    if (workstations.length === 0) return []
    const targetBBox = workstationBounds(workstations)
    const zoneId = definition.id.startsWith('zone-area-') ? definition.id.slice('zone-area-'.length) : null
    return [{
      id: definition.id,
      // Keep the selector a stable spatial label. Live seat totals belong in
      // the scope summary, not in a display name that can become stale.
      label: definition.label,
      short: definition.short,
      clusterIds: definition.clusterIds,
      workstationIds: workstations.map((workstation) => workstation.id),
      targetBBox,
      contextBBox: expandAndClamp(targetBBox, DISPLAY_CONTEXT_PADDING_PT, bounds),
      scope: zoneId ? { kind: 'zone', zoneId } : { kind: 'bbox', bbox: targetBBox },
    }]
  })
}
