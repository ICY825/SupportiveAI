import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FloorLayout } from '@/api/layout'
import type { SpatialPlacement } from '../domain/placement'
import { createApiLayoutStore } from '../workspace/apiLayoutStore'

const saveFloorLayout = vi.hoisted(() => vi.fn())

vi.mock('@/api/layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/layout')>()),
  saveFloorLayout,
}))

const FLOOR = 'floor-16'

function serverLayout(placements: FloorLayout['placements']): FloorLayout {
  return {
    floor_id: FLOOR,
    current_layout_version: 'layout-2',
    placements,
    stale: 0,
  }
}

function serverRow(overrides: Partial<FloorLayout['placements'][number]> = {}) {
  return {
    entity_id: 'ws-16-001',
    x: 10,
    y: 20,
    width: 120,
    depth: 60,
    rotation: 0,
    chair: null,
    seated_side: null,
    layout_version: 'layout-2',
    updated_at: '2026-09-19T00:00:00Z',
    updated_by: 'admin-1',
    ...overrides,
  }
}

function placement(overrides: Partial<SpatialPlacement> = {}): SpatialPlacement {
  return { entityId: 'ws-16-001', x: 1, y: 2, width: 120, depth: 60, rotation: 0, ...overrides }
}

beforeEach(() => {
  saveFloorLayout.mockReset()
})

describe('createApiLayoutStore', () => {
  it('answers read() synchronously from the preloaded snapshot', () => {
    // This is the whole reason the hook loads before the editor mounts:
    // useLayoutEditor reads the store inside a useState initialiser.
    const store = createApiLayoutStore({
      floorId: FLOOR,
      snapshot: serverLayout([serverRow({ x: 33, y: 44, rotation: 45 })]),
    })

    const stored = store.read(FLOOR)
    expect(stored?.['ws-16-001']).toMatchObject({ entityId: 'ws-16-001', x: 33, y: 44, rotation: 45 })
  })

  it('does not answer for a different floor', () => {
    const store = createApiLayoutStore({ floorId: FLOOR, snapshot: serverLayout([serverRow()]) })
    expect(store.read('floor-17')).toBeNull()
  })

  it('keeps a diagonal angle rather than rounding it to a quarter turn', () => {
    const store = createApiLayoutStore({
      floorId: FLOOR,
      snapshot: serverLayout([serverRow({ rotation: 44.5 })]),
    })
    expect(store.read(FLOOR)?.['ws-16-001'].rotation).toBe(44.5)
  })

  it('carries the chair through, so a moved desk does not lose its seat', () => {
    const chair = { bbox: [0, 0, 6, 6], center: [3, 3], rotation: 45 }
    const store = createApiLayoutStore({
      floorId: FLOOR,
      snapshot: serverLayout([serverRow({ chair })]),
    })
    expect(store.read(FLOOR)?.['ws-16-001'].chair).toEqual(chair)
  })

  it('sends the area it was given, in the field names the API uses', async () => {
    saveFloorLayout.mockResolvedValue(serverLayout([serverRow()]))
    const store = createApiLayoutStore({ floorId: FLOOR, snapshot: serverLayout([]) })

    await store.write(FLOOR, {
      'ws-16-001': placement({ x: 5, y: 6, rotation: 45, seatedSide: 'north' }),
    })

    expect(saveFloorLayout).toHaveBeenCalledWith(FLOOR, [
      {
        entity_id: 'ws-16-001',
        x: 5,
        y: 6,
        width: 120,
        depth: 60,
        rotation: 45,
        chair: null,
        seated_side: 'north',
      },
    ])
  })

  it('takes the server answer, not the payload it just sent', async () => {
    // The server merges. Trusting the payload would drop every other area's
    // committed positions from the local snapshot.
    saveFloorLayout.mockResolvedValue(
      serverLayout([serverRow(), serverRow({ entity_id: 'ws-16-002', x: 99 })]),
    )
    const store = createApiLayoutStore({ floorId: FLOOR, snapshot: serverLayout([]) })

    await store.write(FLOOR, { 'ws-16-001': placement() })

    expect(Object.keys(store.read(FLOOR) ?? {})).toEqual(['ws-16-001', 'ws-16-002'])
  })

  it('reports the refreshed floor to its caller', async () => {
    const answer = serverLayout([serverRow()])
    saveFloorLayout.mockResolvedValue(answer)
    const onCommitted = vi.fn()
    const store = createApiLayoutStore({ floorId: FLOOR, snapshot: serverLayout([]), onCommitted })

    await store.write(FLOOR, { 'ws-16-001': placement() })

    expect(onCommitted).toHaveBeenCalledWith(answer)
  })

  it('rethrows a refused write and leaves the snapshot alone', async () => {
    saveFloorLayout.mockRejectedValue(new Error('409'))
    const onError = vi.fn()
    const store = createApiLayoutStore({
      floorId: FLOOR,
      snapshot: serverLayout([serverRow({ x: 10 })]),
      onError,
    })

    await expect(store.write(FLOOR, { 'ws-16-001': placement({ x: 999 }) })).rejects.toThrow('409')
    expect(onError).toHaveBeenCalled()
    expect(store.read(FLOOR)?.['ws-16-001'].x).toBe(10)
  })

  it('does not call the API for an empty write', async () => {
    const store = createApiLayoutStore({ floorId: FLOOR, snapshot: serverLayout([]) })
    await store.write(FLOOR, {})
    expect(saveFloorLayout).not.toHaveBeenCalled()
  })
})
