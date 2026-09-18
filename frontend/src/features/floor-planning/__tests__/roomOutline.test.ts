import { describe, expect, it } from 'vitest'
import { authoredRoomFromPolygon, authoredRoomFromRectangle, validateAuthoredRoom, workstationsOverlappingRoom } from '../domain/authoredEntities'
import { pointInPolygon, polygonIsSimple, polygonLabelPoint, polygonsOverlap, rectangle } from '../domain/geometry'
import { closesOutline, roomLabelPoint, roomParts, simplifyOutline, snapOutlineCorner } from '../domain/roomOutline'
import type { FloorDataset, Point, Workstation } from '../domain/spatial'

const dataset = {
  layout: {
    floor: { id: 'floor-test', level: 16, width: 200, height: 200, mmPerPt: 100 },
    sourcePdfSha256: 'source-hash',
  },
  rooms: [],
  workstations: [],
} as unknown as FloorDataset

const L: Point[] = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 40], [0, 40]]
// A band between two parallel 45° walls, like Floor 16's middle wing.
const diagonal: Point[] = [[0, 0], [20, 0], [80, 60], [60, 60]]

const room = (id: string, polygon: Point[] | Point[][]) =>
  authoredRoomFromPolygon({ dataset, polygon, id, name: id, type: 'LOUNGE', authoredBy: 'admin-1', authoredAt: '2026-09-17T00:00:00.000Z' })

describe('polygonsOverlap', () => {
  it('ignores the empty corner of an L-shape that its bounding box covers', () => {
    expect(polygonsOverlap(L, rectangle([20, 20, 40, 40]))).toBe(false)
    expect(polygonsOverlap(L, rectangle([5, 20, 40, 40]))).toBe(true)
  })

  it('treats shared edges as touching, and identical or nested shapes as overlapping', () => {
    expect(polygonsOverlap(rectangle([0, 0, 10, 10]), rectangle([10, 0, 20, 10]))).toBe(false)
    expect(polygonsOverlap(L, [...L])).toBe(true)
    expect(polygonsOverlap(rectangle([0, 0, 100, 100]), rectangle([0, 0, 2, 2]))).toBe(true)
  })

  it('keeps rooms on either side of a diagonal corridor apart', () => {
    const otherSide: Point[] = [[30, 0], [50, 0], [110, 60], [90, 60]]
    expect(polygonsOverlap(diagonal, otherSide)).toBe(false)
    expect(polygonsOverlap(diagonal, [[10, 0], [50, 0], [110, 60], [70, 60]])).toBe(true)
  })
})

describe('polygonIsSimple', () => {
  it('rejects bow-ties, doubled-back edges and repeated corners', () => {
    expect(polygonIsSimple(L)).toBe(true)
    expect(polygonIsSimple([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(false)
    expect(polygonIsSimple([[0, 0], [10, 0], [5, 0], [5, 10]])).toBe(false)
    expect(polygonIsSimple([[0, 0], [10, 0], [10, 0], [0, 10]])).toBe(false)
  })
})

describe('polygonLabelPoint', () => {
  it('stays inside shapes whose centroid falls outside them', () => {
    const U: Point[] = [[0, 0], [10, 0], [10, 30], [30, 30], [30, 0], [40, 0], [40, 40], [0, 40]]
    expect(pointInPolygon(polygonLabelPoint(L), L)).toBe(true)
    expect(pointInPolygon(polygonLabelPoint(U), U)).toBe(true)
    expect(polygonLabelPoint(rectangle([0, 0, 10, 20]))).toEqual([5, 10])
  })
})

describe('snapOutlineCorner', () => {
  it('snaps each edge to the nearest multiple of 45°', () => {
    expect(snapOutlineCorner([[0, 0]], [10, 1], 2)).toEqual([10, 0])
    const diagonalCorner = snapOutlineCorner([[0, 0]], [10, 9], 2)
    expect(diagonalCorner[0]).toBeCloseTo(9.5)
    expect(diagonalCorner[1]).toBeCloseTo(9.5)
  })

  it('lines the corner up with the first corner so the closing edge is straight', () => {
    // Heading down from (20,0); x=0 is out of reach, so the pull is to the 45° line through the first corner.
    const corner = snapOutlineCorner([[0, 0], [20, 0]], [20, 19], 2)
    expect(corner[0]).toBeCloseTo(20)
    expect(corner[1]).toBeCloseTo(20)
    expect(snapOutlineCorner([[0, 0], [20, 0], [20, 20]], [1, 20], 2)).toEqual([0, 20])
  })

  it('leaves the pointer alone when snapping is turned off', () => {
    expect(snapOutlineCorner([[0, 0]], [10, 3], 2, true)).toEqual([10, 3])
  })

  it('closes on the first corner and drops corners on straight runs', () => {
    expect(closesOutline([[0, 0], [10, 0], [10, 10]], [0.5, 0.5], 1)).toBe(true)
    expect(closesOutline([[0, 0], [10, 0]], [0, 0], 1)).toBe(false)
    expect(simplifyOutline([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]])).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]])
  })
})

