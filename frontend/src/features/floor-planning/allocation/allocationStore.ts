import type { Assignment, FloorAllocationData, AssignmentType } from '../domain/allocation'
import { validateAssignment, type AssignmentIssue, type AssignmentValidation } from '../domain/assignment'

/** A user-visible change to the allocation log. The backend adapter can map this shape later. */
export type AllocationMutation =
  | {
      kind: 'assign'
      id: string
      seatId: string
      employeeId: string
      type: AssignmentType
      validFrom: string
      validTo: string | null
      at: string
      actor: string
    }
  | { kind: 'release'; id: string; assignmentId: string; at: string; actor: string }

export interface AllocationStore {
  read(floorId: string): AllocationMutation[] | null
  /** Append only: existing allocation history must survive later writes. */
  append(floorId: string, mutations: readonly AllocationMutation[]): Promise<void>
}

export interface AssignmentPlan extends AssignmentValidation {
  mutations: AllocationMutation[]
}

/** Applies allocation events without mutating the source fixture. */
export function applyAllocationMutations(
  base: FloorAllocationData,
  mutations: readonly AllocationMutation[],
): FloorAllocationData {
  if (mutations.length === 0) return base

  const seats = new Set(base.seats.map((seat) => seat.id))
  const employees = new Set(base.employees.map((employee) => employee.id))
  const assignments = base.assignments.map((assignment) => ({ ...assignment }))
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id))
  let changed = false

  for (const mutation of mutations) {
    if (mutation.kind === 'assign') {
      if (!seats.has(mutation.seatId) || !employees.has(mutation.employeeId) || assignmentIds.has(mutation.id)) continue
      const assignment: Assignment = {
        id: mutation.id,
        employeeId: mutation.employeeId,
        seatId: mutation.seatId,
        type: mutation.type,
        validFrom: mutation.validFrom,
        validTo: mutation.validTo,
        updatedAt: mutation.at,
      }
      assignments.push(assignment)
      assignmentIds.add(assignment.id)
      changed = true
      continue
    }

    const index = assignments.findIndex((assignment) => assignment.id === mutation.assignmentId)
    if (index < 0) continue
    const current = assignments[index]
    if (
      !seats.has(current.seatId) ||
      !employees.has(current.employeeId) ||
      current.validTo === mutation.at ||
      (current.validTo !== null && Date.parse(current.validTo) <= Date.parse(mutation.at))
    ) continue
    assignments[index] = { ...current, validTo: mutation.at, updatedAt: mutation.at }
    changed = true
  }

  return changed ? { ...base, assignments } : base
}

const activeOccupying = (assignment: Assignment, now: Date) =>
  assignment.type !== 'reservation' &&
  Date.parse(assignment.validFrom) <= now.getTime() &&
  (assignment.validTo === null || Date.parse(assignment.validTo) > now.getTime())

/** Builds one append batch for a fresh assignment or a complete seat move. */
export function planAssignment(
  base: FloorAllocationData,
  candidate: { seatId: string; employeeId: string },
  options: {
    now: Date
    actor: string
    type?: AssignmentType
    validFrom?: string
    validTo?: string | null
    move?: boolean
  },
): AssignmentPlan {
  const nowIso = options.now.toISOString()
  const current = base.assignments.filter(
    (assignment) => assignment.employeeId === candidate.employeeId && activeOccupying(assignment, options.now),
  )
  const validationAssignments = options.move
    ? base.assignments.filter((assignment) => !current.some((existing) => existing.id === assignment.id))
    : base.assignments
  const validation = validateAssignment(candidate, {
    seats: base.seats,
    employees: base.employees,
    assignments: validationAssignments,
    now: options.now,
  })
  if (!validation.valid) return { ...validation, mutations: [] }

  const assignmentId = `asg-${candidate.seatId}-${candidate.employeeId}-${options.now.getTime()}`
  const mutations: AllocationMutation[] = current.map((assignment) => ({
    kind: 'release',
    id: `release-${assignment.id}-${options.now.getTime()}`,
    assignmentId: assignment.id,
    at: nowIso,
    actor: options.actor,
  }))
  mutations.push({
    kind: 'assign',
    id: assignmentId,
    seatId: candidate.seatId,
    employeeId: candidate.employeeId,
    type: options.type ?? 'permanent',
    validFrom: options.validFrom ?? nowIso,
    validTo: options.validTo ?? null,
    at: nowIso,
    actor: options.actor,
  })
  return { valid: true, reasons: [], mutations }
}

/** Builds the release events for every active occupant of a seat. */
export function planRelease(
  base: FloorAllocationData,
  seatId: string,
  options: { now: Date; actor: string },
): { valid: boolean; reasons: AssignmentIssue[]; mutations: AllocationMutation[] } {
  if (!base.seats.some((seat) => seat.id === seatId)) {
    return { valid: false, reasons: [{ type: 'unknown-seat' }], mutations: [] }
  }
  const mutations = base.assignments
    .filter((assignment) => assignment.seatId === seatId && activeOccupying(assignment, options.now))
    .map((assignment) => ({
      kind: 'release' as const,
      id: `release-${assignment.id}-${options.now.getTime()}`,
      assignmentId: assignment.id,
      at: options.now.toISOString(),
      actor: options.actor,
    }))
  return { valid: true, reasons: [], mutations }
}

/** Creates append-only events that reverse a committed batch without deleting history. */
export function inverseAllocationMutations(
  before: FloorAllocationData,
  mutations: readonly AllocationMutation[],
  options: { at: string; actor: string },
): AllocationMutation[] {
  const inverse: AllocationMutation[] = []
  for (const mutation of [...mutations].reverse()) {
    if (mutation.kind === 'assign') {
      inverse.push({
        kind: 'release',
        id: `undo-release-${mutation.id}-${options.at}`,
        assignmentId: mutation.id,
        at: options.at,
        actor: options.actor,
      })
      continue
    }

    const original = before.assignments.find((assignment) => assignment.id === mutation.assignmentId)
    if (!original) continue
    inverse.push({
      kind: 'assign',
      id: `undo-assign-${original.id}-${options.at}`,
      seatId: original.seatId,
      employeeId: original.employeeId,
      type: original.type,
      validFrom: original.validFrom,
      validTo: original.validTo,
      at: options.at,
      actor: options.actor,
    })
  }
  return inverse
}

const sessionMutations = new Map<string, AllocationMutation[]>()

/** Session-only persistence until an API-backed AllocationStore is available. */
export const sessionAllocationStore: AllocationStore = {
  read: (floorId) => sessionMutations.get(floorId) ?? null,
  append: async (floorId, mutations) => {
    if (mutations.length === 0) return
    sessionMutations.set(floorId, [...(sessionMutations.get(floorId) ?? []), ...mutations])
  },
}

/** Test seam and development reset for the session-only store. */
export const clearSessionAllocations = () => sessionMutations.clear()
