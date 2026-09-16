import { memo, useId, type KeyboardEvent, type RefObject } from 'react'
import type { DeskRecord, DeskStatus } from '../domain/desk'
import type { Point, Workstation } from '../domain/spatial'
import { DESK_STATUS } from '../labels'
import { initials } from '../components/desk-inspector/format'
import { planeTransform, points, project, projectedPoints, rectangle, SPIKE_CROP, type SpikeScene } from './scene'

export const SCENE_VIEWBOX = '-39 -7 138 95'

function Line({ a, b, ...props }: { a: Point; b: Point; stroke?: string; strokeWidth?: number }) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...props} />
}

/** Only adds height. The top face always uses the original source polygon. */
function Prism({ polygon, height, bottom, fill, edge = '#aab5be' }: {
  polygon: Point[]; height: number; bottom: number; fill: string; edge?: string
}) {
  const faces = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length]
    return { a, b, depth: project(a)[1] + project(b)[1] }
  }).sort((a, b) => a.depth - b.depth)
  return <g stroke={edge} strokeWidth={0.12} strokeLinejoin="round">
    {faces.map(({ a, b }, i) => <polygon key={i} points={points([project(a, bottom), project(b, bottom), project(b, height), project(a, height)])} fill={i % 2 ? '#bbc7d0' : '#d2dbe1'} />)}
    <polygon points={projectedPoints(polygon, height)} fill={fill} />
  </g>
}

export function SeatSymbol({ status }: { status: DeskStatus }) {
  switch (status) {
    case 'occupied': return <><circle cy={-0.5} r={0.48} fill="currentColor" /><path d="M-0.85 0.95v-.2a.85.85 0 0 1 1.7 0v.2" fill="currentColor" /></>
    case 'available': return <circle r={0.83} fill="none" stroke="currentColor" strokeWidth={0.27} />
    case 'reserved': return <><circle r={0.96} fill="none" stroke="currentColor" strokeWidth={0.23} /><path d="M0-.65V0l.5.3" fill="none" stroke="currentColor" strokeWidth={0.23} /></>
    case 'conflict': return <><path d="M0-1.1 1.15.95H-1.15Z" fill="currentColor" /><path d="M0-.5V.2M0 .45V.65" stroke="white" strokeWidth={0.23} /></>
    case 'unavailable': return <><circle r={0.96} fill="none" stroke="currentColor" strokeWidth={0.23} /><path d="m-.65.65 1.3-1.3" stroke="currentColor" strokeWidth={0.23} /></>
  }
}

function Chair({ ws, height }: { ws: Workstation; height: number }) {
  if (!ws.chair) return null
  const { center, bbox } = ws.chair
  const polygon = rectangle(bbox)
  const dx = center[0] - ws.center[0]
  const dy = center[1] - ws.center[1]
  const back = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? [polygon[1], polygon[2]] : [polygon[3], polygon[0]])
    : (dy > 0 ? [polygon[2], polygon[3]] : [polygon[0], polygon[1]])
  return <g className="sw-chair">
    <polygon points={projectedPoints(polygon)} fill="#253849" opacity={0.09} />
    <Line a={project(center, 0.5)} b={project(center, height)} stroke="#647785" strokeWidth={0.55} />
    <Prism polygon={polygon} height={height} bottom={height - 0.5} fill="#657887" edge="#536572" />
    <polygon points={points([project(back[0], height), project(back[1], height), project(back[1], height + 3), project(back[0], height + 3)])} fill="#536674" stroke="#465a69" strokeWidth={0.15} strokeLinejoin="round" />
  </g>
}

const FILL: Record<DeskStatus, string> = {
  occupied: '#dae5ef', available: '#f6fcf9', reserved: '#f8ecd1', conflict: '#f6dfdc', unavailable: '#e1e5e7',
}

function Desktop({ desk, height }: { desk: DeskRecord; height: number }) {
  const ws = desk.workstation
  const [cx, cy] = ws.center
  const [x, y] = project(ws.center, height + 0.5)
  return <g className="sw-desktop">
    <polygon points={projectedPoints(ws.polygon)} fill="#233c50" opacity={0.09} />
    {ws.polygon.map(([px, py], i) => {
      const p: Point = [px + (cx - px) * 0.14, py + (cy - py) * 0.14]
      return <Line key={i} a={project(p, 0)} b={project(p, height)} stroke="#899ba7" strokeWidth={0.35} />
    })}
    <Prism polygon={ws.polygon} height={height} bottom={height - 0.5} fill={FILL[desk.status]} />
    <text x={x} y={y + 0.6} textAnchor="middle" className="sw-desk-code">{desk.seat.code.split('-').at(-1)}</text>
  </g>
}

