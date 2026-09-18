/**
 * Spatial (physical) model for office floors.
 *
 *   Building
 *     └── Floor
 *          ├── Zone            (source markup area, usually a department's area)
 *          │    ├── DeskCluster
 *          │    │     └── Workstation   (physical desk object on the drawing)
 *          │    └── Room
 *          └── FloorObject     (facilities, UNKNOWN objects)
 *
 * A Workstation is NOT a Seat. Seats (assignable capacity) and assignments live
 * in ./allocation.ts and are attached later, after Admin/HR verification.
 *
 * Coordinates are PDF user-space points, top-left origin, identical to the
 * source raster space. `Floor.mmPerPt` converts to millimetres.
 */

export type Classification = 'WORKSTATION' | 'FURNITURE' | 'FACILITY' | 'STRUCTURAL' | 'UNKNOWN'

/**
 * SOURCE_VERIFIED  taken verbatim from the authoritative source (annotation/label present)
 * EXTRACTED        derived from source geometry or a documented authoring rule; needs human confirmation
 * UNVERIFIED       partially derived (e.g. label found, outline not identified)
 * UNKNOWN          identity or meaning cannot be determined from the source
 */
export type VerificationState = 'SOURCE_VERIFIED' | 'EXTRACTED' | 'UNVERIFIED' | 'UNKNOWN'

export type Point = [number, number]
/** [x0, y0, x1, y1] */
export type BBox = [number, number, number, number]

export interface Building {
  id: string
  /** null when the source does not state it */
  name: string | null
}

export interface Floor {
  id: string
  level: number
  buildingId: string
  name: string
  sourceTitle: string
  sourceScale: string
  sourcePdf: string
  coordinateSpace: 'pdf-points-top-left'
  width: number
  height: number
  mmPerPt: number
}

export interface SourceRaster {
  /** path relative to the app's public base */
  path: string
  width: number
  height: number
  pxPerPt: number
  includesAnnotations: boolean
}

export interface GridAxis {
  name: string
  x?: number
  y?: number
}

export type BaseLayerId =
  | 'facade'
  | 'structure'
  | 'core'
  | 'walls'
  | 'partitions'
  | 'doors'
  | 'fixtures'
  | 'furniture'
  | 'grid'
  | 'dimensions'

export interface BaseLayer {
  id: BaseLayerId
  classification: Classification
  classifications: Classification[]
  cadLayers: string[]
  /** SVG path data in floor coordinates */
  d: string
}

export interface MapLabel {
  text: string
  x: number
  y: number
  size: number
  angle: number
}

export interface FloorLayout {
  sourcePdfSha256: string
  floor: Floor
  sourceRaster: SourceRaster
  grid: { columns: GridAxis[]; rows: GridAxis[] }
  layers: BaseLayer[]
  labels: MapLabel[]
}

export interface EntitySource {
  kind: 'pdf-annotation' | 'pdf-vector' | 'pdf-text' | 'authoring-rule' | 'user-authored'
  geometry?: string
  annotationId?: string
  annotationType?: string
  /**
   * Where a zone's NAME came from, which is not always where its geometry came
   * from. `team` means people stated the department; the drawing does not say
   * it, so the zone stays UNVERIFIED until a corrected sheet carries the label.
   */
  nameSource?: 'pdf-annotation' | 'team'
  labelAnnotationId?: string | null
  deskLabel?: string
  nominalSizeMm?: [number, number]
  rule?: string
  /** Authoring-time template only; runtime rendering never evaluates it. */
  templateId?: string
  text?: string
  /** Provenance for user-authored entities and future re-extraction reconciliation. */
  authoredBy?: string
  authoredAt?: string
  sourcePdfSha256?: string
  deskCode?: string
}

export interface SpatialEntity {
  id: string
  floorId: string
  verification: VerificationState
  bbox: BBox
  gridRef: string
  source?: EntitySource
  notes: string[]
}

