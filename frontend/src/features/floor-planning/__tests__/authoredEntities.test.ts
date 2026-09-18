import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyAuthoredEntities,
  authoredDeskCode,
  authoredDeskId,
  authoredRoomFromRectangle,
  authoredWorkstationFromPlacement,
  authoredEntityStore,
  clearAuthoredEntityStore,
  EMPTY_AUTHORED_ENTITIES,
  mergeAuthoredEntities,
  nextAuthoredDeskNumber,
  nextAuthoredRoomId,
  validateAuthoredRoom,
  workstationsOverlappingRoom,
  type AuthoredEntities,
} from '../domain/authoredEntities'
import type { FloorDataset, Room, Workstation } from '../domain/spatial'

const dataset = {
  layout: {
    floor: { id: 'floor-test', level: 16, width: 100, height: 100, mmPerPt: 100 },
    sourcePdfSha256: 'source-hash',
  },
  zones: [{ id: 'zone-a', gridRef: 'A / 1', polygon: [[0, 0], [100, 0], [100, 100], [0, 100]], bbox: [0, 0, 100, 100] }],
  rooms: [],
  workstations: [],
  clusters: [],
} as unknown as FloorDataset

const placement = {
  entityId: authoredDeskId(16, 900),
  x: 30,
  y: 30,
  width: 12,
  depth: 6,
  rotation: 90 as const,
}

function authoredDesk(number = 900): Workstation {
  return authoredWorkstationFromPlacement({
    dataset,
    placement: { ...placement, entityId: authoredDeskId(16, number) },
    number,
    zoneId: 'zone-a',
    clusterId: 'cluster-authored',
    authoredBy: 'admin-1',
    authoredAt: '2026-09-17T00:00:00.000Z',
  })
}

function authoredRoom(id = 'room-floor-test-a001', bbox: [number, number, number, number] = [10, 10, 25, 30]): Room {
  return authoredRoomFromRectangle({
    dataset,
    bbox,
    id,
    name: 'Phòng họp mới',
    type: 'MEETING',
    authoredBy: 'admin-1',
    authoredAt: '2026-09-17T00:00:00.000Z',
  })
}

