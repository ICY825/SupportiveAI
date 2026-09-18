import { useState, useMemo, useEffect, useRef } from 'react'
import type { LockerItem, LockerViewMode } from '../types'
import {
  MAP_LOCKERS,
  getFlatLockerCompartments,
  calculateLockerStats,
} from '../lockersData'
import { LockerMap } from '../components/LockerMap'
import { LockerDetailGrid } from '../components/LockerDetailGrid'
import { LockerList } from '../components/LockerList'
import { LockerInspector } from '../components/LockerInspector'
import { FloorSelector } from '../../floor-planning/components/FloorSelector'
import { HelpPopover } from '../../floor-planning/components/HelpPopover'
import { FLOORS } from '../../floor-planning/data/registry'
import markUrl from '../../../assets/brand/vsf-mark.png'
import '../../floor-planning/floorPlanning.css'
import '../../floor-planning/components/desk-inspector/deskInspector.css'
import '../lockers.css'

export function LockerManagementPage() {
  const [lockers, setLockers] = useState<LockerItem[]>(MAP_LOCKERS)
  const [viewMode, setViewMode] = useState<LockerViewMode>('map')
  const [searchQuery, setSearchQuery] = useState('')
  // Default selected locker is L1-04 from the wireframe
  const [selectedLockerId, setSelectedLockerId] = useState<string | null>('L1-04')
  const [floorId, setFloorId] = useState<'floor-16'>('floor-16')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

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

  // Flat individual compartments across all zones (18 total)
  const allCompartments = useMemo(
    () => getFlatLockerCompartments(lockers),
    [lockers],
  )

  // Dynamic operational statistics
  const stats = useMemo(() => calculateLockerStats(lockers), [lockers])

  // Filtered map lockers based on search query
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

  // Filtered compartments based on search query
  const filteredCompartments = useMemo(() => {
    if (!searchQuery.trim()) return allCompartments
    const q = searchQuery.toLowerCase().trim()
    return allCompartments.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        (l.employeeName && l.employeeName.toLowerCase().includes(q)) ||
        (l.department && l.department.toLowerCase().includes(q)) ||
        l.physicalLocation.toLowerCase().includes(q),
    )
  }, [allCompartments, searchQuery])

  // Active locker to inspect
  const selectedLocker = useMemo(() => {
    if (!selectedLockerId) return null
    // First search in individual compartments
    const foundComp = allCompartments.find((c) => c.id === selectedLockerId)
    if (foundComp) {
      // Find parent cabinet if any
      const parentCabinet = lockers.find(
        (l) => l.isCombined && l.compartments?.some((c) => c.id === selectedLockerId),
      )
      if (parentCabinet) {
        return {
          ...foundComp,
          isCombined: true,
          compartments: parentCabinet.compartments,
        }
      }
      return foundComp
    }
    // Otherwise search in map lockers
    return lockers.find((l) => l.id === selectedLockerId) ?? null
  }, [lockers, allCompartments, selectedLockerId])

  // Selected locker on map
  const selectedMapLocker = useMemo(() => {
    if (!selectedLockerId) return null
    return (
      lockers.find(
        (l) =>
          l.id === selectedLockerId ||
          (l.isCombined && l.compartments?.some((c) => c.id === selectedLockerId)),
      ) ?? null
    )
  }, [lockers, selectedLockerId])

  // Actions
  const handleRecallLocker = (lockerId: string) => {
    setLockers((prev) =>
      prev.map((l) => {
        if (l.id === lockerId) {
          return {
            ...l,
            status: 'available',
            employeeName: null,
            department: null,
            assignedDate: null,
            recallDueDate: null,
            notes: null,
            aiSuggestion: 'Tủ đã thu hồi thành công. Sẵn sàng cấp phát cho nhân sự mới.',
          }
        }
        if (l.isCombined && l.compartments?.some((c) => c.id === lockerId)) {
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
                  aiSuggestion: 'Tủ đã thu hồi thành công. Sẵn sàng cấp phát cho nhân sự mới.',
                }
              : c,
          )
          return {
            ...l,
            compartments: updatedComps,
            status: updatedComps.some((c) => c.status === 'recall')
              ? ('recall' as const)
              : updatedComps.some((c) => c.status === 'broken')
                ? ('broken' as const)
                : updatedComps.some((c) => c.status === 'in_use')
                  ? ('in_use' as const)
                  : ('available' as const),
          }
        }
        return l
      }),
    )
    setToastMessage(`Đã thu hồi tủ ${lockerId} thành công. Trạng thái chuyển về "Còn trống".`)
  }

  const handleAssignLocker = (lockerId: string) => {
    const demoCandidate = { name: 'Nguyễn Tiến Dũng', dept: 'Mô hình & Nền tảng AI' }

    setLockers((prev) =>
      prev.map((l) => {
        if (l.id === lockerId) {
          return {
            ...l,
            status: 'in_use',
            employeeName: demoCandidate.name,
            department: demoCandidate.dept,
            assignedDate: '16/09/2026',
            aiSuggestion: 'Đã cấp phát thành công theo đề xuất SupportiveAI.',
          }
        }
        if (l.isCombined && l.compartments?.some((c) => c.id === lockerId)) {
          const updatedComps = l.compartments.map((c) =>
            c.id === lockerId
              ? {
                  ...c,
                  status: 'in_use' as const,
                  employeeName: demoCandidate.name,
                  department: demoCandidate.dept,
                  assignedDate: '16/09/2026',
                  aiSuggestion: 'Đã cấp phát thành công theo đề xuất SupportiveAI.',
                }
              : c,
          )
          return {
            ...l,
            compartments: updatedComps,
          }
        }
        return l
      }),
    )
    setToastMessage(`Đã cấp phát tủ ${lockerId} cho nhân sự ${demoCandidate.name} (${demoCandidate.dept}).`)
  }

  const handleRemindLocker = (lockerId: string) => {
    setToastMessage(`Đã gửi thông báo nhắc trả tủ ${lockerId} qua email & Microsoft Teams.`)
  }

  return (
    <div className="fp-page">
      {/* Topbar: strictly consistent with FloorPlanningPage */}
      <header className="fp-topbar">
        <a className="fp-brand-collapsed" href="#/floor-planning" aria-label="Vin Smart Future · Trung tâm Hành chính">
          <img src={markUrl} alt="Vin Smart Future" width="26" height="26" />
        </a>
        <h1>Quản lý tủ locker</h1>
        <FloorSelector floors={FLOORS} value={floorId} onChange={(id) => setFloorId(id as 'floor-16')} />

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
            onClick={() => setViewMode('detail')}
          >
            Chi tiết
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'list'}
            className={`fp-seg-btn${viewMode === 'list' ? ' is-active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            Danh sách
          </button>
        </div>

        <p className="fp-scope is-demo" title="Vị trí tủ lấy từ bản vẽ Tầng 19, chuẩn hóa và thử nghiệm trên mặt bằng Tầng 16">
          <span className="fp-scope-dot" aria-hidden="true" />
          {stats.total} ngăn tủ
        </p>

        <div className="fp-topbar-actions">
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
              placeholder="Tìm mã tủ, nhân sự… (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Tìm mã tủ hoặc nhân sự"
            />
          </div>
          <HelpPopover />
        </div>
      </header>

      {/* Main Workspace layout */}
      <div className="fp-workspace">
        <main className="fp-main">
          {viewMode === 'map' ? (
            <LockerMap
              lockers={filteredMapLockers}
              selectedLocker={selectedMapLocker}
              onSelectLocker={(l) => setSelectedLockerId(l ? l.id : null)}
            />
          ) : viewMode === 'detail' ? (
            <LockerDetailGrid
              lockers={filteredCompartments}
              selectedLocker={selectedLocker}
              onSelectLocker={(l) => setSelectedLockerId(l.id)}
            />
          ) : (
            <LockerList
              lockers={filteredCompartments}
              selectedLocker={selectedLocker}
              onSelectLocker={(l) => setSelectedLockerId(l.id)}
            />
          )}
        </main>

        {/* Right Inspector Panel matching DeskInspector / FloorDetailsPanel */}
        <LockerInspector
          locker={selectedLocker}
          stats={stats}
          onRecallLocker={handleRecallLocker}
          onAssignLocker={handleAssignLocker}
          onRemindLocker={handleRemindLocker}
          onSelectCompartment={(cId) => setSelectedLockerId(cId)}
          onClose={() => setSelectedLockerId(null)}
        />
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