export type SolidObstacleKind = 'column' | 'wall'
export type ClearanceObstacleKind = 'door-clearance'
export type ObstacleKind = SolidObstacleKind | ClearanceObstacleKind
export type ObstacleCategory = 'solid' | 'clearance'

export interface FloorObstacle extends SpatialEntity {
  kind: ObstacleKind
  category: ObstacleCategory
  polygon: Point[]
  bbox: BBox
  name?: string | null
  doorId?: string
  hinge?: Point
  radiusMm?: number
  center?: Point
}

export interface Zone extends SpatialEntity {
  type: 'WORKSPACE_ZONE' | 'UNKNOWN'
  /** null = no label on the source */
  name: string | null
  /**
   * Which department occupies this zone, as `shared/department` codes it.
   * Null when the drawing highlights an area nobody has claimed. Two zones can
   * share a code: AI Platform holds two blocks split by the lift cores.
   */
  departmentCode: string | null
  polygon: Point[]
  /** where the name is drawn: the source label position when there is one */
  labelAnchor: Point
  labelAnchorSource: string
  areaM2: number
  sourceColor: string | null
  /** Optional per-zone fill opacity used by the verification map. */
  sourceOpacity?: number
  sourceLabel: string | null
  /** number in parentheses on the source label; meaning is not stated on the drawing */
  sourceLabelFigure: number | null
  source: EntitySource
}

export interface Room extends SpatialEntity {
  type: import('./roomTypes').RoomType
  zoneId: string | null
  name: string
  /** The room's outline; for a room in several pieces, its first piece. */
  polygon: Point[]
  /**
   * Further pieces of the same room, such as a lounge split by a corridor.
   * Read the shape through `roomParts`, never `polygon` alone.
   */
  extraPolygons?: Point[][]
  areaM2: number
  source: EntitySource
}

export interface DeskCluster extends Omit<SpatialEntity, 'source'> {
  zoneId: string | null
  zoneIds: string[]
  center: Point
  workstationIds: string[]
}

/** UI focus metadata layered over canonical floor geometry; never a Zone. */
export interface FloorDisplayAreaDefinition {
  id: string
  label: string
  short: string
  departmentCode: string
  polygon?: Point[]
  bbox?: BBox
  contextPaddingMm?: number
}

export interface Workstation extends SpatialEntity {
  clusterId: string
  zoneId: string | null
  classification: Classification
  polygon: Point[]
  center: Point
  rotationDeg: number
  chair: { center: Point; bbox: BBox } | null
  source: EntitySource
}

export interface FloorObject extends SpatialEntity {
  zoneId: string | null
  kind: string
  name: string
  classification: Classification
  polygon: Point[]
  source: EntitySource
}

export interface ExtractionReport {
  pdf: {
    producer: string
    creator: string
    pages: number
    rasterImages: number
    vectorPathObjects: number
    textLines: number
    annotations: number
  }
  scale: { mmPerPtX: number; mmPerPtY: number }
  skippedCadLayers: Record<string, number>
  desks: Record<string, number | string>
  chairSymbolsDetected: number
  chairsPairedToDesks: number
  classificationCounts: Partial<Record<Classification, number>>
  clusters: number
  workstationsByZone: Record<string, number>
  ignoredAnnotations: { annotationId: string; type: string; opacity: number; bbox: BBox; reason: string }[]
  obstacles?: {
    columns: number
    doorClearances: number
    total: number
  }
}

/** Everything the renderer needs for one floor. Pure data, no UI. */
export interface FloorDataset {
  building: Building
  layout: FloorLayout
  zones: Zone[]
  rooms: Room[]
  obstacles: FloorObstacle[]
  clusters: DeskCluster[]
  workstations: Workstation[]
  objects: FloorObject[]
  extraction: ExtractionReport
  /** Optional floor-authored UI grouping metadata, separate from source zones. */
  displayAreas?: FloorDisplayAreaDefinition[]
  /** human-readable source name shown in the UI */
  sourceName: string
}

export type EntityKind = 'zone' | 'room' | 'cluster' | 'workstation' | 'object'

export interface EntityRef {
  kind: EntityKind
  id: string
}