const Architecture = memo(function Architecture({ scene, clipId }: { scene: SpikeScene; clipId: string }) {
  return <g aria-hidden="true">
    <polygon points={projectedPoints(rectangle(SPIKE_CROP), -0.8)} fill="#c7d3dd" />
    <g transform={planeTransform()} clipPath={`url(#${clipId})`}>
      <rect x={SPIKE_CROP[0]} y={SPIKE_CROP[1]} width={SPIKE_CROP[2] - SPIKE_CROP[0]} height={SPIKE_CROP[3] - SPIKE_CROP[1]} fill="#f5f7f8" />
      {scene.zones.map((z) => <polygon key={z.id} points={points(z.polygon)} fill="#e5edf4" stroke="#7c9bb6" strokeWidth={0.35} strokeDasharray="1.5 1" />)}
      {scene.rooms.map((r) => <polygon key={r.id} points={points(r.polygon)} fill="#edf0f2" stroke="#8d9ba6" strokeWidth={0.35} />)}
      {scene.layers.map((l) => <path key={l.id} d={l.d} fill="none" stroke={l.id === 'structure' ? '#c6d1d9' : '#a0b0bc'} strokeWidth={l.id === 'facade' ? 0.16 : 0.12} />)}
      {scene.zones.map((z) => <polygon key={`boundary-${z.id}`} points={points(z.polygon)} fill="none" stroke="#658aa8" strokeWidth={0.5} strokeDasharray="1.8 1.2" />)}
    </g>
    {/* Low relief uses the exact wall paths; it does not close openings or infer walls from zone boundaries. */}
    <g transform={planeTransform(2.5)} clipPath={`url(#${clipId})`} fill="none" stroke="#96a7b4" strokeWidth={0.4}>
      {scene.layers.filter((l) => l.id === 'walls' || l.id === 'partitions').map((l) => <path key={l.id} d={l.d} />)}
    </g>
  </g>
})

export function WorkspaceScene({ scene, desks, selectedId, onSelect, svgRef, zoom, pan, onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  scene: SpikeScene
  desks: ReadonlyMap<string, DeskRecord>
  selectedId?: string
  onSelect: (id: string) => void
  svgRef: RefObject<SVGSVGElement | null>
  zoom: number
  pan: Point
  onKeyDown: (e: KeyboardEvent<SVGSVGElement>) => void
  onPointerDown: React.PointerEventHandler<SVGSVGElement>
  onPointerMove: React.PointerEventHandler<SVGSVGElement>
  onPointerUp: React.PointerEventHandler<SVGSVGElement>
  onPointerCancel: React.PointerEventHandler<SVGSVGElement>
}) {
  const clipId = useId()
  const selected = scene.workstations.find((w) => w.id === selectedId)
  const objects = scene.workstations.flatMap((ws) => [
    { ws, kind: 'desk', depth: project(ws.center)[1] },
    ...(ws.chair ? [{ ws, kind: 'chair', depth: project(ws.chair.center)[1] }] : []),
  ]).sort((a, b) => a.depth - b.depth)
  return <svg ref={svgRef} className="sw-scene" viewBox={SCENE_VIEWBOX} role="application" aria-label="Bố trí chỗ ngồi · 19 bàn khu Mô hình & Nền tảng AI" aria-describedby="sw-map-help" tabIndex={0}
    onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
    <defs><clipPath id={clipId}><rect x={SPIKE_CROP[0]} y={SPIKE_CROP[1]} width={SPIKE_CROP[2] - SPIKE_CROP[0]} height={SPIKE_CROP[3] - SPIKE_CROP[1]} /></clipPath></defs>
    <g transform={`translate(${pan[0]} ${pan[1]}) translate(31 40) scale(${zoom}) translate(-31 -40)`}>
      <Architecture scene={scene} clipId={clipId} />
      {objects.map(({ ws, kind }) => {
        const desk = desks.get(ws.id)
        if (!desk) return null
        return <g key={`${ws.id}-${kind}`} data-workstation-id={ws.id} className="sw-furniture" data-status={desk.status}>
          {kind === 'desk' ? <Desktop desk={desk} height={scene.deskHeight} /> : <Chair ws={ws} height={scene.chairHeight} />}
        </g>
      })}
      {selected && <g className="sw-selection" fill="none" strokeLinejoin="round" pointerEvents="none" aria-hidden="true">
        <polygon points={projectedPoints(selected.polygon, scene.deskHeight + 0.15)} stroke="white" strokeWidth={1.25} />
        <polygon points={projectedPoints(selected.polygon, scene.deskHeight + 0.15)} stroke="#245bb7" strokeWidth={0.55} />
      </g>}
      {/* Upright symbols remain legible at this fixed camera angle. */}
      {scene.workstations.map((ws) => {
        const desk = desks.get(ws.id)
        if (!desk) return null
        const [x, y] = project(ws.chair?.center ?? ws.center, scene.chairHeight + 5)
        return <g key={ws.id} data-workstation-id={ws.id} data-status={desk.status} className={`sw-marker${selectedId === ws.id ? ' is-selected' : ''}`} transform={`translate(${x} ${y})`}
          role="button" tabIndex={-1} aria-label={`Bàn ${desk.seat.code} · ${DESK_STATUS[desk.status].label}`} aria-pressed={selectedId === ws.id}
          onClick={(e) => { if (e.detail === 0) onSelect(ws.id) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ws.id) } }}>
          <title>{desk.seat.code} · {DESK_STATUS[desk.status].label}{desk.occupants[0] ? ` · ${desk.occupants[0].employee.name}` : ''}</title>
          <circle className="sw-marker-disc" r={1.85} />
          {desk.status === 'occupied' && desk.occupants[0]
            ? <text textAnchor="middle" y={0.48} className="sw-avatar-text">{initials(desk.occupants[0].employee.name)}</text>
            : <SeatSymbol status={desk.status} />}
        </g>
      })}
      <g aria-hidden="true" className="sw-plane-label" transform={`translate(${project([924, 230])[0]} ${project([924, 230])[1]})`}>
        <text>RANH GIỚI KHU AI</text>
        <path d="M0 1.2v2.9" stroke="#7c9bb6" strokeWidth={0.2} />
      </g>
      <text aria-hidden="true" x={project([940, 293])[0]} y={project([940, 293])[1] + 5} className="sw-crop-label" textAnchor="middle">Mặt bằng tiếp tục · Phạm vi xem thử</text>
    </g>
  </svg>
}
