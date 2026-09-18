import { bboxOfPoints, polygonArea, polygonContainsBBox, polygonIsSimple, polygonsOverlap, polygonsOverlapBeyond, rectangle } from './geometry'
import type { FloorDataset, Room, Workstation, Point, BBox } from './spatial'
import { normalizeRotation, placementBounds, placementPolygon, type SpatialPlacement } from './placement'
import { regularizeZonePolygon } from './zoneGeometry'
import type { RoomType } from './roomTypes'
import { roomParts } from './roomOutline'

export interface AuthoredEntities {
  workstations: readonly Workstation[]
  rooms: readonly Room[]
  /** IDs from the source dataset hidden by an explicit user deletion. */
  removedWorkstationIds: readonly string[]
  /** High-water mark. Deleted numbers remain here and are never reused. */
  issuedDeskNumbers: readonly number[]
  sourcePdfSha256?: string
}

export interface AuthoredEntityChanges {
  workstations?: readonly Workstation[]
  rooms?: readonly Room[]
  removeWorkstationIds?: readonly string[]
  removeRoomIds?: readonly string[]
  issuedDeskNumbers?: readonly number[]
  sourcePdfSha256?: string
}

export const EMPTY_AUTHORED_ENTITIES: AuthoredEntities = {
  workstations: [],
  rooms: [],
  removedWorkstationIds: [],
  issuedDeskNumbers: [],
}

const clone = (value: AuthoredEntities): AuthoredEntities => ({
  workstations: [...value.workstations],
  rooms: [...value.rooms],
  removedWorkstationIds: [...(value.removedWorkstationIds ?? [])],
  issuedDeskNumbers: [...value.issuedDeskNumbers],
  ...(value.sourcePdfSha256 ? { sourcePdfSha256: value.sourcePdfSha256 } : {}),
})

export function mergeAuthoredEntities(current: AuthoredEntities, changes: AuthoredEntityChanges): AuthoredEntities {
  const removeWorkstations = new Set(changes.removeWorkstationIds ?? [])
  const removeRooms = new Set(changes.removeRoomIds ?? [])
  const workstations = new Map(current.workstations.filter((item) => !removeWorkstations.has(item.id)).map((item) => [item.id, item]))
  const rooms = new Map(current.rooms.filter((item) => !removeRooms.has(item.id)).map((item) => [item.id, item]))
  for (const item of changes.workstations ?? []) workstations.set(item.id, item)
  for (const item of changes.rooms ?? []) rooms.set(item.id, item)
  return {
    workstations: [...workstations.values()],
    rooms: [...rooms.values()],
    removedWorkstationIds: [...new Set([...(current.removedWorkstationIds ?? []), ...removeWorkstations])].sort(),
    issuedDeskNumbers: [...new Set([...current.issuedDeskNumbers, ...(changes.issuedDeskNumbers ?? [])])].sort((a, b) => a - b),
    sourcePdfSha256: changes.sourcePdfSha256 ?? current.sourcePdfSha256,
  }
}

function validAuthored(value: unknown): value is AuthoredEntities {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AuthoredEntities>
  return Array.isArray(candidate.workstations)
    && Array.isArray(candidate.rooms)
    && Array.isArray(candidate.issuedDeskNumbers)
    && (candidate.removedWorkstationIds === undefined || Array.isArray(candidate.removedWorkstationIds))
}

function parseStored(value: string | null): AuthoredEntities | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return validAuthored(parsed) ? clone(parsed) : null
  } catch {
    return null
  }
}

const STORAGE_PREFIX = 'vsf.authored-entities.'

export function getAuthoredEntityStorageKey(floorId: string): string {
  return `${STORAGE_PREFIX}${floorId}`
}

export interface AuthoredEntityStore {
  read(floorId: string): AuthoredEntities | null
  /** Merges. Absent ids keep what they had — PATCH, never PUT. */
  write(floorId: string, changes: AuthoredEntityChanges): Promise<void>
}

const memory = new Map<string, AuthoredEntities>()

function readStorage(floorId: string): AuthoredEntities | null {
  const memoryValue = memory.get(floorId)
  if (memoryValue) return clone(memoryValue)
  if (typeof window === 'undefined' || !window.localStorage) return null
  const stored = parseStored(window.localStorage.getItem(getAuthoredEntityStorageKey(floorId)))
  if (stored) memory.set(floorId, stored)
  return stored
}

