import type {
  Building,
  DeskCluster,
  ExtractionReport,
  FloorDataset,
  FloorLayout,
  FloorObject,
  FloorObstacle,
  Room,
  Workstation,
  Zone,
} from '../domain/spatial'

/** Raw file contents as produced by tools/floorplan_extract/extract_floor.py. */
export interface FloorFiles {
  layout: unknown
  zones: unknown
  workstations: unknown
  objects: unknown
  obstacles?: unknown
  extraction: unknown
}

export interface FloorMeta {
  building: Building
  sourceName: string
}

function obj(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Floor data: ${what} is not an object`)
  }
  return value as Record<string, unknown>
}

function arr<T>(value: unknown, what: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Floor data: ${what} is not an array`)
  return value as T[]
}

/**
 * Assemble a FloorDataset from generated files. Only checks the file shape;
 * semantic invariants are checked by validateFloorDataset().
 */
export function buildDataset(files: FloorFiles, meta: FloorMeta): FloorDataset {
  const layout = obj(files.layout, 'layout')
  obj(layout.floor, 'layout.floor')
  arr(layout.layers, 'layout.layers')
  const zones = obj(files.zones, 'zones')
  const ws = obj(files.workstations, 'workstations')
  const objects = obj(files.objects, 'objects')
  const obstacles = files.obstacles ? obj(files.obstacles, 'obstacles') : null

  return {
    building: meta.building,
    sourceName: meta.sourceName,
    layout: layout as unknown as FloorLayout,
    zones: arr<Zone>(zones.zones, 'zones.zones'),
    rooms: arr<Room>(zones.rooms, 'zones.rooms'),
    obstacles: obstacles ? arr<FloorObstacle>(obstacles.obstacles, 'obstacles.obstacles') : [],
    clusters: arr<DeskCluster>(ws.clusters, 'workstations.clusters'),
    workstations: arr<Workstation>(ws.workstations, 'workstations.workstations'),
    objects: arr<FloorObject>(objects.objects, 'objects.objects'),
    extraction: obj(files.extraction, 'extraction') as unknown as ExtractionReport,
  }
}
