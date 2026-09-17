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

/**
 * Builds six navigable AI display areas from canonical cluster/workstation
 * membership. Returns no areas for floors without an explicit display map.
 */
export function buildWorkspaceDisplayAreas(dataset: FloorDataset): WorkspaceDisplayArea[] {
  const departmentScope = defaultWorkspaceScope(dataset)
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

  return AI_AREA_DEFINITIONS.flatMap((definition) => {
    const workstations = definition.clusterIds.flatMap((clusterId) => byCluster.get(clusterId) ?? [])
    if (workstations.length === 0) return []
    const targetBBox = workstationBounds(workstations)
    return [{
      id: definition.id,
      label: `${definition.label} · ${workstations.length} chỗ`,
      short: definition.short,
      clusterIds: definition.clusterIds,
      workstationIds: workstations.map((workstation) => workstation.id),
      targetBBox,
      contextBBox: expandAndClamp(targetBBox, DISPLAY_CONTEXT_PADDING_PT, bounds),
      scope: { kind: 'bbox', bbox: targetBBox } as WorkspaceScope,
    }]
  })
}
