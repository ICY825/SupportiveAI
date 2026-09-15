import { describe, expect, it } from 'vitest'
import { buildHash, parseHash } from '../pages/urlState'

describe('url state', () => {
  it('round-trips floor and selection', () => {
    const hash = buildHash({ floorId: 'floor-16', selected: { kind: 'workstation', id: 'ws-16-001' }, view: 'verification' })
    expect(parseHash(hash)).toEqual({ floorId: 'floor-16', selected: { kind: 'workstation', id: 'ws-16-001' }, view: 'verification' })
  })

  it('round-trips the workspace view mode and defaults to verification', () => {
    const hash = buildHash({ floorId: 'floor-16', selected: null, view: 'workspace' })
    expect(hash).toBe('#/floor-planning?floor=floor-16&view=workspace')
    expect(parseHash(hash).view).toBe('workspace')
    expect(parseHash('#/floor-planning?floor=floor-16').view).toBe('verification')
  })

  it('ignores unknown entity kinds', () => {
    expect(parseHash('#/floor-planning?floor=floor-16&select=employee:e1').selected).toBeNull()
  })
})
