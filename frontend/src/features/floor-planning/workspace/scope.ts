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
    // Two zones, one department: the lift and stair cores split the block.
    // Listing only the first hides 38 of its 154 desks.
    zoneIds: ['zone-16-ai-platform', 'zone-16-ai-platform-02'],
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
  // Two zones, one department: the lift and stair cores split Mô hình & Nền
  // tảng AI into a block of 116 desks east of them and 38 west.
  'zone-16-ai-platform': 'Zone B',
  'zone-16-ai-platform-02': 'Zone B',
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

/**
 * Which department owns a zone — the reverse of DEPARTMENT_GEOMETRY_LINKS.
 *
 * Needed for deep links: `?select=workstation:ws-16-001` has to open the map on
 * the department that desk belongs to, instead of stopping at the chooser and
 * losing the link's whole point.
 */
/**
 * The zones a department occupies.
 *
 * Prefers the drawing: every zone carries `departmentCode`, so real data needs
 * no table at all. DEPARTMENT_GEOMETRY_LINKS remains for the demo fixtures,
 * whose department ids (`dept-ai-data`) are not codes and never appear in a
 * dataset. Delete it once the fixtures speak codes too.
 */
export function zonesOfDepartment(dataset: FloorDataset, departmentId: string): readonly string[] {
  const byCode = dataset.zones
    .filter((zone) => zone.departmentCode === departmentId)
    .map((zone) => zone.id)
  if (byCode.length > 0) return byCode
  return (
    DEPARTMENT_GEOMETRY_LINKS.find(
      (item) => item.floorId === dataset.layout.floor.id && item.departmentId === departmentId,
    )?.zoneIds ?? []
  )
}

export function departmentOfZone(dataset: FloorDataset, zoneId: string | null): string | null {
  if (!zoneId) return null
  const link = DEPARTMENT_GEOMETRY_LINKS.find(
    (item) => item.floorId === dataset.layout.floor.id && item.zoneIds.includes(zoneId),
  )
  return link?.departmentId ?? null
}

/** The department a selected entity sits in, when it is a desk. */
export function departmentOfEntity(dataset: FloorDataset, kind: string, id: string): string | null {
  if (kind !== 'workstation') return null
  const workstation = dataset.workstations.find((item) => item.id === id)
  return workstation ? departmentOfZone(dataset, workstation.zoneId) : null
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

  const zoneIds = scope.kind === 'zone' ? [scope.zoneId] : zonesOfDepartment(dataset, scope.departmentId)
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
