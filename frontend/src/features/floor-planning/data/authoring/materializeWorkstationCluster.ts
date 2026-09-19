/**
 * Authoring helper for repeated workstation patterns.
 *
 * A pattern is expanded once into ordinary DeskCluster + Workstation records.
 * The renderer, editor and allocation model consume only those materialized
 * records; they never evaluate this template at runtime. This keeps every desk
 * independently addressable and editable after import.
 */
import { bboxOfPoints, rectangle, rotateQuarter } from '../../domain/geometry'
import { placementPolygon, type QuarterRotation, type SpatialPlacement } from '../../domain/placement'
import type { BBox, DeskCluster, Point, Workstation } from '../../domain/spatial'

export interface WorkstationTemplate {
  id: string
  /** Footprint at rotation 0, in the floor's coordinate units. */
  width: number
  depth: number
  chair: {
    width: number
    depth: number
    /** Clear distance from the desk edge, in floor units. */
    gap: number
  }
  nominalSizeMm?: [number, number]
}

export interface WorkstationClusterPattern {
  clusterId: string
  floorId: string
  zoneId: string | null
  gridRef: string
  workstationIdPrefix: string
  workstationIdStart: number
  /** Centre of the first desk (row 0, column 0). */
  origin: Point
  rows: number
  columns: number
  rowPitch: number
  columnPitch: number
  /** One explicit orientation per row; no implicit visual inference. */
  rowRotations: QuarterRotation[]
  template: WorkstationTemplate
}

export interface MaterializedWorkstationCluster {
  cluster: DeskCluster
  workstations: Workstation[]
}

function assertPattern(pattern: WorkstationClusterPattern): void {
  if (!Number.isInteger(pattern.rows) || pattern.rows < 1) throw new Error('Cluster pattern rows must be a positive integer')
  if (!Number.isInteger(pattern.columns) || pattern.columns < 1) throw new Error('Cluster pattern columns must be a positive integer')
  if (!Number.isInteger(pattern.workstationIdStart) || pattern.workstationIdStart < 0) {
    throw new Error('Cluster pattern workstationIdStart must be a non-negative integer')
  }
  if (pattern.rowRotations.length !== pattern.rows) throw new Error('Cluster pattern needs one row rotation per row')
  for (const value of [pattern.rowPitch, pattern.columnPitch, pattern.template.width, pattern.template.depth]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Cluster pattern dimensions and pitches must be positive')
  }
  for (const value of [pattern.template.chair.width, pattern.template.chair.depth, pattern.template.chair.gap]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Cluster pattern chair dimensions must be non-negative')
  }
}

function padId(value: number): string {
  return String(value).padStart(3, '0')
}

/** Chair footprint south of a rotation-0 desk, then rigidly rotated with it. */
function chairAt(placement: SpatialPlacement, template: WorkstationTemplate): NonNullable<Workstation['chair']> {
  const center: Point = [
    placement.x,
    placement.y + template.depth / 2 + template.chair.gap + template.chair.depth / 2,
  ]
  const halfWidth = template.chair.width / 2
  const halfDepth = template.chair.depth / 2
  const bbox: BBox = [center[0] - halfWidth, center[1] - halfDepth, center[0] + halfWidth, center[1] + halfDepth]
  const origin: Point = [placement.x, placement.y]
  const rotate = (point: Point) => rotateQuarter(point, origin, placement.rotation as QuarterRotation)
  const rotated = rectangle(bbox).map(rotate)
  return { center: rotate(center), bbox: bboxOfPoints(rotated) }
}

/**
 * Deterministically expands a compact authoring pattern into canonical runtime
 * entities. Output order is row-major and therefore serializes repeatably.
 */
export function materializeWorkstationCluster(
  pattern: WorkstationClusterPattern,
): MaterializedWorkstationCluster {
  assertPattern(pattern)
  const workstations: Workstation[] = []
  const sourceRule = `${pattern.rows}x${pattern.columns} row-major workstation pattern; materialized for individual review and editing`

  for (let row = 0; row < pattern.rows; row++) {
    for (let column = 0; column < pattern.columns; column++) {
      const sequence = pattern.workstationIdStart + row * pattern.columns + column
      const id = `${pattern.workstationIdPrefix}${padId(sequence)}`
      const placement: SpatialPlacement = {
        entityId: id,
        x: pattern.origin[0] + column * pattern.columnPitch,
        y: pattern.origin[1] + row * pattern.rowPitch,
        width: pattern.template.width,
        depth: pattern.template.depth,
        rotation: pattern.rowRotations[row],
      }
      const polygon = placementPolygon(placement)
      workstations.push({
        id,
        floorId: pattern.floorId,
        clusterId: pattern.clusterId,
        zoneId: pattern.zoneId,
        classification: 'WORKSTATION',
        verification: 'EXTRACTED',
        polygon,
        center: [placement.x, placement.y],
        rotationDeg: placement.rotation,
        bbox: bboxOfPoints(polygon),
        chair: chairAt(placement, pattern.template),
        gridRef: pattern.gridRef,
        source: {
          kind: 'authoring-rule',
          templateId: pattern.template.id,
          nominalSizeMm: pattern.template.nominalSizeMm,
          rule: sourceRule,
        },
        notes: ['Materialized from an authoring pattern; verify against the source drawing before approval.'],
      })
    }
  }

  const allDeskPoints = workstations.flatMap((workstation) => workstation.polygon)
  const center: Point = [
    workstations.reduce((sum, workstation) => sum + workstation.center[0], 0) / workstations.length,
    workstations.reduce((sum, workstation) => sum + workstation.center[1], 0) / workstations.length,
  ]
  return {
    cluster: {
      id: pattern.clusterId,
      floorId: pattern.floorId,
      zoneId: pattern.zoneId,
      zoneIds: pattern.zoneId ? [pattern.zoneId] : [],
      verification: 'EXTRACTED',
      center,
      bbox: bboxOfPoints(allDeskPoints),
      gridRef: pattern.gridRef,
      workstationIds: workstations.map((workstation) => workstation.id),
      notes: ['Materialized from an authoring pattern; member workstations are independent canonical entities.'],
    },
    workstations,
  }
}
