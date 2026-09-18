import { useState, useMemo, useEffect, useRef } from 'react'
import type { LockerItem, LockerViewMode, LockerStatus, LockerCompartment } from '../types'
import {
  getFlatLockerCompartments,
  calculateLockerStats,
  MAP_LOCKERS,
} from '../lockersData'
import { LockerMap } from '../components/LockerMap'
import { LockerDetailGrid } from '../components/LockerDetailGrid'
import { LockerList } from '../components/LockerList'
import { LockerInspector } from '../components/LockerInspector'
import { LockerCreatePanel } from '../components/LockerCreatePanel'
import { LockerLocationControls, DEFAULT_LOCKER_SITES } from '../components/LockerLocationControls'
import markUrl from '../../../assets/brand/vsf-mark.png'
import '../../floor-planning/floorPlanning.css'
import '../../floor-planning/components/desk-inspector/deskInspector.css'
import '../lockers.css'

const rawApiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1'
const API_BASE_URL = String(rawApiBaseUrl).replace(/\/+$/, '')

export interface LockerLocation {
  id: string | number
  site: string
  building: string
  floor: string
  zone?: string
  name?: string
  code?: string
  [key: string]: any
}

interface LockerCreateFormData {
  zone: string
  compartment_start: number | string
  compartment_count: number | string
  lock_type: string
  notes: string
}

const initialFormData: LockerCreateFormData = {
  zone: 'A',
  compartment_start: '',
  compartment_count: 1,
  lock_type: 'electronic',
  notes: '',
}

const FIXED_LOCKER_DRAFT_SIZE = { width: 28, height: 28 }

function makeDraftPosition(x: number, y: number) {
  const pos = {
    x,
    y,
    0: x,
    1: y,
    *[Symbol.iterator]() {
      yield x
      yield y
    },
  }
  return pos as { x: number; y: number } & [number, number]
}

function normalizeStatus(raw: unknown): LockerStatus {
  const s = String(raw || '').toLowerCase()
  if (s === 'in_use' || s === 'in-use' || s === 'occupied') return 'in_use'
  if (s === 'recall' || s === 'pending_recall') return 'recall'
  if (s === 'broken' || s === 'maintenance' || s === 'error') return 'broken'
  return 'available'
}

function parseLocation(item: any): LockerLocation {
  return {
    id: item?.id ?? item?.location_id ?? '',
    site: item?.site ?? item?.site_name ?? 'Bắc',
    building: item?.building ?? item?.building_name ?? item?.block ?? 'Technopark',
    floor: String(item?.floor ?? item?.floor_name ?? item?.floor_number ?? item?.level ?? '16'),
    name: item?.name,
    code: item?.code,
  }
}

function mapLockerReadToItem(data: any, index: number = 0): LockerItem {
  const rawZone = String(data?.zone ?? data?.zoneGroup ?? data?.zone_group ?? '').trim()
  const zoneGroup = rawZone || 'Chưa phân khu'
  const zoneGroupName = rawZone || 'Chưa phân khu'

  const col = index % 5
  const row = Math.floor(index / 5)
  const defaultX = 160 + col * 130
  const defaultY = 140 + row * 100

  let rawCenter = data?.center
  if (typeof rawCenter === 'string') {
    try {
      rawCenter = JSON.parse(rawCenter)
    } catch { }
  }

  const center: [number, number] =
    Array.isArray(rawCenter) &&
      rawCenter.length === 2 &&
      !isNaN(Number(rawCenter[0])) &&
      !isNaN(Number(rawCenter[1]))
      ? [Number(rawCenter[0]), Number(rawCenter[1])]
      : rawCenter &&
        typeof rawCenter === 'object' &&
        'x' in rawCenter &&
        'y' in rawCenter &&
        !isNaN(Number(rawCenter.x)) &&
        !isNaN(Number(rawCenter.y))
        ? [Number(rawCenter.x), Number(rawCenter.y)]
        : [defaultX, defaultY]

  let rawBbox = data?.bbox
  if (typeof rawBbox === 'string') {
    try {
      rawBbox = JSON.parse(rawBbox)
    } catch { }
  }

  const size: [number, number] =
    Array.isArray(data?.size) && data.size.length === 2
      ? [Number(data.size[0]), Number(data.size[1])]
      : [28, 28]

  const bbox: [number, number, number, number] =
    Array.isArray(rawBbox) &&
      rawBbox.length === 4 &&
      !isNaN(Number(rawBbox[0])) &&
      !isNaN(Number(rawBbox[1])) &&
      !isNaN(Number(rawBbox[2])) &&
      !isNaN(Number(rawBbox[3])) &&
      Number(rawBbox[2]) > Number(rawBbox[0])
      ? [Number(rawBbox[0]), Number(rawBbox[1]), Number(rawBbox[2]), Number(rawBbox[3])]
      : [
        center[0] - size[0] / 2,
        center[1] - size[1] / 2,
        center[0] + size[0] / 2,
        center[1] + size[1] / 2,
      ]

  const rawAiSuggestion =
    data?.aiSuggestion ??
    data?.ai_suggestion ??
    (normalizeStatus(data?.status) === 'recall'
      ? `Thu hồi tủ ${data?.code || 'L1-04'} và ưu tiên tái cấp phát cho nhân sự mới.`
      : null)

  let compartments: LockerCompartment[] | undefined = undefined
  if (Array.isArray(data?.compartments) && data.compartments.length > 0) {
    compartments = data.compartments.map((c: any, cIdx: number) => ({
      id: String(c.id ?? `${data.id ?? index}-c${cIdx + 1}`),
      code: String(c.code ?? `${data.code || 'LK'}-${cIdx + 1}`),
      status: normalizeStatus(c.status),
      employeeName: c.employeeName ?? c.employee_name ?? null,
      department: c.department ?? null,
      assignedDate: c.assignedDate ?? c.assigned_date ?? null,
      recallDueDate: c.recallDueDate ?? c.recall_due_date ?? null,
      aiSuggestion: c.aiSuggestion ?? c.ai_suggestion ?? (normalizeStatus(c.status) === 'recall' ? rawAiSuggestion : null),
      notes: c.notes ?? null,
    }))
  } else if (data?.compartment_count && Number(data.compartment_count) > 0) {
    const count = Number(data.compartment_count)
    compartments = Array.from({ length: count }, (_, cIdx) => ({
      id: `${data.id ?? index}-c${cIdx + 1}`,
      code: `${data.code || 'LK'}-${String(cIdx + 1).padStart(2, '0')}`,
      status: normalizeStatus(data.status),
      employeeName: null,
      department: null,
      assignedDate: null,
      recallDueDate: null,
      aiSuggestion: null,
      notes: null,
    }))
  }

  const isCombined =
    (compartments && compartments.length > 1) ||
    Boolean(data?.isCombined) ||
    Boolean(data?.is_combined)

  const rawRotation = data?.rotation
  let rotation = 0
  if (typeof rawRotation === 'number') {
    rotation = Number.isFinite(rawRotation) ? rawRotation : 0
  } else if (typeof rawRotation === 'string' && rawRotation.trim() !== '') {
    const parsed = Number(rawRotation)
    rotation = Number.isFinite(parsed) ? parsed : 0
  }

  return {
    id: String(data?.id ?? `locker-${index}`),
    code: String(data?.code ?? `LK-${index + 1}`),
    name: data?.name ? String(data.name) : `Tủ ${data?.code ?? data?.id ?? index + 1}`,
    zoneGroup,
    zoneGroupName,
    physicalLocation:
      data?.physicalLocation ??
      data?.physical_location ??
      `Tầng 16 · ${zoneGroup}`,
    center,
    bbox,
    size,
    status: normalizeStatus(data?.status),
    employeeName: data?.employeeName ?? data?.employee_name ?? null,
    department: data?.department ?? null,
    assignedDate: data?.assignedDate ?? data?.assigned_date ?? null,
    recallDueDate: data?.recallDueDate ?? data?.recall_due_date ?? null,
    aiSuggestion: data?.aiSuggestion ?? data?.ai_suggestion ?? rawAiSuggestion ?? null,
    notes: data?.notes ?? null,
    isCombined,
    orientation: data?.orientation === 'vertical' ? 'vertical' : 'horizontal',
    rotation,
    compartments,
    lockType: data?.lock_type ?? data?.lockType ?? 'mechanical_key',
  }
}

