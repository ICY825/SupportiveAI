import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createDemoAllocation } from '../allocation/demoAllocation'
import { FloorSearch } from '../components/FloorSearch'
import { isTypingTarget } from '../components/keyboard'
import { formatDate, initials } from '../components/desk-inspector/format'
import { buildDeskIndex, DESK_STATUSES, type DeskRecord, type DeskStatus } from '../domain/desk'
import type { BBox, EntityRef, FloorDataset, Point } from '../domain/spatial'
import {
  DESK_STATUS,
  LAYOUT_EDIT,
  SEAT_TYPE,
  SPATIAL_OUT_OF_SCOPE,
  SPATIAL_OUT_OF_SCOPE_HINT,
  SPATIAL_SCOPE_BREADCRUMB,
  SPATIAL_SCOPE_LABEL,
  SPATIAL_UNAVAILABLE,
  SPATIAL_VIEW_LABEL,
} from '../labels'
import { ARROW_DIRECTION, DIRECTION_VECTOR, nearestInDirection } from '../map/deskNavigation'
import { normalizeWheelZoom } from '../map/viewport'
import { buildSearchIndex } from '../search/searchIndex'
import { EditAffordances, EditGround } from './EditLayer'
import { EditInspector, EditToolbar, LayoutModeSwitch, PlacementStatus, UnsavedChangesDialog } from './EditPanel'
import {
  applyPlacements,
  basePlacements as deriveBasePlacements,
  deriveEditableArea,
  GRID_CELL_MM,
  sessionLayoutStore,
  type LayoutStore,
} from './layoutDraft'
import { buildSpikeScene, fitViewBox, project, sceneBounds, unprojectDelta } from './scene'
import { useLayoutEditor, NUDGE_COARSE_CELLS, type WorkspaceMode } from './useLayoutEditor'
import { SCENE_VIEWBOX, SeatSymbol, WorkspaceScene } from './WorkspaceScene'
import './workspace.css'

/** Screen-pixel margin left around the fitted scene. Matches the verification map. */
const SCENE_PADDING = 20
const MIN_ZOOM = 0.85
const MAX_ZOOM = 2.5
/** Pan limit as a share of the framed scene, so it scales with the stage. */
const PAN_LIMIT = 0.3
/** Pointer travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4

function Status({ desk }: { desk: DeskRecord }) {
  return <span className="fp-chip sw-status" data-status={desk.status}><svg viewBox="-2 -2 4 4" aria-hidden="true"><SeatSymbol status={desk.status} /></svg>{DESK_STATUS[desk.status].label}</span>
}

/** The map's own marker, at legend size, so the key teaches the map literally. */
function LegendMark({ status }: { status: DeskStatus }) {
  return (
    <svg className="sw-key-mark" viewBox="-2.4 -2.4 4.8 4.8" aria-hidden="true">
      <circle className="sw-marker-disc" r={1.85} />
      {status === 'occupied' ? <text textAnchor="middle" y={0.48} className="sw-avatar-text">NM</text> : <SeatSymbol status={status} />}
    </svg>
  )
}

/**
 * Seat counts and the map key for the current scope. Stays in the panel whether
 * or not a desk is selected: it describes the scope, not the selection.
 */
function ScopeSummary({ count, counts, children }: {
  count: number
  counts: (status: DeskStatus) => number
  /** empty-state prompt, shown between the counts and the key when nothing is selected */
  children?: ReactNode
}) {
  return (
    <section className="sw-summary" aria-labelledby="sw-summary-title">
      <p className="fp-eyebrow" id="sw-summary-title">{SPATIAL_SCOPE_LABEL}</p>
      <div className="sw-capacity"><strong>{count}</strong><span>chỗ ngồi</span></div>
      <div className="sw-occupancy-bar" aria-hidden="true">
        {DESK_STATUSES.map((s) => <span key={s} data-status={s} style={{ flex: counts(s) }} />)}
      </div>
      <dl className="sw-counts">
        {DESK_STATUSES.map((s) => (
          <div key={s} data-status={s} title={DESK_STATUS[s].hint}>
            <dt>{DESK_STATUS[s].short}</dt>
            <dd>{counts(s)}</dd>
          </div>
        ))}
      </dl>
      {children}
      <details className="fp-section sw-key-block" open>
        <summary>
          <h3>Chú giải</h3>
        </summary>
        <ul className="sw-key">
        {DESK_STATUSES.map((s) => (
          <li key={s} data-status={s}>
            <LegendMark status={s} />
            {DESK_STATUS[s].short}
          </li>
        ))}
          <li className="sw-key-boundary">
            <span className="sw-key-rule" aria-hidden="true" />
            Ranh giới khu vực
          </li>
        </ul>
      </details>
    </section>
  )
}

