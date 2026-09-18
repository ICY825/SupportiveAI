import { describe, expect, it, beforeEach } from 'vitest'
import { createDemoAllocation } from '../allocation/demoAllocation'
import {
  applyAllocationMutations,
  clearSessionAllocations,
  planAssignment,
  planRelease,
  sessionAllocationStore,
} from '../allocation/allocationStore'
import type { FloorAllocationData, Seat } from '../domain/allocation'
import { buildDeskIndex } from '../domain/desk'
import { validateAssignment } from '../domain/assignment'
import type { FloorDataset, Workstation } from '../domain/spatial'
import floor16Layout from '@data/floors/floor-16/floor16.layout.json'
import floor16Zones from '@data/floors/floor-16/floor16.zones.json'
import floor16Workstations from '@data/floors/floor-16/floor16.workstations.json'
import floor16Objects from '@data/floors/floor-16/floor16.objects.json'
import floor16Obstacles from '@data/floors/floor-16/floor16.obstacles.json'
import floor16Extraction from '@data/floors/floor-16/floor16.extraction.json'

const NOW = new Date('2026-09-17T03:00:00Z')

const seat = (id: string, status: Seat['status'] = 'ACTIVE'): Seat => ({
  id,
  code: id.replace('seat-', 'F16-A-'),
  workstationId: id.replace('seat-', 'ws-'),
  status,
  seatType: 'FIXED',
  departmentId: 'dept-ai',
  verifiedBy: null,
  verifiedAt: null,
  layoutVersion: 'test',
})

const employee = (id: string) => ({
  id,
  employeeCode: `VSF-${id}`,
  name: id,
  departmentId: 'dept-ai',
})

const workstation = (id: string): Workstation => ({
  id,
  floorId: 'floor-16',
  clusterId: 'cluster-test',
  zoneId: null,
  classification: 'WORKSTATION',
  verification: 'EXTRACTED',
  polygon: [[0, 0], [1, 0], [1, 1], [0, 1]],
  center: [0.5, 0.5],
  rotationDeg: 0,
  chair: null,
  bbox: [0, 0, 1, 1],
  gridRef: 'A / 1',
  source: { kind: 'pdf-vector' },
  notes: [],
})

const miniDataset = { workstations: [workstation('ws-1'), workstation('ws-2'), workstation('ws-3')], zones: [] } as unknown as FloorDataset

const allocation = (): FloorAllocationData => ({
  source: { kind: 'demo', asOf: NOW.toISOString() },
  seats: [seat('seat-1'), seat('seat-2'), seat('seat-3', 'OUT_OF_SERVICE')],
  employees: [employee('emp-1'), employee('emp-2')],
  departments: [{ id: 'dept-ai', name: 'AI & Data', zonePreferences: [] }],
  devices: [],
  assignments: [{
    id: 'assignment-1',
    employeeId: 'emp-1',
    seatId: 'seat-1',
    type: 'permanent',
    validFrom: '2026-09-01T00:00:00Z',
    validTo: null,
  }],
})

