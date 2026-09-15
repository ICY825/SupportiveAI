import { describe, expect, it } from 'vitest'
import { clampScale, fitViewport, focusBBox, MAX_SCALE, panBy, screenToFloor, zoomAt } from '../map/viewport'

describe('viewport math', () => {
  it('fits content centred inside the view', () => {
    const vp = fitViewport({ width: 1000, height: 500 }, { width: 1048, height: 1048 }, 24)
    expect(vp.scale).toBeCloseTo(1)
    expect(vp.x).toBeCloseTo(24)
    expect(vp.y).toBeCloseTo((1048 - 500) / 2)
  })

  it('keeps the zoom anchor point fixed on screen', () => {
    const vp = { scale: 2, x: 10, y: 20 }
    const before = screenToFloor(vp, 300, 200)
    const next = zoomAt(vp, 1.5, 300, 200, 0.1)
    const after = screenToFloor(next, 300, 200)
    expect(after[0]).toBeCloseTo(before[0])
    expect(after[1]).toBeCloseTo(before[1])
    expect(next.scale).toBeCloseTo(3)
  })

  it('clamps zoom between half the fit scale and MAX_SCALE', () => {
    expect(clampScale(0.01, 1)).toBe(0.5)
    expect(clampScale(1e6, 1)).toBe(MAX_SCALE)
  })

  it('pans by screen pixels', () => {
    expect(panBy({ scale: 3, x: 1, y: 2 }, 10, -5)).toEqual({ scale: 3, x: 11, y: -3 })
  })

  it('centres a focused bbox', () => {
    const vp = focusBBox([100, 100, 120, 110], { width: 800, height: 600 }, 1)
    const c = screenToFloor(vp, 400, 300)
    expect(c[0]).toBeCloseTo(110)
    expect(c[1]).toBeCloseTo(105)
  })
})