function CompactInspector({ desk, onClose, onVerify, showHeader = true }: { desk: DeskRecord; onClose: () => void; onVerify: () => void; showHeader?: boolean }) {
  const people = desk.status === 'reserved' && desk.reservation ? [desk.reservation] : desk.occupants
  return <aside className={`sw-inspector${showHeader ? '' : ' is-secondary'}`} aria-labelledby={showHeader ? 'sw-desk-title' : undefined} aria-label={showHeader ? undefined : `Thông tin nhân sự bàn ${desk.seat.code}`}>
    {showHeader && <header className="fp-card-head"><div><p className="fp-eyebrow">Bàn đang chọn</p><h2 id="sw-desk-title" className="fp-card-title">{desk.seat.code}</h2></div><button type="button" className="fp-icon-btn" onClick={onClose} aria-label="Đóng bảng thông tin bàn" title="Đóng (Esc)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button></header>}
    <Status desk={desk} />
    {/* Who sits here is the answer to the click, so it reads without a click —
        the same way the verification panel keeps an entity's own facts visible. */}
    <section className="sw-person-section">
      <h3 className="fp-section-title">{desk.status === 'reserved' ? 'Nhân sự đặt chỗ' : 'Nhân sự sử dụng'}</h3>
      {people.map(({ employee }) => <div className="sw-person" key={employee.id}><span className="sw-avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><span>{employee.employeeCode} · {employee.jobTitle}</span></div></div>)}
      {desk.status === 'available' && <div className="sw-vacant"><strong>Chỗ ngồi còn trống</strong><p>Chưa có nhân sự được gán</p></div>}
      {desk.status === 'unavailable' && <div className="sw-unavailable"><strong>Tạm ngưng sử dụng</strong><p>{desk.seat.statusReason ?? 'Chỗ ngồi hiện không khả dụng.'}</p></div>}
      {desk.status === 'reserved' && desk.reservation && <p className="sw-detail-note">Từ {formatDate(desk.reservation.assignment.validFrom)}</p>}
      {desk.status === 'conflict' && <p className="sw-conflict-note">Có {desk.occupants.length} phân công cùng hiệu lực tại bàn này.</p>}
    </section>
    <details key={desk.workstation.id} className="fp-section" open>
      <summary>
        <h3>Thông tin chỗ ngồi</h3>
      </summary>
      <dl className="fp-facts"><div><dt>Khu vực</dt><dd>{desk.zone?.name ?? 'Chưa có nhãn'}</dd></div><div><dt>Bộ phận</dt><dd>{desk.department?.name ?? 'Chưa có dữ liệu'}</dd></div><div><dt>Loại chỗ ngồi</dt><dd>{SEAT_TYPE[desk.seat.seatType]}</dd></div></dl>
    </details>
    <button type="button" className="fp-btn is-wide sw-verify" onClick={onVerify}>Đối chiếu trên bản vẽ <span aria-hidden="true">↗</span></button>
    <p className="sw-inspector-note">Thông tin bố trí minh họa · Chỉ xem</p>
  </aside>
}

/** What a pointer press is doing. Panning and moving an object never mix. */
interface DragSession {
  id: number
  kind: 'pan' | 'object'
  entityId?: string
  start: Point
  last: Point
  moved: boolean
}

export function SpatialWorkspace({ dataset, selected, onSelect, onVerify, searchSlot, settingsOpen, onCloseSettings, onDirtyChange, layoutStore = sessionLayoutStore }: {
  dataset: FloorDataset
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
  onVerify: () => void
  searchSlot: HTMLElement | null
  settingsOpen: boolean
  onCloseSettings: () => void
  /** lets the page guard floor and view changes while a layout draft is open */
  onDirtyChange?: (dirty: boolean) => void
  /** swap for an API-backed store once a layout endpoint exists */
  layoutStore?: LayoutStore
}) {
  const [now] = useState(() => new Date())
  const baseScene = useMemo(() => buildSpikeScene(dataset), [dataset])
  const base = useMemo(() => deriveBasePlacements(baseScene.workstations), [baseScene])
  const area = useMemo(() => deriveEditableArea(dataset, baseScene), [dataset, baseScene])
  const editor = useLayoutEditor({ floorId: dataset.layout.floor.id, basePlacements: base, area, store: layoutStore })
  const editing = editor.mode === 'edit'

  // What is drawn: the authoritative geometry moved to its current placements.
  const scene = useMemo(() => applyPlacements(baseScene, base, editor.placements), [baseScene, base, editor.placements])

  const allDesks = useMemo(() => buildDeskIndex(dataset, createDemoAllocation(dataset, now), now), [dataset, now])
  const desks = useMemo(() => {
    const entries: Array<readonly [string, DeskRecord]> = []
    for (const ws of scene.workstations) {
      const record = allDesks.get(ws.id)
      // the record keeps its own identity while nothing has moved, so the
      // inspector and the map always describe the same geometry
      if (record) entries.push([ws.id, record.workstation === ws ? record : { ...record, workstation: ws }] as const)
    }
    return new Map(entries)
  }, [allDesks, scene])
  const search = useMemo(() => buildSearchIndex(dataset, desks).filter((item) => item.target.kind === 'workstation' && desks.has(item.target.id)), [dataset, desks])
  const svgRef = useRef<SVGSVGElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>([0, 0])
  const [exitPrompt, setExitPrompt] = useState(false)
  const drag = useRef<DragSession | null>(null)
  const pendingPan = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const pendingZoomFactor = useRef(1)
  const pendingDrag = useRef<Point | null>(null)
  const rafId = useRef<number | null>(null)
  const desk = selected?.kind === 'workstation' ? desks.get(selected.id) : undefined
  const outsideCrop = selected !== null && !desk

  // Pointer handlers and rAF callbacks reach the editor through a ref so they
  // never capture a stale closure and never need re-binding mid-gesture.
  const editorRef = useRef(editor)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const codeOf = useCallback((entityId: string) => desks.get(entityId)?.seat.code.split('-').at(-1) ?? entityId, [desks])
  const selectedValidation = desk ? editor.validation.get(desk.workstation.id) : undefined
  const invalidCount = useMemo(() => [...editor.validation.values()].filter((v) => !v.valid).length, [editor.validation])

  useEffect(() => {
    onDirtyChange?.(editor.dirty)
  }, [onDirtyChange, editor.dirty])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // The scene is framed from its own geometry, so it fills whatever stage it gets.
  const bounds = useMemo<BBox>(() => sceneBounds(baseScene), [baseScene])
  const frame = useMemo(() => (stage ? fitViewBox(bounds, stage, SCENE_PADDING) : null), [bounds, stage])
  const viewBox = frame ? frame.join(' ') : SCENE_VIEWBOX
  const origin: Point = useMemo(
    () => (frame ? [frame[0] + frame[2] / 2, frame[1] + frame[3] / 2] : [31, 40]),
    [frame],
  )
  const panLimit: Point = useMemo(
    () => (frame ? [frame[2] * PAN_LIMIT, frame[3] * PAN_LIMIT] : [80, 60]),
    [frame],
  )

  const panLimitRef = useRef(panLimit)
  useEffect(() => {
    panLimitRef.current = panLimit
  }, [panLimit])

  // Cached CTM scale outside gesture hot path to prevent layout queries
  const scaleRef = useRef(1)
  useEffect(() => {
    if (stage && frame && frame[2] > 0) {
      scaleRef.current = stage.width / frame[2]
    }
  }, [stage, frame])
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const flushFrame = useCallback(() => {
    rafId.current = null
    const { dx, dy } = pendingPan.current
    const factor = pendingZoomFactor.current
    const objectDelta = pendingDrag.current
    pendingPan.current = { dx: 0, dy: 0 }
    pendingZoomFactor.current = 1
    pendingDrag.current = null

    const limit = panLimitRef.current
    if (dx !== 0 || dy !== 0) {
      setPan(([x, y]) => [
        Math.max(-limit[0], Math.min(limit[0], x + dx)),
        Math.max(-limit[1], Math.min(limit[1], y + dy)),
      ])
    }
    if (factor !== 1) {
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)))
    }
    if (objectDelta) editorRef.current.dragTo(objectDelta)
  }, [])

  const scheduleFrame = useCallback(() => {
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(flushFrame)
    }
  }, [flushFrame])

  useEffect(() => {
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
    }
  }, [])

  const reset = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
    pendingPan.current = { dx: 0, dy: 0 }
    pendingZoomFactor.current = 1
    setZoom(1)
    setPan([0, 0])
  }, [])

  const zoomBy = useCallback((factor: number) => {
    if (!Number.isFinite(factor) || factor <= 0) return
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      flushFrame()
    }
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)))
  }, [flushFrame])

  const selectDesk = useCallback((id: string) => {
    onSelect({ kind: 'workstation', id })
    svgRef.current?.focus()
  }, [onSelect])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setStage({ width: el.clientWidth, height: el.clientHeight })
    }
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setStage({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const releaseDrag = useCallback((cancelObjectMove: boolean) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    pendingDrag.current = null
    try {
      if (svgRef.current?.hasPointerCapture?.(d.id)) svgRef.current.releasePointerCapture(d.id)
    } catch {}
    if (d.kind === 'object') {
      if (cancelObjectMove) editorRef.current.cancelDrag()
      else editorRef.current.endDrag()
    }
  }, [])

  /**
   * Escape is layered: it abandons the gesture in progress first, then the
   * selection. It never discards the edit session — leaving edit mode is an
   * explicit Hủy, so a stray key cannot lose a layout.
   */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isTypingTarget(e.target)) return
      if (drag.current?.kind === 'object') {
        releaseDrag(true)
        return
      }
      onSelect(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect, releaseDrag])

  // Window blur cleans up any active drag to prevent stuck pointer lockouts
  useEffect(() => {
    const onBlur = () => {
      if (!drag.current) return
      releaseDrag(false)
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        flushFrame()
      }
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [flushFrame, releaseDrag])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = normalizeWheelZoom(e.deltaY, e.deltaMode, 0.7)
      if (Number.isFinite(factor) && factor > 0) {
        pendingZoomFactor.current = Math.max(0.01, Math.min(100, pendingZoomFactor.current * factor))
        scheduleFrame()
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      svg.removeEventListener('wheel', onWheel)
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
    }
  }, [scheduleFrame])

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const direction = ARROW_DIRECTION[e.key]
    // Edit mode rebinds the arrows to nudging the selected object; view-mode
    // desk-to-desk navigation is untouched.
    if (editing && desk) {
      if (direction) {
        e.preventDefault()
        // Nudging runs along the floor's own axes, which is what the grid and
        // the desk rows are aligned to — not along the screen's axes.
        const step = e.shiftKey ? NUDGE_COARSE_CELLS : 1
        const [ux, uy] = DIRECTION_VECTOR[direction]
        editor.nudge(desk.workstation.id, [ux * step, uy * step])
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        editor.rotate(desk.workstation.id)
        return
      }
    }
    if (!direction) return
    e.preventDefault()
    const candidates = scene.workstations.map((w) => ({ id: w.id, center: project(w.center) }))
    const from = desk ? project(desk.workstation.center) : null
    const next = from ? nearestInDirection(from, direction, candidates, desk?.workstation.id) : candidates[0]
    if (next) { selectDesk(next.id); reset() }
  }

  const pointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return
    if (drag.current !== null) {
      if (e.pointerType === 'mouse') {
        drag.current = null
      } else {
        return
      }
    }
    const targetEl = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement
    const hit = targetEl?.closest?.('[data-workstation-id]')?.getAttribute('data-workstation-id') ?? undefined
    // In edit mode a press that lands on an object moves that object; a press
    // on the floor still pans. The two gestures never overlap.
    const kind: DragSession['kind'] = editing && hit ? 'object' : 'pan'
    drag.current = { id: e.pointerId, kind, entityId: hit, start: [e.clientX, e.clientY], last: [e.clientX, e.clientY], moved: false }
    if (kind === 'object' && hit) {
      if (selected?.id !== hit) selectDesk(hit)
      editor.startDrag(hit)
    }
  }

  const pointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.moved && Math.hypot(e.clientX - d.start[0], e.clientY - d.start[1]) > DRAG_THRESHOLD_PX) {
      d.moved = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
    }
    if (!d.moved) return
    // Read cached scale without forcing layout query (getScreenCTM)
    const rawScale = stage && frame && frame[2] > 0 ? stage.width / frame[2] : scaleRef.current
    const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1

    if (d.kind === 'object') {
      // Measured from the press, not frame to frame, so a snapped placement
      // cannot accumulate drift over a long drag.
      const zoomed = scale * (zoomRef.current > 0 ? zoomRef.current : 1)
      const delta = unprojectDelta([(e.clientX - d.start[0]) / zoomed, (e.clientY - d.start[1]) / zoomed])
      if (Number.isFinite(delta[0]) && Number.isFinite(delta[1])) {
        pendingDrag.current = delta
        scheduleFrame()
      }
      return
    }

    const dx = (e.clientX - d.last[0]) / scale
    const dy = (e.clientY - d.last[1]) / scale
    if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
      d.last = [e.clientX, e.clientY]
    }
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      pendingPan.current.dx += dx
      pendingPan.current.dy += dy
      scheduleFrame()
    }
  }

  const pointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const moved = d.moved
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      flushFrame()
    }
    releaseDrag(false)
    if (moved) return
    const targetEl = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement
    const id = targetEl?.closest?.('[data-workstation-id]')?.getAttribute('data-workstation-id')
    if (id) selectDesk(id)
    else onSelect(null)
  }

  const pointerCancel = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      flushFrame()
    }
    releaseDrag(true)
  }

  const changeMode = useCallback((next: WorkspaceMode) => {
    if (next === editorRef.current.mode) return
    if (next === 'edit') {
      editorRef.current.enterEdit()
      return
    }
    if (!editorRef.current.tryExitEdit()) setExitPrompt(true)
  }, [])

  const statusCounts = useMemo(() => {
    const map = Object.fromEntries(DESK_STATUSES.map((s) => [s, 0])) as Record<DeskStatus, number>
    for (const d of desks.values()) map[d.status]++
    return map
  }, [desks])
  const counts = useCallback((status: DeskStatus) => statusCounts[status] ?? 0, [statusCounts])

  if (!scene.workstations.length) return <div className="fp-state">{SPATIAL_UNAVAILABLE}</div>

  return <main className={`sw-workspace${editing ? ' is-editing' : ''}`}>
    {searchSlot && createPortal(<FloorSearch index={search} includesPeople onPick={(item) => { selectDesk(item.target.id); reset() }} />, searchSlot)}
    <div className="sw-main">
      <header className="sw-heading">
        <div>
          <p className="fp-eyebrow sw-breadcrumb">{dataset.building.name} <span>/</span> {dataset.layout.floor.name} <span>/</span> {SPATIAL_SCOPE_BREADCRUMB}</p>
          {/* Seat count and scope live in the side panel's summary, not here. */}
          <h2 className="fp-page-title">Mô hình &amp; Nền tảng AI</h2>
        </div>
        <div className="sw-heading-actions">
          <LayoutModeSwitch mode={editor.mode} onChange={changeMode} />
          {editing ? (
            <EditToolbar
              dirty={editor.dirty}
              valid={editor.valid}
              saving={editor.saving}
              changedCount={editor.changedCount}
              invalidCount={invalidCount}
              onCancel={editor.cancel}
              onSave={() => { void editor.save() }}
            />
          ) : (
            <span className="fp-tag sw-preview-label">{SPATIAL_VIEW_LABEL}</span>
          )}
        </div>
      </header>
      <section className="sw-map-panel" aria-label="Không gian bố trí chỗ ngồi">
        <div className="sw-map-top">
          <span><i /> Khu Mô hình &amp; Nền tảng AI</span>
          {editing
            ? <span className="sw-edit-caption">{LAYOUT_EDIT.gridLabel(GRID_CELL_MM)}{desk ? ' · ' : ''}{desk ? <PlacementStatus validation={selectedValidation} codeOf={codeOf} className="is-inline" /> : null}</span>
            : <span className={desk ? 'sw-selected-caption' : undefined}>{desk ? `Đang chọn ${desk.seat.code}` : 'Góc nhìn cố định'}</span>}
        </div>
        <div className="sw-map-stage" ref={stageRef}>
          <WorkspaceScene
            scene={scene}
            desks={desks}
            selectedId={desk?.workstation.id}
            onSelect={selectDesk}
            svgRef={svgRef}
            viewBox={viewBox}
            origin={origin}
            zoom={zoom}
            pan={pan}
            ariaLabel={editing ? 'Chỉnh sửa bố trí · khu Mô hình & Nền tảng AI' : undefined}
            ground={editing ? <EditGround area={area} /> : undefined}
            overlay={editing ? (
              <EditAffordances
                placements={editor.placements}
                selectedId={desk?.workstation.id}
                validation={editor.validation}
                deskHeight={scene.deskHeight}
                dragging={editor.drag?.moved === true}
                onRotate={editor.rotate}
              />
            ) : undefined}
            onKeyDown={onKeyDown}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerCancel}
          />
          {settingsOpen && <div id="fp-map-settings" className="fp-card sw-view-settings"><button type="button" className="fp-icon-btn" aria-label="Đóng cài đặt bản đồ" title="Đóng" onClick={onCloseSettings}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button><strong>Góc nhìn không gian</strong><p>Kéo để di chuyển, cuộn để thu phóng. Góc nhìn được giữ cố định để dễ đối chiếu vị trí.</p><button type="button" className="fp-btn is-wide" onClick={reset}>Vừa khung</button></div>}
          <div className="fp-toolbar sw-map-controls" role="toolbar" aria-label="Điều khiển khung nhìn">
            <div className="fp-btn-group">
              <button type="button" aria-label="Thu nhỏ" title="Thu nhỏ" onClick={() => zoomBy(1 / 1.2)} disabled={zoom <= MIN_ZOOM}>−</button>
              <output aria-label="Mức thu phóng">{Math.round(zoom * 100)}%</output>
              <button type="button" aria-label="Phóng to" title="Phóng to" onClick={() => zoomBy(1.2)} disabled={zoom >= MAX_ZOOM}>+</button>
            </div>
            <button type="button" title="Đưa toàn bộ khu vực vào khung nhìn" onClick={reset}>Vừa khung</button>
          </div>
        </div>
      </section>
    </div>
    <div className="sw-context">
      {editing && desk && (
        <EditInspector
          code={desk.seat.code}
          placement={editor.placements[desk.workstation.id]}
          validation={selectedValidation}
          area={area}
          mmPerPt={dataset.layout.floor.mmPerPt}
          codeOf={codeOf}
          onRotate={() => { editor.rotate(desk.workstation.id); svgRef.current?.focus() }}
        />
      )}
      {editing && !desk && (
        <section className="sw-edit-empty">
          <p className="fp-eyebrow">{LAYOUT_EDIT.selectedTitle}</p>
          <p className="sw-edit-empty-body">{LAYOUT_EDIT.noSelection}</p>
          <p className="sw-edit-hint">{LAYOUT_EDIT.hint}</p>
        </section>
      )}
      {desk && <CompactInspector desk={desk} showHeader={!editing} onClose={() => { onSelect(null); svgRef.current?.focus() }} onVerify={onVerify} />}
      {editing && (
        <p className="sw-edit-note">
          {LAYOUT_EDIT.boundaryNote} {LAYOUT_EDIT.persistenceNote}
        </p>
      )}
      <ScopeSummary count={desks.size} counts={counts}>
        {/*
          * No "pick a desk" prompt: the map already reads as clickable. This
          * only speaks up when a deep link points at a desk outside the crop,
          * where the panel would otherwise look empty for no stated reason.
          */}
        {outsideCrop && (
          <div className="sw-overview">
            <h3 className="sw-empty-title">{SPATIAL_OUT_OF_SCOPE}</h3>
            <p>{SPATIAL_OUT_OF_SCOPE_HINT}</p>
            <button type="button" className="fp-btn is-wide sw-verify" onClick={onVerify}>Đối chiếu trên bản vẽ <span aria-hidden="true">↗</span></button>
          </div>
        )}
      </ScopeSummary>
    </div>
    {exitPrompt && (
      <UnsavedChangesDialog
        onStay={() => setExitPrompt(false)}
        onDiscard={() => { setExitPrompt(false); editor.cancel() }}
      />
    )}
    <p className="fp-sr-only" aria-live="polite">{desk ? `Đã chọn bàn ${desk.seat.code} · ${DESK_STATUS[desk.status].label}` : 'Chưa chọn bàn'}</p>
  </main>
}