describe('allocation mutations and validation', () => {
  beforeEach(clearSessionAllocations)

  it('preserves identity when there are no mutations', () => {
    const base = allocation()
    expect(applyAllocationMutations(base, [])).toBe(base)
  })

  it('assigns an employee to an available seat without changing seat status', () => {
    const base = allocation()
    const plan = planAssignment(base, { seatId: 'seat-2', employeeId: 'emp-2' }, { now: NOW, actor: 'admin-1' })
    const next = applyAllocationMutations(base, plan.mutations)
    expect(plan.valid).toBe(true)
    expect(next.seats).toBe(base.seats)
    expect(next.assignments).toHaveLength(2)
    expect(buildDeskIndex(miniDataset, base, NOW).get('ws-2')?.status).toBe('available')
    expect(buildDeskIndex(miniDataset, next, NOW).get('ws-2')?.status).toBe('occupied')
  })

  it('releases an occupant while retaining the assignment history', () => {
    const base = allocation()
    const plan = planRelease(base, 'seat-1', { now: NOW, actor: 'admin-1' })
    const next = applyAllocationMutations(base, plan.mutations)
    expect(next.assignments).toHaveLength(1)
    expect(next.assignments[0].validTo).toBe(NOW.toISOString())
    expect(next.assignments[0].id).toBe('assignment-1')
  })

  it('moves an employee in one append batch and leaves one active assignment', () => {
    const base = allocation()
    const plan = planAssignment(base, { seatId: 'seat-2', employeeId: 'emp-1' }, { now: NOW, actor: 'admin-1', move: true })
    expect(plan.valid).toBe(true)
    expect(plan.mutations.map((mutation) => mutation.kind)).toEqual(['release', 'assign'])
    const next = applyAllocationMutations(base, plan.mutations)
    const active = next.assignments.filter((assignment) => assignment.employeeId === 'emp-1' && assignment.validTo === null)
    expect(active).toHaveLength(1)
    expect(active[0].seatId).toBe('seat-2')
  })

  it('refuses occupied, unavailable, and elsewhere-seated assignments', () => {
    const base = allocation()
    expect(validateAssignment({ seatId: 'seat-1', employeeId: 'emp-2' }, { ...base, now: NOW })).toMatchObject({
      valid: false,
      reasons: [{ type: 'seat-occupied' }],
    })
    expect(validateAssignment({ seatId: 'seat-3', employeeId: 'emp-2' }, { ...base, now: NOW })).toMatchObject({
      valid: false,
      reasons: [{ type: 'seat-unavailable' }],
    })
    expect(validateAssignment({ seatId: 'seat-2', employeeId: 'emp-1' }, { ...base, now: NOW })).toMatchObject({
      valid: false,
      reasons: [{ type: 'employee-seated-elsewhere', seatCode: 'F16-A-1' }],
    })
  })

  it('skips mutations referencing removed entities', () => {
    const base = allocation()
    const next = applyAllocationMutations(base, [{
      kind: 'assign',
      id: 'new',
      seatId: 'missing-seat',
      employeeId: 'emp-2',
      type: 'permanent',
      validFrom: NOW.toISOString(),
      validTo: null,
      at: NOW.toISOString(),
      actor: 'admin-1',
    }])
    expect(next).toBe(base)
  })

  it('appends separate store writes instead of replacing history', async () => {
    await sessionAllocationStore.append('floor-16', [{
      kind: 'release', id: 'release-1', assignmentId: 'assignment-1', at: NOW.toISOString(), actor: 'admin-1',
    }])
    await sessionAllocationStore.append('floor-16', [{
      kind: 'release', id: 'release-2', assignmentId: 'assignment-2', at: NOW.toISOString(), actor: 'admin-1',
    }])
    expect(sessionAllocationStore.read('floor-16')).toHaveLength(2)
  })
})

describe('demo assignment bench', () => {
  it('adds unseated bench employees without changing desk statuses', async () => {
  const dataset = {
      building: { id: 'b', name: 'Test' },
      layout: floor16Layout,
      zones: (floor16Zones as { zones: FloorDataset['zones'] }).zones,
      rooms: [],
      clusters: [],
      workstations: (floor16Workstations as { workstations: FloorDataset['workstations'] }).workstations,
      objects: (floor16Objects as { objects: FloorDataset['objects'] }).objects,
      obstacles: (floor16Obstacles as { obstacles: FloorDataset['obstacles'] }).obstacles,
      extraction: floor16Extraction,
    } as unknown as FloorDataset
    const allocationWithBench = createDemoAllocation(dataset, NOW)
    const histogram = (value: FloorAllocationData) => [...buildDeskIndex(dataset, value, NOW).values()]
      .reduce<Record<string, number>>((counts, desk) => ({ ...counts, [desk.status]: (counts[desk.status] ?? 0) + 1 }), {})
    const bench = allocationWithBench.employees.filter((item) => item.id.startsWith('emp-bench-'))
    const withoutBench = { ...allocationWithBench, employees: allocationWithBench.employees.filter((item) => !item.id.startsWith('emp-bench-')) }
    expect(bench).toHaveLength(32)
    expect(bench.every((item) => !allocationWithBench.assignments.some((a) => a.employeeId === item.id))).toBe(true)
    expect(histogram(allocationWithBench)).toEqual(histogram(withoutBench))
    expect(buildDeskIndex(dataset, allocationWithBench, NOW).size).toBe(382)
  })
})
