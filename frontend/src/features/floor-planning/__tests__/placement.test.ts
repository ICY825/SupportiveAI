import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import {
  bboxOfPoints,
  clipPolygonToBBox,
  pointInPolygon,
  polygonArea,
  polygonContainsBBox,
} from '../domain/geometry'
import {
  intersects,
  normalizeRotation,
  placementBounds,
  placementFootprint,
  rotatePlacementBy,
  snapPlacementToGrid,
  snapPointToGrid,
  translatePlacement,
  validatePlacement,
  type PlacementContext,
  type SpatialGrid,
  type SpatialPlacement,
} from '../domain/placement'
import type { FloorDataset, FloorObstacle, Point, Room, Zone } from '../domain/spatial'

import {
  basePlacements,
  deriveEditableArea,
  gridForEntity,
  gridPoints,
  placementFromWorkstation,
} from '../workspace/layoutDraft'
import { buildWorkspaceScene, project, unproject, unprojectDelta } from '../workspace/scene'
import { defaultWorkspaceScope } from '../workspace/scope'

const desk = (over: Partial<SpatialPlacement> = {}): SpatialPlacement => ({
  entityId: 'a',
  x: 100,
  y: 100,
  width: 12,
  depth: 6,
  rotation: 0,
  ...over,
})

const GRID: SpatialGrid = { origin: [0, 0], cellSize: 6 }

describe('grid snapping', () => {
  it('snaps a point to the nearest intersection, including negative offsets', () => {
    expect(snapPointToGrid([13, -8], GRID)).toEqual([12, -6])
    expect(snapPointToGrid([15, 15], GRID)).toEqual([18, 18])
  })

  it('snaps the footprint corner, not the centre, so neighbours stay flush', () => {
    const snapped = snapPlacementToGrid(desk({ x: 100.4, y: 100.9 }), GRID)
    const [x0, y0] = placementBounds(snapped)
    expect(x0 % GRID.cellSize).toBeCloseTo(0, 10)
    expect(y0 % GRID.cellSize).toBeCloseTo(0, 10)
    // same object size, only moved
    expect(placementFootprint(snapped)).toEqual({ width: 12, depth: 6 })
  })

  it('is idempotent and leaves an already-aligned placement untouched', () => {
    const once = snapPlacementToGrid(desk({ x: 101, y: 97 }), GRID)
    expect(snapPlacementToGrid(once, GRID)).toEqual(once)
  })

  it('does nothing when the grid has no usable cell size', () => {
    const p = desk({ x: 100.4 })
    expect(snapPlacementToGrid(p, { origin: [0, 0], cellSize: 0 })).toBe(p)
  })
})

describe('quarter rotation changes the collision footprint', () => {
  it('swaps width and depth at 90° and 270°, and restores them at 180°', () => {
    expect(placementFootprint(desk({ rotation: 0 }))).toEqual({ width: 12, depth: 6 })
    expect(placementFootprint(desk({ rotation: 90 }))).toEqual({ width: 6, depth: 12 })
    expect(placementFootprint(desk({ rotation: 180 }))).toEqual({ width: 12, depth: 6 })
    expect(placementFootprint(desk({ rotation: 270 }))).toEqual({ width: 6, depth: 12 })
  })

  it('bounds follow the rotated footprint about the same centre', () => {
    expect(placementBounds(desk({ rotation: 0 }))).toEqual([94, 97, 106, 103])
    expect(placementBounds(desk({ rotation: 90 }))).toEqual([97, 94, 103, 106])
  })

  it('wraps through four turns and normalizes any input angle', () => {
    let p = desk()
    for (const expected of [90, 180, 270, 0]) {
      p = rotatePlacementBy(p, 90)
      expect(p.rotation).toBe(expected)
    }
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(89)).toBe(90)
  })
})