function persist(floorId: string, value: AuthoredEntities): void {
  memory.set(floorId, clone(value))
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(getAuthoredEntityStorageKey(floorId), JSON.stringify(value))
  } catch {
    // Storage is optional; the in-memory seam still keeps the current session usable.
  }
}

export const authoredEntityStore: AuthoredEntityStore = {
  read: readStorage,
  write: async (floorId, changes) => {
    persist(floorId, mergeAuthoredEntities(readStorage(floorId) ?? EMPTY_AUTHORED_ENTITIES, changes))
  },
}

export function clearAuthoredEntityStore(): void {
  memory.clear()
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let index = window.localStorage.length - 1; index >= 0; index--) {
        const key = window.localStorage.key(index)
        if (key?.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(key)
      }
    }
  } catch {
    // Storage is optional; clearing the in-memory seam is still useful.
  }
}

const pad = (value: number) => String(value).padStart(3, '0')

export function authoredChairBounds(placement: SpatialPlacement, tileSize: number): BBox {
  const [x0, y0, x1, y1] = placementBounds(placement)
  const centerX = (x0 + x1) / 2
  const centerY = (y0 + y1) / 2
  const halfTile = tileSize / 2

  switch (placement.rotation) {
    case 90:
      return [x0 - tileSize, centerY - halfTile, x0, centerY + halfTile]
    case 180:
      return [centerX - halfTile, y0 - tileSize, centerX + halfTile, y0]
    case 270:
      return [x1, centerY - halfTile, x1 + tileSize, centerY + halfTile]
    default:
      return [centerX - halfTile, y1, centerX + halfTile, y1 + tileSize]
  }
}

function authoredPlacementFromWorkstation(workstation: Workstation): SpatialPlacement {
  const [x0, y0, x1, y1] = workstation.bbox
  const rotation = normalizeRotation(workstation.rotationDeg)
  const turned = rotation % 180 !== 0
  return {
    entityId: workstation.id,
    x: x0 + (x1 - x0) / 2,
    y: y0 + (y1 - y0) / 2,
    width: turned ? y1 - y0 : x1 - x0,
    depth: turned ? x1 - x0 : y1 - y0,
    rotation,
  }
}

function normalizeAuthoredWorkstation(dataset: FloorDataset, workstation: Workstation): Workstation {
  if (workstation.source?.kind !== 'user-authored') return workstation
  const chairBbox = authoredChairBounds(authoredPlacementFromWorkstation(workstation), 600 / dataset.layout.floor.mmPerPt)
  return {
    ...workstation,
    chair: {
      bbox: chairBbox,
      center: [(chairBbox[0] + chairBbox[2]) / 2, (chairBbox[1] + chairBbox[3]) / 2],
    },
  }
}

export function nextAuthoredDeskNumber(authored: Pick<AuthoredEntities, 'issuedDeskNumbers' | 'workstations'>): number {
  const observed = authored.workstations
    .map((item) => Number(item.source?.deskCode?.match(/-(\d+)$/)?.[1] ?? item.id.match(/-a(\d+)$/)?.[1] ?? 0))
  const highest = Math.max(899, ...authored.issuedDeskNumbers, ...observed)
  return highest + 1
}

export function authoredDeskId(level: number, number: number): string {
  return `ws-${level}-a${pad(number)}`
}

export function authoredDeskCode(level: number, zoneLetter: string, number: number): string {
  return `F${level}-${zoneLetter}-${number}`
}

export function nextAuthoredRoomId(floorId: string, rooms: readonly Room[]): string {
  const highest = Math.max(0, ...rooms.map((room) => Number(room.id.match(/-a(\d+)$/)?.[1] ?? 0)))
  return `room-${floorId.replace(/[^a-zA-Z0-9]+/g, '-')}-a${pad(highest + 1)}`
}

