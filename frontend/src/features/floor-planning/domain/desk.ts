/**
 * Desk = one physical workstation + its seat + what is attached to that seat.
 * Status is DERIVED from seat state and assignments, never stored, so the
 * floor map and the inspector cannot disagree.
 */
import type { Assignment, Department, Device, Employee, FloorAllocationData, Seat } from './allocation'
import type { FloorDataset, Workstation, Zone } from './spatial'

export type DeskStatus = 'occupied' | 'available' | 'reserved' | 'conflict' | 'unavailable'

export const DESK_STATUSES: DeskStatus[] = ['occupied', 'available', 'reserved', 'conflict', 'unavailable']

export interface PersonOnDesk {
  assignment: Assignment
  employee: Employee
  manager: Employee | null
  department: Department | null
}

export interface DeskRecord {
  workstation: Workstation
  seat: Seat
  status: DeskStatus
  zone: Zone | null
  department: Department | null
  /** active, non-reservation assignments (0, 1, or >1 = conflict) */
  occupants: PersonOnDesk[]
  /** current or next reservation, if any */
  reservation: PersonOnDesk | null
  /** devices installed at the seat, plus devices issued to a single occupant */
  devices: Device[]
  /** most recent change to any assignment involved in a conflict */
  conflictDetectedAt: string | null
}

const t = (iso: string) => Date.parse(iso)

/** In effect at `now`: started and not yet ended. */
export function isActive(a: Assignment, now: Date): boolean {
  return t(a.validFrom) <= now.getTime() && (a.validTo === null || t(a.validTo) > now.getTime())
}

/** Not yet ended (current or future). */
function notEnded(a: Assignment, now: Date): boolean {
  return a.validTo === null || t(a.validTo) > now.getTime()
}

export function deriveDeskStatus(seat: Seat, assignments: Assignment[], now: Date): DeskStatus {
  if (seat.status === 'OUT_OF_SERVICE' || seat.status === 'INACTIVE') return 'unavailable'
  const mine = assignments.filter((a) => a.seatId === seat.id)
  const occupying = mine.filter((a) => a.type !== 'reservation' && isActive(a, now))
  if (occupying.length > 1) return 'conflict'
  if (occupying.length === 1) return 'occupied'
  if (seat.status === 'RESERVED' || mine.some((a) => a.type === 'reservation' && notEnded(a, now))) return 'reserved'
  return 'available'
}

/** Index desks by workstation id. Workstations without a seat are not desks. */
export function buildDeskIndex(
  dataset: FloorDataset,
  allocation: FloorAllocationData | undefined,
  now: Date,
): Map<string, DeskRecord> {
  const index = new Map<string, DeskRecord>()
  if (!allocation) return index

  const wsById = new Map(dataset.workstations.map((w) => [w.id, w]))
  const zoneById = new Map(dataset.zones.map((z) => [z.id, z]))
  const deptById = new Map(allocation.departments.map((d) => [d.id, d]))
  const empById = new Map(allocation.employees.map((e) => [e.id, e]))
  const bySeat = new Map<string, Assignment[]>()
  for (const a of allocation.assignments) bySeat.set(a.seatId, [...(bySeat.get(a.seatId) ?? []), a])

  const person = (a: Assignment): PersonOnDesk | null => {
    const employee = empById.get(a.employeeId)
    if (!employee) return null
    return {
      assignment: a,
      employee,
      manager: employee.managerId ? (empById.get(employee.managerId) ?? null) : null,
      department: employee.departmentId ? (deptById.get(employee.departmentId) ?? null) : null,
    }
  }

  for (const seat of allocation.seats) {
    const workstation = wsById.get(seat.workstationId)
    if (!workstation) continue
    const assignments = bySeat.get(seat.id) ?? []
    const status = deriveDeskStatus(seat, assignments, now)
    const occupying = assignments.filter((a) => a.type !== 'reservation' && isActive(a, now))
    const occupants = occupying.map(person).filter((p): p is PersonOnDesk => p !== null)
    const nextReservation = assignments
      .filter((a) => a.type === 'reservation' && notEnded(a, now))
      .sort((a, b) => t(a.validFrom) - t(b.validFrom))[0]
    const occupantIds = new Set(occupants.length === 1 ? [occupants[0].employee.id] : [])
    const devices = allocation.devices.filter(
      (d) => d.seatId === seat.id || (d.employeeId != null && occupantIds.has(d.employeeId)),
    )
    const conflictDetectedAt =
      status === 'conflict'
        ? occupying
            .map((a) => a.updatedAt ?? a.validFrom)
            .sort((a, b) => t(a) - t(b))
            .at(-1)!
        : null

    index.set(workstation.id, {
      workstation,
      seat,
      status,
      zone: workstation.zoneId ? (zoneById.get(workstation.zoneId) ?? null) : null,
      department: seat.departmentId ? (deptById.get(seat.departmentId) ?? null) : null,
      occupants,
      reservation: nextReservation ? person(nextReservation) : null,
      devices,
      conflictDetectedAt,
    })
  }
  return index
}
