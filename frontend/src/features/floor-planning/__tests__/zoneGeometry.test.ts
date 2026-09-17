import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset, Point } from '../domain/spatial'
import { regularizeZonePolygon, STUB_MAX_PT, zoneDisplayPolygon } from '../domain/zoneGeometry'

let dataset: FloorDataset

beforeAll(async () => {
  dataset = await FLOORS[0].load()
})

const zoneOf = (id: string) => dataset.zones.find((zone) => zone.id === id)!

const segments = (polygon: readonly Point[]) =>
  polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const angle = (((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 90 + 90) % 90
    return { length, offAxis: Math.min(angle, 90 - angle) }
  })

const area = (polygon: readonly Point[]) =>
  Math.abs(
    polygon.reduce((sum, a, i) => {
      const b = polygon[(i + 1) % polygon.length]
      return sum + (a[0] * b[1] - b[0] * a[1])
    }, 0) / 2,
  )

describe('regularizeZonePolygon on the extracted Floor 16 annotations', () => {
  it('removes the stray stub vertices from the hand-lassoed zones', () => {
    for (const id of ['zone-16-bds-smart-city', 'zone-16-ai-platform']) {
      const source = zoneOf(id).polygon
      expect(segments(source).some((s) => s.length < STUB_MAX_PT)).toBe(true)

      const display = regularizeZonePolygon(source)
      expect(segments(display).every((s) => s.length >= STUB_MAX_PT)).toBe(true)
      expect(display.length).toBeLessThan(source.length)
    }
  })

  it('straightens every edge that was aimed at an axis or a 45° chamfer', () => {
    const display = regularizeZonePolygon(zoneOf('zone-16-bds-smart-city').polygon)
    for (const { offAxis } of segments(display)) {
      // 0 = axis-aligned, 45 = the building's diagonal wall. Nothing in between.
      const toAxis = Math.min(offAxis, 90 - offAxis)
      const toDiagonal = Math.abs(offAxis - 45)
      expect(Math.min(toAxis, toDiagonal)).toBeLessThan(0.01)
    }
  })

  it('keeps the diagonal chamfer rather than flattening it to a box', () => {
    const display = regularizeZonePolygon(zoneOf('zone-16-bds-smart-city').polygon)
    expect(segments(display).filter((s) => Math.abs(s.offAxis - 45) < 0.01).length).toBeGreaterThanOrEqual(3)
  })

  it('moves the outline only slightly — this is tidying, not redrawing', () => {
    for (const id of ['zone-16-bds-smart-city', 'zone-16-ai-platform']) {
      const source = zoneOf(id).polygon
      const display = regularizeZonePolygon(source)
      expect(Math.abs(area(display) - area(source)) / area(source)).toBeLessThan(0.02)
    }
  })

  it('leaves the clean highlight rectangles untouched', () => {
    for (const id of ['zone-16-vinfast-kdo2o', 'zone-16-kd-vh-gsm', 'zone-16-unlabeled-01']) {
      const source = zoneOf(id).polygon
      const display = regularizeZonePolygon(source)
      expect(display).toHaveLength(source.length)
      for (const [i, point] of display.entries()) {
        expect(point[0]).toBeCloseTo(source[i][0], 6)
        expect(point[1]).toBeCloseTo(source[i][1], 6)
      }
    }
  })

  it('is idempotent, so a second pass never drifts the outline', () => {
    for (const zone of dataset.zones) {
      const once = regularizeZonePolygon(zone.polygon)
      const twice = regularizeZonePolygon(once)
      expect(twice).toHaveLength(once.length)
      for (const [i, point] of twice.entries()) {
        expect(point[0]).toBeCloseTo(once[i][0], 6)
        expect(point[1]).toBeCloseTo(once[i][1], 6)
      }
    }
  })

  it('never writes back into the canonical annotation', () => {
    const zone = zoneOf('zone-16-ai-platform')
    const before = JSON.stringify(zone.polygon)
    zoneDisplayPolygon(zone)
    expect(JSON.stringify(zone.polygon)).toBe(before)
  })

  it('memoises per zone object', () => {
    const zone = zoneOf('zone-16-ai-platform')
    expect(zoneDisplayPolygon(zone)).toBe(zoneDisplayPolygon(zone))
  })

  it('returns degenerate input unchanged instead of throwing', () => {
    expect(regularizeZonePolygon([])).toEqual([])
    expect(regularizeZonePolygon([[0, 0], [1, 0], [1, 1]])).toHaveLength(3)
  })
})