describe('object intersection', () => {
  it('reports overlap when two placements share area', () => {
    expect(intersects(desk(), desk({ entityId: 'b', x: 104 }))).toBe(true)
  })

  it('does not report overlap for placements that are merely flush', () => {
    // 12 wide, centres exactly one width apart: they touch along one edge
    expect(intersects(desk(), desk({ entityId: 'b', x: 112 }))).toBe(false)
    expect(intersects(desk(), desk({ entityId: 'b', y: 106 }))).toBe(false)
  })

  it('reports overlap only after rotation grows the footprint into a neighbour', () => {
    const a = desk()
    const b = desk({ entityId: 'b', y: 108 })
    expect(intersects(a, b)).toBe(false)
    expect(intersects(rotatePlacementBy(a, 90), b)).toBe(true)
  })
})

describe('placement validation', () => {
  const boundary = {
    polygon: [
      [0, 0],
      [200, 0],
      [200, 200],
      [0, 200],
    ] as [number, number][],
    bbox: [0, 0, 200, 200] as [number, number, number, number],
    kind: 'zone-annotation' as const,
    sourceId: 'zone-test',
  }

  it('accepts a move into free space inside the boundary', () => {
    const moved = translatePlacement(desk(), 30, 0)
    const result = validatePlacement(moved, { others: [desk({ entityId: 'b', x: 40 })], boundary })
    expect(result).toEqual({ valid: true, reasons: [] })
  })

  it('rejects a move that overlaps another object and names it', () => {
    const result = validatePlacement(desk(), { others: [desk({ entityId: 'ws-090', x: 104 })], boundary })
    expect(result.valid).toBe(false)
    expect(result.reasons).toEqual([{ type: 'overlap', entityId: 'ws-090' }])
  })

  it('ignores the candidate colliding with its own entry in the context', () => {
    expect(validatePlacement(desk(), { others: [desk()], boundary }).valid).toBe(true)
  })

  it('rejects a placement that leaves the boundary', () => {
    const result = validatePlacement(desk({ x: 197 }), { others: [], boundary })
    expect(result.valid).toBe(false)
    expect(result.reasons).toContainEqual({ type: 'outside-boundary' })
  })

  it('rejects a placement that straddles a concave notch without any corner leaving', () => {
    // a C-shape: the gap in the middle of the right edge is real empty space
    const notched = {
      ...boundary,
      polygon: [
        [0, 0],
        [200, 0],
        [200, 80],
        [60, 100],
        [200, 120],
        [200, 200],
        [0, 200],
      ] as [number, number][],
    }
    const straddling = desk({ x: 150, y: 100, width: 80, depth: 40 })
    expect(validatePlacement(straddling, { others: [], boundary: notched }).valid).toBe(false)
  })

  it('applies no boundary rule when the context has none', () => {
    expect(validatePlacement(desk({ x: -900 }), { others: [], boundary: null }).valid).toBe(true)
  })
})

describe('polygon helpers', () => {
  it('clips a polygon to a rectangle without moving the parts already inside', () => {
    const clipped = clipPolygonToBBox(
      [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
      ],
      [5, 5, 15, 15],
    )
    // the same ring, possibly starting at a different vertex
    expect(clipped).toHaveLength(4)
    expect(bboxOfPoints(clipped)).toEqual([5, 5, 15, 15])
  })

  it('accepts a box strictly inside and refuses one that pokes out', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    expect(polygonContainsBBox(square, [1, 1, 9, 9])).toBe(true)
    expect(polygonContainsBBox(square, [1, 1, 11, 9])).toBe(false)
  })

  it('calculates the planar area of triangles and rectangles using the Shoelace formula', () => {
    const triangle: Point[] = [
      [0, 0],
      [4, 0],
      [0, 3],
    ]
    expect(polygonArea(triangle)).toBe(6)

    const rect: Point[] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [0, 5],
    ]
    expect(polygonArea(rect)).toBe(50)
  })

  it('returns 0 for degenerate polygons with fewer than 3 vertices', () => {
    expect(polygonArea([])).toBe(0)
    expect(polygonArea([[1, 2]])).toBe(0)
    expect(polygonArea([[1, 2], [3, 4]])).toBe(0)
  })
})

