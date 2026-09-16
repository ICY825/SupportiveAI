import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { createDemoAllocation } from '../allocation/demoAllocation'
import { FloorSearch } from '../components/FloorSearch'
import { isTypingTarget } from '../components/keyboard'
import { formatDate, initials } from '../components/desk-inspector/format'
import { buildDeskIndex, DESK_STATUSES, type DeskRecord } from '../domain/desk'
import type { BBox, EntityRef, FloorDataset, Point } from '../domain/spatial'
import {
  DESK_STATUS,
  SEAT_TYPE,
  SPATIAL_OUT_OF_SCOPE,
  SPATIAL_OUT_OF_SCOPE_HINT,
  SPATIAL_SCOPE_BREADCRUMB,
  SPATIAL_SCOPE_LABEL,
  SPATIAL_UNAVAILABLE,
  SPATIAL_VIEW_LABEL,
} from '../labels'
import { ARROW_DIRECTION, nearestInDirection } from '../map/deskNavigation'
import { buildSearchIndex } from '../search/searchIndex'
import { buildSpikeScene, fitViewBox, project, sceneBounds } from './scene'
import { SCENE_VIEWBOX, SeatSymbol, WorkspaceScene } from './WorkspaceScene'
import './workspace.css'

/** Screen-pixel margin left around the fitted scene. Matches the verification map. */
const SCENE_PADDING = 20
const MIN_ZOOM = 0.85
const MAX_ZOOM = 2.5
/** Pan limit as a share of the framed scene, so it scales with the stage. */
const PAN_LIMIT = 0.3

function Status({ desk }: { desk: DeskRecord }) {
  return <span className="fp-chip sw-status" data-status={desk.status}><svg viewBox="-2 -2 4 4" aria-hidden="true"><SeatSymbol status={desk.status} /></svg>{DESK_STATUS[desk.status].label}</span>
}

