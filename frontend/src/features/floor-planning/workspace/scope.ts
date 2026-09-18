import { bboxOfPoints, rectangle } from '../domain/geometry'
import type { BBox, FloorDataset, Point, Workstation } from '../domain/spatial'

/** A view over canonical floor geometry. It never owns or duplicates desks. */
export type WorkspaceScope =
  | { kind: 'department'; departmentId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'bbox'; bbox: BBox }

/**
 * The source drawing has zones, while department ids currently come from the
 * allocation layer. Keep that incomplete business-to-geometry link here, at
 * the workspace boundary, rather than teaching the renderer department names.
 */
interface DepartmentGeometryLink {
  floorId: string
  departmentId: string
  zoneIds: readonly string[]
}

const DEPARTMENT_GEOMETRY_LINKS: readonly DepartmentGeometryLink[] = [
  {
    floorId: 'floor-16',
    departmentId: 'dept-ai-data',
    zoneIds: ['zone-16-ai-platform'],
  },
  {
    floorId: 'floor-16',
    departmentId: 'dept-smart-city',
    zoneIds: ['zone-16-bds-smart-city'],
  },
  {
    floorId: 'floor-16',
    departmentId: 'dept-gsm',
    zoneIds: ['zone-16-kd-vh-gsm'],
  },
  {
    floorId: 'floor-16',
    departmentId: 'dept-vinfast-kdo2o',
    zoneIds: ['zone-16-vinfast-kdo2o'],
  },
]

/**
 * Building wing (Zone A / Zone B) mapping for Technopark Tower departments.
 * Zone A: Upper wing (Khu A / Phía trên - trục 7 đến 4: GSM, VinFast, Smart City).
 * Zone B: Lower wing (Khu B / Phía dưới - trục 4.1 đến 1: AI & Data, Unlabeled zone).
 */
export const DEPARTMENT_WING_ZONES: Record<string, 'Zone A' | 'Zone B'> = {
  'dept-ai-data': 'Zone B',
  'dept-smart-city': 'Zone A',
  'dept-gsm': 'Zone A',
  'dept-vinfast-kdo2o': 'Zone A',
}

export const ZONE_WING_MAPPING: Record<string, 'Zone A' | 'Zone B'> = {
  'zone-16-ai-platform': 'Zone B',
  'zone-16-unlabeled-01': 'Zone B',
  'zone-16-kd-vh-gsm': 'Zone A',
  'zone-16-vinfast-kdo2o': 'Zone A',
  'zone-16-bds-smart-city': 'Zone A',
}

export function resolveDepartmentWingZone(scope: WorkspaceScope | null, zoneIds?: readonly string[]): 'Zone A' | 'Zone B' {
  if (scope?.kind === 'department' && DEPARTMENT_WING_ZONES[scope.departmentId]) {
    return DEPARTMENT_WING_ZONES[scope.departmentId]
  }
  if (scope?.kind === 'zone' && ZONE_WING_MAPPING[scope.zoneId]) {
    return ZONE_WING_MAPPING[scope.zoneId]
  }
  if (zoneIds) {
    for (const id of zoneIds) {
      if (ZONE_WING_MAPPING[id]) return ZONE_WING_MAPPING[id]
    }
  }
  return 'Zone B'
}

export interface ResolvedWorkspaceScope {
  scope: WorkspaceScope
  bbox: BBox
  polygons: Point[][]
  zoneIds: readonly string[]
  label: string
  sourceLabel: string | null
  sourceLabelFigure: number | null
}

const EMPTY_BBOX: BBox = [0, 0, 1, 1]

const unionBounds = (polygons: readonly Point[][]): BBox => {
  const points = polygons.flat()
  return points.length ? bboxOfPoints(points) : EMPTY_BBOX
}

const normalizedBBox = ([x0, y0, x1, y1]: BBox): BBox => [
  Math.min(x0, x1),
  Math.min(y0, y1),
  Math.max(x0, x1),
  Math.max(y0, y1),
]

export function departmentScopeForFloor(dataset: FloorDataset): WorkspaceScope | null {
  const link = DEPARTMENT_GEOMETRY_LINKS.find((item) => item.floorId === dataset.layout.floor.id)
  return link ? { kind: 'department', departmentId: link.departmentId } : null
}

export function defaultWorkspaceScope(dataset: FloorDataset): WorkspaceScope {
  return departmentScopeForFloor(dataset) ?? {
    kind: 'bbox',
    bbox: [0, 0, dataset.layout.floor.width, dataset.layout.floor.height],
  }
}

export function resolveWorkspaceScope(dataset: FloorDataset, scope: WorkspaceScope): ResolvedWorkspaceScope {
  if (scope.kind === 'bbox') {
    const bbox = normalizedBBox(scope.bbox)
    return {
      scope,
      bbox,
      polygons: [rectangle(bbox)],
      zoneIds: [],
      label: 'Khu vực tập trung',
      sourceLabel: null,
      sourceLabelFigure: null,
    }
  }

  const zoneIds = scope.kind === 'zone'
    ? [scope.zoneId]
    : (DEPARTMENT_GEOMETRY_LINKS.find(
        (item) => item.floorId === dataset.layout.floor.id && item.departmentId === scope.departmentId,
      )?.zoneIds ?? [])
  const zones = zoneIds
    .map((id) => dataset.zones.find((zone) => zone.id === id))
    .filter((zone): zone is FloorDataset['zones'][number] => zone !== undefined)
  const primary = zones[0]
  return {
    scope,
    bbox: unionBounds(zones.map((zone) => zone.polygon)),
    polygons: zones.map((zone) => zone.polygon),
    zoneIds: zones.map((zone) => zone.id),
    label: primary?.name ?? (scope.kind === 'department' ? scope.departmentId : scope.zoneId),
    sourceLabel: primary?.sourceLabel ?? null,
    sourceLabelFigure: primary?.sourceLabelFigure ?? null,
  }
}

export function workstationInScope(workstation: Workstation, resolved: ResolvedWorkspaceScope): boolean {
  if (resolved.scope.kind !== 'bbox') return workstation.zoneId !== null && resolved.zoneIds.includes(workstation.zoneId)
  const [x, y] = workstation.center
  const [x0, y0, x1, y1] = resolved.bbox
  return x >= x0 && x <= x1 && y >= y0 && y <= y1
}

export function workspaceScopeKey(scope: WorkspaceScope): string {
  return scope.kind === 'department'
    ? `department:${scope.departmentId}`
    : scope.kind === 'zone'
      ? `zone:${scope.zoneId}`
      : `bbox:${scope.bbox.join(',')}`
}