export function LockerManagementPage() {
  const [lockers, setLockers] = useState<LockerItem[]>(MAP_LOCKERS)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<LockerViewMode>('map')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLockerId, setSelectedLockerId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Location filters state: Site -> Tòa -> Tầng (bỏ Zone)
  const defaultFallbackLocation: LockerLocation = {
    id: '',
    site: 'Bắc',
    building: 'Technopark',
    floor: '16',
  }
  const sites = DEFAULT_LOCKER_SITES
  const [locations, setLocations] = useState<LockerLocation[]>([defaultFallbackLocation])
  const [isLocationsLoading, setIsLocationsLoading] = useState<boolean>(true)
  const [selectedSite, setSelectedSite] = useState<string>('Bắc')
  const [selectedBuilding, setSelectedBuilding] = useState<string>('Technopark')
  const [selectedFloor, setSelectedFloor] = useState<string>('16')
  const [selectedZone, setSelectedZone] = useState<string>('')
  const [selectedCabinetId, setSelectedCabinetId] = useState<string>('')

  // Create Locker Form/Panel state
  const [isCreatingLocker, setIsCreatingLocker] = useState<boolean>(false)
  const [formData, setFormData] = useState<LockerCreateFormData>(initialFormData)
  const [draftPosition, setDraftPosition] = useState<({ x: number; y: number } & [number, number]) | null>(null)
  const [draftRotation, setDraftRotation] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Fetch /locker-locations
  const fetchLocations = async () => {
    setIsLocationsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/locker-locations`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const data = await res.json()
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.data)
            ? data.data
            : []
      const parsed = list.map(parseLocation)
      if (parsed.length > 0) {
        setLocations(parsed)
      } else {
        setLocations([defaultFallbackLocation])
        setIsLoading(false)
      }
    } catch (err: any) {
      console.warn('Không thể tải locker-locations, sử dụng cấu hình mặc định:', err)
      setLocations([defaultFallbackLocation])
      setIsLoading(false)
    } finally {
      setIsLocationsLoading(false)
    }
  }

  useEffect(() => {
    fetchLocations()
  }, [])

  // Cascading filters: Site (VinSmart Future) -> Building -> Floor
  const availableBuildings = useMemo(() => {
    const list = locations
      .filter((loc) => !loc.site || loc.site === selectedSite)
      .map((loc) => loc.building)
      .filter(Boolean)
    return Array.from(new Set(list))
  }, [locations, selectedSite])

  useEffect(() => {
    if (availableBuildings.length > 0) {
      if (!availableBuildings.includes(selectedBuilding)) {
        setSelectedBuilding(availableBuildings[0])
      }
    } else {
      setSelectedBuilding('')
    }
  }, [availableBuildings, selectedBuilding])

  const availableFloors = useMemo(() => {
    const list = locations
      .filter(
        (loc) =>
          (!loc.site || loc.site === selectedSite) &&
          (!selectedBuilding || loc.building === selectedBuilding),
      )
      .map((loc) => loc.floor)
      .filter(Boolean)
    return Array.from(new Set(list))
  }, [locations, selectedSite, selectedBuilding])

  useEffect(() => {
    if (availableFloors.length > 0) {
      if (!availableFloors.includes(selectedFloor)) {
        setSelectedFloor(availableFloors[0])
      }
    } else {
      setSelectedFloor('')
    }
  }, [availableFloors, selectedFloor])

  const matchingLocations = useMemo(() => {
    return locations.filter(
      (loc) =>
        (!loc.site || loc.site === selectedSite) &&
        (!selectedBuilding || loc.building === selectedBuilding) &&
        (!selectedFloor || loc.floor === selectedFloor),
    )
  }, [locations, selectedSite, selectedBuilding, selectedFloor])

  // Xác định location được chọn và location_id tương ứng dựa trên Tòa + Tầng đang chọn
  const activeLocation = useMemo(() => {
    if (!matchingLocations.length) return null
    return matchingLocations[0]
  }, [matchingLocations])

  const selectedLocationId = activeLocation ? activeLocation.id : null

  // Fetch lockers với ?location_id=
  const fetchLockers = async (locId?: string | number | null) => {
    const targetLocId = locId !== undefined ? locId : selectedLocationId
    if (targetLocId === null || targetLocId === undefined || targetLocId === '') {
      return
    }
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(
        `${API_BASE_URL}/lockers?location_id=${encodeURIComponent(String(targetLocId))}`,
      )
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const data = await res.json()
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.value)
          ? data.value
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.data)
              ? data.data
              : []
      const mapped = list.map((item: any, idx: number) => mapLockerReadToItem(item, idx))
      setLockers(mapped)
    } catch (err: any) {
      setFetchError(err?.message || 'Không thể kết nối đến máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  // Tự động tải danh sách tủ khi Location ID được xác định
  useEffect(() => {
    if (selectedLocationId !== null && selectedLocationId !== undefined && selectedLocationId !== '') {
      fetchLockers(selectedLocationId)
      if (createError && createError.includes('Vị trí tủ')) {
        setCreateError(null)
      }
    }
  }, [selectedLocationId])

  // Quick keyboard shortcut Ctrl+K to search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  // Flat individual compartments across all zones
  const allCompartments = useMemo(
    () => getFlatLockerCompartments(lockers),
    [lockers],
  )

  // Dynamic operational statistics
  const stats = useMemo(() => calculateLockerStats(lockers), [lockers])

  const zoneSummary = useMemo(() => {
    const groups = new Map<string, number>()
    for (const locker of lockers) {
      const label = locker.zoneGroupName || `Khu ${locker.zoneGroup}`
      groups.set(label, (groups.get(label) || 0) + (locker.compartments?.length || 1))
    }
    return Array.from(groups, ([label, totalCompartments]) => ({ label, totalCompartments }))
  }, [lockers])

  const locationLabel = `Tòa nhà: ${selectedBuilding} · Tầng ${selectedFloor}`

  // Danh sách Zone khả dụng cho location hiện tại
  const availableZones = useMemo(() => {
    const list = lockers.map((l) => l.zoneGroup).filter(Boolean)
    return Array.from(new Set(list)).sort()
  }, [lockers])

  // Danh sách Tủ khả dụng phụ thuộc vào Zone đang chọn
  const availableCabinets = useMemo(() => {
    let list = lockers
    if (selectedZone) {
      list = list.filter((l) => l.zoneGroup === selectedZone)
    }
    return list
  }, [lockers, selectedZone])

  const handleZoneChange = (zone: string) => {
    setSelectedZone(zone)
  }

  useEffect(() => {
    if (selectedZone && !availableZones.includes(selectedZone)) {
      setSelectedZone('')
    }
  }, [availableZones, selectedZone])

  const selectedCabinetUnavailable = Boolean(
    selectedCabinetId && !availableCabinets.some((c) => c.id === selectedCabinetId),
  )
  const selectedCabinetLabel =
    lockers.find((l) => l.id === selectedCabinetId)?.code || selectedCabinetId

  // Filtered map lockers based on search query (Tab Sơ đồ)
  const filteredMapLockers = useMemo(() => {
    if (!searchQuery.trim()) return lockers
    const q = searchQuery.toLowerCase().trim()
    return lockers.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        (l.employeeName && l.employeeName.toLowerCase().includes(q)) ||
        (l.department && l.department.toLowerCase().includes(q)) ||
        l.physicalLocation.toLowerCase().includes(q) ||
        (l.compartments &&
          l.compartments.some(
            (c) =>
              c.code.toLowerCase().includes(q) ||
              (c.employeeName && c.employeeName.toLowerCase().includes(q)),
          )),
    )
  }, [lockers, searchQuery])

  // Filtered lockers for Detail mode: search + zone
  const filteredDetailLockers = useMemo(() => {
    let list = lockers
    if (selectedZone) {
      list = list.filter((l) => l.zoneGroup === selectedZone)
    }
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase().trim()
    return list.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        (l.employeeName && l.employeeName.toLowerCase().includes(q)) ||
        (l.department && l.department.toLowerCase().includes(q)) ||
        l.physicalLocation.toLowerCase().includes(q) ||
        (l.compartments &&
          l.compartments.some(
            (c) =>
              c.code.toLowerCase().includes(q) ||
              (c.employeeName && c.employeeName.toLowerCase().includes(q)),
          )),
    )
  }, [lockers, selectedZone, searchQuery])

  // Filtered compartments for List mode: search + zone + tủ
  const listCabinets = useMemo(() => {
    let list = lockers
    if (selectedZone) {
      list = list.filter((l) => l.zoneGroup === selectedZone)
    }
    if (selectedCabinetId) {
      list = list.filter((l) => l.id === selectedCabinetId)
    }
    return list
  }, [lockers, selectedZone, selectedCabinetId])

  const listCompartments = useMemo(
    () => getFlatLockerCompartments(listCabinets),
    [listCabinets],
  )

  const filteredListLockers = useMemo(() => {
    if (!searchQuery.trim()) return listCompartments
    const q = searchQuery.toLowerCase().trim()
    return listCompartments.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        (l.employeeName && l.employeeName.toLowerCase().includes(q)) ||
        (l.employeeCode && l.employeeCode.toLowerCase().includes(q)) ||
        (l.employeeEmail && l.employeeEmail.toLowerCase().includes(q)) ||
        (l.jobTitle && l.jobTitle.toLowerCase().includes(q)) ||
        (l.department && l.department.toLowerCase().includes(q)) ||
        l.physicalLocation.toLowerCase().includes(q),
    )
  }, [listCompartments, searchQuery])

  // Active locker to inspect
  const selectedLocker = useMemo(() => {
    if (!selectedLockerId) return null
    const foundComp = allCompartments.find((c) => c.id === selectedLockerId)
    if (foundComp) {
      const parentCabinet = lockers.find(
        (l) => l.compartments?.some((c) => c.id === selectedLockerId),
      )
      if (parentCabinet) {
        return {
          ...foundComp,
          isCombined: true,
          lockType: parentCabinet.lockType,
          compartments: parentCabinet.compartments,
          cabinetId: parentCabinet.id,
          cabinetCode: parentCabinet.code,
          aiSuggestion: foundComp.aiSuggestion || parentCabinet.aiSuggestion,
        }
      }
      return foundComp
    }
    return lockers.find((l) => l.id === selectedLockerId) ?? null
  }, [lockers, allCompartments, selectedLockerId])

  // Selected locker on map
  const selectedMapLocker = useMemo(() => {
    if (!selectedLockerId) return null
    return (
      lockers.find(
        (l) =>
          l.id === selectedLockerId ||
          l.compartments?.some((c) => c.id === selectedLockerId),
      ) ?? null
    )
  }, [lockers, selectedLockerId])

  // Bắt đầu tạo tủ mới - kích hoạt state tạo tủ trên bản đồ
  const handleStartCreateLocker = () => {
    setIsCreatingLocker(true)
    setViewMode('map')
    setSelectedLockerId(null)
    setDraftPosition(makeDraftPosition(580, 425))
    setDraftRotation(0)
    setFormData({
      ...initialFormData,
      compartment_start: '',
    })
    setCreateError(null)
  }

  // Hủy tạo tủ - tắt state và reset dữ liệu nháp
  const handleCancelCreate = () => {
    if (isSubmitting) return
    setIsCreatingLocker(false)
    setDraftPosition(null)
    setDraftRotation(0)
    setFormData({
      ...initialFormData,
      compartment_start: '',
    })
    setCreateError(null)
  }

  // Cập nhật vị trí nháp khi kéo thả trên bản đồ hoặc click
  const handleDraftPositionChange = (pos: any) => {
    if (Array.isArray(pos) && pos.length >= 2) {
      setDraftPosition(makeDraftPosition(Number(pos[0]), Number(pos[1])))
    } else if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      setDraftPosition(makeDraftPosition(pos.x, pos.y))
    }
  }

  // Submit tạo tủ mới - dùng location_id tự xác định, không đòi người dùng nhập
  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isLocationsLoading) {
      setCreateError('Vị trí tủ đang tải, chưa sẵn sàng. Vui lòng đợi trong giây lát trước khi tạo tủ.')
      return
    }

    if (selectedLocationId === null || selectedLocationId === undefined || selectedLocationId === '') {
      setCreateError('Vị trí tủ chưa sẵn sàng hoặc không hợp lệ. Vui lòng kiểm tra lại bộ lọc vị trí.')
      return
    }

    const startRaw = formData.compartment_start
    const startStr = typeof startRaw === 'string' ? startRaw.trim() : startRaw !== null && startRaw !== undefined ? String(startRaw).trim() : ''
    if (startStr === '') {
      setCreateError('Ngăn bắt đầu không được để trống.')
      return
    }

    const startNum = Number(startStr)
    if (!Number.isFinite(startNum) || !Number.isInteger(startNum) || startNum < 0) {
      setCreateError('Ngăn bắt đầu phải là số nguyên lớn hơn hoặc bằng 0.')
      return
    }

    if (!draftPosition) {
      setCreateError('Vui lòng chọn vị trí tủ trên sơ đồ.')
      return
    }

    const zoneTrimmed = formData.zone.trim()
    if (!zoneTrimmed) {
      setCreateError('Khu vực (Zone) không được để trống.')
      return
    }

    const countStr = String(formData.compartment_count).trim()
    const countNum = Number(countStr)
    if (countStr === '' || !Number.isFinite(countNum) || !Number.isInteger(countNum) || countNum < 1) {
      setCreateError('Số ngăn phải là số nguyên lớn hơn hoặc bằng 1.')
      return
    }

    const rotStr = String(draftRotation).trim()
    const rotRaw = Number(rotStr)
    if (rotStr === '' || !Number.isFinite(rotRaw) || rotRaw < 0 || rotRaw > 360) {
      setCreateError('Góc xoay (độ) phải là số từ 0 đến 360.')
      return
    }

    // Chuẩn hóa góc trong khoảng 0..360
    let rotNum = Math.round((((rotRaw % 360) + 360) % 360) * 100) / 100
    if (rotRaw === 360) {
      rotNum = 360
    }

    setIsSubmitting(true)
    setCreateError(null)

    try {
      const payload: Record<string, any> = {
        site: selectedSite,
        location_id: /^\d+$/.test(String(selectedLocationId))
          ? parseInt(String(selectedLocationId), 10)
          : selectedLocationId,
        zone: zoneTrimmed,
        compartment_count: countNum,
        compartment_start: startNum,
        center: [draftPosition.x, draftPosition.y],
        rotation: rotNum,
        size: [28, 28],
      }
      if (formData.lock_type.trim()) payload.lock_type = formData.lock_type.trim()
      if (formData.notes.trim()) payload.notes = formData.notes.trim()

      const res = await fetch(`${API_BASE_URL}/lockers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}: ${res.statusText}`
        try {
          const errJson = await res.json()
          if (errJson.detail) {
            errMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)
          }
        } catch {
          // ignore
        }
        throw new Error(errMsg)
      }

      const created = await res.json()
      const rawItem = created?.data ?? created
      const newItem = mapLockerReadToItem(rawItem, lockers.length)
      setLockers((prev) => [...prev, newItem])
      setSelectedLockerId(newItem.id)
      const serverCode = rawItem?.code || newItem.code || 'mới'
      setToastMessage(`Đã tạo tủ ${serverCode} thành công.`)
      setIsCreatingLocker(false)
      setFormData({
        ...initialFormData,
        compartment_start: '',
      })
      setDraftPosition(null)
      setDraftRotation(0)
    } catch (err: any) {
      setCreateError(err?.message || 'Tạo tủ thất bại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteLocker = async () => {
    if (!selectedMapLocker) return

    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa tủ ${selectedMapLocker.code} (ID: ${selectedMapLocker.id}) không?`,
    )
    if (!confirmed) return

    try {
      const res = await fetch(`${API_BASE_URL}/lockers/${selectedMapLocker.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}: ${res.statusText}`
        try {
          const errJson = await res.json()
          if (errJson.detail) {
            errMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)
          }
        } catch {
          // ignore
        }
        throw new Error(errMsg)
      }

      const deletedId = selectedMapLocker.id
      const deletedCode = selectedMapLocker.code
      setLockers((prev) => prev.filter((l) => l.id !== deletedId))
      setSelectedLockerId(null)
      setToastMessage(`Đã xóa tủ ${deletedCode} thành công.`)
    } catch (err: any) {
      alert(`Xóa tủ thất bại: ${err.message}`)
      setToastMessage(`Lỗi xóa tủ: ${err.message}`)
    }
  }

  // Actions: cấp phát và thu hồi theo từng NGĂN TỦ (compartment)
  const handleRecallLocker = (lockerId: string) => {
    let targetCode = lockerId

    setLockers((prev) =>
      prev.map((l) => {
        // Nếu lockerId là một compartment trong cụm tủ l
        if (l.compartments && l.compartments.length > 0) {
          const compMatch = l.compartments.find((c) => c.id === lockerId)
          if (compMatch) {
            targetCode = compMatch.code
            const updatedComps = l.compartments.map((c) =>
              c.id === lockerId
                ? {
                  ...c,
                  status: 'available' as const,
                  employeeName: null,
                  department: null,
                  assignedDate: null,
                  recallDueDate: null,
                  notes: null,
                  aiSuggestion: 'Ngăn tủ đã thu hồi thành công. Sẵn sàng cấp phát cho nhân sự mới.',
                }
                : c,
            )
            const hasRecall = updatedComps.some((c) => c.status === 'recall')
            const hasBroken = updatedComps.some((c) => c.status === 'broken')
            const allInUse = updatedComps.length > 0 && updatedComps.every((c) => c.status === 'in_use')
            const nextParentStatus = hasRecall ? 'recall' : hasBroken ? 'broken' : allInUse ? 'in_use' : 'available'

            return {
              ...l,
              status: nextParentStatus,
              compartments: updatedComps,
            }
          }

          // Hoặc nếu lockerId là id của chính tủ cha l: tìm ngăn cần thu hồi trước
          if (l.id === lockerId) {
            const targetComp =
              l.compartments.find((c) => c.status === 'recall') ||
              l.compartments.find((c) => c.status === 'in_use')
            if (targetComp) {
              targetCode = targetComp.code
              const updatedComps = l.compartments.map((c) =>
                c.id === targetComp.id
                  ? {
                    ...c,
                    status: 'available' as const,
                    employeeName: null,
                    department: null,
                    assignedDate: null,
                    recallDueDate: null,
                    notes: null,
                    aiSuggestion: 'Ngăn tủ đã thu hồi thành công. Sẵn sàng cấp phát cho nhân sự mới.',
                  }
                  : c,
              )
              const hasRecall = updatedComps.some((c) => c.status === 'recall')
              const hasBroken = updatedComps.some((c) => c.status === 'broken')
              const allInUse = updatedComps.length > 0 && updatedComps.every((c) => c.status === 'in_use')
              const nextParentStatus = hasRecall ? 'recall' : hasBroken ? 'broken' : allInUse ? 'in_use' : 'available'

              return {
                ...l,
                status: nextParentStatus,
                compartments: updatedComps,
              }
            }
          }
        }

        // Trường hợp tủ đơn không có compartments
        if (l.id === lockerId) {
          targetCode = l.code
          return {
            ...l,
            status: 'available',
            employeeName: null,
            department: null,
            assignedDate: null,
            recallDueDate: null,
            notes: null,
            aiSuggestion: 'Ngăn tủ đã thu hồi thành công. Sẵn sàng cấp phát cho nhân sự mới.',
          }
        }

        return l
      }),
    )
    setToastMessage(`Đã thu hồi tủ ${targetCode} thành công. Trạng thái chuyển về "Còn trống".`)
  }

  const handleAssignLocker = (
    lockerId: string,
    info?: {
      employeeName?: string
      employeeCode?: string
      employeeEmail?: string
      jobTitle?: string
      department?: string
      assignedDate?: string
      notes?: string
    },
  ) => {
    const candidateName = info?.employeeName?.trim() || 'Nguyễn Tiến Dũng'
    const candidateCode = info?.employeeCode?.trim() || null
    const candidateEmail = info?.employeeEmail?.trim() || null
    const candidateTitle = info?.jobTitle?.trim() || null
    const candidateDept = info?.department?.trim() || 'Mô hình & Nền tảng AI'
    const candidateAssignedDate = info?.assignedDate?.trim() || '16/09/2026'
    const candidateNotes = info?.notes?.trim()
    let assignedCompCode = ''
    let assignedCompId = ''

    setLockers((prev) =>
      prev.map((l) => {
        // Nếu lockerId là một compartment trong cụm tủ l
        if (l.compartments && l.compartments.length > 0) {
          const compMatch = l.compartments.find((c) => c.id === lockerId)
          if (compMatch) {
            assignedCompCode = compMatch.code
            assignedCompId = compMatch.id
            const updatedComps = l.compartments.map((c) =>
              c.id === lockerId
                ? {
                  ...c,
                  status: 'in_use' as const,
                  employeeName: candidateName,
                  employeeCode: candidateCode,
                  employeeEmail: candidateEmail,
                  jobTitle: candidateTitle,
                  department: candidateDept,
                  assignedDate: candidateAssignedDate,
                  notes: candidateNotes !== undefined ? candidateNotes : c.notes,
                  aiSuggestion: 'Đã cấp phát ngăn thành công theo đề xuất SupportiveAI.',
                }
                : c,
            )
            const hasRecall = updatedComps.some((c) => c.status === 'recall')
            const hasBroken = updatedComps.some((c) => c.status === 'broken')
            const allInUse = updatedComps.length > 0 && updatedComps.every((c) => c.status === 'in_use')
            const nextParentStatus = hasRecall ? 'recall' : hasBroken ? 'broken' : allInUse ? 'in_use' : 'available'

            return {
              ...l,
              status: nextParentStatus,
              compartments: updatedComps,
            }
          }

          // Hoặc nếu lockerId là id của chính tủ cha l: tìm ngăn trống đầu tiên
          if (l.id === lockerId) {
            const firstAvail = l.compartments.find((c) => c.status === 'available')
            if (firstAvail) {
              assignedCompCode = firstAvail.code
              assignedCompId = firstAvail.id
              const updatedComps = l.compartments.map((c) =>
                c.id === firstAvail.id
                  ? {
                    ...c,
                    status: 'in_use' as const,
                    employeeName: candidateName,
                    employeeCode: candidateCode,
                    employeeEmail: candidateEmail,
                    jobTitle: candidateTitle,
                    department: candidateDept,
                    assignedDate: candidateAssignedDate,
                    notes: candidateNotes !== undefined ? candidateNotes : c.notes,
                    aiSuggestion: 'Đã cấp phát ngăn thành công theo đề xuất SupportiveAI.',
                  }
                  : c,
              )
              const hasRecall = updatedComps.some((c) => c.status === 'recall')
              const hasBroken = updatedComps.some((c) => c.status === 'broken')
              const allInUse = updatedComps.length > 0 && updatedComps.every((c) => c.status === 'in_use')
              const nextParentStatus = hasRecall ? 'recall' : hasBroken ? 'broken' : allInUse ? 'in_use' : 'available'

              return {
                ...l,
                status: nextParentStatus,
                compartments: updatedComps,
              }
            }
          }
        }

        // Trường hợp tủ đơn không có compartments
        if (l.id === lockerId) {
          assignedCompCode = l.code
          assignedCompId = l.id
          return {
            ...l,
            status: 'in_use',
            employeeName: candidateName,
            employeeCode: candidateCode,
            employeeEmail: candidateEmail,
            jobTitle: candidateTitle,
            department: candidateDept,
            assignedDate: candidateAssignedDate,
            notes: candidateNotes !== undefined ? candidateNotes : l.notes,
            aiSuggestion: 'Đã cấp phát ngăn thành công theo đề xuất SupportiveAI.',
          }
        }

        return l
      }),
    )

    if (assignedCompId) {
      setSelectedLockerId(assignedCompId)
    }

    if (assignedCompCode) {
      setToastMessage(`Đã cấp phát ngăn ${assignedCompCode} cho nhân sự ${candidateName} (${candidateDept}).`)
    } else {
      setToastMessage(`Tủ đã hết ngăn trống, không thể cấp phát thêm.`)
    }
  }

  const handleMarkBroken = (lockerId: string, reason: string) => {
    let brokenCompCode = ''
    let brokenCompId = ''

    setLockers((prev) =>
      prev.map((l) => {
        if (l.compartments && l.compartments.length > 0) {
          const compMatch = l.compartments.find((c) => c.id === lockerId)
          if (compMatch) {
            brokenCompCode = compMatch.code
            brokenCompId = compMatch.id
            const updatedComps = l.compartments.map((c) =>
              c.id === lockerId
                ? {
                  ...c,
                  status: 'broken' as const,
                  employeeName: null,
                  department: null,
                  assignedDate: null,
                  notes: reason.trim() || 'Báo hỏng ngăn tủ',
                }
                : c,
            )
            const hasRecall = updatedComps.some((c) => c.status === 'recall')
            const hasBroken = updatedComps.some((c) => c.status === 'broken')
            const allInUse = updatedComps.length > 0 && updatedComps.every((c) => c.status === 'in_use')
            const nextParentStatus = hasRecall ? 'recall' : hasBroken ? 'broken' : allInUse ? 'in_use' : 'available'

            return {
              ...l,
              status: nextParentStatus,
              compartments: updatedComps,
            }
          }
        }

        if (l.id === lockerId) {
          brokenCompCode = l.code
          brokenCompId = l.id
          return {
            ...l,
            status: 'broken' as const,
            employeeName: null,
            department: null,
            assignedDate: null,
            notes: reason.trim() || 'Báo hỏng tủ',
          }
        }

        return l
      }),
    )

    if (brokenCompId) {
      setSelectedLockerId(brokenCompId)
    }

    if (brokenCompCode) {
      setToastMessage(`Đã ghi nhận báo hỏng ngăn ${brokenCompCode}: "${reason.trim() || 'Hỏng hóc'}"`)
    }
  }

  const handleRemindLocker = (lockerId: string) => {
    let targetCode = lockerId
    for (const l of lockers) {
      if (l.id === lockerId) {
        targetCode = l.code
        break
      }
      if (l.compartments) {
        const c = l.compartments.find((comp) => comp.id === lockerId)
        if (c) {
          targetCode = c.code
          break
        }
      }
    }
    setToastMessage(`Đã gửi thông báo nhắc trả ngăn ${targetCode} qua email & Microsoft Teams.`)
  }

  return (
    <div className="fp-page">
      <style>{`
        @keyframes lockerSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        #locker-draft-rotation::-webkit-inner-spin-button,
        #locker-draft-rotation::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        #locker-draft-rotation {
          -moz-appearance: textfield;
          appearance: textfield;
        }
        .fp-topbar {
          display: flex;
          align-items: center;
          flex-wrap: wrap !important;
          height: auto !important;
          min-height: 48px;
          box-sizing: border-box;
          max-width: 100%;
          gap: 8px;
        }
        .fp-brand-collapsed {
          flex-shrink: 0;
        }
        .locker-location-filters {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap !important;
          gap: 8px;
          max-width: 100%;
          min-width: 0;
        }
        .fp-view-mode {
          flex-shrink: 0;
        }
        .fp-scope {
          flex-shrink: 0;
          white-space: nowrap;
        }
        .fp-topbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          box-sizing: border-box;
          flex-wrap: wrap;
          min-width: 0;
          max-width: 100%;
        }
        .fp-search {
          position: relative;
          display: flex;
          align-items: center;
          flex: 1 1 180px;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }
        .fp-search input {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }
        @media (min-width: 993px) {
          .fp-topbar-actions {
            margin-left: auto;
            width: auto;
            flex-wrap: nowrap;
          }
          .fp-search {
            flex: 0 1 240px;
            min-width: 160px;
            max-width: 280px;
          }
          .fp-search input {
            min-width: 0;
          }
        }
        @media (max-width: 992px) {
          .fp-topbar {
            overflow-x: visible;
            overflow-y: visible;
            flex-wrap: wrap !important;
          }
          .fp-topbar-actions {
            flex: 1 1 auto;
            flex-wrap: wrap !important;
            justify-content: flex-start;
          }
          .locker-location-filters {
            flex-wrap: wrap !important;
          }
          .fp-search {
            flex: 1 1 100%;
            flex-basis: 100%;
            width: 100%;
            min-width: 0;
            max-width: 100%;
          }
        }
        @media (max-width: 768px) {
          .fp-topbar {
            flex-wrap: wrap !important;
          }
          .fp-topbar-actions {
            width: 100%;
            flex-wrap: wrap !important;
          }
          .locker-location-filters {
            flex-wrap: wrap !important;
          }
          .fp-search {
            flex: 1 1 100%;
            flex-basis: 100%;
            width: 100%;
            min-width: 0;
            max-width: 100%;
            order: 10;
          }
        }
      `}</style>
      {/* Topbar: strictly consistent with FloorPlanningPage */}
      <header
        className="fp-topbar"
        style={{
          flexWrap: 'wrap',
          height: 'auto',
          minHeight: '48px',
          gap: '8px',
          padding: '6px 16px',
        }}
      >
        <a className="fp-brand-collapsed" href="#/floor-planning" aria-label="Vin Smart Future · Trung tâm Hành chính">
          <img src={markUrl} alt="Vin Smart Future" width="26" height="26" />
        </a>

        {/* Bộ lọc Location: Site (Bắc/Trung/Nam), Tòa, Tầng, Zone, Tủ */}
        <LockerLocationControls
          sites={sites}
          availableBuildings={availableBuildings}
          availableFloors={availableFloors}
          selectedSite={selectedSite}
          selectedBuilding={selectedBuilding}
          selectedFloor={selectedFloor}
          onSiteChange={setSelectedSite}
          onBuildingChange={setSelectedBuilding}
          onFloorChange={setSelectedFloor}
        >
          {/* Bộ lọc Zone khi ở chế độ xem Chi tiết hoặc Danh sách */}
          {(viewMode === 'detail' || viewMode === 'list') && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
              <label
                htmlFor="locker-filter-zone"
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Zone:
              </label>
              <select
                id="locker-filter-zone"
                aria-label="Chọn zone"
                value={selectedZone}
                onChange={(e) => handleZoneChange(e.target.value)}
                style={{
                  height: '26px',
                  padding: '0 6px',
                  fontSize: '12px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '5px',
                  color: '#1e293b',
                  cursor: 'pointer',
                  maxWidth: '100%',
                  minWidth: 0,
                }}
              >
                <option value="">Tất cả zone</option>
                {availableZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Bộ lọc Tủ khi ở chế độ xem Danh sách */}
          {viewMode === 'list' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
              <label
                htmlFor="locker-filter-cabinet"
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Tủ:
              </label>
              <select
                id="locker-filter-cabinet"
                aria-label="Chọn tủ"
                value={selectedCabinetUnavailable ? '' : selectedCabinetId}
                onChange={(e) => setSelectedCabinetId(e.target.value)}
                style={{
                  height: '26px',
                  padding: '0 6px',
                  fontSize: '12px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '5px',
                  color: '#1e293b',
                  cursor: 'pointer',
                  maxWidth: '100%',
                  minWidth: 0,
                }}
              >
                <option value="">Tất cả tủ</option>
                {availableCabinets.map((cabinet) => (
                  <option key={cabinet.id} value={cabinet.id}>
                    {cabinet.code}
                  </option>
                ))}
              </select>
            </div>
          )}
        </LockerLocationControls>

        <div className="fp-topbar-actions">
          {/* 3 Clickable Modes: Sơ đồ / Chi tiết / Danh sách */}
          <div className="fp-segmented fp-view-mode" role="tablist" aria-label="Chế độ xem tủ locker">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'map'}
              className={`fp-seg-btn${viewMode === 'map' ? ' is-active' : ''}`}
              onClick={() => setViewMode('map')}
            >
              Sơ đồ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'detail'}
              className={`fp-seg-btn${viewMode === 'detail' ? ' is-active' : ''}`}
              onClick={() => {
                setViewMode('detail')
                if (isCreatingLocker) handleCancelCreate()
              }}
            >
              Chi tiết
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'list'}
              className={`fp-seg-btn${viewMode === 'list' ? ' is-active' : ''}`}
              onClick={() => {
                setViewMode('list')
                if (isCreatingLocker) handleCancelCreate()
              }}
            >
              Danh sách
            </button>
          </div>
          <button
            type="button"
            className={`fp-seg-btn${isCreatingLocker ? ' is-active' : ''}`}
            onClick={handleStartCreateLocker}
            title="Tạo tủ locker mới"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '32px',
              padding: '0 12px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ whiteSpace: 'nowrap' }}>Tạo tủ</span>
          </button>
          <button
            type="button"
            className="fp-seg-btn"
            disabled={!selectedMapLocker}
            onClick={handleDeleteLocker}
            title={selectedMapLocker ? `Xóa tủ ${selectedMapLocker.code}` : 'Chọn tủ trên sơ đồ để xóa'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '32px',
              padding: '0 12px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: selectedMapLocker ? 'pointer' : 'not-allowed',
              opacity: selectedMapLocker ? 1 : 0.4,
              color: selectedMapLocker ? '#ef4444' : undefined,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 4h10M6 4V2.5A.5.5 0 0 1 6.5 2h3a.5.5 0 0 1 .5.5V4m2 0v9.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 13.5V4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ whiteSpace: 'nowrap' }}>Xóa tủ</span>
          </button>
          <div className="fp-search">
            <svg
              className="fp-search-icon"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.6" />
              <path d="m10.5 10.5 3.5 3.5" />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Tìm mã tủ, nhân sự"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Tìm mã tủ hoặc nhân sự"
            />
          </div>
        </div>
      </header>

      {/* Main Workspace layout */}
      <div className="fp-workspace">
        <main className="fp-main">
          {isLoading ? (
            <div
              className="locker-status-message"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: '320px',
                color: '#64748b',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: '3px solid #e2e8f0',
                  borderTopColor: '#2563eb',
                  borderRadius: '50%',
                  animation: 'lockerSpin 1s linear infinite',
                }}
              />
              <p style={{ margin: 0, fontSize: '15px' }}>Đang tải danh sách tủ locker...</p>
            </div>
          ) : fetchError ? (
            <div
              className="locker-status-message"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: '320px',
                color: '#dc2626',
                gap: '12px',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 500 }}>Không thể tải dữ liệu tủ: {fetchError}</p>
              <button
                type="button"
                className="fp-seg-btn is-active"
                onClick={() => {
                  fetchLocations()
                  if (selectedLocationId) {
                    fetchLockers(selectedLocationId)
                  }
                }}
                style={{ marginTop: '8px', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                Thử lại
              </button>
            </div>
          ) : viewMode === 'map' ? (
            <LockerMap
              lockers={filteredMapLockers}
              selectedLocker={selectedMapLocker}
              onSelectLocker={(l: LockerItem | null) => {
                if (!isCreatingLocker) {
                  setSelectedLockerId(l ? l.id : null)
                }
              }}
              onSelectPosition={isCreatingLocker ? (pos: { x: number; y: number }) => setDraftPosition(makeDraftPosition(pos.x, pos.y)) : undefined}
              draftPosition={isCreatingLocker ? draftPosition : undefined}
              draftRotation={
                isCreatingLocker
                  ? Number.isFinite(Number(draftRotation))
                    ? Number(draftRotation) === 360
                      ? 360
                      : ((Number(draftRotation) % 360) + 360) % 360
                    : 0
                  : undefined
              }
              draftSize={isCreatingLocker ? FIXED_LOCKER_DRAFT_SIZE : undefined}
              onDraftPositionChange={isCreatingLocker ? handleDraftPositionChange : undefined}
            />
          ) : viewMode === 'detail' ? (
            <LockerDetailGrid
              lockers={filteredDetailLockers}
              selectedLocker={selectedLocker}
              onSelectLocker={(l) => setSelectedLockerId(l.id)}
            />
          ) : selectedCabinetUnavailable ? (
            <div
              className="locker-empty-state"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: '320px',
                padding: '32px 16px',
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                  color: '#94a3b8',
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18" />
                  <circle cx="6" cy="7" r="1" />
                  <circle cx="6" cy="12" r="1" />
                  <circle cx="6" cy="17" r="1" />
                </svg>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 500,
                  color: '#475569',
                }}
              >
                Không có tủ {selectedCabinetLabel} ở zone {selectedZone}
              </p>
            </div>
          ) : (
            <LockerList
              lockers={filteredListLockers}
              selectedLocker={selectedLocker}
              onSelectLocker={(l) => setSelectedLockerId(l.id)}
            />
          )}
        </main>

        {/* Right Inspector Panel matching DeskInspector / FloorDetailsPanel */}
        {isCreatingLocker ? (
          <LockerCreatePanel
            formData={formData}
            onFormDataChange={(field, value) => {
              setFormData((prev) => ({ ...prev, [field]: value }))
              if (field === 'compartment_start' && createError) {
                setCreateError(null)
              }
            }}
            draftRotation={draftRotation}
            onDraftRotationChange={setDraftRotation}
            createError={createError}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmitCreate}
            onCancel={handleCancelCreate}
          />
        ) : (
          <LockerInspector
            locker={selectedLocker}
            stats={stats}
            zoneSummary={zoneSummary}
            locationLabel={locationLabel}
            onRecallLocker={handleRecallLocker}
            onAssignLocker={handleAssignLocker}
            onMarkBroken={handleMarkBroken}
            onRemindLocker={handleRemindLocker}
            onSelectCompartment={(cId) => setSelectedLockerId(cId)}
            onSelectCabinet={(cabId) => setSelectedLockerId(cabId)}
            onClose={() => setSelectedLockerId(null)}
          />
        )}
      </div>



      {/* Toast Notification */}
      {toastMessage && (
        <div className="locker-toast" role="status">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#22c55e" strokeWidth="2">
            <path d="M5 10l3.5 3.5L15 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
