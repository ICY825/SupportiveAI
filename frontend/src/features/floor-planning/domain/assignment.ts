import type { Assignment, Employee, Seat } from './allocation'

export type AssignmentIssue =
  | { type: 'seat-unavailable' }
  | { type: 'seat-occupied' }
  | { type: 'employee-seated-elsewhere'; seatCode: string }
  | { type: 'unknown-employee' }
  | { type: 'unknown-seat' }

export interface AssignmentValidation {
  valid: boolean
  reasons: AssignmentIssue[]
}

const isActive = (assignment: Assignment, now: Date) =>
  Date.parse(assignment.validFrom) <= now.getTime() &&
  (assignment.validTo === null || Date.parse(assignment.validTo) > now.getTime())

/** Pure validation shared by the picker, action handlers and future API adapter. */
export function validateAssignment(
  candidate: { seatId: string; employeeId: string },
  context: { seats: readonly Seat[]; employees: readonly Employee[]; assignments: readonly Assignment[]; now: Date },
): AssignmentValidation {
  const seat = context.seats.find((item) => item.id === candidate.seatId)
  const employee = context.employees.find((item) => item.id === candidate.employeeId)
  const reasons: AssignmentIssue[] = []

  if (!seat) reasons.push({ type: 'unknown-seat' })
  if (!employee) reasons.push({ type: 'unknown-employee' })
  if (!seat || !employee) return { valid: false, reasons }

  if (seat.status === 'OUT_OF_SERVICE' || seat.status === 'INACTIVE') {
    reasons.push({ type: 'seat-unavailable' })
  }

  const activeAssignments = context.assignments.filter(
    (assignment) => assignment.type !== 'reservation' && isActive(assignment, context.now),
  )
  if (activeAssignments.some((assignment) => assignment.seatId === seat.id)) {
    reasons.push({ type: 'seat-occupied' })
  }

  const elsewhere = activeAssignments.find(
    (assignment) => assignment.employeeId === employee.id && assignment.seatId !== seat.id,
  )
  if (elsewhere) {
    const otherSeat = context.seats.find((item) => item.id === elsewhere.seatId)
    reasons.push({ type: 'employee-seated-elsewhere', seatCode: otherSeat?.code ?? elsewhere.seatId })
  }

  return { valid: reasons.length === 0, reasons }
}
