import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { buildSpikeScene, cropSourcePath, fitViewBox, planeTransform, project, sceneBounds, SPIKE_CROP } from '../workspace/scene'

let dataset: FloorDataset
beforeAll(async () => { dataset = await FLOORS[0].load() })

describe('spatial spike preserves source geometry', () => {
  it('uses three complete clusters and original workstation, chair and zone objects', () => {
    const before = JSON.stringify(dataset)
    const scene = buildSpikeScene(dataset)
    expect(scene.workstations).toHaveLength(19)
    expect(new Set(scene.workstations.map((w) => w.clusterId)).size).toBe(3)
    expect(new Set(scene.workstations.map((w) => w.rotationDeg)).size).toBeGreaterThan(1)
    for (const w of scene.workstations) {
      expect(w).toBe(dataset.workstations.find((original) => original.id === w.id))
      expect(w.chair).not.toBeNull()
      for (const bbox of [w.bbox, w.chair!.bbox]) {
        expect(bbox[0]).toBeGreaterThanOrEqual(SPIKE_CROP[0])
        expect(bbox[1]).toBeGreaterThanOrEqual(SPIKE_CROP[1])
        expect(bbox[2]).toBeLessThanOrEqual(SPIKE_CROP[2])
        expect(bbox[3]).toBeLessThanOrEqual(SPIKE_CROP[3])
      }
    }
    for (const zone of scene.zones) expect(zone).toBe(dataset.zones.find((z) => z.id === zone.id))
    expect(JSON.stringify(dataset)).toBe(before)
  })

  it('projects source paths and furniture through the same affine transform at each elevation', () => {
    for (const height of [0, 4.25, 7.1]) {
      const [a, b, c, d, e, f] = planeTransform(height).slice(7, -1).split(' ').map(Number)
      for (const w of buildSpikeScene(dataset).workstations) {
        for (const [x, y] of [...w.polygon, w.chair!.center]) {
          const [px, py] = project([x, y], height)
          expect(px).toBeCloseTo(a * x + c * y + e, 8)
          expect(py).toBeCloseTo(b * x + d * y + f, 8)
        }
      }
    }
  })

  it('retains crossing lines and cubic curves verbatim and culls only outside subpaths', () => {
    const crossing = 'M0 5L30 5'
    const curve = 'M0 0C12 10 15 15 30 0'
    expect(cropSourcePath(`${crossing}M40 40L50 50${curve}`, [10, 4, 20, 8])).toBe(`${crossing}${curve}`)
    // Unrecognized path syntax must remain intact for SVG clipping.
    expect(cropSourcePath('M0 0h30v10z', [10, 4, 20, 8])).toBe('M0 0h30v10z')
  })
})

describe('spatial spike framing', () => {
  it('bounds every drawn desk, chair marker and caption', () => {
    const scene = buildSpikeScene(dataset)
    const [x0, y0, x1, y1] = sceneBounds(scene)
    expect(x1).toBeGreaterThan(x0)
    expect(y1).toBeGreaterThan(y0)
    for (const w of scene.workstations) {
      for (const corner of w.polygon) {
        const [px, py] = project(corner, scene.deskHeight)
        expect(px).toBeGreaterThanOrEqual(x0)
        expect(px).toBeLessThanOrEqual(x1)
        expect(py).toBeGreaterThanOrEqual(y0)
        expect(py).toBeLessThanOrEqual(y1)
      }
    }
  })

  it('fills the stage at the largest scale the padding allows', () => {
    const bounds = sceneBounds(buildSpikeScene(dataset))
    const view = { width: 900, height: 560 }
    const padding = 20
    const [, , width, height] = fitViewBox(bounds, view, padding)
    // the viewBox takes the stage's aspect ratio, so the scene is never letterboxed
    expect(width / height).toBeCloseTo(view.width / view.height, 6)
    const scale = view.width / width
    const slack = [view.width - (bounds[2] - bounds[0]) * scale, view.height - (bounds[3] - bounds[1]) * scale]
    // the tight axis lands exactly on the padding; the other one can only be looser
    expect(Math.min(...slack)).toBeCloseTo(padding * 2, 6)
    expect(Math.max(...slack)).toBeGreaterThanOrEqual(padding * 2 - 1e-6)
  })

  it('wastes less of the stage than the fixed viewBox it replaces', () => {
    const bounds = sceneBounds(buildSpikeScene(dataset))
    const [width, height] = [bounds[2] - bounds[0], bounds[3] - bounds[1]]
    for (const view of [
      { width: 876, height: 600 },
      { width: 1400, height: 760 },
      { width: 700, height: 460 },
    ]) {
      // 'xMidYMid meet' fits the whole fixed box, margins included
      const [, , fixedWidth, fixedHeight] = [-39, -7, 138, 95]
      const before = Math.min(view.width / fixedWidth, view.height / fixedHeight)
      const after = view.width / fitViewBox(bounds, view, 20)[2]
      expect(after).toBeGreaterThan(before)
      // the stage's tight axis is filled to the padding; only the other one may carry
      // slack, and only by however much the aspect ratios differ
      const fill = [(width * after) / view.width, (height * after) / view.height]
      expect(Math.max(...fill)).toBeGreaterThan(0.94)
    }
  })
})
