/**
 * Allocation model — Phase 2 attachment points. TYPES ONLY.
 *
 * No records of these types exist in this codebase yet, on purpose:
 * seats must be verified by Admin, and employees/departments/assignments
 * must come from HR. Do not populate these with sample or guessed data.
 *
 *   Workstation (physical, extracted)
 *       ↓ verified by Admin
 *   Seat (assignable capacity)
 *       ↓ HR data
 *   Assignment (employee ↔ seat, time-bounded)
 */

export type SeatStatus = 'ACTIVE' | 'INACTIVE' | 'RESERVED' | 'OUT_OF_SERVICE'

/** Placeholder vocabulary; the real list must be agreed with Admin. */
export type SeatType = 'FIXED' | 'HOT_DESK' | 'MANAGER' | 'OTHER'

export interface Seat {
  id: string
  workstationId: string
  status: SeatStatus
  seatType: SeatType
  verifiedBy: string | null
  verifiedAt: string | null
  /** mirrors README `seat.layout_version` */
  layoutVersion: string
}

export interface Department {
  id: string
  name: string
  /** zone ids this department prefers / is allocated to */
  zonePreferences: string[]
}

export interface Employee {
  id: string
  departmentId: string
}

export interface Assignment {
  employeeId: string
  seatId: string
  validFrom: string
  validTo: string | null
}

/**
 * Optional data a floor view can receive once Phase 2 exists.
 * The map and details panel treat `undefined` as "no data" and show "—".
 */
export interface FloorAllocationData {
  seats: Seat[]
  assignments: Assignment[]
  departments: Department[]
}
