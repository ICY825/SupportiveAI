import { bboxOfPoints, pointInPolygon, polygonsOverlap, rectangle } from '../domain/geometry'
import type { BBox, FloorDataset, FloorDisplayAreaDefinition, Point, Workstation } from '../domain/spatial'
import { defaultWorkspaceScope, resolveWorkspaceScope, workstationInScope, type WorkspaceScope } from './scope'

/**
 * UI-only grouping of extracted clusters. These are display/editing areas, not
 * business zones or new physical entities.
 */
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

const definitionPolygon = (definition: FloorDisplayAreaDefinition): Point[] => {
  if (definition.polygon && definition.polygon.length >= 3) return definition.polygon
  return definition.bbox ? rectangle(definition.bbox) : []
}

const workstationBounds = (workstations: readonly Workstation[]): BBox =>
  bboxOfPoints(workstations.flatMap((workstation) => workstation.polygon))

const containsDefinition = (definition: FloorDisplayAreaDefinition, point: Point): boolean => {
  const polygon = definitionPolygon(definition)
  return polygon.length >= 3 && pointInPolygon(point, polygon)
}

const uniqueClusterIds = (workstations: readonly Workstation[]): string[] => [...new Set(workstations.map((workstation) => workstation.clusterId))]

/** Builds the default display scopes from canonical cluster/workstation membership. */
export function buildWorkspaceDisplayAreas(dataset: FloorDataset): WorkspaceDisplayArea[] {
  return buildWorkspaceDisplayAreasForScope(dataset, defaultWorkspaceScope(dataset))
}

export interface DisplayAreaDefinitionIssue {
  level: 'error' | 'warning'
  entityId: string
  message: string
}

/**
 * Validates the curated metadata without turning it into a source Zone. The
 * page already exposes dataset warnings in its debug panel, so a stale or
 * overlapping UI definition is visible and testable instead of disappearing
 * from the picker.
 */
export function validateDisplayAreaDefinitions(dataset: FloorDataset): DisplayAreaDefinitionIssue[] {
  const issues: DisplayAreaDefinitionIssue[] = []
  const definitions = dataset.displayAreas ?? []
  const floor = [0, 0, dataset.layout.floor.width, dataset.layout.floor.height] as BBox
  const departmentCodes = new Set(dataset.zones.map((zone) => zone.departmentCode).filter((code): code is string => Boolean(code)))

  for (const definition of definitions) {
    const polygon = definitionPolygon(definition)
    if (polygon.length < 3) {
      issues.push({ level: 'error', entityId: definition.id, message: 'display area has no valid polygon or bbox' })
      continue
    }
    if (!departmentCodes.has(definition.departmentCode)) {
      issues.push({ level: 'warning', entityId: definition.id, message: `display area references unknown department ${definition.departmentCode}` })
    }
    const [x0, y0, x1, y1] = bboxOfPoints(polygon)
    if (x0 < floor[0] || y0 < floor[1] || x1 > floor[2] || y1 > floor[3]) {
      issues.push({ level: 'warning', entityId: definition.id, message: 'display area geometry extends beyond the floor and will be clamped' })
    }
    const hasCanonicalDesk = dataset.workstations.some((workstation) =>
      workstation.source?.kind !== 'user-authored' &&
      workstation.zoneId !== null &&
      dataset.zones.find((zone) => zone.id === workstation.zoneId)?.departmentCode === definition.departmentCode &&
      containsDefinition(definition, workstation.center),
    )
    if (!hasCanonicalDesk) {
      issues.push({ level: 'warning', entityId: definition.id, message: 'display area contains no canonical workstation; definition may be stale' })
    }
  }

  for (let i = 0; i < definitions.length; i += 1) {
    const a = definitions[i]
    const aPolygon = definitionPolygon(a)
    if (aPolygon.length < 3) continue
    for (let j = i + 1; j < definitions.length; j += 1) {
      const b = definitions[j]
      if (a.departmentCode !== b.departmentCode) continue
      const bPolygon = definitionPolygon(b)
      if (bPolygon.length >= 3 && polygonsOverlap(aPolygon, bPolygon)) {
        issues.push({ level: 'error', entityId: a.id, message: `display area overlaps ${b.id} within department ${a.departmentCode}` })
      }
    }
  }
  return issues
}