describe('authored spatial entities', () => {
  beforeEach(() => {
    clearAuthoredEntityStore()
  })

  it('creates an unverified desk with the permanent floor number and code', () => {
    const desk = authoredDesk()

    expect(desk.id).toBe('ws-16-a900')
    expect(desk.source.deskCode).toBe('F16-A-900')
    expect(desk.source.kind).toBe('user-authored')
    expect(desk.verification).toBe('UNVERIFIED')
    expect(desk.rotationDeg).toBe(90)
    expect(desk.bbox).toEqual([27, 24, 33, 36])
    expect(desk.chair).toEqual({ bbox: [21, 27, 27, 33], center: [24, 30] })
  })

  it('normalizes oversized chairs on authored desks loaded from storage', () => {
    const legacy = {
      ...authoredDesk(),
      chair: { bbox: [21, 24, 27, 36] as [number, number, number, number], center: [24, 30] as [number, number] },
    }
    const hydrated = applyAuthoredEntities(dataset, {
      ...EMPTY_AUTHORED_ENTITIES,
      workstations: [legacy],
    })

    expect(hydrated.workstations[0].chair).toEqual({ bbox: [21, 27, 27, 33], center: [24, 30] })
  })

  it('starts at 900 and never reuses a high-water number after deletion', () => {
    const first = authoredDesk()
    const current = mergeAuthoredEntities(EMPTY_AUTHORED_ENTITIES, {
      workstations: [first],
      issuedDeskNumbers: [900],
    })
    const afterDelete = mergeAuthoredEntities(current, { removeWorkstationIds: [first.id] })

    expect(nextAuthoredDeskNumber(EMPTY_AUTHORED_ENTITIES)).toBe(900)
    expect(nextAuthoredDeskNumber(afterDelete)).toBe(901)
    expect(authoredDeskCode(16, 'B', 901)).toBe('F16-B-901')
  })

  it('keeps separate store writes and supports removal as a patch', async () => {
    const first = authoredDesk()
    await authoredEntityStore.write('floor-test', { workstations: [first], issuedDeskNumbers: [900] })
    await authoredEntityStore.write('floor-test', { rooms: [authoredRoom()] })

    const stored = authoredEntityStore.read('floor-test')
    expect(stored?.workstations).toHaveLength(1)
    expect(stored?.rooms).toHaveLength(1)
    expect(stored?.issuedDeskNumbers).toEqual([900])

    await authoredEntityStore.write('floor-test', { removeWorkstationIds: [first.id] })
    expect(authoredEntityStore.read('floor-test')?.workstations).toEqual([])
  })

  it('merges only matching-floor entities without mutating the extracted dataset', () => {
    const authored: AuthoredEntities = {
      workstations: [authoredDesk()],
      rooms: [authoredRoom()],
      removedWorkstationIds: [],
      issuedDeskNumbers: [900],
    }
    const next = applyAuthoredEntities(dataset, authored)

    expect(next).not.toBe(dataset)
    expect(next.workstations).toHaveLength(1)
    expect(next.rooms).toHaveLength(1)
    expect(next.clusters[0].workstationIds).toEqual(['ws-16-a900'])
    expect(dataset.workstations).toEqual([])
    expect(dataset.rooms).toEqual([])
    expect(applyAuthoredEntities(dataset, EMPTY_AUTHORED_ENTITIES)).toBe(dataset)
  })

  it('remembers deleted source desks without mutating the extracted dataset', () => {
    const sourceDesk = { ...authoredDesk(), id: 'ws-source', source: { ...authoredDesk().source, kind: 'pdf-vector' as const } }
    const sourceDataset = {
      ...dataset,
      workstations: [sourceDesk],
      clusters: [{ id: sourceDesk.clusterId, workstationIds: [sourceDesk.id] }],
    } as unknown as FloorDataset
    const removed = mergeAuthoredEntities(EMPTY_AUTHORED_ENTITIES, { removeWorkstationIds: [sourceDesk.id] })
    const next = applyAuthoredEntities(sourceDataset, removed)

    expect(removed.removedWorkstationIds).toEqual([sourceDesk.id])
    expect(next.workstations).toEqual([])
    expect(next.clusters[0].workstationIds).toEqual([])
    expect(sourceDataset.workstations).toEqual([sourceDesk])
  })

  it('regularizes rooms and validates minimum area, floor bounds, and room overlap', () => {
    const existing = authoredRoom('room-existing', [40, 40, 55, 60])
    const candidate = authoredRoom('room-candidate', [45, 45, 60, 65])
    const small = authoredRoom('room-small', [1, 1, 1.1, 1.1])
    const outside = authoredRoom('room-outside', [95, 95, 110, 110])

    expect(candidate.polygon).toEqual([[45, 45], [60, 45], [60, 65], [45, 65]])
    expect(validateAuthoredRoom(candidate, dataset, [existing])).toEqual([
      { type: 'overlap-room', roomId: 'room-existing', roomName: 'Phòng họp mới' },
    ])
    expect(validateAuthoredRoom(small, dataset, [])).toMatchObject([{ type: 'too-small' }])
    expect(validateAuthoredRoom(small, dataset, [])[0]).toMatchObject({ areaM2: expect.closeTo(0.0001, 10) })
    expect(validateAuthoredRoom(outside, dataset, [])).toEqual([{ type: 'outside-floor' }])
  })

  it('reports desks covered by a room without changing the desks', () => {
    const desk = authoredDesk()
    const room = authoredRoom('room-over-desk', [20, 20, 40, 40])

    expect(workstationsOverlappingRoom(room, [desk])).toEqual([desk])
    expect(desk.verification).toBe('UNVERIFIED')
  })

  it('generates an authored room id after existing authored room ids', () => {
    expect(nextAuthoredRoomId('floor-test', [authoredRoom('room-floor-test-a003')])).toBe('room-floor-test-a004')
  })
})
