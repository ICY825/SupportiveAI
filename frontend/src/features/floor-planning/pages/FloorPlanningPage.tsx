import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { createDemoAllocation } from '../allocation/demoAllocation'
import { FloorDetailsPanel } from '../components/FloorDetailsPanel'
import { FloorMap } from '../components/FloorMap'
import { SpatialWorkspace } from '../workspace/SpatialWorkspace'
import { FloorMapControls, ViewControls } from '../components/FloorMapControls'
import { FloorSearch } from '../components/FloorSearch'
import { FloorSelector } from '../components/FloorSelector'
import { HelpPopover } from '../components/HelpPopover'
import { isTypingTarget } from '../components/keyboard'
import { MapLegend } from '../components/MapLegend'
import { DeskInspector } from '../components/desk-inspector/DeskInspector'
import { DeskStatusIcon } from '../components/desk-inspector/DeskStatusBadge'
import { DeskStatusLegend } from '../components/desk-inspector/DeskStatusLegend'
import { FLOORS, findFloor } from '../data/registry'
import { validateFloorDataset } from '../data/validateFloorDataset'
import { buildDeskIndex, DESK_STATUSES, type DeskStatus } from '../domain/desk'
import type { BBox, EntityRef, FloorDataset } from '../domain/spatial'
import { DESK_STATUS, UNLABELED_ZONE, VIEW_MODES, objectName } from '../labels'
import { ARROW_DIRECTION, nearestInDirection } from '../map/deskNavigation'
import { buildSearchIndex, type SearchItem } from '../search/searchIndex'
import { gridBounds } from '../map/grid'
import { DEFAULT_SETTINGS, type MapSettings } from '../map/mapSettings'
import { useViewport } from '../map/useViewport'
import { buildHash, parseHash, type ViewMode } from './urlState'
import '../floorPlanning.css'

/** Smallest area (floor points) "focus" frames, so a single desk keeps its surroundings in view. */
const FOCUS_MIN_PT = 160

interface FloorPlanningPageProps {
  /** map display settings panel (opened from the app sidebar) */
  settingsOpen?: boolean
  onSettingsOpenChange?: (open: boolean) => void
}

export function FloorPlanningPage({ settingsOpen = false, onSettingsOpenChange }: FloorPlanningPageProps = {}) {
  const initial = useMemo(() => parseHash(window.location.hash), [])
  const [floorId, setFloorId] = useState(findFloor(initial.floorId)?.id ?? FLOORS[0].id)
  const [selected, setSelected] = useState<EntityRef | null>(initial.selected)
  const [view, setView] = useState<ViewMode>(initial.view)
  const [state, setState] = useState<{ id: string; dataset?: FloorDataset; error?: string } | null>(null)
  const [searchSlot, setSearchSlot] = useState<HTMLDivElement | null>(null)

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

  const changeFloor = (id: string) => {
    setSelected(null)
    setFloorId(id)
  }

  const current = state?.id === floorId ? state : null
  const floorLabel = findFloor(floorId)?.label

  return (
    <div className={`fp-page${view === 'workspace' ? ' is-spatial-page' : ''}`}>
      <header className="fp-topbar">
        <h1>Mặt bằng văn phòng</h1>
        <FloorSelector floors={FLOORS} value={floorId} onChange={changeFloor} />
        <div className="fp-segmented fp-view-mode" role="radiogroup" aria-label="Chế độ xem">
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={view === m.id}
              className={view === m.id ? 'is-active' : ''}
              onClick={() => setView(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {view === 'workspace' && (
          <p className="fp-scope is-demo" title="Nhân sự, chỗ ngồi và thiết bị là dữ liệu giả lập; chưa kết nối HR/Admin.">
            <span className="fp-scope-dot" aria-hidden="true" />
            Dữ liệu bố trí minh họa
          </p>
        )}
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
      {current?.dataset && view === 'workspace' && (
        <SpatialWorkspace
          key={floorId}
          dataset={current.dataset}
          selected={selected}
          onSelect={setSelected}
          onVerify={() => setView('verification')}
          searchSlot={searchSlot}
          settingsOpen={settingsOpen}
          onCloseSettings={() => onSettingsOpenChange?.(false)}
        />
      )}
      {current?.dataset && view === 'verification' && (
        <FloorWorkspace
          key={floorId}
          dataset={current.dataset}
          selected={selected}
          onSelect={setSelected}
          view={view}
          onViewChange={setView}
          searchSlot={searchSlot}
          settingsOpen={settingsOpen}
          onCloseSettings={() => onSettingsOpenChange?.(false)}
        />
      )}
    </div>
  )
}

function FloorWorkspace({
  dataset,
  selected,
  onSelect,
  view,
  onViewChange,
  searchSlot,
  settingsOpen,
  onCloseSettings,
}: {
  dataset: FloorDataset
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  /** top-bar element the search box renders into */
  searchSlot: HTMLElement | null
  settingsOpen: boolean
  onCloseSettings: () => void
}) {
  const [settings, setSettings] = useState<MapSettings>(DEFAULT_SETTINGS)
  const [hovered, setHovered] = useState<EntityRef | null>(null)
  const [now] = useState(() => new Date())
  const { floor } = dataset.layout
  const content = useMemo(() => ({ width: floor.width, height: floor.height }), [floor])
  // extra padding keeps source zone labels near the plate edge inside the fitted view
  const home = useMemo(() => gridBounds(dataset.layout, 60), [dataset])
  const vp = useViewport(content, home)
  const issues = useMemo(() => validateFloorDataset(dataset), [dataset])
  const mainRef = useRef<HTMLElement>(null)

  // Allocation is attached, never merged: demo fixtures until the HR/Admin API exists.
  const workspace = view === 'workspace'
  const allocation = useMemo(() => (workspace ? createDemoAllocation(dataset, now) : undefined), [workspace, dataset, now])
  const desks = useMemo(() => buildDeskIndex(dataset, allocation, now), [dataset, allocation, now])
  const deskStatuses = useMemo(
    () => (workspace ? new Map([...desks].map(([id, d]) => [id, d.status] as const)) : undefined),
    [workspace, desks],
  )
  const deskCounts = useMemo(() => {
    const counts = Object.fromEntries(DESK_STATUSES.map((s) => [s, 0])) as Record<DeskStatus, number>
    for (const d of desks.values()) counts[d.status]++
    return counts
  }, [desks])

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
          <FloorMapControls settings={settings} layers={dataset.layout.layers} onChange={setSettings} />
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
        <ViewControls
          onZoomIn={() => vp.zoomBy(1.4)}
          onZoomOut={() => vp.zoomBy(1 / 1.4)}
          onFit={vp.fit}
          onReset={vp.reset}
          onFocusSelection={selBBox ? () => focusSelection(selBBox) : undefined}
        />
        <div className="fp-map-foot">
          {settings.sourceMode !== 'digital' && (
            <p className="fp-source-note" title={dataset.layout.floor.sourcePdf}>
              <span className="fp-source-note-label">Bản vẽ gốc</span>
              <span className="fp-filename">{dataset.sourceName}</span>
              <span className="fp-source-note-extra">· ảnh raster, gồm chú thích của người rà soát</span>
            </p>
          )}
          {workspace ? <DeskStatusLegend counts={deskCounts} demo={allocation?.source.kind === 'demo'} /> : <MapLegend />}
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
          selected={selected}
          onSelect={onSelect}
          debug={settings.debug.enabled}
          issues={issues}
          desks={workspace ? desks : undefined}
          allocationSource={allocation?.source}
        />
      )}
    </div>
  )
}