/**
 * Builds UI view scopes for any canonical workspace scope. Floor-authored
 * display metadata supplies curated geometry; a zone-backed fallback covers
 * anything stale or unclaimed without inventing workstation membership.
 */
export function buildWorkspaceDisplayAreasForScope(dataset: FloorDataset, departmentScope: WorkspaceScope): WorkspaceDisplayArea[] {
  if (departmentScope.kind !== 'department') return []
  const resolved = resolveWorkspaceScope(dataset, departmentScope)
  const accepted = dataset.workstations.filter((workstation) => workstationInScope(workstation, resolved))
  const bounds = floorBounds(dataset)

  const acceptedDepartmentCodes = new Set(
    resolved.zoneIds
      .map((zoneId) => dataset.zones.find((zone) => zone.id === zoneId)?.departmentCode)
      .filter((code): code is string => Boolean(code)),
  )
  const curatedDefinitions = (dataset.displayAreas ?? []).filter((definition) => acceptedDepartmentCodes.has(definition.departmentCode))

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
  const claimed = new Set<string>()
  const curated = curatedDefinitions.map((definition) => {
    const extracted = accepted.filter((workstation) => workstation.source?.kind !== 'user-authored')
    const geometryWorkstations = extracted.filter((workstation) => containsDefinition(definition, workstation.center))
    const geometryClusterIds = new Set(geometryWorkstations.map((workstation) => workstation.clusterId))
    const workstations = accepted.filter((workstation) =>
      !claimed.has(workstation.id) && (
        containsDefinition(definition, workstation.center) ||
        (workstation.source?.kind === 'user-authored' && geometryClusterIds.has(workstation.clusterId))
      ),
    )
    for (const workstation of workstations) claimed.add(workstation.id)
    return {
      definition,
      // Canonical desks are always claimed by geometry. Authored desks keep
      // the area of their source template, so a valid placement just outside
      // the compact curated bbox does not disappear from the active editor.
      workstations,
    }
  })
  const leftoverByZone = new Map<string, Workstation[]>()
  for (const workstation of accepted) {
    if (claimed.has(workstation.id) || !workstation.zoneId) continue
    leftoverByZone.set(workstation.zoneId, [...(leftoverByZone.get(workstation.zoneId) ?? []), workstation])
  }
  const definitions: Array<{ definition: FloorDisplayAreaDefinition; workstations: Workstation[] }> = [
    ...curated,
    ...[...leftoverByZone.entries()].map(([zoneId, workstations], index) => ({
      definition: {
        id: `zone-area-${zoneId}`,
        label: `Khu vực ${String.fromCharCode(65 + curated.length + index)}`,
        short: String.fromCharCode(65 + curated.length + index),
        departmentCode: dataset.zones.find((zone) => zone.id === zoneId)?.departmentCode ?? '',
      },
      workstations,
    })),
  ]

  return definitions.flatMap(({ definition, workstations }) => {
    if (workstations.length === 0) return []
    const targetBBox = workstationBounds(workstations)
    const zoneId = definition.id.startsWith('zone-area-') ? definition.id.slice('zone-area-'.length) : null
    const padding = definition.contextPaddingMm !== undefined
      ? Math.max(0, definition.contextPaddingMm / dataset.layout.floor.mmPerPt)
      : DISPLAY_CONTEXT_PADDING_PT
    return [{
      id: definition.id,
      label: definition.label,
      short: definition.short,
      clusterIds: uniqueClusterIds(workstations),
      workstationIds: workstations.map((workstation) => workstation.id),
      targetBBox,
      contextBBox: expandAndClamp(targetBBox, padding, bounds),
      scope: zoneId ? { kind: 'zone', zoneId } : { kind: 'bbox', bbox: targetBBox },
    }]
  })
}