describe('authored rooms with any outline', () => {
  it('keeps the outline exactly, with its real area', () => {
    const lounge = room('lounge', diagonal)
    expect(lounge.polygon).toEqual(diagonal)
    expect(lounge.areaM2).toBeCloseTo((20 * 60 * 100 ** 2) / 1_000_000)
    expect(validateAuthoredRoom(lounge, dataset, [])).toEqual([])
  })

  it('validates against real shapes rather than bounding boxes', () => {
    const lShaped = room('l', L)
    const inCorner = authoredRoomFromRectangle({ dataset, bbox: [20, 20, 40, 40], id: 'corner', name: 'corner', type: 'MEETING', authoredBy: 'a', authoredAt: 'b' })
    expect(validateAuthoredRoom(inCorner, dataset, [lShaped])).toEqual([])
    expect(validateAuthoredRoom(room('bowtie', [[0, 0], [30, 30], [30, 0], [0, 30]]), dataset, [])).toEqual([{ type: 'self-intersecting' }])

    const deskInCorner = { polygon: rectangle([25, 25, 30, 30]) } as Workstation
    const deskInArm = { polygon: rectangle([2, 25, 8, 30]) } as Workstation
    expect(workstationsOverlappingRoom(lShaped, [deskInCorner, deskInArm])).toEqual([deskInArm])
  })
})

describe('rooms in several pieces', () => {
  // Both sides of one partition: they share the diagonal edge from (20,0) to (80,60).
  const farSide: Point[] = [[20, 0], [40, 0], [100, 60], [80, 60]]

  it('keeps every piece, sums their area and bounds them together', () => {
    const lounge = room('lounge', [diagonal, farSide])
    expect(roomParts(lounge)).toEqual([diagonal, farSide])
    expect(lounge.areaM2).toBeCloseTo((2 * 20 * 60 * 100 ** 2) / 1_000_000)
    expect(lounge.bbox).toEqual([0, 0, 100, 60])
    expect(validateAuthoredRoom(lounge, dataset, [])).toEqual([])
    expect(room('single', diagonal).extraPolygons).toBeUndefined()
  })

  it('rejects pieces that share floor, and checks every piece against other rooms', () => {
    expect(validateAuthoredRoom(room('doubled', [diagonal, diagonal]), dataset, [])).toContainEqual({ type: 'parts-overlap' })
    const lounge = room('lounge', [diagonal, farSide])
    const onFarSide = room('other', [[70, 30], [120, 30], [120, 60], [70, 60]])
    expect(validateAuthoredRoom(onFarSide, dataset, [lounge])).toEqual([{ type: 'overlap-room', roomId: 'lounge', roomName: 'lounge' }])
    const deskOnFarSide = { polygon: rectangle([84, 55, 88, 58]) } as Workstation
    expect(workstationsOverlappingRoom(lounge, [deskOnFarSide])).toEqual([deskOnFarSide])
  })

  it('captions the room once, inside its largest piece', () => {
    const small: Point[] = rectangle([150, 150, 155, 155])
    const lounge = room('lounge', [small, L])
    expect(pointInPolygon(roomLabelPoint(lounge), L)).toBe(true)
  })
})

describe('hand-drawn neighbours', () => {
  it('lets outlines along the same partition cross by less than the tolerance', () => {
    // mmPerPt is 100 here, so 300 mm is 3 pt. The far side's partition edge sits 1 pt into the near side.
    const nearSide = diagonal
    const farSide: Point[] = [[19, 0], [40, 0], [100, 60], [79, 60]]
    expect(validateAuthoredRoom(room('lounge', [nearSide, farSide]), dataset, [])).toEqual([])
    const deepFarSide: Point[] = [[10, 0], [40, 0], [100, 60], [70, 60]]
    expect(validateAuthoredRoom(room('lounge', [nearSide, deepFarSide]), dataset, [])).toContainEqual({ type: 'parts-overlap' })
  })

  it('snaps a new corner onto a corner already drawn before snapping its angle', () => {
    expect(snapOutlineCorner([[0, 0]], [20.5, 1.5], 2, false, [[21, 2]])).toEqual([21, 2])
    expect(snapOutlineCorner([], [20.5, 1.5], 2, false, [[21, 2]])).toEqual([21, 2])
    expect(snapOutlineCorner([], [20.5, 1.5], 2, true, [[21, 2]])).toEqual([20.5, 1.5])
  })
})
