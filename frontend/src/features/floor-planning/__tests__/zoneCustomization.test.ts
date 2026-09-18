// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import {
  applyZoneCustomizations,
  clearAllZoneCustomizations,
  loadZoneCustomizations,
  polygonCentroid,
  saveZoneCustomizations,
} from '../domain/zoneCustomization'
import type { Zone } from '../domain/spatial'

const mockZone: Zone = {
  id: 'zone-1',
  floorId: 'floor-test',
  type: 'WORKSPACE_ZONE',
  name: 'Khu vực thử nghiệm',
  polygon: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  bbox: [0, 0, 100, 100],
  labelAnchor: [50, 50],
  labelAnchorSource: 'centroid',
  areaM2: 50,
  gridRef: 'A-1',
  sourceColor: '#fbcecc',
  sourceLabel: 'Khu vực thử nghiệm',
  sourceLabelFigure: null,
  source: { kind: 'pdf-annotation' },
  verification: 'SOURCE_VERIFIED',
  notes: [],
}

const unknownZone: Zone = {
  id: 'zone-unlabeled',
  floorId: 'floor-test',
  type: 'UNKNOWN',
  name: null,
  polygon: [
    [200, 200],
    [300, 200],
    [300, 300],
    [200, 300],
  ],
  bbox: [200, 200, 300, 300],
  labelAnchor: [250, 250],
  labelAnchorSource: 'centroid',
  areaM2: 45,
  gridRef: 'B-2',
  sourceColor: null,
  sourceLabel: null,
  sourceLabelFigure: null,
  source: { kind: 'pdf-annotation' },
  verification: 'UNKNOWN',
  notes: [],
}

describe('zoneCustomization domain logic', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('applies name change to an existing zone', () => {
    const updated = applyZoneCustomizations([mockZone], {
      'zone-1': { name: 'Phòng AI & Tự động hóa' },
    })
    expect(updated[0].name).toBe('Phòng AI & Tự động hóa')
    expect(updated[0].labelAnchor).toEqual([50, 50])
  })

  it('assigns department name and verification to an unlabeled zone', () => {
    const updated = applyZoneCustomizations([unknownZone], {
      'zone-unlabeled': {
        name: 'Phòng Nhân sự',
        verification: 'SOURCE_VERIFIED',
        type: 'WORKSPACE_ZONE',
        sourceColor: '#8de7ed',
      },
    })
    expect(updated[0].name).toBe('Phòng Nhân sự')
    expect(updated[0].verification).toBe('SOURCE_VERIFIED')
    expect(updated[0].type).toBe('WORKSPACE_ZONE')
    expect(updated[0].sourceColor).toBe('#8de7ed')
  })

  it('removes department name (unassigns)', () => {
    const updated = applyZoneCustomizations([mockZone], {
      'zone-1': {
        name: null,
        verification: 'UNKNOWN',
        type: 'UNKNOWN',
        sourceColor: null,
      },
    })
    expect(updated[0].name).toBeNull()
    expect(updated[0].verification).toBe('UNKNOWN')
    expect(updated[0].type).toBe('UNKNOWN')
  })

  it('repositions labelAnchor like a PDF markup tool', () => {
    const updated = applyZoneCustomizations([mockZone], {
      'zone-1': { labelAnchor: [120, 80] },
    })
    expect(updated[0].labelAnchor).toEqual([120, 80])
    expect(updated[0].name).toBe('Khu vực thử nghiệm')
  })

  it('persists and loads customizations from localStorage', () => {
    const floorId = 'floor-16'
    saveZoneCustomizations(floorId, {
      'zone-1': { name: 'Phòng Tài chính', labelAnchor: [80, 90] },
    })
    const loaded = loadZoneCustomizations(floorId)
    expect(loaded['zone-1']).toEqual({ name: 'Phòng Tài chính', labelAnchor: [80, 90] })

    clearAllZoneCustomizations()
    expect(loadZoneCustomizations(floorId)).toEqual({})
  })

  it('computes correct centroid for polygon', () => {
    const square: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    const centroid = polygonCentroid(square)
    expect(centroid).toEqual([50, 50])
  })
})
