import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { createDemoAllocation } from '../allocation/demoAllocation'
import { FloorSearch } from '../components/FloorSearch'
import { isTypingTarget } from '../components/keyboard'
import { formatDate, initials } from '../components/desk-inspector/format'
import { buildDeskIndex, DESK_STATUSES, type DeskRecord } from '../domain/desk'
import type { EntityRef, FloorDataset, Point } from '../domain/spatial'
import { DESK_STATUS, SEAT_TYPE } from '../labels'
import { ARROW_DIRECTION, nearestInDirection } from '../map/deskNavigation'
import { buildSearchIndex } from '../search/searchIndex'
import { buildSpikeScene, project } from './scene'
import { SeatSymbol, WorkspaceScene } from './WorkspaceScene'
import './workspace.css'

function Status({ desk }: { desk: DeskRecord }) {
  return <span className="sw-status" data-status={desk.status}><svg viewBox="-2 -2 4 4" aria-hidden="true"><SeatSymbol status={desk.status} /></svg>{DESK_STATUS[desk.status].label}</span>
}

function CompactInspector({ desk, onClose, onVerify }: { desk: DeskRecord; onClose: () => void; onVerify: () => void }) {
  const people = desk.status === 'reserved' && desk.reservation ? [desk.reservation] : desk.occupants
  return <aside className="sw-inspector" aria-labelledby="sw-desk-title">
    <header><div><p className="sw-eyebrow">Bàn đang chọn</p><h2 id="sw-desk-title">{desk.seat.code}</h2></div><button type="button" className="sw-close" onClick={onClose} aria-label="Đóng bảng thông tin bàn">×</button></header>
    <Status desk={desk} />
    <div className="sw-person-section">
      <h3>{desk.status === 'reserved' ? 'Nhân sự đặt chỗ' : 'Nhân sự sử dụng'}</h3>
      {people.map(({ employee }) => <div className="sw-person" key={employee.id}><span className="sw-avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><span>{employee.employeeCode} · {employee.jobTitle}</span></div></div>)}
      {desk.status === 'available' && <div className="sw-vacant"><strong>Chỗ ngồi còn trống</strong><p>Chưa có nhân sự được gán</p></div>}
      {desk.status === 'unavailable' && <div className="sw-unavailable"><strong>Tạm ngưng sử dụng</strong><p>{desk.seat.statusReason ?? 'Chỗ ngồi hiện không khả dụng.'}</p></div>}
      {desk.status === 'reserved' && desk.reservation && <p className="sw-detail-note">Từ {formatDate(desk.reservation.assignment.validFrom)}</p>}
      {desk.status === 'conflict' && <p className="sw-conflict-note">Có {desk.occupants.length} phân công cùng hiệu lực tại bàn này.</p>}
    </div>
    <dl className="sw-facts"><div><dt>Khu vực</dt><dd>{desk.zone?.name ?? 'Chưa có nhãn'}</dd></div><div><dt>Bộ phận</dt><dd>{desk.department?.name ?? 'Chưa có dữ liệu'}</dd></div><div><dt>Loại chỗ ngồi</dt><dd>{SEAT_TYPE[desk.seat.seatType]}</dd></div></dl>
    <button type="button" className="sw-verify" onClick={onVerify}>Đối chiếu trên bản vẽ <span aria-hidden="true">↗</span></button>
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
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>([0, 0])
  const drag = useRef<{ id: number; start: Point; last: Point; moved: boolean } | null>(null)
  const desk = selected?.kind === 'workstation' ? desks.get(selected.id) : undefined
  const outsideCrop = selected !== null && !desk
  const reset = () => { setZoom(1); setPan([0, 0]) }
  const zoomBy = (factor: number) => setZoom((z) => Math.min(2, Math.max(0.85, z * factor)))
  const selectDesk = (id: string) => { onSelect({ kind: 'workstation', id }); svgRef.current?.focus() }

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
    setPan(([x, y]) => [Math.max(-80, Math.min(80, x + dx)), Math.max(-60, Math.min(60, y + dy))])
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

  if (!scene.workstations.length) return <div className="fp-state">Bản xem thử không gian hiện chỉ có tại Tầng 16.</div>

  return <main className="sw-workspace">
    {searchSlot && createPortal(<FloorSearch index={search} includesPeople onPick={(item) => { selectDesk(item.target.id); reset() }} />, searchSlot)}
    <header className="sw-heading"><div><p className="sw-eyebrow">{dataset.building.name} <span>/</span> {dataset.layout.floor.name} <span>/</span> Khu vực xem thử</p><h2>Mô hình & Nền tảng AI</h2><p>19 chỗ ngồi · 3 cụm bàn · Một phần khu vực</p></div><span className="sw-preview-label">Bản xem thử không gian</span></header>
    <div className="sw-body">
      <section className="sw-map-panel" aria-label="Không gian bố trí chỗ ngồi">
        <div className="sw-map-top"><span><i /> Khu Mô hình & Nền tảng AI</span><span className={desk ? 'sw-selected-caption' : undefined}>{desk ? `Đang chọn ${desk.seat.code}` : 'Góc nhìn cố định'}</span></div>
        <div className="sw-map-stage">
          <WorkspaceScene scene={scene} desks={desks} selectedId={desk?.workstation.id} onSelect={selectDesk} svgRef={svgRef} zoom={zoom} pan={pan} onKeyDown={onKeyDown} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null }} />
          {settingsOpen && <div id="fp-map-settings" className="sw-view-settings"><button type="button" className="sw-close" aria-label="Đóng cài đặt bản đồ" onClick={onCloseSettings}>×</button><strong>Góc nhìn không gian</strong><p>Kéo để di chuyển, cuộn để thu phóng. Góc nhìn được giữ cố định để dễ đối chiếu vị trí.</p><button type="button" className="sw-verify" onClick={reset}>Vừa khung</button></div>}
          <div className="sw-map-controls" aria-label="Điều khiển góc nhìn"><button type="button" aria-label="Thu nhỏ" onClick={() => zoomBy(1 / 1.2)} disabled={zoom <= 0.85}>−</button><output aria-label="Mức thu phóng">{Math.round(zoom * 100)}%</output><button type="button" aria-label="Phóng to" onClick={() => zoomBy(1.2)} disabled={zoom >= 2}>+</button><button type="button" onClick={reset}>Vừa khung</button></div>
        </div>
        <div className="sw-legend" aria-label="Trạng thái trong phạm vi xem thử">{DESK_STATUSES.map((status) => <div key={status} data-status={status}><svg viewBox="-2 -2 4 4" aria-hidden="true"><SeatSymbol status={status} /></svg><span>{DESK_STATUS[status].label}</span><b>{[...desks.values()].filter((d) => d.status === status).length}</b></div>)}</div>
        <footer className="sw-map-foot"><span id="sw-map-help">Nhấp vào bàn để xem thông tin · Phím mũi tên để chuyển bàn</span><span className="sw-boundary-key"><i /> Ranh giới khu vực</span></footer>
      </section>
      <div className="sw-context">
        {desk ? <CompactInspector desk={desk} onClose={() => { onSelect(null); svgRef.current?.focus() }} onVerify={onVerify} /> : <aside className="sw-overview" aria-label="Tổng quan khu vực xem thử">
          <p className="sw-eyebrow">Trong phạm vi xem thử</p><div className="sw-capacity"><strong>{desks.size}</strong><span>chỗ ngồi</span></div>
          <div className="sw-occupancy-bar" aria-hidden="true">{DESK_STATUSES.map((s) => <span key={s} data-status={s} style={{ flex: [...desks.values()].filter((d) => d.status === s).length }} />)}</div>
          <h3>{outsideCrop ? 'Vị trí ở ngoài phạm vi xem thử' : 'Chọn một bàn trên mặt bằng'}</h3><p>{outsideCrop ? 'Chuyển sang bản vẽ để xem vị trí đang chọn.' : 'Xem trạng thái chỗ ngồi, nhân sự và bộ phận tại từng vị trí.'}</p>
          {outsideCrop && <button type="button" className="sw-verify" onClick={onVerify}>Đối chiếu trên bản vẽ ↗</button>}
          <div className="sw-overview-note"><strong>Cách đọc mặt bằng</strong><p><span className="sw-example-avatar">NM</span> Ký hiệu nhân sự: bàn đang sử dụng</p><p><span className="sw-example-empty">○</span> Vòng tròn rỗng: bàn còn trống</p></div>
        </aside>}
        <div className="sw-scope-note"><span className="sw-scope-line" /><p><strong>Một phần mặt bằng Tầng 16</strong><br />Vị trí bàn, ghế và ranh giới theo bản vẽ hiện có. Nhân sự và trạng thái là dữ liệu minh họa.</p></div>
      </div>
    </div>
    <p className="fp-sr-only" aria-live="polite">{desk ? `Đã chọn bàn ${desk.seat.code} · ${DESK_STATUS[desk.status].label}` : 'Chưa chọn bàn'}</p>
  </main>
}
