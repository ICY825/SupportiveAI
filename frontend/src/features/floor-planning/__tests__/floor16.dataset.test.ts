import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import { pointInPolygon, validateFloorDataset } from '../data/validateFloorDataset'
import type { FloorDataset } from '../domain/spatial'

let ds: FloorDataset

beforeAll(async () => {
  ds = await FLOORS.find((f) => f.id === 'floor-16')!.load()
})

describe('floor-16 dataset', () => {
  it('has no validation errors', () => {
    const errors = validateFloorDataset(ds).filter((i) => i.level === 'error')
    expect(errors).toEqual([])
  })

  it('represents the labelled zones visible on the source PDF', () => {
    const names = ds.zones.map((z) => z.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'VINFAST-KDO2O',
        'KINH DOANH & VẬN HÀNH GSM',
        'BẤT ĐỘNG SẢN - SMART CITY',
        'MÔ HÌNH & NỀN TẢNG AI',
      ]),
    )
  })

  it('keeps the unlabeled highlighted area explicitly UNKNOWN', () => {
    const unlabeled = ds.zones.filter((z) => z.name === null)
    expect(unlabeled.length).toBeGreaterThan(0)
    for (const z of unlabeled) {
      expect(z.verification).toBe('UNKNOWN')
      expect(z.type).toBe('UNKNOWN')
    }
  })

  it('assigns stable, unique, zone-independent workstation ids', () => {
    const ids = ds.workstations.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^ws-16-\d{3}$/)
  })

  it('only classifies desks with a detected chair as WORKSTATION', () => {
    for (const w of ds.workstations) {
      if (w.classification === 'WORKSTATION') {
        expect(w.chair).not.toBeNull()
        expect(w.verification).toBe('EXTRACTED')
      }
    }
  })

  it('places every zoned workstation inside its zone polygon', () => {
    const zones = new Map(ds.zones.map((z) => [z.id, z]))
    for (const w of ds.workstations) {
      if (w.zoneId) expect(pointInPolygon(w.center, zones.get(w.zoneId)!.polygon)).toBe(true)
    }
  })

  it('contains no fabricated seats, employees, assignments or occupancy', () => {
    const text = JSON.stringify(ds).toLowerCase()
    for (const key of ['"seatid"', '"employeeid"', '"assignment', '"occupancy', '"utilization', '"capacity']) {
      expect(text).not.toContain(key)
    }
    for (const r of ds.rooms) {
      // occupant names on the source labels are not imported
      expect(Object.keys(r)).not.toContain('occupant')
    }
  })

  it('is geometry in source PDF space with a known scale', () => {
    expect(ds.layout.floor.coordinateSpace).toBe('pdf-points-top-left')
    expect(ds.layout.floor.mmPerPt).toBeGreaterThan(100)
    expect(ds.layout.floor.mmPerPt).toBeLessThan(112)
    expect(ds.extraction.pdf.rasterImages).toBe(0)
  })
})
