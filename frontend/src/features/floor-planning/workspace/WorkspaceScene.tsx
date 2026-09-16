import { memo, useId, useMemo, type KeyboardEvent, type RefObject } from 'react'
import type { DeskRecord, DeskStatus } from '../domain/desk'
import type { Point, Workstation } from '../domain/spatial'
import { DESK_STATUS, SCENE_CROP_CAPTION, SCENE_ZONE_CAPTION } from '../labels'
import { initials } from '../components/desk-inspector/format'
import {
  CROP_LABEL_OFFSET,
  MARKER_RADIUS,
  planeTransform,
  points,
  projectedPoints,
  rectangle,
  SPIKE_CROP,
  type SpikeScene,
  type MemoizedDesk,
  type MemoizedChair,
  type MemoizedPrism,
  memoizeSceneGeometry,
} from './scene'

/** Used until the stage has been measured, and by environments without layout. */
export const SCENE_VIEWBOX = '-39 -7 138 95'

function Line({ a, b, ...props }: { a: Point; b: Point; stroke?: string; strokeWidth?: number }) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...props} />
}

const MemoizedPrism = memo(function MemoizedPrism({
  prism,
  fill,
  edge = '#aab5be',
}: {
  prism: MemoizedPrism
  fill: string
  edge?: string
}) {
  return (
    <g stroke={edge} strokeWidth={0.12} strokeLinejoin="round">
      {prism.faces.map(({ points: pts, fill: faceFill }, i) => (
        <polygon key={i} points={pts} fill={faceFill} />
      ))}
      <polygon points={prism.topPoints} fill={fill} />
    </g>
  )
})

export function SeatSymbol({ status }: { status: DeskStatus }) {
  switch (status) {
    case 'occupied': return <><circle cy={-0.5} r={0.48} fill="currentColor" /><path d="M-0.85 0.95v-.2a.85.85 0 0 1 1.7 0v.2" fill="currentColor" /></>
    case 'available': return <circle r={0.83} fill="none" stroke="currentColor" strokeWidth={0.27} />
    case 'reserved': return <><circle r={0.96} fill="none" stroke="currentColor" strokeWidth={0.23} /><path d="M0-.65V0l.5.3" fill="none" stroke="currentColor" strokeWidth={0.23} /></>
    case 'conflict': return <><path d="M0-1.1 1.15.95H-1.15Z" fill="currentColor" /><path d="M0-.5V.2M0 .45V.65" stroke="white" strokeWidth={0.23} /></>
    case 'unavailable': return <><circle r={0.96} fill="none" stroke="currentColor" strokeWidth={0.23} /><path d="m-.65.65 1.3-1.3" stroke="currentColor" strokeWidth={0.23} /></>
  }
}

const Chair = memo(function Chair({ geom }: { geom: MemoizedChair }) {
  return (
    <g className="sw-chair">
      <polygon points={geom.shadowPoints} fill="#253849" opacity={0.09} />
      <Line a={geom.stem.a} b={geom.stem.b} stroke="#647785" strokeWidth={0.55} />
      <MemoizedPrism prism={geom.prism} fill="#657887" edge="#536572" />
      <polygon points={geom.backPoints} fill="#536674" stroke="#465a69" strokeWidth={0.15} strokeLinejoin="round" />
    </g>
  )
})

const FILL: Record<DeskStatus, string> = {
  occupied: '#dae5ef', available: '#f6fcf9', reserved: '#f8ecd1', conflict: '#f6dfdc', unavailable: '#e1e5e7',
}

const Desktop = memo(function Desktop({ desk, geom }: { desk: DeskRecord; geom: MemoizedDesk }) {
  return (
    <g className="sw-desktop">
      <polygon points={geom.shadowPoints} fill="#233c50" opacity={0.09} />
      {geom.legs.map((leg, i) => (
        <Line key={i} a={leg.a} b={leg.b} stroke="#899ba7" strokeWidth={0.35} />
      ))}
      <MemoizedPrism prism={geom.prism} fill={FILL[desk.status]} />
      <text x={geom.codePos[0]} y={geom.codePos[1] + 0.6} textAnchor="middle" className="sw-desk-code">
        {desk.seat.code.split('-').at(-1)}
      </text>
    </g>
  )
})

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

