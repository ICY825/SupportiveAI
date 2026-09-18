/**
 * Allocation model — attached to the physical model, never merged into it.
 *
 *   Workstation (physical, extracted from the drawing)
 *       ↓ verified by Admin
 *   Seat (assignable capacity, has a human code)
 *       ↓ HR data
 *   Assignment (employee ↔ seat, time-bounded)  →  Employee
 *
 * Real records must come from the backend after Admin/HR verification.
 * Until then the only records are the clearly-labelled demo fixtures in
 * ../allocation/demoAllocation.ts, shown only in the "workspace" view mode.
 * Never write allocation fields into FloorDataset or the generated JSON.
 */

export type SeatStatus = 'ACTIVE' | 'INACTIVE' | 'RESERVED' | 'OUT_OF_SERVICE'

/** Placeholder vocabulary; the real list must be agreed with Admin. */
export type SeatType = 'FIXED' | 'HOT_DESK' | 'SHARED' | 'MANAGER' | 'OTHER'

export interface SeatCapabilities {
  power?: boolean
  monitor?: boolean
  dockingStation?: boolean
}

export interface Seat {
  id: string
  /** human-facing desk code, e.g. F16-A-023 */
  code: string
  workstationId: string
  /** Operational status, when the source system records one. */
  status?: SeatStatus
  /** Seating classification, when the source system records one. */
  seatType?: SeatType
  /** department the seat is allocated to; null = not allocated */
  departmentId: string | null
  capabilities?: SeatCapabilities
  /** why the seat is INACTIVE / OUT_OF_SERVICE */
  statusReason?: string | null
  statusChangedAt?: string | null
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

export type Presence = 'in_office' | 'remote' | 'away' | 'unknown'

export interface Employee {
  id: string
  employeeCode: string
  name: string
  avatarUrl?: string
  jobTitle?: string
  departmentId: string | null
  team?: string
  managerId?: string | null
  presence?: Presence
}

export type AssignmentType = 'permanent' | 'temporary' | 'reservation'

export interface Assignment {
  id: string
  employeeId: string
  seatId: string
  type: AssignmentType
  /** ISO 8601 */
  validFrom: string
  /** ISO 8601; null = open-ended */
  validTo: string | null
  updatedAt?: string
}

export type DeviceType = 'laptop' | 'monitor' | 'dock' | 'other'

export interface Device {
  id: string
  type: DeviceType
  assetCode: string
  model?: string
  /** installed at the seat (monitor, dock) */
  seatId?: string | null
  /** issued to a person (laptop) */
  employeeId?: string | null
}

export interface AllocationSource {
  kind: 'demo' | 'api'
  /** ISO 8601 time the data represents */
  asOf: string
}

/** Everything a floor view can receive about seats and people. */
export interface FloorAllocationData {
  source: AllocationSource
  seats: Seat[]
  assignments: Assignment[]
  departments: Department[]
  employees: Employee[]
  devices: Device[]
}
