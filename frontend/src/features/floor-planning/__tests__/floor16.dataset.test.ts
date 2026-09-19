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

  it('keeps any unlabeled highlighted area explicitly UNKNOWN', () => {
    // There is none on floor 16 any more: the lavender block was the last one,
    // and the team named it as the second half of AI Platform. The guard stays,
    // because the next floor extracted may well have one.
    for (const z of ds.zones.filter((zone) => zone.name === null)) {
      expect(z.verification).toBe('UNKNOWN')
      expect(z.type).toBe('UNKNOWN')
    }
  })

  /**
   * A name the team supplied is not a name the drawing carries. The zone is
   * usable — it has a department, so desks belong to it — but it must not claim
   * the sheet verified it, or nobody will know to check it against the corrected
   * drawing later.
   */
  it('marks a team-named zone UNVERIFIED, and says where the name came from', () => {
    const teamNamed = ds.zones.filter((z) => z.source?.nameSource === 'team')
    expect(teamNamed.map((z) => z.id)).toEqual(['zone-16-ai-platform-02'])
    for (const z of teamNamed) {
      expect(z.name).toBe('MÔ HÌNH & NỀN TẢNG AI')
      expect(z.verification).toBe('UNVERIFIED')
      expect(z.type).toBe('WORKSPACE_ZONE')
    }
  })

  /** The lift and stair cores split one department across two zones. */
  it('counts both halves of AI Platform', () => {
    const ai = ds.zones.filter((z) => z.name === 'MÔ HÌNH & NỀN TẢNG AI').map((z) => z.id)
    expect(ai.sort()).toEqual(['zone-16-ai-platform', 'zone-16-ai-platform-02'])
    const desks = ds.workstations.filter((w) => ai.includes(w.zoneId ?? ''))
    expect(desks.length).toBe(154)
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

  it('loads a lightweight overview that agrees with every canonical workstation', () => {
    expect(ds.overview).toBeDefined()
    expect(ds.overview!.displayAreas.map((area) => area.id)).toEqual([
      'ai-area-a', 'ai-area-b', 'ai-area-c', 'ai-area-d', 'ai-area-e', 'ai-area-f',
    ])
    expect(ds.overview!.workstations).toHaveLength(ds.workstations.length)
    const full = new Map(ds.workstations.map((workstation) => [workstation.id, workstation]))
    for (const workstation of ds.overview!.workstations) {
      const source = full.get(workstation.id)!
      expect(workstation.center).toEqual(source.center)
      expect(workstation.bbox).toEqual(source.bbox)
      expect(workstation.rotationDeg).toBe(source.rotationDeg)
    }
    expect(ds.overview!.workstations.filter((workstation) =>
      ['zone-16-ai-platform', 'zone-16-ai-platform-02'].includes(workstation.zoneId ?? ''),
    )).toHaveLength(154)
  })
})
