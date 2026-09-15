import { describe, expect, it } from 'vitest'
import { buildHash, parseHash } from '../pages/urlState'

describe('url state', () => {
  it('round-trips floor and selection', () => {
    const hash = buildHash({ floorId: 'floor-16', selected: { kind: 'workstation', id: 'ws-16-001' } })
    expect(parseHash(hash)).toEqual({ floorId: 'floor-16', selected: { kind: 'workstation', id: 'ws-16-001' } })
  })

  it('ignores unknown entity kinds', () => {
    expect(parseHash('#/floor-planning?floor=floor-16&select=employee:e1').selected).toBeNull()
  })
})
