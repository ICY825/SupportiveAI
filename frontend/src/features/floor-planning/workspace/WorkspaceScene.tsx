import { memo, useId, useMemo, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { initials } from '../components/desk-inspector/format'
import type { DeskRecord, DeskStatus } from '../domain/desk'
import type { Point, Workstation } from '../domain/spatial'
import { DESK_STATUS } from '../labels'
import {
  MARKER_RADIUS,
  memoizeSceneGeometry,
  labelAnchorInView,
  planeTransform,
  points,
  project,
  roomLabelAnchor,
  projectedPoints,
  rectangle,
  type MemoizedChair,
  type MemoizedDesk,
  type MemoizedPrism,
  type WorkspaceDetailTier,
  type WorkspaceSceneModel,
} from './scene'

function Line({ a, b, ...props }: { a: Point; b: Point; stroke?: string; strokeWidth?: number }) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...props} />
}

const Prism = memo(function Prism({ prism, fill, edge = '#aab5be' }: {
  prism: MemoizedPrism
  fill: string
  edge?: string
}) {
  return (
    <g stroke={edge} strokeWidth={0.12} strokeLinejoin="round">
      {prism.faces.map(({ points: facePoints, fill: faceFill }, index) => (
        <polygon key={index} points={facePoints} fill={faceFill} />
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

const Chair = memo(function Chair({ geometry }: { geometry: MemoizedChair }) {
  return (
    <g className="sw-chair">
      <polygon points={geometry.shadowPoints} fill="#253849" opacity={0.09} />
      <Line a={geometry.stem.a} b={geometry.stem.b} stroke="#647785" strokeWidth={0.55} />
      <Prism prism={geometry.prism} fill="#657887" edge="#536572" />
      <polygon points={geometry.backPoints} fill="#536674" stroke="#465a69" strokeWidth={0.15} strokeLinejoin="round" />
    </g>
  )
})

const FILL: Record<DeskStatus, string> = {
  occupied: '#dae5ef', available: '#f6fcf9', reserved: '#f8ecd1', conflict: '#f6dfdc', unavailable: '#e1e5e7',
}

const Desktop = memo(function Desktop({ desk, geometry, showCode }: {
  desk: DeskRecord
  geometry: MemoizedDesk
  showCode: boolean
}) {
  return (
    <g className="sw-desktop">
      <polygon points={geometry.shadowPoints} fill="#233c50" opacity={0.09} />
      {geometry.legs.map((leg, index) => <Line key={index} a={leg.a} b={leg.b} stroke="#899ba7" strokeWidth={0.35} />)}
      <Prism prism={geometry.prism} fill={FILL[desk.status]} />
      {showCode && (
        <text x={geometry.codePos[0]} y={geometry.codePos[1] + 0.6} textAnchor="middle" className="sw-desk-code">
          {desk.seat.code.split('-').at(-1)}
        </text>
      )}
    </g>
  )
})

const Architecture = memo(function Architecture({ scene, clipId }: { scene: WorkspaceSceneModel; clipId: string }) {
  const contextPlane = rectangle(scene.contextBounds)
  return (
    <g aria-hidden="true">
      <polygon points={projectedPoints(contextPlane, -0.8)} fill="#c7d3dd" />
      <g transform={planeTransform()} clipPath={`url(#${clipId})`}>
        <polygon points={points(contextPlane)} fill="#f5f7f8" />
        {scene.zones.map((zone) => <polygon key={zone.id} points={points(zone.polygon)} fill="#e5edf4" stroke="#7c9bb6" strokeWidth={0.35} strokeDasharray="1.5 1" />)}
        {scene.rooms.map((room) => <polygon key={room.id} points={points(room.polygon)} fill="#edf0f2" stroke="#8d9ba6" strokeWidth={0.35} />)}
        {scene.obstacles.filter((obstacle) => obstacle.category === 'solid').map((obstacle) => (
          <polygon key={obstacle.id} points={points(obstacle.polygon)} fill="#b8c4cc" stroke="#74838e" strokeWidth={0.35} />
        ))}
        {scene.layers.map((layer) => <path key={layer.id} d={layer.d} fill="none" stroke={layer.id === 'structure' ? '#c6d1d9' : '#a0b0bc'} strokeWidth={layer.id === 'facade' ? 0.16 : 0.12} />)}
        {scene.zones.map((zone) => <polygon key={`boundary-${zone.id}`} points={points(zone.polygon)} fill="none" stroke="#658aa8" strokeWidth={0.5} strokeDasharray="1.8 1.2" />)}
      </g>
      <g transform={planeTransform(2.5)} clipPath={`url(#${clipId})`} fill="none" stroke="#96a7b4" strokeWidth={0.4}>
        {scene.layers.filter((layer) => layer.id === 'walls' || layer.id === 'partitions').map((layer) => <path key={layer.id} d={layer.d} />)}
      </g>
      <g transform={planeTransform(1)} clipPath={`url(#${clipId})`} fill="none" stroke="#4f7ea7" strokeWidth={0.7} strokeDasharray="2 1.5">
        {scene.scopePolygons.map((polygon, index) => <polygon key={`scope-boundary-${index}`} points={points(polygon)} />)}
      </g>
      {/* Captions are outside the clip, so they are placed by anchor, not by
          whether the shape reaches in. sceneBounds applies the same rule. */}
      {scene.zones.map((zone) => zone.name && labelAnchorInView(zone.labelAnchor, scene.contextBounds) ? (
        <text key={`label-${zone.id}`} x={project(zone.labelAnchor)[0]} y={project(zone.labelAnchor)[1]} className="sw-plane-label" textAnchor="middle">{zone.name}</text>
      ) : null)}
      {scene.rooms.map((room) => {
        const center = roomLabelAnchor(room.bbox)
        if (!labelAnchorInView(center, scene.contextBounds)) return null
        const label = project(center)
        return <text key={`room-label-${room.id}`} x={label[0]} y={label[1]} className="sw-room-label" textAnchor="middle">{room.name}</text>
      })}
    </g>
  )
})

const Marker = memo(function Marker({ ws, desk, pos, isSelected, showInitials, onSelect }: {
  ws: Workstation
  desk: DeskRecord
  pos: Point
  isSelected: boolean
  showInitials: boolean
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
      onClick={(event) => { if (event.detail === 0) onSelect(ws.id) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(ws.id)
        }
      }}
    >
      <title>{desk.seat.code} · {DESK_STATUS[desk.status].label}{desk.occupants[0] ? ` · ${desk.occupants[0].employee.name}` : ''}</title>
      <circle className="sw-marker-disc" r={MARKER_RADIUS} />
      {showInitials && desk.status === 'occupied' && desk.occupants[0] ? (
        <text textAnchor="middle" y={0.48} className="sw-avatar-text">{initials(desk.occupants[0].employee.name)}</text>
      ) : <SeatSymbol status={desk.status} />}
    </g>
  )
})

export function WorkspaceScene({ scene, desks, contextDesks, selectedId, onSelect, svgRef, viewBox, origin, zoom, pan, detailTier, ground, overlay, ariaLabel, onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  scene: WorkspaceSceneModel
  desks: ReadonlyMap<string, DeskRecord>
  contextDesks?: ReadonlyMap<string, DeskRecord>
  selectedId?: string
  onSelect: (id: string) => void
  svgRef: RefObject<SVGSVGElement | null>
  viewBox: string
  origin: Point
  zoom: number
  pan: Point
  detailTier: WorkspaceDetailTier
  ground?: ReactNode
  overlay?: ReactNode
  ariaLabel?: string
  onKeyDown: (event: KeyboardEvent<SVGSVGElement>) => void
  onPointerDown: React.PointerEventHandler<SVGSVGElement>
  onPointerMove: React.PointerEventHandler<SVGSVGElement>
  onPointerUp: React.PointerEventHandler<SVGSVGElement>
  onPointerCancel: React.PointerEventHandler<SVGSVGElement>
}) {
  const clipId = useId()
  const geometry = useMemo(() => memoizeSceneGeometry(scene), [scene])
  const showDeskDetail = detailTier !== 'far'

  return (
    <svg
      ref={svgRef}
      className="sw-scene"
      viewBox={viewBox}
      role="application"
      aria-label={ariaLabel ?? `Bố trí chỗ ngồi · ${scene.workstations.length} bàn · ${scene.resolvedScope.label}`}
      data-rendered-workstations={scene.workstations.length}
      data-detail-tier={detailTier}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={scene.contextBounds[0]} y={scene.contextBounds[1]} width={scene.contextBounds[2] - scene.contextBounds[0]} height={scene.contextBounds[3] - scene.contextBounds[1]} />
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
        {ground}
        {geometry.items.map((item) => {
          const desk = item.context ? contextDesks?.get(item.ws.id) : desks.get(item.ws.id)
          if (!desk) return null
          return (
            <g
              key={`${item.ws.id}-${item.kind}`}
              {...(item.context ? {} : { 'data-workstation-id': item.ws.id })}
              className={`sw-furniture${item.context ? ' sw-context-furniture' : ''}`}
              data-status={desk.status}
              data-context={item.context ? 'true' : undefined}
              pointerEvents={item.context ? 'none' : undefined}
            >
              <title>{desk.seat.code} · {DESK_STATUS[desk.status].label}{desk.occupants[0] ? ` · ${desk.occupants[0].employee.name}` : ''}</title>
              {item.kind === 'desk' && item.deskGeom
                ? <Desktop desk={desk} geometry={item.deskGeom} showCode={showDeskDetail && !item.context} />
                : item.chairGeom ? <Chair geometry={item.chairGeom} /> : null}
            </g>
          )
        })}
        {selectedId && geometry.selectionPolygons.has(selectedId) && (
          <g className="sw-selection" fill="none" strokeLinejoin="round" pointerEvents="none" aria-hidden="true">
            <polygon points={geometry.selectionPolygons.get(selectedId)!} stroke="white" strokeWidth={1.25} />
            <polygon points={geometry.selectionPolygons.get(selectedId)!} stroke="#245bb7" strokeWidth={0.55} />
          </g>
        )}
        {geometry.markers.map(({ ws, pos }) => {
          const desk = desks.get(ws.id)
          if (!desk || (!showDeskDetail && selectedId !== ws.id)) return null
          return <Marker key={ws.id} ws={ws} desk={desk} pos={pos} isSelected={selectedId === ws.id} showInitials={detailTier === 'close'} onSelect={onSelect} />
        })}
        {overlay}
      </g>
    </svg>
  )
}
