import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeatAssignment } from '@/api/seats'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { buildLiveAllocation, seatIdOf, workstationIdOf } from '../allocation/liveAllocation'
import { createApiAllocationStore } from '../allocation/apiAllocationStore'

vi.mock('@/api/seats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/seats')>()),
  assignSeat: vi.fn(async () => ({}) as SeatAssignment),
  releaseSeat: vi.fn(async () => ({}) as SeatAssignment),
}))

const { assignSeat, releaseSeat } = await import('@/api/seats')

let dataset: FloorDataset
beforeAll(async () => {
  dataset = await FLOORS.find((f) => f.id === 'floor-16')!.load()
})

function row(overrides: Partial<SeatAssignment> = {}): SeatAssignment {
  return {
    id: 'sa-1',
    floor_id: 'floor-16',
    workstation_id: dataset.workstations[0].id,
    layout_version: 'sha-1',
    employee: {
      id: 'emp-1',
      employee_code: 'VSF001',
      full_name: 'Nguyễn Thị Thu Hương',
      department_id: 'dept-1',
    },
    assigned_at: '2026-09-18T02:00:00Z',
    released_at: null,
    assigned_by: 'emp-9',
    decision: 'manual',
    note: null,
    ...overrides,
  }
}

describe('buildLiveAllocation', () => {
  it('derives seats from the drawing and people from the API', () => {
    const allocation = buildLiveAllocation(dataset, [row()])

    expect(allocation.source.kind).toBe('api')
    expect(allocation.seats.length).toBe(
      dataset.workstations.filter((w) => w.classification === 'WORKSTATION').length,
    )
    expect(allocation.employees).toEqual([
      expect.objectContaining({ id: 'emp-1', employeeCode: 'VSF001' }),
    ])
  })

  it('keeps the backend assignment id, because release and move are called with it', () => {
    const allocation = buildLiveAllocation(dataset, [row({ id: 'sa-42' })])
    expect(allocation.assignments[0].id).toBe('sa-42')
    expect(allocation.assignments[0].seatId).toBe(seatIdOf(dataset.workstations[0].id))
  })

  it('invents nothing the backend does not answer for', () => {
    const allocation = buildLiveAllocation(dataset, [row()])
    expect(allocation.devices).toEqual([])
    expect(allocation.departments).toEqual([])
    expect(allocation.seats.every((seat) => seat.departmentId === null)).toBe(true)
    expect(allocation.seats.every((seat) => seat.status === undefined)).toBe(true)
    expect(allocation.seats.every((seat) => seat.seatType === undefined)).toBe(true)
  })

  it('drops an assignment pointing at a desk the drawing no longer has', () => {
    const allocation = buildLiveAllocation(dataset, [row({ workstation_id: 'ws-16-gone' })])
    expect(allocation.assignments).toEqual([])
  })

  it('round-trips the seat id to the key the backend uses', () => {
    expect(workstationIdOf(seatIdOf('ws-16-001'))).toBe('ws-16-001')
  })
})

describe('createApiAllocationStore', () => {
  beforeEach(() => {
    vi.mocked(assignSeat).mockClear()
    vi.mocked(releaseSeat).mockClear()
  })

  it('sends the workstation id, never the display seat id', async () => {
    const store = createApiAllocationStore({ floorId: 'floor-16' })
    await store.append('floor-16', [
      {
        kind: 'assign',
        id: 'local-1',
        seatId: 'seat-ws-16-007',
        employeeId: 'emp-1',
        type: 'permanent',
        validFrom: '2026-09-18T02:00:00Z',
        validTo: null,
        at: '2026-09-18T02:00:00Z',
        actor: 'tester',
      },
    ])

    expect(assignSeat).toHaveBeenCalledWith({
      floor_id: 'floor-16',
      workstation_id: 'ws-16-007',
      employee_id: 'emp-1',
      decision: 'manual',
    })
  })

  it('releases by the backend id and reports when the batch is committed', async () => {
    const onCommitted = vi.fn()
    const store = createApiAllocationStore({ floorId: 'floor-16', onCommitted })
    await store.append('floor-16', [
      { kind: 'release', id: 'local-2', assignmentId: 'sa-42', at: 'now', actor: 'tester' },
    ])

    expect(releaseSeat).toHaveBeenCalledWith('sa-42')
    expect(onCommitted).toHaveBeenCalledTimes(1)
  })

  it('keeps no local history: the server is the record', () => {
    expect(createApiAllocationStore({ floorId: 'floor-16' }).read('floor-16')).toBeNull()
  })
})
