import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import { bboxOfPoints, clipPolygonToBBox, pointInPolygon, polygonContainsBBox } from '../domain/geometry'
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
  type SpatialGrid,
  type SpatialPlacement,
} from '../domain/placement'
import type { FloorDataset } from '../domain/spatial'
import {
  basePlacements,
  deriveEditableArea,
  gridForEntity,
  gridPoints,
  placementFromWorkstation,
} from '../workspace/layoutDraft'
import { buildSpikeScene, project, unproject, unprojectDelta } from '../workspace/scene'

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
    const scene = buildSpikeScene(dataset)
    const placements = Object.values(basePlacements(scene.workstations))
    const area = deriveEditableArea(dataset, scene)
    for (const placement of placements) {
      expect(validatePlacement(placement, { others: placements, boundary: area.boundary })).toEqual({
        valid: true,
        reasons: [],
      })
    }
  })

  it('derives the editable area from the source zone annotation, not from the camera crop', () => {
    const scene = buildSpikeScene(dataset)
    const area = deriveEditableArea(dataset, scene)
    expect(area.boundary.kind).toBe('zone-annotation')
    expect(area.boundary.sourceId).toBe('zone-16-ai-platform')
    expect(area.grid.cellSize).toBeCloseTo(600 / dataset.layout.floor.mmPerPt, 9)
    expect(gridPoints(area, area.grid, (p) => pointInPolygon(p, area.boundary.polygon)).length).toBeGreaterThan(50)
  })

  it('rejects a desk pushed outside the editable area', () => {
    const scene = buildSpikeScene(dataset)
    const area = deriveEditableArea(dataset, scene)
    const placement = placementFromWorkstation(scene.workstations[0])
    const outside = translatePlacement(placement, 0, -60)
    expect(validatePlacement(outside, { others: [], boundary: area.boundary }).reasons).toContainEqual({
      type: 'outside-boundary',
    })
  })

  it('puts every desk back exactly, whatever route it takes through the grid', () => {
    const scene = buildSpikeScene(dataset)
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
    const [dx, dy] = unprojectDelta(project([900 + delta[0], 225 + delta[1]]))
    expect(dx).toBeCloseTo(delta[0], 9)
    expect(dy).toBeCloseTo(delta[1], 9)
  })
})