describe('floor 16 placements, boundary and projection', () => {
  let dataset: FloorDataset
  beforeAll(async () => {
    dataset = await FLOORS[0].load()
  })

  it('round-trips a workstation through its placement without moving it', () => {
    for (const ws of dataset.workstations.slice(0, 40)) {
      const bounds = placementBounds(placementFromWorkstation(ws))
      for (let i = 0; i < 4; i++) expect(bounds[i]).toBeCloseTo(ws.bbox[i], 9)
    }
  })

  it('starts from a layout with no overlapping desks, so Save is not blocked on open', () => {
    const scene = buildWorkspaceScene(dataset, defaultWorkspaceScope(dataset))
    const placements = Object.values(basePlacements(scene.workstations))
    const area = deriveEditableArea(dataset, scene)
    for (const placement of placements) {
      expect(validatePlacement(placement, { others: placements, boundary: area.boundary })).toEqual({
        valid: true,
        reasons: [],
      })
    }
  })

  it('derives the editable area from the source zone annotation, not from the viewport scope', () => {
    const scene = buildWorkspaceScene(dataset, defaultWorkspaceScope(dataset))
    const area = deriveEditableArea(dataset, scene)
    expect(area.boundary.kind).toBe('zone-annotation')
    expect(area.boundary.sourceId).toBe('zone-16-ai-platform')
    expect(area.grid.cellSize).toBeCloseTo(600 / dataset.layout.floor.mmPerPt, 9)
    expect(gridPoints(area, area.grid, (p) => pointInPolygon(p, area.boundary.polygon)).length).toBeGreaterThan(50)
  })

  it('rejects a desk pushed outside the editable area', () => {
    const scene = buildWorkspaceScene(dataset, defaultWorkspaceScope(dataset))
    const area = deriveEditableArea(dataset, scene)
    const placement = placementFromWorkstation(scene.workstations[0])
    const outside = translatePlacement(placement, 0, -60)
    expect(validatePlacement(outside, { others: [], boundary: area.boundary }).reasons).toContainEqual({
      type: 'outside-boundary',
    })
  })

  it('puts every desk back exactly, whatever route it takes through the grid', () => {
    const focus = dataset.clusters.find((cluster) => cluster.id === 'cluster-16-13')!
    const scene = buildWorkspaceScene(dataset, { kind: 'bbox', bbox: focus.bbox })
    const area = deriveEditableArea(dataset, scene)
    for (const ws of scene.workstations) {
      const original = placementFromWorkstation(ws)
      const grid = gridForEntity(area.grid, original)
      // the authoritative position is on its own lattice, so snapping is a no-op
      expect(snapPlacementToGrid(original, grid)).toEqual(original)
      for (const [dx, dy] of [
        [1, 0],
        [3, -2],
        [-4, 5],
      ]) {
        const away = snapPlacementToGrid(
          translatePlacement(original, dx * grid.cellSize, dy * grid.cellSize),
          grid,
        )
        expect(away).not.toEqual(original)
        const back = snapPlacementToGrid(
          translatePlacement(away, -dx * grid.cellSize, -dy * grid.cellSize),
          grid,
        )
        expect(back).toEqual(original)
      }
      // a sub-cell drag from the original resolves back onto the original
      expect(snapPlacementToGrid(translatePlacement(original, grid.cellSize * 0.3, 0), grid)).toEqual(original)
    }
  })

  it('inverts the scene projection exactly, which is what pointer drags rely on', () => {
    for (const point of [
      [900, 225],
      [946.51, 245.73],
      [1008, 294],
    ] as [number, number][]) {
      const [bx, by] = unproject(project(point))
      expect(bx).toBeCloseTo(point[0], 9)
      expect(by).toBeCloseTo(point[1], 9)
    }
    const delta: [number, number] = [7.25, -3.5]
    const from = project([900, 225])
    const to = project([900 + delta[0], 225 + delta[1]])
    const [dx, dy] = unprojectDelta([to[0] - from[0], to[1] - from[1]])
    expect(dx).toBeCloseTo(delta[0], 9)
    expect(dy).toBeCloseTo(delta[1], 9)
  })
})