function CompactInspector({ desk, onClose, onVerify }: { desk: DeskRecord; onClose: () => void; onVerify: () => void }) {
  const people = desk.status === 'reserved' && desk.reservation ? [desk.reservation] : desk.occupants
  return <aside className="sw-inspector" aria-labelledby="sw-desk-title">
    <header className="fp-card-head"><div><p className="fp-eyebrow">Bàn đang chọn</p><h2 id="sw-desk-title" className="fp-card-title">{desk.seat.code}</h2></div><button type="button" className="fp-icon-btn" onClick={onClose} aria-label="Đóng bảng thông tin bàn" title="Đóng (Esc)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button></header>
    <Status desk={desk} />
    <div className="sw-person-section">
      <h3 className="fp-section-title">{desk.status === 'reserved' ? 'Nhân sự đặt chỗ' : 'Nhân sự sử dụng'}</h3>
      {people.map(({ employee }) => <div className="sw-person" key={employee.id}><span className="sw-avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><span>{employee.employeeCode} · {employee.jobTitle}</span></div></div>)}
      {desk.status === 'available' && <div className="sw-vacant"><strong>Chỗ ngồi còn trống</strong><p>Chưa có nhân sự được gán</p></div>}
      {desk.status === 'unavailable' && <div className="sw-unavailable"><strong>Tạm ngưng sử dụng</strong><p>{desk.seat.statusReason ?? 'Chỗ ngồi hiện không khả dụng.'}</p></div>}
      {desk.status === 'reserved' && desk.reservation && <p className="sw-detail-note">Từ {formatDate(desk.reservation.assignment.validFrom)}</p>}
      {desk.status === 'conflict' && <p className="sw-conflict-note">Có {desk.occupants.length} phân công cùng hiệu lực tại bàn này.</p>}
    </div>
    <dl className="fp-facts"><div><dt>Khu vực</dt><dd>{desk.zone?.name ?? 'Chưa có nhãn'}</dd></div><div><dt>Bộ phận</dt><dd>{desk.department?.name ?? 'Chưa có dữ liệu'}</dd></div><div><dt>Loại chỗ ngồi</dt><dd>{SEAT_TYPE[desk.seat.seatType]}</dd></div></dl>
    <button type="button" className="fp-btn is-wide sw-verify" onClick={onVerify}>Đối chiếu trên bản vẽ <span aria-hidden="true">↗</span></button>
    <p className="sw-inspector-note">Thông tin bố trí minh họa · Chỉ xem</p>
  </aside>
}

export function SpatialWorkspace({ dataset, selected, onSelect, onVerify, searchSlot, settingsOpen, onCloseSettings }: {
  dataset: FloorDataset
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
  onVerify: () => void
  searchSlot: HTMLElement | null
  settingsOpen: boolean
  onCloseSettings: () => void
}) {
  const [now] = useState(() => new Date())
  const scene = useMemo(() => buildSpikeScene(dataset), [dataset])
  const desks = useMemo(() => {
    const all = buildDeskIndex(dataset, createDemoAllocation(dataset, now), now)
    return new Map(scene.workstations.flatMap((w) => all.has(w.id) ? [[w.id, all.get(w.id)!] as const] : []))
  }, [dataset, scene, now])
  const search = useMemo(() => buildSearchIndex(dataset, desks).filter((item) => item.target.kind === 'workstation' && desks.has(item.target.id)), [dataset, desks])
  const svgRef = useRef<SVGSVGElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>([0, 0])
  const drag = useRef<{ id: number; start: Point; last: Point; moved: boolean } | null>(null)
  const desk = selected?.kind === 'workstation' ? desks.get(selected.id) : undefined
  const outsideCrop = selected !== null && !desk
  const reset = () => { setZoom(1); setPan([0, 0]) }
  const zoomBy = (factor: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)))
  const selectDesk = (id: string) => { onSelect({ kind: 'workstation', id }); svgRef.current?.focus() }

  // The scene is framed from its own geometry, so it fills whatever stage it gets.
  const bounds = useMemo<BBox>(() => sceneBounds(scene), [scene])
  const frame = useMemo(() => (stage ? fitViewBox(bounds, stage, SCENE_PADDING) : null), [bounds, stage])
  const viewBox = frame ? frame.join(' ') : SCENE_VIEWBOX
  const origin: Point = frame ? [frame[0] + frame[2] / 2, frame[1] + frame[3] / 2] : [31, 40]
  const panLimit: Point = frame ? [frame[2] * PAN_LIMIT, frame[3] * PAN_LIMIT] : [80, 60]

  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setStage({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !isTypingTarget(e.target)) onSelect(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.001)) }
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  }, [])

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const direction = ARROW_DIRECTION[e.key]
    if (!direction) return
    e.preventDefault()
    const candidates = scene.workstations.map((w) => ({ id: w.id, center: project(w.center) }))
    const from = desk ? project(desk.workstation.center) : null
    const next = from ? nearestInDirection(from, direction, candidates, desk?.workstation.id) : candidates[0]
    if (next) { selectDesk(next.id); reset() }
  }
  const pointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    drag.current = { id: e.pointerId, start: [e.clientX, e.clientY], last: [e.clientX, e.clientY], moved: false }
  }
  const pointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (Math.hypot(e.clientX - d.start[0], e.clientY - d.start[1]) > 4) d.moved = true
    if (!d.moved) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const scale = e.currentTarget.getScreenCTM()?.a ?? 1
    const dx = (e.clientX - d.last[0]) / scale
    const dy = (e.clientY - d.last[1]) / scale
    setPan(([x, y]) => [
      Math.max(-panLimit[0], Math.min(panLimit[0], x + dx)),
      Math.max(-panLimit[1], Math.min(panLimit[1], y + dy)),
    ])
    d.last = [e.clientX, e.clientY]
  }
  const pointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (d.moved) return
    const id = (e.target as Element).closest('[data-workstation-id]')?.getAttribute('data-workstation-id')
    if (id) selectDesk(id)
    else onSelect(null)
  }

  if (!scene.workstations.length) return <div className="fp-state">{SPATIAL_UNAVAILABLE}</div>

  const counts = (status: DeskRecord['status']) => [...desks.values()].filter((d) => d.status === status).length

  return <main className="sw-workspace">
    {searchSlot && createPortal(<FloorSearch index={search} includesPeople onPick={(item) => { selectDesk(item.target.id); reset() }} />, searchSlot)}
    <div className="sw-main">
      <header className="sw-heading">
        <div>
          <p className="fp-eyebrow sw-breadcrumb">{dataset.building.name} <span>/</span> {dataset.layout.floor.name} <span>/</span> {SPATIAL_SCOPE_BREADCRUMB}</p>
          <h2 className="fp-page-title">Mô hình &amp; Nền tảng AI</h2>
          <p className="sw-heading-meta">{desks.size} chỗ ngồi · 3 cụm bàn · Một phần khu vực</p>
        </div>
        <span className="fp-tag sw-preview-label">{SPATIAL_VIEW_LABEL}</span>
      </header>
      <section className="sw-map-panel" aria-label="Không gian bố trí chỗ ngồi">
        <div className="sw-map-top"><span><i /> Khu Mô hình &amp; Nền tảng AI</span><span className={desk ? 'sw-selected-caption' : undefined}>{desk ? `Đang chọn ${desk.seat.code}` : 'Góc nhìn cố định'}</span></div>
        <div className="sw-map-stage" ref={stageRef}>
          <WorkspaceScene scene={scene} desks={desks} selectedId={desk?.workstation.id} onSelect={selectDesk} svgRef={svgRef} viewBox={viewBox} origin={origin} zoom={zoom} pan={pan} onKeyDown={onKeyDown} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null }} />
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
        <div className="sw-legend" role="group" aria-label={`Trạng thái chỗ ngồi · ${SPATIAL_SCOPE_LABEL}`}>{DESK_STATUSES.map((status) => <div key={status} data-status={status} title={DESK_STATUS[status].hint}><svg viewBox="-2 -2 4 4" aria-hidden="true"><SeatSymbol status={status} /></svg><span>{DESK_STATUS[status].label}</span><b>{counts(status)}</b></div>)}</div>
        <footer className="sw-map-foot"><span id="sw-map-help">Nhấp vào bàn để xem thông tin · Phím mũi tên để chuyển bàn</span><span className="sw-boundary-key"><i /> Ranh giới khu vực</span></footer>
      </section>
    </div>
    <div className="sw-context">
      {desk ? <CompactInspector desk={desk} onClose={() => { onSelect(null); svgRef.current?.focus() }} onVerify={onVerify} /> : <aside className="sw-overview" aria-label={`Tổng quan · ${SPATIAL_SCOPE_LABEL}`}>
        <p className="fp-eyebrow">{SPATIAL_SCOPE_LABEL}</p><div className="sw-capacity"><strong>{desks.size}</strong><span>chỗ ngồi</span></div>
        <div className="sw-occupancy-bar" aria-hidden="true">{DESK_STATUSES.map((s) => <span key={s} data-status={s} style={{ flex: counts(s) }} />)}</div>
        <h3 className="sw-empty-title">{outsideCrop ? SPATIAL_OUT_OF_SCOPE : 'Chọn một bàn trên mặt bằng'}</h3><p>{outsideCrop ? SPATIAL_OUT_OF_SCOPE_HINT : 'Xem trạng thái chỗ ngồi, nhân sự và bộ phận tại từng vị trí.'}</p>
        {outsideCrop && <button type="button" className="fp-btn is-wide sw-verify" onClick={onVerify}>Đối chiếu trên bản vẽ <span aria-hidden="true">↗</span></button>}
        <div className="sw-overview-note"><strong>Cách đọc mặt bằng</strong><p><span className="sw-example-avatar">NM</span> Ký hiệu nhân sự: bàn đang sử dụng</p><p><span className="sw-example-empty">○</span> Vòng tròn rỗng: bàn còn trống</p></div>
      </aside>}
      <div className="sw-scope-note"><span className="sw-scope-line" /><p><strong>Một phần mặt bằng Tầng 16</strong><br />Vị trí bàn, ghế và ranh giới theo bản vẽ hiện có. Nhân sự và trạng thái là dữ liệu minh họa.</p></div>
    </div>
    <p className="fp-sr-only" aria-live="polite">{desk ? `Đã chọn bàn ${desk.seat.code} · ${DESK_STATUS[desk.status].label}` : 'Chưa chọn bàn'}</p>
  </main>
}