export function authoredWorkstationFromPlacement({
  dataset,
  placement,
  number,
  zoneId,
  clusterId,
  authoredBy,
  authoredAt,
}: {
  dataset: FloorDataset
  placement: SpatialPlacement
  number: number
  zoneId: string | null
  clusterId: string
  authoredBy: string
  authoredAt: string
}): Workstation {
  const polygon = placementPolygon(placement)
  const chairBbox = authoredChairBounds(placement, 600 / dataset.layout.floor.mmPerPt)
  const level = dataset.layout.floor.level
  const zoneIndex = zoneId ? dataset.zones.findIndex((zone) => zone.id === zoneId) : -1
  return {
    id: placement.entityId,
    floorId: dataset.layout.floor.id,
    clusterId,
    zoneId,
    classification: 'WORKSTATION',
    verification: 'UNVERIFIED',
    polygon,
    center: [placement.x, placement.y],
    rotationDeg: placement.rotation,
    bbox: bboxOfPoints(polygon),
    chair: chairBbox
      ? {
          bbox: chairBbox,
          center: [(chairBbox[0] + chairBbox[2]) / 2, (chairBbox[1] + chairBbox[3]) / 2],
        }
      : null,
    gridRef: zoneIndex >= 0 ? `authored/${dataset.zones[zoneIndex].gridRef}` : 'authored',
    source: {
      kind: 'user-authored',
      authoredBy,
      authoredAt,
      sourcePdfSha256: dataset.layout.sourcePdfSha256,
      deskCode: authoredDeskCode(level, zoneIndex >= 0 ? String.fromCharCode(65 + zoneIndex) : 'X', number),
      nominalSizeMm: [Math.round(placement.width * dataset.layout.floor.mmPerPt), Math.round(placement.depth * dataset.layout.floor.mmPerPt)],
    },
    notes: ['Được tạo trong ứng dụng; chưa xác minh với bản vẽ nguồn.'],
  }
}

export function authoredRoomFromRectangle({ bbox, ...rest }: AuthoredRoomInput & { bbox: BBox }): Room {
  return authoredRoomFromPolygon({ ...rest, polygon: regularizeZonePolygon(rectangle(bbox)) })
}

type AuthoredRoomInput = {
  dataset: FloorDataset
  id: string
  name: string
  type: RoomType
  authoredBy: string
  authoredAt: string
}

/**
 * Any simple outline: L-shaped, notched, or following a 45° wall. Pass several
 * to make one room of separate pieces. Outlines are stored as given; they are
 * not regularized, because that would drop short deliberate edges as if they
 * were stray clicks.
 */
export function authoredRoomFromPolygon({
  dataset,
  polygon,
  id,
  name,
  type,
  authoredBy,
  authoredAt,
}: AuthoredRoomInput & { polygon: readonly Point[] | readonly (readonly Point[])[] }): Room {
  const pieces = (isPointList(polygon) ? [polygon] : polygon).map((piece) => piece.map(([x, y]): Point => [x, y]))
  const [outline, ...extraPolygons] = pieces
  const areaM2 = (pieces.reduce((sum, piece) => sum + polygonArea(piece), 0) * dataset.layout.floor.mmPerPt ** 2) / 1_000_000
  return {
    id,
    floorId: dataset.layout.floor.id,
    verification: 'UNVERIFIED',
    bbox: bboxOfPoints(pieces.flat()),
    gridRef: 'authored',
    name,
    type,
    zoneId: null,
    polygon: outline,
    ...(extraPolygons.length ? { extraPolygons } : {}),
    areaM2,
    source: {
      kind: 'user-authored',
      authoredBy,
      authoredAt,
      sourcePdfSha256: dataset.layout.sourcePdfSha256,
    },
    notes: ['Được tạo trong ứng dụng; chưa xác minh với bản vẽ nguồn.'],
  }
}

const isPointList = (value: readonly Point[] | readonly (readonly Point[])[]): value is readonly Point[] =>
  value.length > 0 && typeof value[0][0] === 'number'

export type AuthoredRoomIssue =
  | { type: 'self-intersecting' }
  | { type: 'parts-overlap' }
  | { type: 'too-small'; areaM2: number }
  | { type: 'outside-floor' }
  | { type: 'overlap-room'; roomId: string; roomName: string }

/**
 * How far outlines may cross before it counts as overlap: about one click's
 * error at normal zoom. Two sides of one partition, or two rooms sharing a
 * wall, are clicked separately and never land on exactly the same line.
 */
export const ROOM_OVERLAP_TOLERANCE_MM = 300

const partsOverlap = (a: Pick<Room, 'polygon' | 'extraPolygons'>, b: Pick<Room, 'polygon' | 'extraPolygons'>, tolerance: number) =>
  roomParts(a).some((part) => roomParts(b).some((other) => polygonsOverlapBeyond(part, other, tolerance)))

