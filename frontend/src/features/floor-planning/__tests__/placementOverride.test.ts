import { describe, expect, it } from 'vitest'
import { validatePlacement, type SpatialPlacement } from '../domain/placement'
import type { FloorObstacle } from '../domain/spatial'

const desk = (overrides: Partial<SpatialPlacement> = {}): SpatialPlacement => ({
  entityId: 'desk-a',
  x: 20,
  y: 20,
  width: 10,
  depth: 10,
  rotation: 0,
  ...overrides,
})

const obstacle = (verification: 'SOURCE_VERIFIED' | 'EXTRACTED' | 'UNVERIFIED'): FloorObstacle => ({
  id: 'obstacle-a',
  floorId: 'floor-16',
  kind: 'column',
  category: 'solid',
  polygon: [[0, 0], [10, 0], [10, 10], [0, 10]],
  bbox: [0, 0, 10, 10] as [number, number, number, number],
  gridRef: 'A-1',
  notes: [],
  verification,
})

describe('placement override policy', () => {
  it('allows only extracted or unverified geometry after explicit override', () => {
    const result = validatePlacement(desk({ x: 5, y: 5 }), { others: [], obstacles: [obstacle('EXTRACTED')] })
    expect(result.valid).toBe(true)
    expect(result.requiresOverride).toBe(true)
    expect(result.reasons[0]).toMatchObject({ type: 'obstacle-collision', severity: 'overridable' })
  })

  it('keeps source-verified geometry and desk overlaps hard', () => {
    const verified = validatePlacement(desk({ x: 5, y: 5 }), { others: [], obstacles: [obstacle('SOURCE_VERIFIED')] })
    expect(verified.valid).toBe(false)
    expect(verified.requiresOverride).toBe(false)

    const overlap = validatePlacement(desk({ x: 5, y: 5 }), {
      others: [desk({ entityId: 'desk-b', x: 5, y: 5 })],
    })
    expect(overlap.valid).toBe(false)
    expect(overlap.reasons).toContainEqual(expect.objectContaining({ type: 'overlap', severity: 'hard' }))
  })
})