const Marker = memo(function Marker({
  ws,
  desk,
  pos,
  isSelected,
  onSelect,
}: {
  ws: Workstation
  desk: DeskRecord
  pos: Point
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <g
      data-workstation-id={ws.id}
      data-status={desk.status}
      className={`sw-marker${isSelected ? ' is-selected' : ''}`}
      transform={`translate(${pos[0]} ${pos[1]})`}
      role="button"
      tabIndex={-1}
      aria-label={`Bàn ${desk.seat.code} · ${DESK_STATUS[desk.status].label}`}
      aria-pressed={isSelected}
      onClick={(e) => {
        if (e.detail === 0) onSelect(ws.id)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(ws.id)
        }
      }}
    >
      <title>
        {desk.seat.code} · {DESK_STATUS[desk.status].label}
        {desk.occupants[0] ? ` · ${desk.occupants[0].employee.name}` : ''}
      </title>
      <circle className="sw-marker-disc" r={MARKER_RADIUS} />
      {desk.status === 'occupied' && desk.occupants[0] ? (
        <text textAnchor="middle" y={0.48} className="sw-avatar-text">
          {initials(desk.occupants[0].employee.name)}
        </text>
      ) : (
        <SeatSymbol status={desk.status} />
      )}
    </g>
  )
})

export function WorkspaceScene({ scene, desks, selectedId, onSelect, svgRef, viewBox, origin, zoom, pan, onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  scene: SpikeScene
  desks: ReadonlyMap<string, DeskRecord>
  selectedId?: string
  onSelect: (id: string) => void
  svgRef: RefObject<SVGSVGElement | null>
  /** framing for the current stage size; see fitViewBox in ./scene */
  viewBox: string
  /** scene point the zoom is anchored on */
  origin: Point
  zoom: number
  pan: Point
  onKeyDown: (e: KeyboardEvent<SVGSVGElement>) => void
  onPointerDown: React.PointerEventHandler<SVGSVGElement>
  onPointerMove: React.PointerEventHandler<SVGSVGElement>
  onPointerUp: React.PointerEventHandler<SVGSVGElement>
  onPointerCancel: React.PointerEventHandler<SVGSVGElement>
}) {
  const clipId = useId()
  const geometry = useMemo(() => memoizeSceneGeometry(scene), [scene])

  return (
    <svg
      ref={svgRef}
      className="sw-scene"
      viewBox={viewBox}
      role="application"
      aria-label="Bố trí chỗ ngồi · 19 bàn khu Mô hình & Nền tảng AI"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={SPIKE_CROP[0]} y={SPIKE_CROP[1]} width={SPIKE_CROP[2] - SPIKE_CROP[0]} height={SPIKE_CROP[3] - SPIKE_CROP[1]} />
        </clipPath>
      </defs>
      <g
        className="sw-scene-content"
        transform={`translate(${pan[0]} ${pan[1]}) translate(${origin[0]} ${origin[1]}) scale(${zoom}) translate(${-origin[0]} ${-origin[1]})`}
        style={{
          transform: `translate3d(${pan[0]}px, ${pan[1]}px, 0px) translate3d(${origin[0]}px, ${origin[1]}px, 0px) scale3d(${zoom}, ${zoom}, 1) translate3d(${-origin[0]}px, ${-origin[1]}px, 0px)`,
          transformBox: 'view-box',
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        <Architecture scene={scene} clipId={clipId} />
        {geometry.items.map((item) => {
          const desk = desks.get(item.ws.id)
          if (!desk) return null
          return (
            <g key={`${item.ws.id}-${item.kind}`} data-workstation-id={item.ws.id} className="sw-furniture" data-status={desk.status}>
              {item.kind === 'desk' && item.deskGeom ? (
                <Desktop desk={desk} geom={item.deskGeom} />
              ) : item.chairGeom ? (
                <Chair geom={item.chairGeom} />
              ) : null}
            </g>
          )
        })}
        {selectedId && geometry.selectionPolygons.has(selectedId) && (
          <g className="sw-selection" fill="none" strokeLinejoin="round" pointerEvents="none" aria-hidden="true">
            <polygon points={geometry.selectionPolygons.get(selectedId)!} stroke="white" strokeWidth={1.25} />
            <polygon points={geometry.selectionPolygons.get(selectedId)!} stroke="#245bb7" strokeWidth={0.55} />
          </g>
        )}
        {/* Upright symbols remain legible at this fixed camera angle. */}
        {geometry.markers.map(({ ws, pos }) => {
          const desk = desks.get(ws.id)
          if (!desk) return null
          return (
            <Marker
              key={ws.id}
              ws={ws}
              desk={desk}
              pos={pos}
              isSelected={selectedId === ws.id}
              onSelect={onSelect}
            />
          )
        })}
        <g aria-hidden="true" className="sw-plane-label" transform={`translate(${geometry.zoneCaptionPos[0]} ${geometry.zoneCaptionPos[1]})`}>
          <text>{SCENE_ZONE_CAPTION}</text>
          <path d="M0 1.2v2.9" stroke="#7c9bb6" strokeWidth={0.2} />
        </g>
        <text aria-hidden="true" x={geometry.cropCaptionPos[0]} y={geometry.cropCaptionPos[1] + CROP_LABEL_OFFSET} className="sw-crop-label" textAnchor="middle">
          {SCENE_CROP_CAPTION}
        </text>
      </g>
    </svg>
  )
}