export function validateAuthoredRoom(room: Pick<Room, 'bbox' | 'polygon' | 'extraPolygons' | 'areaM2'>, dataset: FloorDataset, otherRooms: readonly Room[] = dataset.rooms): AuthoredRoomIssue[] {
  const parts = roomParts(room)
  // Area and overlap mean nothing for an outline that crosses itself.
  if (!parts.every((part) => polygonIsSimple(part))) return [{ type: 'self-intersecting' }]
  const reasons: AuthoredRoomIssue[] = []
  const tolerance = ROOM_OVERLAP_TOLERANCE_MM / dataset.layout.floor.mmPerPt
  // Pieces may share an edge, like two sides of one partition, but not floor.
  if (parts.some((part, i) => parts.slice(i + 1).some((other) => polygonsOverlapBeyond(part, other, tolerance)))) reasons.push({ type: 'parts-overlap' })
  if (room.areaM2 < 2) reasons.push({ type: 'too-small', areaM2: room.areaM2 })
  const floor: BBox = [0, 0, dataset.layout.floor.width, dataset.layout.floor.height]
  if (!polygonContainsBBox(rectangle(floor), room.bbox)) reasons.push({ type: 'outside-floor' })
  for (const other of otherRooms) {
    if (other.id !== (room as Room).id && partsOverlap(room, other, tolerance)) reasons.push({ type: 'overlap-room', roomId: other.id, roomName: other.name })
  }
  return reasons
}

/** Desks remain untouched when a room covers them; the UI uses this to report the explicit consequence. */
export function workstationsOverlappingRoom(room: Pick<Room, 'polygon' | 'extraPolygons'>, workstations: readonly Workstation[]): Workstation[] {
  return workstations.filter((workstation) => roomParts(room).some((part) => polygonsOverlap(part, workstation.polygon)))
}

function authoredCluster(workstations: readonly Workstation[]) {
  const grouped = new Map<string, Workstation[]>()
  for (const workstation of workstations) grouped.set(workstation.clusterId, [...(grouped.get(workstation.clusterId) ?? []), workstation])
  return grouped
}

export function applyAuthoredEntities(dataset: FloorDataset, authored: AuthoredEntities | null | undefined): FloorDataset {
  if (!authored) return dataset
  const removedIds = authored.removedWorkstationIds ?? []
  if (authored.workstations.length === 0 && authored.rooms.length === 0 && removedIds.length === 0) return dataset
  const removedWorkstationIds = new Set(removedIds)
  const authoredWorkstations = authored.workstations
    .filter((item) => item.floorId === dataset.layout.floor.id && !removedWorkstationIds.has(item.id))
    .map((item) => normalizeAuthoredWorkstation(dataset, item))
  const authoredRooms = authored.rooms.filter((item) => item.floorId === dataset.layout.floor.id)
  const sourceWorkstations = dataset.workstations.filter((item) => !removedWorkstationIds.has(item.id))

  const workstations = [...sourceWorkstations, ...authoredWorkstations]
  const grouped = authoredCluster(authoredWorkstations)
  const clusters = dataset.clusters.map((cluster) => {
    const added = grouped.get(cluster.id)
    const remaining = cluster.workstationIds.filter((id) => !removedWorkstationIds.has(id))
    if (!added && remaining.length === cluster.workstationIds.length) return cluster
    return { ...cluster, workstationIds: [...remaining, ...(added?.map((item) => item.id) ?? [])] }
  })
  for (const [clusterId, items] of grouped) {
    if (dataset.clusters.some((cluster) => cluster.id === clusterId)) continue
    const polygon = items.flatMap((item) => item.polygon)
    const center: Point = [items.reduce((sum, item) => sum + item.center[0], 0) / items.length, items.reduce((sum, item) => sum + item.center[1], 0) / items.length]
    clusters.push({
      id: clusterId,
      floorId: dataset.layout.floor.id,
      zoneId: items[0].zoneId,
      zoneIds: items[0].zoneId ? [items[0].zoneId] : [],
      verification: 'UNVERIFIED',
      bbox: bboxOfPoints(polygon),
      gridRef: 'authored',
      center,
      workstationIds: items.map((item) => item.id),
      notes: ['Được tạo trong ứng dụng; chưa xác minh với bản vẽ nguồn.'],
    })
  }
  return { ...dataset, workstations, rooms: [...dataset.rooms, ...authoredRooms], clusters }
}
