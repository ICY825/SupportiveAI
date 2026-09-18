import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { contentBounds, pathBounds } from '../map/contentBounds'
import { gridBounds } from '../map/grid'
import { fitViewport } from '../map/viewport'

let dataset: FloorDataset
beforeAll(async () => {
  dataset = await FLOORS[0].load()
})

describe('pathBounds', () => {
  it('bounds an absolute M/L/C path, control points included', () => {
    expect(pathBounds('M0 5L30 5M10 1L10 40')).toEqual([0, 1, 30, 40])
    expect(pathBounds('M0 0C12 10 15 15 30 0')).toEqual([0, 0, 30, 15])
  })

  it('refuses to guess at path syntax it does not parse', () => {
    expect(pathBounds('M0 0h30v10z')).toBeNull()
    expect(pathBounds('')).toBeNull()
  })
})

describe('contentBounds', () => {
  it('covers every drawn entity and the building plate', () => {
    const [x0, y0, x1, y1] = contentBounds(dataset)
    for (const e of [...dataset.zones, ...dataset.rooms, ...dataset.workstations, ...dataset.objects]) {
      expect(e.bbox[0]).toBeGreaterThanOrEqual(x0)
      expect(e.bbox[1]).toBeGreaterThanOrEqual(y0)
      expect(e.bbox[2]).toBeLessThanOrEqual(x1)
      expect(e.bbox[3]).toBeLessThanOrEqual(y1)
    }
  })

  it('stays inside the source sheet', () => {
    const { width, height } = dataset.layout.floor
    const [x0, y0, x1, y1] = contentBounds(dataset)
    expect(x0).toBeGreaterThanOrEqual(0)
    expect(y0).toBeGreaterThanOrEqual(0)
    expect(x1).toBeLessThanOrEqual(width)
    expect(y1).toBeLessThanOrEqual(height)
  })

  it('frames a smaller area than the structural grid it replaces', () => {
    const grid = gridBounds(dataset.layout, 60)
    const content = contentBounds(dataset)
    const area = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1])
    expect(area(content)).toBeLessThan(area(grid))
    // it only reaches past the grid where something is actually drawn there
    expect(content[0]).toBeGreaterThan(grid[0])
    expect(content[1]).toBeGreaterThan(grid[1])
    expect(content[3]).toBeLessThan(grid[3])
  })

  // The gain is bounded by the widest zone caption, which reaches past the plate.
  it('fits the floor larger than the structural grid did, at laptop and desktop shapes', () => {
    const grid = gridBounds(dataset.layout, 60)
    const content = contentBounds(dataset)
    const size = (b: number[]) => ({ width: b[2] - b[0], height: b[3] - b[1] })
    for (const view of [{ width: 900, height: 760 }, { width: 970, height: 700 }, { width: 1500, height: 900 }]) {
      const before = fitViewport(size(grid), view)
      const after = fitViewport(size(content), view)
      expect(after.scale).toBeGreaterThan(before.scale * 1.03)
    }
  })
})

describe('contentBounds: zone labels', () => {
  it('leaves room for the zone name drawn nearest the building edge', () => {
    const [, , x1] = contentBounds(dataset)
    const widest = dataset.zones.reduce((a, b) => (a.labelAnchor[0] > b.labelAnchor[0] ? a : b))
    // the name is centred on its anchor, so at least half of it sits beyond
    expect(x1).toBeGreaterThan(widest.labelAnchor[0])
    expect(x1).toBeGreaterThan(Math.max(...dataset.zones.map((z) => z.bbox[2])))
  })
})
