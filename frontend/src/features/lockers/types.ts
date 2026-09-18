export type LockerStatus = 'in_use' | 'available' | 'recall' | 'broken'

export type LockerViewMode = 'map' | 'detail' | 'list'

export interface LockerCompartment {
  id: string
  code: string
  status: LockerStatus
  employeeName: string | null
  department: string | null
  assignedDate: string | null
  employeeCode?: string | null
  employeeEmail?: string | null
  jobTitle?: string | null
  recallDueDate?: string | null
  aiSuggestion?: string | null
  notes?: string | null
  lockType?: string | null
}

export interface LockerItem {
  id: string
  code: string
  name: string
  zoneGroup: string
  zoneGroupName: string
  physicalLocation: string
  center: [number, number]
  bbox: [number, number, number, number]
  size: [number, number]
  status: LockerStatus
  employeeName: string | null
  department: string | null
  assignedDate: string | null
  employeeCode?: string | null
  employeeEmail?: string | null
  jobTitle?: string | null
  recallDueDate?: string | null
  aiSuggestion?: string | null
  notes?: string | null
  isCombined?: boolean
  orientation?: 'horizontal' | 'vertical'
  rotation?: number
  compartments?: LockerCompartment[]
  lockType?: string | null
  cabinetId?: string
  cabinetCode?: string
}

export interface LockerStats {
  total: number
  inUse: number
  available: number
  recall: number
  broken: number
}
