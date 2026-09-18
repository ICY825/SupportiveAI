import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { searchEmployees } from '@/api/employees'
import { createApiAllocationStore } from '../allocation/apiAllocationStore'
import { createDemoAllocation } from '../allocation/demoAllocation'
import { useFloorAllocation } from '../allocation/useFloorAllocation'
import { FloorDetailsPanel } from '../components/FloorDetailsPanel'
import { FloorMap } from '../components/FloorMap'
import { SpatialWorkspace } from '../workspace/SpatialWorkspace'
import { UnsavedChangesDialog } from '../workspace/EditPanel'
import { FloorMapControls, ViewControls } from '../components/FloorMapControls'
import { FloorSearch } from '../components/FloorSearch'
import { FloorPicker } from '../components/FloorPicker'
import { HelpPopover } from '../components/HelpPopover'
import { isTypingTarget } from '../components/keyboard'
import { DeskInspector } from '../components/desk-inspector/DeskInspector'
import { DeskStatusIcon } from '../components/desk-inspector/DeskStatusBadge'
import { FLOORS, FLOOR_INVENTORY, findFloor } from '../data/registry'
import { validateFloorDataset } from '../data/validateFloorDataset'
import { buildDeskIndex } from '../domain/desk'
import {
  applyAuthoredEntities,
  authoredEntityStore,
  authoredRoomFromPolygon,
  EMPTY_AUTHORED_ENTITIES,
  mergeAuthoredEntities,
  nextAuthoredRoomId,
  validateAuthoredRoom,
  workstationsOverlappingRoom,
  type AuthoredEntities,
  type AuthoredEntityChanges,
} from '../domain/authoredEntities'
import type { Employee as AllocationEmployee } from '../domain/allocation'
import type { RoomType } from '../domain/roomTypes'
import type { BBox, EntityRef, FloorDataset, Point, VerificationState } from '../domain/spatial'
import {
  applyDatasetZoneCustomizations,
  loadZoneCustomizations,
  saveZoneCustomizations,
  type FloorZoneCustomizations,
} from '../domain/zoneCustomization'
import { ALLOCATION_FALLBACK, DESK_STATUS, UNLABELED_ZONE, VIEW_MODES, objectName } from '../labels'
import { ARROW_DIRECTION, nearestInDirection } from '../map/deskNavigation'
import { buildSearchIndex, type SearchItem } from '../search/searchIndex'
import { contentBounds } from '../map/contentBounds'
import { DEFAULT_SETTINGS, type MapSettings } from '../map/mapSettings'
import { useViewport } from '../map/useViewport'
import { buildHash, parseHash, type ViewMode } from './urlState'
import markUrl from '../../../assets/brand/vsf-mark.png'
import '../floorPlanning.css'

/** Smallest area (floor points) "focus" frames, so a single desk keeps its surroundings in view. */
const FOCUS_MIN_PT = 160

interface FloorPlanningPageProps {
  /** map display settings panel (opened from the app sidebar) */
  settingsOpen?: boolean
  onSettingsOpenChange?: (open: boolean) => void
  /**
   * Whether the settings panel has anything to show for the current view.
   *
   * It holds CAD layer toggles and the source-drawing modes, which exist to
   * check the extraction against the sheet. That is the verification view's
   * work; the workspace has no use for it, so the sidebar hides the button
   * rather than offering one that does nothing.
   */
  onSettingsApplicableChange?: (applicable: boolean) => void
}

