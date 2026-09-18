import { describe, expect, it } from 'vitest'
import { clampScale, fitViewport, focusBBox, MAX_SCALE, normalizeWheelZoom, panBy, recenterOnResize, screenToFloor, zoomAt } from '../map/viewport'

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

  it('keeps the centred floor point and zoom when the view resizes', () => {
    const vp = { scale: 2.5, x: -120, y: 40 }
    const before = screenToFloor(vp, 400, 300)
    const next = recenterOnResize(vp, { width: 800, height: 600 }, { width: 1010, height: 600 })
    expect(next.scale).toBe(2.5)
    const after = screenToFloor(next, 505, 300)
    expect(after[0]).toBeCloseTo(before[0])
    expect(after[1]).toBeCloseTo(before[1])
  })

  it('normalizes wheel zoom factors across pixel, line, and page delta modes', () => {
    // Zoom in (negative deltaY): factor > 1
    expect(normalizeWheelZoom(-1, 1)).toBeGreaterThan(1)
    expect(normalizeWheelZoom(-50, 0)).toBeGreaterThan(1)

    // Zoom out (positive deltaY): factor < 1
    expect(normalizeWheelZoom(1, 1)).toBeLessThan(1)
    expect(normalizeWheelZoom(50, 0)).toBeLessThan(1)

    // A single line tick (deltaMode 1, deltaY = 1) produces a gentle ~5% change
    expect(normalizeWheelZoom(-1, 1)).toBeCloseTo(Math.exp(0.05), 5)
    expect(normalizeWheelZoom(1, 1)).toBeCloseTo(Math.exp(-0.05), 5)

    // Trackpad tick of ~33px in deltaMode 0 produces comparable increment to 1 line tick
    expect(normalizeWheelZoom(-33.33, 0)).toBeCloseTo(normalizeWheelZoom(-1, 1), 2)

    // Sensitivity scales zoom factor smoothly
    const normalFactor = normalizeWheelZoom(-1, 1, 1)
    const gentlerFactor = normalizeWheelZoom(-1, 1, 0.7)
    expect(gentlerFactor).toBeGreaterThan(1)
    expect(gentlerFactor).toBeLessThan(normalFactor)

    // Page delta mode (deltaMode 2)
    expect(normalizeWheelZoom(1, 2)).toBeCloseTo(Math.exp(-0.5), 5)
    expect(normalizeWheelZoom(-1, 2)).toBeCloseTo(Math.exp(0.5), 5)

    // Neutral deltaY = 0 produces exactly 1
    expect(normalizeWheelZoom(0, 0)).toBe(1)
    expect(normalizeWheelZoom(0, 1)).toBe(1)

    // Non-finite and NaN values return safe 1 (identity)
    expect(normalizeWheelZoom(NaN, 0)).toBe(1)
    expect(normalizeWheelZoom(Infinity, 0)).toBe(1)
    expect(normalizeWheelZoom(-Infinity, 1)).toBe(1)

    // Non-finite, zero, and negative sensitivity values return safe 1 (identity)
    expect(normalizeWheelZoom(-1, 1, NaN)).toBe(1)
    expect(normalizeWheelZoom(-1, 1, 0)).toBe(1)
    expect(normalizeWheelZoom(-1, 1, -0.5)).toBe(1)
    expect(normalizeWheelZoom(-1, 1, Infinity)).toBe(1)

    // Extreme delta values are clamped to prevent Infinity / 0 underflow or NaN multiplication
    const extremeZoomOut = normalizeWheelZoom(1e9, 0)
    const extremeZoomIn = normalizeWheelZoom(-1e9, 0)
    expect(Number.isFinite(extremeZoomOut)).toBe(true)
    expect(Number.isFinite(extremeZoomIn)).toBe(true)
    expect(extremeZoomOut).toBeGreaterThan(0)
    expect(extremeZoomOut * extremeZoomIn).not.toBeNaN()

    const vp = { scale: 1, x: 0, y: 0 }
    const next = zoomAt(vp, extremeZoomOut * extremeZoomIn, 100, 100, 1)
    expect(Number.isFinite(next.scale)).toBe(true)
    expect(Number.isFinite(next.x)).toBe(true)
    expect(Number.isFinite(next.y)).toBe(true)
  })

  it('safely handles non-finite or invalid parameters in viewport operations', () => {
    const vp = { scale: 1, x: 10, y: 20 }

    // zoomAt: invalid factor or scale
    expect(zoomAt(vp, NaN, 100, 100, 1)).toBe(vp)
    expect(zoomAt(vp, 0, 100, 100, 1)).toBe(vp)
    expect(zoomAt(vp, -1.5, 100, 100, 1)).toBe(vp)
    expect(zoomAt(vp, 1.5, NaN, 100, 1)).toBe(vp)
    expect(zoomAt(vp, 1.5, 100, NaN, 1)).toBe(vp)
    expect(zoomAt(vp, 1.5, 100, 100, NaN)).toBe(vp)
    expect(zoomAt(vp, 1.5, 100, 100, 0)).toBe(vp)
    expect(zoomAt({ scale: 0, x: 0, y: 0 }, 1.5, 100, 100, 1)).toEqual({ scale: 0, x: 0, y: 0 })
    expect(zoomAt({ scale: NaN, x: 0, y: 0 }, 1.5, 100, 100, 1)).toEqual({ scale: NaN, x: 0, y: 0 })

    // panBy: invalid dx/dy
    expect(panBy(vp, NaN, 10)).toBe(vp)
    expect(panBy(vp, 10, NaN)).toBe(vp)
    expect(panBy(vp, Infinity, 0)).toBe(vp)

    // screenToFloor: invalid scale or coordinates
    expect(screenToFloor({ scale: 0, x: 0, y: 0 }, 10, 20)).toEqual([0, 0])
    expect(screenToFloor({ scale: NaN, x: 0, y: 0 }, 10, 20)).toEqual([0, 0])
    expect(screenToFloor(vp, NaN, 20)).toEqual([0, 0])
    expect(screenToFloor(vp, 10, NaN)).toEqual([0, 0])
  })
})
