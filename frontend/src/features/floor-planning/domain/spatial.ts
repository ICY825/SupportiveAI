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
 * EXTRACTED        derived from source vectors by a documented rule; needs human confirmation
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
  kind: 'pdf-annotation' | 'pdf-vector' | 'pdf-text'
  geometry?: string
  annotationId?: string
  annotationType?: string
  labelAnnotationId?: string | null
  deskLabel?: string
  nominalSizeMm?: [number, number]
  rule?: string
  text?: string
}

interface SpatialEntity {
  id: string
  floorId: string
  verification: VerificationState
  bbox: BBox
  gridRef: string
  source?: EntitySource
  notes: string[]
}

export interface Zone extends SpatialEntity {
  type: 'WORKSPACE_ZONE' | 'UNKNOWN'
  /** null = no label on the source */
  name: string | null
  polygon: Point[]
  /** where the name is drawn: the source label position when there is one */
  labelAnchor: Point
  labelAnchorSource: string
  areaM2: number
  sourceColor: string | null
  sourceLabel: string | null
  /** number in parentheses on the source label; meaning is not stated on the drawing */
  sourceLabelFigure: number | null
  source: EntitySource
}

export interface Room extends SpatialEntity {
  type: 'ROOM'
  zoneId: string | null
  name: string
  polygon: Point[]
  areaM2: number
  source: EntitySource
}

export interface DeskCluster extends Omit<SpatialEntity, 'source'> {
  zoneId: string | null
  zoneIds: string[]
  center: Point
  workstationIds: string[]
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
}

/** Everything the renderer needs for one floor. Pure data, no UI. */
export interface FloorDataset {
  building: Building
  layout: FloorLayout
  zones: Zone[]
  rooms: Room[]
  clusters: DeskCluster[]
  workstations: Workstation[]
  objects: FloorObject[]
  extraction: ExtractionReport
  /** human-readable source name shown in the UI */
  sourceName: string
}

export type EntityKind = 'zone' | 'room' | 'cluster' | 'workstation' | 'object'

export interface EntityRef {
  kind: EntityKind
  id: string
}