describe('Milestone 2 - Multi-Layer Validation Engine', () => {
  const columnObstacle: FloorObstacle = {
    id: 'col-fixture-1',
    floorId: 'floor-16',
    kind: 'column',
    category: 'solid',
    name: 'Cột bê tông kiểm thử',
    verification: 'EXTRACTED',
    polygon: [
      [100, 100],
      [120, 100],
      [120, 120],
      [100, 120],
    ],
    bbox: [100, 100, 120, 120],
    center: [110, 110],
    gridRef: 'B-A / 6-5',
    notes: [],
  }

  const wallObstacle: FloorObstacle = {
    id: 'wall-fixture-1',
    floorId: 'floor-16',
    kind: 'wall',
    category: 'solid',
    name: 'Lõi bê tông kiểm thử',
    verification: 'EXTRACTED',
    polygon: [
      [200, 100],
      [300, 100],
      [300, 140],
      [200, 140],
    ],
    bbox: [200, 100, 300, 140],
    center: [250, 120],
    gridRef: 'C-B / 5-4',
    notes: [],
  }

  const doorClearanceObstacle: FloorObstacle = {
    id: 'door-clr-fixture-1',
    doorId: 'door-fixture-1',
    floorId: 'floor-16',
    kind: 'door-clearance',
    category: 'clearance',
    name: 'Khoảng quét mở cửa 900mm',
    verification: 'EXTRACTED',
    polygon: [
      [400, 100],
      [410, 100],
      [410, 110],
      [400, 110],
    ],
    bbox: [400, 100, 410, 110],
    center: [405, 105],
    gridRef: 'D-C / 5-4',
    notes: [],
  }

  // Polygonal door swing sector (hinge at [500, 100], radius 10, sweeping quadrant [500..510, 100..110])
  const doorArcObstacle: FloorObstacle = {
    id: 'door-arc-fixture-1',
    doorId: 'door-arc-1',
    floorId: 'floor-16',
    kind: 'door-clearance',
    category: 'clearance',
    name: 'Khoảng mở cánh cửa rẻ quạt',
    verification: 'EXTRACTED',
    polygon: [
      [500, 100],
      [510, 100],
      [509.24, 103.83],
      [507.07, 107.07],
      [503.83, 109.24],
      [500, 110],
    ],
    bbox: [500, 100, 510, 110],
    center: [505, 105],
    gridRef: 'E-D / 5-4',
    notes: [],
  }

  const roomFixture: Room = {
    id: 'room-16-acoustic-01',
    floorId: 'floor-16',
    type: 'ROOM',
    name: 'Phòng cách âm',
    polygon: [
      [50, 50],
      [90, 50],
      [90, 90],
      [50, 90],
    ],
    bbox: [50, 50, 90, 90],
    gridRef: 'K-J / 7-6',
    areaM2: 25,
    verification: 'EXTRACTED',
    zoneId: 'zone-16-ai-platform',
    source: { kind: 'pdf-vector' },
    notes: [],
  }

  const zoneFixture: Zone = {
    id: 'zone-16-ai-platform',
    floorId: 'floor-16',
    type: 'WORKSPACE_ZONE',
    name: 'MÔ HÌNH & NỀN TẢNG AI',
    polygon: [
      [0, 0],
      [1000, 0],
      [1000, 500],
      [0, 500],
    ],
    bbox: [0, 0, 1000, 500],
    gridRef: 'B-A / 6-5',
    areaM2: 500,
    verification: 'SOURCE_VERIFIED',
    labelAnchor: [500, 250],
    labelAnchorSource: 'annotation',
    sourceColor: '#0000FF',
    sourceLabel: 'MÔ HÌNH & NỀN TẢNG AI',
    sourceLabelFigure: null,
    source: { kind: 'pdf-annotation' },
    notes: [],
  }

  describe('a) Positive: Flush zero-gap contact against solid obstacles', () => {
    it('accepts a desk placed flush against the west face of a column with 0 mm gap', () => {
      const flushWest = desk({ x: 94, y: 110, width: 12, depth: 6 })
      const context: PlacementContext = {
        others: [],
        boundary: null,
        obstacles: [columnObstacle],
      }
      const result = validatePlacement(flushWest, context)
      expect(result.valid).toBe(true)
      expect(result.reasons).toHaveLength(0)
    })

    it('accepts a desk placed flush against the north face of a concrete core wall with 0 mm gap', () => {
      const flushNorth = desk({ x: 250, y: 97, width: 12, depth: 6 })
      const context: PlacementContext = {
        others: [],
        boundary: null,
        obstacles: [wallObstacle],
      }
      const result = validatePlacement(flushNorth, context)
      expect(result.valid).toBe(true)
      expect(result.reasons).toHaveLength(0)
    })

    it('accepts real Floor 16 workstation ws-16-049 flush against core wall wall-16-02 with 0 mm gap', async () => {
      const dataset = await FLOORS[0].load()
      const ws049 = dataset.workstations.find((w) => w.id === 'ws-16-049')!
      const wall02 = dataset.obstacles.find((o) => o.id === 'wall-16-02')!
      expect(ws049.bbox[0]).toBe(507.17)
      expect(wall02.bbox[2]).toBe(507.17)
      const placement = placementFromWorkstation(ws049)
      const result = validatePlacement(placement, {
        others: [],
        boundary: null,
        obstacles: [wall02],
      })
      expect(result.valid).toBe(true)
      expect(result.reasons).toHaveLength(0)
    })
  })

  describe('b) Negative: Workstation penetrating column', () => {
    it('rejects a desk penetrating a column by 1 mm and issues obstacle-collision with obstacle metadata', () => {
      const penetrating = desk({ x: 95, y: 110, width: 12, depth: 6 })
      const context: PlacementContext = {
        others: [],
        boundary: null,
        obstacles: [columnObstacle],
      }
      const result = validatePlacement(penetrating, context)
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'col-fixture-1',
        obstacleKind: 'column',
        obstacleName: 'Cột bê tông kiểm thử',
      })
    })

    it('rejects a desk completely enclosed inside a column', () => {
      const inside = desk({ x: 110, y: 110, width: 6, depth: 4 })
      const result = validatePlacement(inside, { others: [], boundary: null, obstacles: [columnObstacle] })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual(
        expect.objectContaining({
          type: 'obstacle-collision',
          obstacleId: 'col-fixture-1',
        }),
      )
    })
  })

  describe('c) Negative: Workstation penetrating core wall', () => {
    it('rejects a desk penetrating a core wall and issues obstacle-collision with wall metadata', () => {
      const penetrating = desk({ x: 250, y: 99, width: 12, depth: 6 })
      const result = validatePlacement(penetrating, {
        others: [],
        boundary: null,
        obstacles: [wallObstacle],
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'wall-fixture-1',
        obstacleKind: 'wall',
        obstacleName: 'Lõi bê tông kiểm thử',
      })
    })
  })

  describe('d) Negative: Workstation intersecting door clearance', () => {
    it('rejects a desk intersecting a rectangular door swing zone and issues clearance-conflict', () => {
      const conflicting = desk({ x: 402, y: 102, width: 12, depth: 6 })
      const result = validatePlacement(conflicting, {
        others: [],
        boundary: null,
        obstacles: [doorClearanceObstacle],
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'clearance-conflict',
        obstacleId: 'door-clr-fixture-1',
        obstacleKind: 'door-clearance',
        obstacleName: 'Khoảng quét mở cửa 900mm',
      })
    })

    it('rejects a desk penetrating a polygonal door sector and accepts one placed in the outer bbox corner', () => {
      const penetrating = desk({ x: 502, y: 102, width: 6, depth: 4 })
      const conflictResult = validatePlacement(penetrating, {
        others: [],
        boundary: null,
        obstacles: [doorArcObstacle],
      })
      expect(conflictResult.valid).toBe(false)
      expect(conflictResult.reasons).toContainEqual(
        expect.objectContaining({
          type: 'clearance-conflict',
          obstacleId: 'door-arc-fixture-1',
        }),
      )

      const clearCorner = desk({ x: 509.5, y: 109.5, width: 0.5, depth: 0.5 })
      const clearResult = validatePlacement(clearCorner, {
        others: [],
        boundary: null,
        obstacles: [doorArcObstacle],
      })
      expect(clearResult.valid).toBe(true)
    })
  })

  describe('e) Negative: Chair seating space penetrating obstacles or door clearances', () => {
    it('rejects a workstation whose desk is clear but whose chair space penetrates a column', () => {
      const deskFacingColumn = desk({
        x: 92,
        y: 110,
        width: 12,
        depth: 6,
        seatedSide: 'right', // Seating zone extends from x=98 to x=104
      })
      const result = validatePlacement(deskFacingColumn, {
        others: [],
        boundary: null,
        obstacles: [columnObstacle],
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual(
        expect.objectContaining({
          type: 'obstacle-collision',
          obstacleId: 'col-fixture-1',
          target: 'chair',
        }),
      )
    })

    it('rejects a workstation whose desk is clear but whose chair space penetrates a core wall', () => {
      const deskFacingWall = desk({
        x: 250,
        y: 95,
        width: 12,
        depth: 6,
        seatedSide: 'bottom', // Seating zone extends to y=104, penetrating wall at y=100
      })
      const result = validatePlacement(deskFacingWall, {
        others: [],
        boundary: null,
        obstacles: [wallObstacle],
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual(
        expect.objectContaining({
          type: 'obstacle-collision',
          obstacleId: 'wall-fixture-1',
          target: 'chair',
        }),
      )
    })

    it('rejects a workstation whose chair space penetrates a door swing trajectory', () => {
      const deskFacingDoor = desk({
        x: 392,
        y: 105,
        width: 12,
        depth: 6,
        seatedSide: 'right', // Chair zone reaches x in [398, 404], overlapping door clearance x>=400
      })
      const result = validatePlacement(deskFacingDoor, {
        others: [],
        boundary: null,
        obstacles: [doorClearanceObstacle],
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual(
        expect.objectContaining({
          type: 'clearance-conflict',
          obstacleId: 'door-clr-fixture-1',
          target: 'chair',
        }),
      )
    })
  })

  describe('f) Negative: Chair seating space penetrating another workstation or chair', () => {
    it('rejects placement when Workstation A chair space penetrates Workstation B desk table', () => {
      const deskB = desk({ entityId: 'desk-b', x: 100, y: 100, width: 12, depth: 6 })
      const deskA = desk({
        entityId: 'desk-a',
        x: 100,
        y: 92,
        width: 12,
        depth: 6,
        seatedSide: 'bottom', // Chair extends down from y=95 to y=101, overlapping Desk B (top is y=97)
      })
      const result = validatePlacement(deskA, { others: [deskB], boundary: null })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual(
        expect.objectContaining({ type: 'overlap', entityId: 'desk-b' }),
      )
    })

    it('rejects placement when two back-to-back desks have overlapping chair seating spaces', () => {
      const deskA = desk({ entityId: 'desk-a', x: 100, y: 83, width: 12, depth: 6, seatedSide: 'bottom' })
      const deskB = desk({ entityId: 'desk-b', x: 100, y: 100, width: 12, depth: 6, seatedSide: 'top' })
      const result = validatePlacement(deskA, { others: [deskB], boundary: null })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual(
        expect.objectContaining({ type: 'overlap', entityId: 'desk-b', target: 'chair' }),
      )
    })
  })

  describe('g) Hierarchical: Room boundary containment', () => {
    it('accepts a workstation placed fully inside an enclosed room', () => {
      const insideRoom = desk({ x: 65, y: 65, width: 12, depth: 6 })
      const result = validatePlacement(insideRoom, {
        others: [],
        boundary: null,
        room: roomFixture,
      })
      expect(result.valid).toBe(true)
      expect(result.reasons).toHaveLength(0)
    })

    it('rejects a workstation pushed across a room wall and issues outside-room-boundary with room metadata', () => {
      const straddlingRoom = desk({ x: 88, y: 65, width: 12, depth: 6 })
      const result = validatePlacement(straddlingRoom, {
        others: [],
        boundary: null,
        room: roomFixture,
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'outside-room-boundary',
        roomId: 'room-16-acoustic-01',
        roomName: 'Phòng cách âm',
      })
    })
  })

  describe('h) Hierarchical: Department zone containment', () => {
    it('accepts a workstation positioned fully inside the department zone', () => {
      const insideZone = desk({ x: 100, y: 100, width: 12, depth: 6 })
      const result = validatePlacement(insideZone, {
        others: [],
        boundary: null,
        zone: zoneFixture,
      })
      expect(result.valid).toBe(true)
    })

    it('rejects a workstation pushed outside the department zone and issues outside-department-zone', () => {
      const outsideZone = desk({ x: 998, y: 100, width: 12, depth: 6 })
      const result = validatePlacement(outsideZone, {
        others: [],
        boundary: null,
        zone: zoneFixture,
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'outside-department-zone',
        zoneId: 'zone-16-ai-platform',
        zoneName: 'MÔ HÌNH & NỀN TẢNG AI',
      })
    })

    it('distinguishes hierarchical violations: room breach emits outside-room-boundary, zone breach emits outside-department-zone', () => {
      const insideZoneOutsideRoom = desk({ x: 150, y: 150, width: 12, depth: 6 })
      const roomResult = validatePlacement(insideZoneOutsideRoom, {
        others: [],
        boundary: null,
        room: roomFixture,
        zone: zoneFixture,
      })
      expect(roomResult.reasons).toContainEqual(expect.objectContaining({ type: 'outside-room-boundary' }))
      expect(roomResult.reasons).not.toContainEqual(expect.objectContaining({ type: 'outside-department-zone' }))
    })
  })

  describe('i) Real Dataset: Cluster 13/17 concrete pillar (col-16-13) collision', () => {
    it('verifies col-16-13 coordinates match CAD KT-Betong extraction exactly', async () => {
      const dataset = await FLOORS[0].load()
      const pillar = dataset.obstacles.find((o) => o.id === 'col-16-13')
      expect(pillar).toBeDefined()
      expect(pillar?.kind).toBe('column')
      expect(pillar?.category).toBe('solid')
      expect(pillar?.bbox).toEqual([982.51, 239.68, 993.89, 252.79])
    })

    it('verifies desks ws-16-067 and ws-16-070 in default positions have a 2.01 pt gap and do not collide', async () => {
      const dataset = await FLOORS[0].load()
      const pillar = dataset.obstacles.find((o) => o.id === 'col-16-13')!
      const ws067 = dataset.workstations.find((w) => w.id === 'ws-16-067')!
      const ws070 = dataset.workstations.find((w) => w.id === 'ws-16-070')!

      expect(ws067.bbox[2]).toBe(980.5)
      expect(pillar.bbox[0]).toBe(982.51)
      expect(pillar.bbox[0] - ws067.bbox[2]).toBeCloseTo(2.01, 2)
      expect(pillar.bbox[0] - ws070.bbox[2]).toBeCloseTo(2.01, 2)

      const p067 = placementFromWorkstation(ws067)
      const result067 = validatePlacement(p067, { others: [], boundary: null, obstacles: [pillar] })
      expect(result067.valid).toBe(true)

      const p070 = placementFromWorkstation(ws070)
      const result070 = validatePlacement(p070, { others: [], boundary: null, obstacles: [pillar] })
      expect(result070.valid).toBe(true)
    })

    it('triggers obstacle-collision when ws-16-067 is moved +3 pt eastward into col-16-13', async () => {
      const dataset = await FLOORS[0].load()
      const pillar = dataset.obstacles.find((o) => o.id === 'col-16-13')!
      const ws067 = dataset.workstations.find((w) => w.id === 'ws-16-067')!

      const base = placementFromWorkstation(ws067)
      const movedIntoColumn = translatePlacement(base, 3, 0) // x shifts from 974.81 to 977.81, right edge to 983.50 > 982.51

      const result = validatePlacement(movedIntoColumn, {
        others: [],
        boundary: null,
        obstacles: [pillar],
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'col-16-13',
        obstacleKind: 'column',
        obstacleName: 'Cột bê tông (>A / 7-6)',
      })
    })
  })
})
