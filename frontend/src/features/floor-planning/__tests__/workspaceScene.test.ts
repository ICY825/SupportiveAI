import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { buildSpikeScene, cropSourcePath, planeTransform, project, SPIKE_CROP } from '../workspace/scene'

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