export function FloorPlanningPage({
  settingsOpen = false,
  onSettingsOpenChange,
  onSettingsApplicableChange,
}: FloorPlanningPageProps = {}) {
  const initial = useMemo(() => parseHash(window.location.hash), [])
  const [floorId, setFloorId] = useState(findFloor(initial.floorId)?.id ?? FLOORS[0].id)
  const [selected, setSelected] = useState<EntityRef | null>(initial.selected)
  const [view, setView] = useState<ViewMode>(initial.view)
  const [state, setState] = useState<{ id: string; dataset?: FloorDataset; error?: string } | null>(null)
  const [searchSlot, setSearchSlot] = useState<HTMLDivElement | null>(null)
  // An open layout draft lives inside SpatialWorkspace and dies with it, so the
  // page has to ask before it unmounts or replaces that component.
  const [layoutDirty, setLayoutDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<{ floorId?: string; view?: ViewMode } | null>(null)
  const [authoredByFloor, setAuthoredByFloor] = useState<Record<string, AuthoredEntities>>({})

  useEffect(() => {
    let cancelled = false
    const entry = findFloor(floorId)
    if (!entry) return
    entry
      .load()
      .then((dataset) => !cancelled && setState({ id: floorId, dataset }))
      .catch((err: unknown) => !cancelled && setState({ id: floorId, error: String(err) }))
    return () => {
      cancelled = true
    }
  }, [floorId])

  useEffect(() => {
    const next = buildHash({ floorId, selected, view })
    if (window.location.hash !== next) window.history.replaceState(null, '', next)
  }, [floorId, selected, view])

  useEffect(() => {
    onSettingsApplicableChange?.(view === 'verification')
  }, [onSettingsApplicableChange, view])
  useEffect(() => () => onSettingsApplicableChange?.(false), [onSettingsApplicableChange])

  // A pasted or edited link in the same tab only changes the hash.
  useEffect(() => {
    const onHash = () => {
      const next = parseHash(window.location.hash)
      const floor = findFloor(next.floorId)
      if (floor) setFloorId(floor.id)
      setSelected(next.selected)
      setView(next.view)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!layoutDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [layoutDirty])

  const applyNav = (next: { floorId?: string; view?: ViewMode }) => {
    if (next.floorId !== undefined) {
      setSelected(null)
      setFloorId(next.floorId)
    }
    if (next.view !== undefined) setView(next.view)
  }

  /** Every route out of an open draft funnels through one confirmation. */
  const navigate = (next: { floorId?: string; view?: ViewMode }) => {
    if (layoutDirty) {
      setPendingNav(next)
      return
    }
    applyNav(next)
  }

  const changeFloor = (id: string) => navigate({ floorId: id })

  const current = state?.id === floorId ? state : null
  const floorLabel = findFloor(floorId)?.label

  // Zone customizations (rename, assign, reposition labels)
  const [customizationsByFloor, setCustomizationsByFloor] = useState<Record<string, FloorZoneCustomizations>>({})
  const [zonePreviewsByFloor, setZonePreviewsByFloor] = useState<Record<string, FloorZoneCustomizations>>({})
  const floorCustomizations = customizationsByFloor[floorId] ?? loadZoneCustomizations(floorId)
  const floorZonePreviews = zonePreviewsByFloor[floorId]

  const handleZoneUpdate = useCallback(
    (update: {
      zoneId: string
      name?: string | null
      labelAnchor?: Point
      sourceColor?: string | null
      sourceOpacity?: number | null
      verification?: VerificationState
      type?: 'WORKSPACE_ZONE' | 'UNKNOWN'
    }) => {
      setCustomizationsByFloor((prev) => {
        const floorPrev = prev[floorId] ?? loadZoneCustomizations(floorId)
        const nextFloor = {
          ...floorPrev,
          [update.zoneId]: {
            ...(floorPrev[update.zoneId] ?? {}),
            ...(update.name !== undefined ? { name: update.name } : {}),
            ...(update.labelAnchor !== undefined ? { labelAnchor: update.labelAnchor } : {}),
            ...(update.sourceColor !== undefined ? { sourceColor: update.sourceColor } : {}),
            ...(update.sourceOpacity !== undefined ? { sourceOpacity: update.sourceOpacity } : {}),
            ...(update.verification !== undefined ? { verification: update.verification } : {}),
            ...(update.type !== undefined ? { type: update.type } : {}),
          },
        }
        saveZoneCustomizations(floorId, nextFloor)
        return { ...prev, [floorId]: nextFloor }
      })
    },
    [floorId],
  )

  const handleZonePreview = useCallback(
    (update: { zoneId: string; sourceColor?: string | null; sourceOpacity?: number | null }) => {
      setZonePreviewsByFloor((prev) => {
        const floorPrev = prev[floorId] ?? {}
        return {
          ...prev,
          [floorId]: {
            ...floorPrev,
            [update.zoneId]: {
              ...(floorPrev[update.zoneId] ?? {}),
              ...(update.sourceColor !== undefined ? { sourceColor: update.sourceColor } : {}),
              ...(update.sourceOpacity !== undefined ? { sourceOpacity: update.sourceOpacity } : {}),
            },
          },
        }
      })
    },
    [floorId],
  )

  const handleZonePreviewClear = useCallback(
    (zoneId: string) => {
      setZonePreviewsByFloor((prev) => {
        const floorPrev = prev[floorId]
        if (!floorPrev?.[zoneId]) return prev
        const nextFloor = { ...floorPrev }
        delete nextFloor[zoneId]
        const next = { ...prev }
        if (Object.keys(nextFloor).length === 0) delete next[floorId]
        else next[floorId] = nextFloor
        return next
      })
    },
    [floorId],
  )

  const handleResetZone = useCallback(
    (zoneId: string) => {
      setCustomizationsByFloor((prev) => {
        const floorPrev = prev[floorId] ?? loadZoneCustomizations(floorId)
        const nextFloor = { ...floorPrev }
        delete nextFloor[zoneId]
        saveZoneCustomizations(floorId, nextFloor)
        return { ...prev, [floorId]: nextFloor }
      })
    },
    [floorId],
  )

  const handleResetAllZones = useCallback(() => {
    setCustomizationsByFloor((prev) => ({ ...prev, [floorId]: {} }))
    saveZoneCustomizations(floorId, {})
  }, [floorId])

  const authoredEntities = authoredByFloor[floorId] ?? authoredEntityStore.read(floorId) ?? EMPTY_AUTHORED_ENTITIES
  const handleAuthoredEntityChange = useCallback(
    (changes: AuthoredEntityChanges) => {
      setAuthoredByFloor((prev) => {
        const current = prev[floorId] ?? authoredEntityStore.read(floorId) ?? EMPTY_AUTHORED_ENTITIES
        const next = mergeAuthoredEntities(current, changes)
        void authoredEntityStore.write(floorId, changes)
        return { ...prev, [floorId]: next }
      })
    },
    [floorId],
  )

  const currentDataset = current?.dataset
  const effectiveDataset = useMemo(() => {
    if (!currentDataset) return undefined
    const displayCustomizations = Object.keys(floorZonePreviews ?? {}).reduce<FloorZoneCustomizations>(
      (merged, zoneId) => ({
        ...merged,
        [zoneId]: { ...(merged[zoneId] ?? {}), ...floorZonePreviews![zoneId] },
      }),
      floorCustomizations,
    )
    const customized = applyDatasetZoneCustomizations(currentDataset, displayCustomizations)
    if (!customized) return undefined
    return applyAuthoredEntities(customized, authoredEntities)
  }, [currentDataset, floorCustomizations, floorZonePreviews, authoredEntities])

  // Seats and people: real when there is a session, demo fixtures otherwise.
  // The map itself never waits on this — its geometry ships with the build.
  const [allocationNow] = useState(() => new Date())
  const allocation = useFloorAllocation(effectiveDataset, allocationNow)
  const liveAllocationStore = useMemo(
    () => createApiAllocationStore({ floorId, onCommitted: allocation.reload }),
    [floorId, allocation.reload],
  )

  /**
   * Staff directory lookup for the seat picker. Live data only ever names the
   * people who already hold a seat, so without this an empty desk could not be
   * filled from the map at all.
   */
  const searchDirectory = useCallback(async (query: string): Promise<AllocationEmployee[]> => {
    const found = await searchEmployees(query)
    return found.map((person) => ({
      id: person.id,
      employeeCode: person.employee_code,
      name: person.full_name,
      departmentId: person.department_id,
      presence: 'unknown',
    }))
  }, [])

  return (
    <div className={`fp-page${view === 'workspace' ? ' is-spatial-page' : ''}`}>
      <header className="fp-topbar">
        <a className="fp-brand-collapsed" href="#/floor-planning" aria-label="Vin Smart Future · Trung tâm Hành chính">
          <img src={markUrl} alt="Vin Smart Future" width="26" height="26" />
        </a>
        <h1>Mặt bằng văn phòng</h1>
        <FloorPicker inventory={FLOOR_INVENTORY} value={floorId} onChange={changeFloor} />
        <div className="fp-segmented fp-view-mode" role="radiogroup" aria-label="Chế độ xem">
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={view === m.id}
              className={view === m.id ? 'is-active' : ''}
              onClick={() => navigate({ view: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="fp-topbar-actions">
          <div className="fp-search-slot" ref={setSearchSlot} />
          <HelpPopover />
        </div>
      </header>
      {!current && (
        <div className="fp-state" role="status">
          Đang tải dữ liệu {floorLabel?.toLowerCase()}…
        </div>
      )}
      {current?.error && (
        <div className="fp-state is-error" role="alert">
          <strong>Không tải được dữ liệu mặt bằng.</strong>
          <span className="fp-mono">{current.error}</span>
        </div>
      )}
      {allocation.status === 'failed' && view === 'workspace' && (
        <div className="fp-state is-error" role="alert">
          <strong>{ALLOCATION_FALLBACK}</strong>
          <span className="fp-mono">{allocation.error}</span>
        </div>
      )}
      {effectiveDataset && view === 'workspace' && (
        <SpatialWorkspace
          key={floorId}
          dataset={effectiveDataset}
          selected={selected}
          onSelect={setSelected}
          onVerify={() => navigate({ view: 'verification' })}
          searchSlot={searchSlot}
          onDirtyChange={setLayoutDirty}
          authoredEntities={authoredEntities}
          onAuthoredEntityChange={handleAuthoredEntityChange}
          allocationSource={allocation.status === 'live' ? allocation.data : undefined}
          allocationStore={allocation.status === 'live' ? liveAllocationStore : undefined}
          onAllocationCommitted={allocation.status === 'live' ? allocation.reload : undefined}
          onSearchEmployees={allocation.status === 'live' ? searchDirectory : undefined}
          reconcile={allocation.status === 'live' ? allocation.reconcile : null}
        />
      )}
      {effectiveDataset && view === 'verification' && (
        <FloorWorkspace
          key={floorId}
          dataset={effectiveDataset}
          baseDataset={current?.dataset}
          selected={selected}
          onSelect={setSelected}
          view={view}
          onViewChange={(next) => navigate({ view: next })}
          searchSlot={searchSlot}
          settingsOpen={settingsOpen}
          onCloseSettings={() => onSettingsOpenChange?.(false)}
          onZoneUpdate={handleZoneUpdate}
          onZonePreview={handleZonePreview}
          onZonePreviewClear={handleZonePreviewClear}
          onResetZone={handleResetZone}
          onResetAllZones={handleResetAllZones}
          onAuthoredEntityChange={handleAuthoredEntityChange}
        />
      )}
      {pendingNav && (
        <UnsavedChangesDialog
          onStay={() => setPendingNav(null)}
          onDiscard={() => {
            const next = pendingNav
            setPendingNav(null)
            setLayoutDirty(false)
            applyNav(next)
          }}
        />
      )}
    </div>
  )
}

function FloorWorkspace({
  dataset,
  baseDataset,
  selected,
  onSelect,
  view,
  onViewChange,
  searchSlot,
  settingsOpen,
  onCloseSettings,
  onZoneUpdate,
  onZonePreview,
  onZonePreviewClear,
  onResetZone,
  onResetAllZones,
  onAuthoredEntityChange,
}: {
  dataset: FloorDataset
  baseDataset?: FloorDataset
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  /** top-bar element the search box renders into */
  searchSlot: HTMLElement | null
  settingsOpen: boolean
  onCloseSettings: () => void
  onZoneUpdate?: (update: {
    zoneId: string
    name?: string | null
    labelAnchor?: Point
    sourceColor?: string | null
    sourceOpacity?: number | null
    verification?: VerificationState
    type?: 'WORKSPACE_ZONE' | 'UNKNOWN'
  }) => void
  onZonePreview?: (update: { zoneId: string; sourceColor?: string | null; sourceOpacity?: number | null }) => void
  onZonePreviewClear?: (zoneId: string) => void
  onResetZone?: (zoneId: string) => void
  onResetAllZones?: () => void
  onAuthoredEntityChange?: (changes: AuthoredEntityChanges) => void
}) {
  const [settings, setSettings] = useState<MapSettings>(DEFAULT_SETTINGS)
  const [hovered, setHovered] = useState<EntityRef | null>(null)
  const [now] = useState(() => new Date())
  const { floor } = dataset.layout
  const content = useMemo(() => ({ width: floor.width, height: floor.height }), [floor])
  // "fit" frames the drawn floor, not the sheet: see map/contentBounds.ts
  const home = useMemo(() => contentBounds(dataset), [dataset])
  const vp = useViewport(content, home)
  const issues = useMemo(() => validateFloorDataset(dataset), [dataset])
  const mainRef = useRef<HTMLElement>(null)
  const [roomDrawMode, setRoomDrawMode] = useState(false)
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null)
  // Pieces drawn so far for the room being authored; a lounge split by a corridor has two.
  const [roomDraft, setRoomDraft] = useState<Point[][] | null>(null)
  const [roomError, setRoomError] = useState<string | null>(null)

  // Allocation is attached, never merged: demo fixtures until the HR/Admin API exists.
  const workspace = view === 'workspace'
  const allocation = useMemo(() => (workspace ? createDemoAllocation(dataset, now) : undefined), [workspace, dataset, now])
  const desks = useMemo(() => buildDeskIndex(dataset, allocation, now), [dataset, allocation, now])
  const deskStatuses = useMemo(
    () => (workspace ? new Map([...desks].map(([id, d]) => [id, d.status] as const)) : undefined),
    [workspace, desks],
  )
  const selectedDesk = workspace && selected?.kind === 'workstation' ? desks.get(selected.id) : undefined

  const bboxOf = useCallback(
    (ref: EntityRef) => {
      const pool = {
        zone: dataset.zones,
        room: dataset.rooms,
        cluster: dataset.clusters,
        workstation: dataset.workstations,
        object: dataset.objects,
      }[ref.kind]
      return pool.find((e) => e.id === ref.id)?.bbox
    },
    [dataset],
  )

  const deskLabel = useCallback(
    (wsId: string) => {
      const desk = workspace ? desks.get(wsId) : undefined
      return desk ? `Bàn ${desk.seat.code} · ${DESK_STATUS[desk.status].label}` : `Vị trí làm việc ${wsId}`
    },
    [workspace, desks],
  )

  const hoverLabel = useMemo(() => {
    if (!hovered) return null
    if (hovered.kind === 'zone') return dataset.zones.find((z) => z.id === hovered.id)?.name ?? UNLABELED_ZONE
    if (hovered.kind === 'room') return dataset.rooms.find((r) => r.id === hovered.id)?.name
    if (hovered.kind === 'object') {
      const o = dataset.objects.find((k) => k.id === hovered.id)
      return o && objectName(o)
    }
    return deskLabel(hovered.id)
  }, [hovered, dataset, deskLabel])

  const focusMap = () => mainRef.current?.querySelector<SVGSVGElement>('.fp-svg')?.focus()

  const clearSelection = useCallback(() => onSelect(null), [onSelect])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !selected || e.defaultPrevented) return
      if (isTypingTarget(e.target)) return
      onSelect(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, onSelect])

  const searchIndex = useMemo(() => buildSearchIndex(dataset, workspace ? desks : undefined), [dataset, workspace, desks])

  const selBBox = selected ? bboxOf(selected) : undefined
  const setViewport = vp.setViewport
  const focusSelection = (b: BBox) => {
    const cx = (b[0] + b[2]) / 2
    const cy = (b[1] + b[3]) / 2
    const hw = Math.max(b[2] - b[0], FOCUS_MIN_PT) / 2
    const hh = Math.max(b[3] - b[1], FOCUS_MIN_PT) / 2
    vp.focus([cx - hw, cy - hh, cx + hw, cy + hh])
  }

  const beginRoomDraw = useCallback(() => {
    setRoomDrawMode(true)
    setRoomDraft(null)
    setRoomError(null)
    onSelect(null)
  }, [onSelect])

  const cancelRoomDraw = useCallback(() => {
    setRoomDrawMode(false)
    setRoomDraft(null)
    setRoomError(null)
  }, [])

  const handleRoomDraw = useCallback((polygon: Point[]) => {
    setRoomDrawMode(false)
    setRoomDraft((parts) => [...(parts ?? []), polygon])
    setRoomError(null)
  }, [])

  const beginRoomPart = useCallback(() => {
    setRoomDrawMode(true)
    setRoomError(null)
  }, [])

  const removeLastRoomPart = useCallback(() => {
    setRoomDraft((parts) => (parts && parts.length > 1 ? parts.slice(0, -1) : parts))
    setRoomError(null)
  }, [])

  const saveAuthoredRoom = useCallback((payload: { polygons: Point[][]; name: string; type: RoomType }) => {
    if (!onAuthoredEntityChange) return 'Không thể lưu phòng ở chế độ hiện tại.'
    const room = authoredRoomFromPolygon({
      dataset,
      polygon: payload.polygons,
      id: nextAuthoredRoomId(dataset.layout.floor.id, dataset.rooms),
      name: payload.name,
      type: payload.type,
      authoredBy: 'demo-admin',
      authoredAt: new Date().toISOString(),
    })
    const validation = validateAuthoredRoom(room, dataset)
    if (validation.length > 0) {
      const message = validation.map((issue) => {
        if (issue.type === 'self-intersecting') return 'Đường viền phòng không được tự cắt nhau.'
        if (issue.type === 'parts-overlap') return 'Các phần của phòng không được chồng lên nhau.'
        if (issue.type === 'too-small') return 'Phòng phải có diện tích tối thiểu 2 m².'
        if (issue.type === 'outside-floor') return 'Phòng phải nằm hoàn toàn trong mặt bằng.'
        return `Phòng chồng lên ${issue.roomName}.`
      }).join(' ')
      setRoomError(message)
      return message
    }
    onAuthoredEntityChange({ rooms: [room], sourcePdfSha256: dataset.layout.sourcePdfSha256 })
    setRoomDraft(null)
    setRoomError(null)
    return null
  }, [dataset, onAuthoredEntityChange])

  const deleteAuthoredRoom = useCallback((roomId: string) => {
    const room = dataset.rooms.find((item) => item.id === roomId)
    if (!room || room.source.kind !== 'user-authored' || !onAuthoredEntityChange) return
    onAuthoredEntityChange({ removeRoomIds: [roomId] })
    if (selected?.kind === 'room' && selected.id === roomId) onSelect(null)
  }, [dataset.rooms, onAuthoredEntityChange, onSelect, selected])

  const pickSearchResult = (item: SearchItem) => {
    onSelect(item.target)
    const bbox = bboxOf(item.target)
    if (bbox) focusSelection(bbox)
    focusMap()
  }

  /** Arrow keys walk between desks; the view pans only when the next desk is off screen. */
  const onMapKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const direction = ARROW_DIRECTION[e.key]
    if (!direction) return
    e.preventDefault()
    const candidates = workspace
      ? dataset.workstations.filter((w) => desks.has(w.id))
      : dataset.workstations
    const from = selected?.kind === 'workstation' ? candidates.find((w) => w.id === selected.id) : undefined
    const next = from ? nearestInDirection(from.center, direction, candidates, from.id) : candidates[0]
    if (!next) return
    onSelect({ kind: 'workstation', id: next.id })
    const { scale, x, y } = vp.viewport
    const sx = next.center[0] * scale + x
    const sy = next.center[1] * scale + y
    const margin = 60
    if (sx < margin || sy < margin || sx > vp.size.width - margin || sy > vp.size.height - margin) {
      setViewport((v) => ({ ...v, x: vp.size.width / 2 - next.center[0] * v.scale, y: vp.size.height / 2 - next.center[1] * v.scale }))
    }
  }

  const callout = useMemo(() => {
    if (!selectedDesk) return null
    const { scale, x, y } = vp.viewport
    const [x0, y0, x1] = selectedDesk.workstation.bbox
    const left = ((x0 + x1) / 2) * scale + x
    const top = y0 * scale + y
    if (left < 0 || top < 0 || left > vp.size.width || top > vp.size.height) return null
    return { left, top }
  }, [selectedDesk, vp.viewport, vp.size])

  const selectionAnnouncement =
    selected?.kind === 'workstation' ? `Đã chọn ${deskLabel(selected.id).toLowerCase()}` : ''

  return (
    <div className={`fp-workspace${settingsOpen ? ' has-settings' : ''}`}>
      {searchSlot &&
        createPortal(<FloorSearch index={searchIndex} includesPeople={workspace} onPick={pickSearchResult} />, searchSlot)}
      {settingsOpen && (
        <aside id="fp-map-settings" className="fp-sidebar" aria-labelledby="fp-map-settings-title">
          <header className="fp-sidebar-head">
            <h2 id="fp-map-settings-title">Cài đặt bản đồ</h2>
            <button type="button" className="fp-sidebar-close" aria-label="Đóng cài đặt bản đồ" title="Đóng" onClick={onCloseSettings}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <FloorMapControls
            settings={settings}
            layers={dataset.layout.layers}
            onChange={setSettings}
            dataset={dataset}
            desks={workspace ? desks : undefined}
            allocationSource={allocation?.source}
            selected={selected}
          />
        </aside>
      )}
      <main className="fp-main" ref={mainRef}>
        <FloorMap
          dataset={dataset}
          settings={settings}
          viewport={vp.viewport}
          minFitScale={vp.minFitScale}
          onViewportChange={setViewport}
          containerRef={vp.containerRef}
          selected={selected}
          onSelect={onSelect}
          onHover={setHovered}
          assetBase={import.meta.env.BASE_URL}
          deskStatuses={deskStatuses}
          onKeyDown={onMapKeyDown}
          onZoneUpdate={onZoneUpdate}
          editingZoneId={editingZoneId}
          roomDrawMode={roomDrawMode}
          roomDraft={roomDraft}
          onRoomDraw={handleRoomDraw}
          onRoomDrawCancel={cancelRoomDraw}
        />
        {callout && selectedDesk && (
          <div className="fp-desk-callout" style={{ left: callout.left, top: callout.top }} data-desk-status={selectedDesk.status} aria-hidden="true">
            <DeskStatusIcon status={selectedDesk.status} size={10} />
            {selectedDesk.seat.code}
          </div>
        )}
        <div className="fp-hover" aria-live="polite">
          {hoverLabel ?? (
            <span className="fp-hover-hint">Kéo để di chuyển · Cuộn để thu phóng · Nhấp để chọn · Nhấn ? để xem phím tắt</span>
          )}
        </div>
        <p className="fp-sr-only" aria-live="polite">
          {selectionAnnouncement}
        </p>
        {/* controls sit bottom-right in both modes, above the legend stack */}
        <div className="fp-map-foot">
          <ViewControls
            onZoomIn={() => vp.zoomBy(1.4)}
            onZoomOut={() => vp.zoomBy(1 / 1.4)}
            onFit={vp.fit}
            onReset={vp.reset}
            onFocusSelection={selBBox ? () => focusSelection(selBBox) : undefined}
          />
          {settings.sourceMode !== 'digital' && (
            <p className="fp-source-note" title={dataset.layout.floor.sourcePdf}>
              <span className="fp-source-note-label">Bản vẽ gốc</span>
              <span className="fp-filename">{dataset.sourceName}</span>
              <span className="fp-source-note-extra">· ảnh raster, gồm chú thích của người rà soát</span>
            </p>
          )}
        </div>
      </main>
      {selectedDesk && allocation ? (
        <DeskInspector
          desk={selectedDesk}
          source={allocation.source}
          now={now}
          onClose={() => {
            clearSelection()
            focusMap()
          }}
          onShowWorkstation={() => onViewChange('verification')}
        />
      ) : (
        <FloorDetailsPanel
          dataset={dataset}
          baseDataset={baseDataset}
          selected={selected}
          onSelect={onSelect}
          debug={settings.debug.enabled}
          issues={issues}
          desks={workspace ? desks : undefined}
          allocationSource={allocation?.source}
          onZoneUpdate={onZoneUpdate}
          onZonePreview={onZonePreview}
          onZonePreviewClear={onZonePreviewClear}
          onZoneEditingChange={setEditingZoneId}
          onResetZone={onResetZone}
          onResetAllZones={onResetAllZones}
          onBeginRoomDraw={beginRoomDraw}
          pendingRoom={roomDraft}
          roomOverlapCount={roomDraft ? workstationsOverlappingRoom({ polygon: roomDraft[0], extraPolygons: roomDraft.slice(1) }, dataset.workstations).length : 0}
          onAddRoomPart={beginRoomPart}
          onRemoveLastRoomPart={removeLastRoomPart}
          roomDrawing={roomDrawMode}
          roomError={roomError}
          onCancelRoomDraw={cancelRoomDraw}
          onSaveAuthoredRoom={saveAuthoredRoom}
          onDeleteAuthoredRoom={deleteAuthoredRoom}
        />
      )}
    </div>
  )
}
