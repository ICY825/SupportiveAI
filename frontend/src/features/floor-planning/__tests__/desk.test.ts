import { beforeAll, describe, expect, it } from 'vitest'
import { createDemoAllocation, demoShowcaseDesks } from '../allocation/demoAllocation'
import { FLOORS } from '../data/registry'
import type { Assignment, Seat } from '../domain/allocation'
import { buildDeskIndex, deriveDeskStatus } from '../domain/desk'
import type { FloorDataset } from '../domain/spatial'
import { nearestInDirection } from '../map/deskNavigation'

const NOW = new Date('2026-09-15T02:50:00Z') // 09:50 in Hanoi

const seat = (over: Partial<Seat> = {}): Seat => ({
  id: 's1',
  code: 'F16-A-001',
  workstationId: 'ws-16-001',
  status: 'ACTIVE',
  seatType: 'FIXED',
  departmentId: null,
  verifiedBy: null,
  verifiedAt: null,
  layoutVersion: 'test',
  ...over,
})

const asg = (over: Partial<Assignment>): Assignment => ({
  id: `a-${Math.random()}`,
  employeeId: 'e1',
  seatId: 's1',
  type: 'permanent',
  validFrom: '2026-09-01T00:00:00Z',
  validTo: null,
  ...over,
})

describe('deriveDeskStatus', () => {
  it('is available with no assignments', () => {
    expect(deriveDeskStatus(seat(), [], NOW)).toBe('available')
  })

  it('is occupied with one active assignment and ignores other seats', () => {
    expect(deriveDeskStatus(seat(), [asg({}), asg({ seatId: 's2', employeeId: 'e2' })], NOW)).toBe('occupied')
  })

  it('treats ended and not-yet-started assignments as inactive', () => {
    const ended = asg({ validTo: '2026-09-10T00:00:00Z' })
    const future = asg({ validFrom: '2026-10-01T00:00:00Z' })
    expect(deriveDeskStatus(seat(), [ended, future], NOW)).toBe('available')
  })

  it('is a conflict with two active occupying assignments', () => {
    expect(deriveDeskStatus(seat(), [asg({}), asg({ employeeId: 'e2', type: 'temporary' })], NOW)).toBe('conflict')
  })

  it('is reserved for an upcoming reservation, but occupancy wins', () => {
    const reservation = asg({ type: 'reservation', employeeId: 'e3', validFrom: '2026-09-16T01:00:00Z' })
    expect(deriveDeskStatus(seat(), [reservation], NOW)).toBe('reserved')
    expect(deriveDeskStatus(seat(), [reservation, asg({})], NOW)).toBe('occupied')
  })

  it('is unavailable when the seat is out of service, whatever the assignments', () => {
    expect(deriveDeskStatus(seat({ status: 'OUT_OF_SERVICE' }), [asg({})], NOW)).toBe('unavailable')
  })
})

describe('demo allocation on floor-16', () => {
  let ds: FloorDataset
  beforeAll(async () => {
    ds = await FLOORS.find((f) => f.id === 'floor-16')!.load()
  })

  it.each([
    ['early morning', '2026-09-14T23:30:00Z'],
    ['mid morning', '2026-09-15T02:50:00Z'],
    ['late evening', '2026-09-15T15:30:00Z'],
  ])('gives every showcase desk its intended state (%s)', (_, iso) => {
    const now = new Date(iso)
    const desks = buildDeskIndex(ds, createDemoAllocation(ds, now), now)
    const statuses = demoShowcaseDesks(ds).map((w) => desks.get(w.id)?.status)
    expect(statuses).toEqual(['occupied', 'available', 'reserved', 'conflict', 'unavailable', 'occupied'])
  })

  it('attaches people through assignments and keeps the physical dataset untouched', () => {
    const before = JSON.stringify(ds)
    const desks = buildDeskIndex(ds, createDemoAllocation(ds, NOW), NOW)
    expect(JSON.stringify(ds)).toBe(before)
    const [occupied, available, , conflict] = demoShowcaseDesks(ds).map((w) => desks.get(w.id)!)
    expect(occupied.occupants[0].employee.name).toBe('Nguyễn Văn Minh')
    expect(occupied.occupants[0].manager?.name).toBe('Trần Đức Anh')
    expect(available.occupants).toEqual([])
    expect(conflict.occupants).toHaveLength(2)
    expect(conflict.conflictDetectedAt).not.toBeNull()
  })

  it('only creates seats for classified workstations, with unique codes', () => {
    const allocation = createDemoAllocation(ds, NOW)
    const codes = allocation.seats.map((s) => s.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(allocation.seats).toHaveLength(ds.workstations.filter((w) => w.classification === 'WORKSTATION').length)
    expect(allocation.source.kind).toBe('demo')
  })
})

describe('nearestInDirection', () => {
  const grid = [
    { id: 'a', center: [0, 0] as [number, number] },
    { id: 'b', center: [10, 0] as [number, number] },
    { id: 'c', center: [0, 10] as [number, number] },
    { id: 'd', center: [30, 1] as [number, number] },
    { id: 'e', center: [12, 40] as [number, number] },
  ]

  it('follows the row before jumping sideways', () => {
    expect(nearestInDirection([0, 0], 'right', grid, 'a')?.id).toBe('b')
    expect(nearestInDirection([10, 0], 'right', grid, 'b')?.id).toBe('d')
    expect(nearestInDirection([0, 0], 'down', grid, 'a')?.id).toBe('c')
  })

  it('returns nothing when no candidate lies in that direction', () => {
    expect(nearestInDirection([0, 0], 'up', grid, 'a')).toBeUndefined()
    expect(nearestInDirection([0, 0], 'left', grid, 'a')).toBeUndefined()
  })
})
