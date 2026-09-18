export type LockerStatus = 'in_use' | 'available' | 'recall' | 'broken'

export type LockerViewMode = 'map' | 'detail' | 'list'

export interface LockerCompartment {
  id: string
  code: string
  status: LockerStatus
  employeeName: string | null
  department: string | null
  assignedDate: string | null
  recallDueDate?: string | null
  aiSuggestion?: string | null
  notes?: string | null
}

export interface LockerItem {
  id: string
  code: string
  name: string
  zoneGroup: 'L1' | 'L2' | 'L3' | 'L4'
  zoneGroupName: string
  physicalLocation: string
  center: [number, number]
  bbox: [number, number, number, number]
  size: [number, number]
  status: LockerStatus
  employeeName: string | null
  department: string | null
  assignedDate: string | null
  recallDueDate?: string | null
  aiSuggestion?: string | null
  notes?: string | null
  isCombined?: boolean
  orientation?: 'horizontal' | 'vertical'
  compartments?: LockerCompartment[]
}

export interface LockerStats {
  total: number
  inUse: number
  available: number
  recall: number
  broken: number
}
