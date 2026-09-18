import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { DeskStatus } from '../domain/desk'
import type { BaseLayer, BBox, EntityKind, EntityRef, FloorDataset, Point } from '../domain/spatial'
import { zoneDisplayPolygon } from '../domain/zoneGeometry'
import { rectangle } from '../domain/geometry'
import { closesOutline, roomLabelPoint, roomParts, simplifyOutline, snapOutlineCorner } from '../domain/roomOutline'
import { gridRefAt } from '../map/grid'
import { isSheetAnnotation } from '../map/sheetLabels'
import { UNLABELED_ZONE, objectName } from '../labels'
import { DEFAULT_ZONE_FILL_OPACITY } from '../domain/zoneCustomization'
import type { MapSettings } from '../map/mapSettings'
import { normalizeWheelZoom, panBy, screenToFloor, zoomAt, type Viewport } from '../map/viewport'

interface FloorMapProps {
  dataset: FloorDataset
  settings: MapSettings
  viewport: Viewport
  minFitScale: number
  onViewportChange: (update: (vp: Viewport) => Viewport) => void
  containerRef: React.RefObject<HTMLDivElement | null>
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
  onHover: (ref: EntityRef | null) => void
  assetBase: string
  /** workspace mode: derived desk status per workstation id */
  deskStatuses?: ReadonlyMap<string, DeskStatus>
  /** makes the map focusable and receives keyboard navigation */
  onKeyDown?: (e: ReactKeyboardEvent<SVGSVGElement>) => void
  /** callback when a zone label is dragged/repositioned or updated */
  onZoneUpdate?: (update: { zoneId: string; labelAnchor?: Point; name?: string | null }) => void
  /** selected zone being edited in the details panel; suppresses its fill overlay */
  editingZoneId?: string | null
  /** outline authoring mode for user-created rooms: drag a rectangle or click corners */
  roomDrawMode?: boolean
  /** pieces of the room being authored that are already drawn */
  roomDraft?: readonly Point[][] | null
  onRoomDraw?: (polygon: Point[]) => void
  onRoomDrawCancel?: () => void
}

/** Screen distance within which a corner snaps to a guide or closes the outline. */
const ROOM_SNAP_PX = 10

const DRAG_THRESHOLD_PX = 4

const points = (poly: Point[]) => poly.map(([x, y]) => `${x},${y}`).join(' ')

function entityFromTarget(target: EventTarget | null): EntityRef | null {
  const targetEl = target instanceof Element ? target : (target as Node | null)?.parentElement
  const el = targetEl?.closest?.('[data-entity-id]')
  if (!el) return null
  return { kind: el.getAttribute('data-entity-kind') as EntityKind, id: el.getAttribute('data-entity-id')! }
}

/** Renders one floor dataset. Knows nothing about any specific floor. */
export function FloorMap({
  dataset,
  settings,
  viewport,
  minFitScale,
  onViewportChange,
  containerRef,
  selected,
  onSelect,
  onHover,
  assetBase,
  deskStatuses,
  onKeyDown,
  onZoneUpdate,
  editingZoneId = null,
  roomDrawMode = false,
  roomDraft = null,
  onRoomDraw,
  onRoomDrawCancel,
}: FloorMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [draggedLabel, setDraggedLabel] = useState<{ zoneId: string; anchor: Point } | null>(null)
  const roomDrag = useRef<{ pointerId: number; start: Point; current: Point; startX: number; startY: number; moved: boolean } | null>(null)
  // Corners placed so far when a room is clicked corner by corner, and where the next one would go.
  const [roomPath, setRoomPath] = useState<Point[]>([])
  const [roomNextCorner, setRoomNextCorner] = useState<Point | null>(null)
  // Corners of pieces and rooms already drawn, which a new corner snaps onto.
  const roomSnapCorners = useMemo(
    () => (roomDrawMode ? [...(roomDraft ?? []).flat(), ...dataset.rooms.flatMap((room) => roomParts(room).flat())] : []),
    [roomDrawMode, roomDraft, dataset.rooms],
  )
  // The rectangle under a drag in progress.
  const [roomRectangle, setRoomRectangle] = useState<Point[] | null>(null)
  const labelDrag = useRef<{
    pointerId: number
    zoneId: string
    startX: number
    startY: number
    startAnchor: Point
    currentAnchor: Point
    moved: boolean
  } | null>(null)
  const [panning, setPanning] = useState(false)
  const lastHover = useRef<string | null>(null)
  const { layout } = dataset
  const { width, height } = layout.floor

  // Cached SVG bounding rect outside gesture hot path to prevent forced synchronous reflow
  const cachedRect = useRef({ left: 0, top: 0, width: 0, height: 0 })

  const updateCachedRect = useCallback(() => {
    const svg = svgRef.current
    if (svg) {
      const r = svg.getBoundingClientRect()
      cachedRect.current = { left: r.left, top: r.top, width: r.width, height: r.height }
    }
  }, [])

  useEffect(() => {
    updateCachedRect()
    const svg = svgRef.current
    if (!svg) return
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateCachedRect) : null
    ro?.observe(svg)
    window.addEventListener('resize', updateCachedRect, { passive: true })
    window.addEventListener('scroll', updateCachedRect, { passive: true, capture: true })
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', updateCachedRect)
      window.removeEventListener('scroll', updateCachedRect, true)
    }
  }, [updateCachedRect])

  // Coalesced gesture batching aligned to display refresh rate
  const pendingPan = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const pendingZoom = useRef<{ factor: number; sx: number; sy: number } | null>(null)
  const rafId = useRef<number | null>(null)
  const onViewportChangeRef = useRef(onViewportChange)
  const minFitScaleRef = useRef(minFitScale)

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange
    minFitScaleRef.current = minFitScale
  }, [onViewportChange, minFitScale])

  const flushGestures = useCallback(() => {
    rafId.current = null
    const pan = pendingPan.current
    const zoom = pendingZoom.current
    if ((!pan || (pan.dx === 0 && pan.dy === 0)) && !zoom) return

    pendingPan.current = { dx: 0, dy: 0 }
    pendingZoom.current = null

    onViewportChangeRef.current((vp) => {
      let next = vp
      if (pan && (pan.dx !== 0 || pan.dy !== 0)) {
        next = panBy(next, pan.dx, pan.dy)
      }
      if (zoom && zoom.factor !== 1) {
        next = zoomAt(next, zoom.factor, zoom.sx, zoom.sy, minFitScaleRef.current)
      }
      return next
    })
  }, [])

  const scheduleFrame = useCallback(() => {
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(flushGestures)
    }
  }, [flushGestures])

  useEffect(() => {
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
    }
  }, [])

  // Window blur cleans up any active drag to prevent stuck pointer lockouts
  useEffect(() => {
    const onBlur = () => {
      if (roomDrag.current) {
        try {
          if (svgRef.current?.hasPointerCapture?.(roomDrag.current.pointerId)) {
            svgRef.current.releasePointerCapture(roomDrag.current.pointerId)
          }
        } catch {}
        if (roomDrag.current.moved) setRoomRectangle(null)
        roomDrag.current = null
      }
      if (labelDrag.current) {
        try {
          if (svgRef.current?.hasPointerCapture?.(labelDrag.current.pointerId)) {
            svgRef.current.releasePointerCapture(labelDrag.current.pointerId)
          }
        } catch {}
        labelDrag.current = null
        setDraggedLabel(null)
      }
      const d = drag.current
      if (d) {
        drag.current = null
        try {
          if (svgRef.current?.hasPointerCapture?.(d.id)) {
            svgRef.current.releasePointerCapture(d.id)
          }
        } catch {}
        setPanning(false)
        if (rafId.current !== null) {
          cancelAnimationFrame(rafId.current)
          flushGestures()
        }
      }
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [flushGestures])

  // Wheel must be non-passive to prevent page scroll
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      let rect = cachedRect.current
      if (rect.width === 0) {
        updateCachedRect()
        rect = cachedRect.current
      }
      const factor = normalizeWheelZoom(e.deltaY, e.deltaMode)
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      if (Number.isFinite(factor) && Number.isFinite(sx) && Number.isFinite(sy)) {
        if (pendingZoom.current) {
          pendingZoom.current.factor = Math.max(0.01, Math.min(100, pendingZoom.current.factor * factor))
          pendingZoom.current.sx = sx
          pendingZoom.current.sy = sy
        } else {
          pendingZoom.current = { factor, sx, sy }
        }
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
  }, [scheduleFrame, updateCachedRect])

  const finishRoomPath = useCallback(
    (path: readonly Point[]) => {
      const outline = simplifyOutline(path)
      if (outline.length < 3) return
      setRoomPath([])
      setRoomNextCorner(null)
      onRoomDraw?.(outline)
    },
    [onRoomDraw],
  )

  // Entering or leaving draw mode from anywhere (panel cancel, save) drops a half-clicked outline.
  const [roomPathMode, setRoomPathMode] = useState(roomDrawMode)
  if (roomPathMode !== roomDrawMode) {
    setRoomPathMode(roomDrawMode)
    setRoomPath([])
    setRoomNextCorner(null)
  }

  useEffect(() => {
    if (!roomDrawMode) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (e.key === 'Enter' && roomPath.length >= 3) {
        e.preventDefault()
        finishRoomPath(roomPath)
      } else if (e.key === 'Backspace' && roomPath.length > 0) {
        e.preventDefault()
        const next = roomPath.slice(0, -1)
        setRoomPath(next)
        setRoomNextCorner(next.length ? next[next.length - 1] : null)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (roomPath.length > 0) {
          setRoomPath([])
          setRoomNextCorner(null)
        } else onRoomDrawCancel?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [roomDrawMode, roomPath, finishRoomPath, onRoomDrawCancel])

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return

    if (roomDrawMode) {
      updateCachedRect()
      const rect = cachedRect.current
      const start = screenToFloor(viewport, e.clientX - rect.left, e.clientY - rect.top)
      roomDrag.current = { pointerId: e.pointerId, start, current: start, startX: e.clientX, startY: e.clientY, moved: false }
      onSelect(null)
      try {
        svgRef.current?.setPointerCapture(e.pointerId)
      } catch {}
      return
    }

    // PDF tool affordance: dragging or clicking a zone title/label
    const labelEl = (e.target as Element | null)?.closest?.('[data-zone-label="true"]')
    if (labelEl) {
      const zoneId = labelEl.getAttribute('data-entity-id')
      const zone = dataset.zones.find((z) => z.id === zoneId)
      if (zone) {
        updateCachedRect()
        labelDrag.current = {
          pointerId: e.pointerId,
          zoneId: zone.id,
          startX: e.clientX,
          startY: e.clientY,
          startAnchor: [zone.labelAnchor[0], zone.labelAnchor[1]],
          currentAnchor: [zone.labelAnchor[0], zone.labelAnchor[1]],
          moved: false,
        }
        try {
          svgRef.current?.setPointerCapture(e.pointerId)
        } catch {}
        return
      }
    }

    if (drag.current !== null) {
      if (e.pointerType === 'mouse') {
        if (drag.current.moved) {
          setPanning(false)
        }
        drag.current = null
      } else {
        return
      }
    }
    updateCachedRect()
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rd = roomDrag.current
    if (rd && rd.pointerId === e.pointerId) {
      const rect = cachedRect.current
      const current = screenToFloor(viewport, e.clientX - rect.left, e.clientY - rect.top)
      rd.current = current
      // Once corners are being clicked, a slipped drag is still a click, not a rectangle.
      if (!rd.moved && roomPath.length === 0 && Math.hypot(e.clientX - rd.startX, e.clientY - rd.startY) > DRAG_THRESHOLD_PX) rd.moved = true
      if (rd.moved) setRoomRectangle(rectangle(bboxFromCorners(rd.start, current)))
      return
    }
    if (roomDrawMode && roomPath.length > 0) {
      const rect = cachedRect.current
      const pointer = screenToFloor(viewport, e.clientX - rect.left, e.clientY - rect.top)
      setRoomNextCorner(snapOutlineCorner(roomPath, pointer, ROOM_SNAP_PX / viewport.scale, e.shiftKey, roomSnapCorners))
    }
    const ld = labelDrag.current
    if (ld && ld.pointerId === e.pointerId) {
      const dx = e.clientX - ld.startX
      const dy = e.clientY - ld.startY
      if (!ld.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        ld.moved = true
      }
      if (ld.moved) {
        const nextAnchor: Point = [
          Math.round((ld.startAnchor[0] + dx / viewport.scale) * 10) / 10,
          Math.round((ld.startAnchor[1] + dy / viewport.scale) * 10) / 10,
        ]
        ld.currentAnchor = nextAnchor
        setDraggedLabel({ zoneId: ld.zoneId, anchor: nextAnchor })
      }
      return
    }

    const d = drag.current
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        d.moved = true
        try {
          svgRef.current?.setPointerCapture(e.pointerId)
        } catch {}
        setPanning(true)
      }
      if (d.moved) {
        if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
          d.x = e.clientX
          d.y = e.clientY
        }
        if (Number.isFinite(dx) && Number.isFinite(dy)) {
          pendingPan.current.dx += dx
          pendingPan.current.dy += dy
          scheduleFrame()
        }
        return
      }
    }
    if (drag.current?.moved) return
    const ref = entityFromTarget(e.target)
    const key = ref ? `${ref.kind}:${ref.id}` : null
    if (key !== lastHover.current) {
      lastHover.current = key
      onHover(ref)
    }
    if (settings.debug.enabled && settings.debug.coords) {
      let rect = cachedRect.current
      if (rect.width === 0) {
        updateCachedRect()
        rect = cachedRect.current
      }
      setCursor(screenToFloor(viewport, e.clientX - rect.left, e.clientY - rect.top))
    }
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rd = roomDrag.current
    if (rd && rd.pointerId === e.pointerId) {
      roomDrag.current = null
      if (rd.moved) {
        const bbox = bboxFromCorners(rd.start, rd.current)
        setRoomRectangle(null)
        if (bbox[2] > bbox[0] && bbox[3] > bbox[1]) onRoomDraw?.(rectangle(bbox))
      } else {
        const tolerance = ROOM_SNAP_PX / viewport.scale
        const corner = snapOutlineCorner(roomPath, rd.start, tolerance, e.shiftKey, roomSnapCorners)
        const last = roomPath[roomPath.length - 1]
        // Clicking the first corner closes; so does the second click of a double-click.
        const repeated = last !== undefined && roomPath.length >= 3 && Math.hypot(corner[0] - last[0], corner[1] - last[1]) <= tolerance
        if (closesOutline(roomPath, corner, tolerance) || repeated) finishRoomPath(roomPath)
        else if (!last || corner[0] !== last[0] || corner[1] !== last[1]) {
          setRoomPath([...roomPath, corner])
          setRoomNextCorner(corner)
        }
      }
      try {
        if (svgRef.current?.hasPointerCapture?.(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
      } catch {}
      return
    }
    const ld = labelDrag.current
    if (ld && ld.pointerId === e.pointerId) {
      labelDrag.current = null
      setDraggedLabel(null)
      try {
        if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
          svgRef.current.releasePointerCapture(e.pointerId)
        }
      } catch {}

      if (ld.moved) {
        onZoneUpdate?.({
          zoneId: ld.zoneId,
          labelAnchor: ld.currentAnchor,
        })
        onSelect({ kind: 'zone', id: ld.zoneId })
      } else {
        onSelect({ kind: 'zone', id: ld.zoneId })
      }
      return
    }

    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      flushGestures()
    }
    if (d.moved) {
      try {
        if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
          svgRef.current.releasePointerCapture(e.pointerId)
        }
      } catch {}
      setPanning(false)
      return
    }
    onSelect(entityFromTarget(e.target))
  }

  const onPointerCancel = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rd = roomDrag.current
    if (rd && rd.pointerId === e.pointerId) {
      roomDrag.current = null
      if (rd.moved) setRoomRectangle(null)
      return
    }
    const ld = labelDrag.current
    if (ld && ld.pointerId === e.pointerId) {
      try {
        if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
          svgRef.current.releasePointerCapture(e.pointerId)
        }
      } catch {}
      labelDrag.current = null
      setDraggedLabel(null)
      return
    }

    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      flushGestures()
    }
    try {
      if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
        svgRef.current.releasePointerCapture(e.pointerId)
      }
    } catch {}
    setPanning(false)
  }

  const showDigital = settings.sourceMode !== 'source'
  const showSource = settings.sourceMode !== 'digital'
  const debug = settings.debug.enabled
  const deskSelected = deskStatuses && selected?.kind === 'workstation' ? selected.id : null

  return (
    <div ref={containerRef} className="fp-map">
      <svg
        ref={svgRef}
        className={`fp-svg${panning ? ' is-panning' : ''}${debug ? ' is-debug' : ''}${deskStatuses ? ' has-desk-status' : ''}${deskSelected ? ' has-desk-selection' : ''}${roomDrawMode ? ' is-room-drawing' : ''}`}
        role="application"
        aria-label={`Bản đồ mặt bằng ${layout.floor.name}`}
        aria-roledescription="bản đồ tương tác"
        tabIndex={onKeyDown ? 0 : undefined}
        onKeyDown={onKeyDown}
        onPointerEnter={updateCachedRect}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          lastHover.current = null
          onHover(null)
          setCursor(null)
        }}
      >
        <defs>
          <pattern id="fp-hatch-unknown" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="2" fill="var(--fp-unknown-bg)" />
            <line x1="0" y1="0" x2="0" y2="2" stroke="var(--fp-unknown)" strokeWidth="0.5" />
          </pattern>
          <pattern id="fp-desk-reserved" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="1.6" height="1.6" fill="#fff" />
            <rect width="0.7" height="1.6" fill="var(--desk-reserved-fill)" />
          </pattern>
          <pattern id="fp-desk-unavailable" width="1.6" height="1.6" patternUnits="userSpaceOnUse">
            <rect width="1.6" height="1.6" fill="#f1efec" />
            <path d="M0 0L1.6 1.6M1.6 0L0 1.6" stroke="var(--desk-unavailable-fill)" strokeWidth="0.25" />
          </pattern>
        </defs>
        <g
          className="fp-viewport-layer"
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
          style={{
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0px) scale3d(${viewport.scale}, ${viewport.scale}, 1)`,
            transformBox: 'view-box',
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          <rect className="fp-sheet" x={0} y={0} width={width} height={height} />

          {settings.zoneFills && <ZoneFills dataset={dataset} />}

          {showSource && settings.sourceMode === 'source' && (
            <SourceImage dataset={dataset} assetBase={assetBase} opacity={1} />
          )}

          {showDigital && <BaseLayers layers={layout.layers} visible={settings.layers} />}

          {showSource && settings.sourceMode === 'overlay' && (
            <SourceImage dataset={dataset} assetBase={assetBase} opacity={settings.sourceOpacity} />
          )}

          {deskStatuses && <DeskStatusLayer dataset={dataset} statuses={deskStatuses} />}
          {deskStatuses && deskSelected && (
            <SelectedDesk dataset={dataset} id={deskSelected} status={deskStatuses.get(deskSelected)} />
          )}

          <EntityLayer dataset={dataset} />

          {roomDraft?.map((part, i) => <polygon key={i} className="fp-room-draft" points={points(part)} pointerEvents="none" />)}
          {roomRectangle && <polygon className="fp-room-draft" points={points(roomRectangle)} pointerEvents="none" />}

          {roomDrawMode && roomPath.length > 0 && (
            <g className="fp-room-path" pointerEvents="none">
              <polyline points={points(roomNextCorner ? [...roomPath, roomNextCorner] : roomPath)} />
              {roomPath.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={(i === 0 ? 5 : 3.5) / viewport.scale} className={i === 0 ? 'is-first' : undefined} />
              ))}
            </g>
          )}

          {settings.labels && showDigital && (
            <Labels
              dataset={dataset}
              selectedZoneId={selected?.kind === 'zone' ? selected.id : null}
              draggedLabel={draggedLabel}
            />
          )}

          <Selection dataset={dataset} selected={selected} editingZoneId={editingZoneId} />

          {debug && <DebugLayer dataset={dataset} settings={settings} />}
        </g>
      </svg>

      {debug && settings.debug.coords && cursor && (
        <div className="fp-coords" aria-live="off">
          <span>pt {cursor[0].toFixed(1)}, {cursor[1].toFixed(1)}</span>
          <span>
            mm {Math.round(cursor[0] * layout.floor.mmPerPt)}, {Math.round(cursor[1] * layout.floor.mmPerPt)}
          </span>
          <span>lưới {gridRefAt(layout, cursor[0], cursor[1])}</span>
          <span>thu phóng {viewport.scale.toFixed(2)} px/pt</span>
        </div>
      )}
    </div>
  )
}

const SourceImage = memo(function SourceImage({
  dataset,
  assetBase,
  opacity,
}: {
  dataset: FloorDataset
  assetBase: string
  opacity: number
}) {
  const { floor, sourceRaster } = dataset.layout
  return (
    <image
      className="fp-source"
      href={`${assetBase}${sourceRaster.path}`}
      x={0}
      y={0}
      width={floor.width}
      height={floor.height}
      opacity={opacity}
      preserveAspectRatio="none"
    />
  )
})

const BaseLayers = memo(function BaseLayers({
  layers,
  visible,
}: {
  layers: BaseLayer[]
  visible: MapSettings['layers']
}) {
  return (
    <g className="fp-base" aria-hidden="true">
      {layers.map((l) =>
        visible[l.id] ? <path key={l.id} className={`fp-layer fp-layer-${l.id}`} d={l.d} data-layer={l.id} /> : null,
      )}
    </g>
  )
})

const ZoneFills = memo(function ZoneFills({ dataset }: { dataset: FloorDataset }) {
  return (
    <g className="fp-zone-fills" aria-hidden="true">
      {dataset.zones.map((z) => (
        <polygon
          key={z.id}
          points={points(zoneDisplayPolygon(z))}
          fill={z.verification === 'UNKNOWN' ? 'url(#fp-hatch-unknown)' : (z.sourceColor ?? 'transparent')}
          className="fp-zone-fill"
          style={{ fillOpacity: z.sourceOpacity ?? DEFAULT_ZONE_FILL_OPACITY }}
        />
      ))}
    </g>
  )
})

/** Interactive entities. Hover highlight is pure CSS so hovering never re-renders this. */
const EntityLayer = memo(function EntityLayer({ dataset }: { dataset: FloorDataset }) {
  return (
    <g className="fp-entities">
      <g className="fp-zones">
        {dataset.zones.map((z) => (
          <polygon
            key={z.id}
            className="fp-zone"
            /* The tidied outline, so the zone is clicked where it is drawn. */
            points={points(zoneDisplayPolygon(z))}
            data-entity-kind="zone"
            data-entity-id={z.id}
            data-verification={z.verification}
            style={{ ['--zone-color' as string]: z.sourceColor ?? 'var(--fp-unknown)' }}
          >
            <title>{z.name ?? UNLABELED_ZONE}</title>
          </polygon>
        ))}
      </g>
      <g className="fp-rooms">
        {dataset.rooms.flatMap((r) => roomParts(r).map((part, i) => (
          <polygon
            key={`${r.id}:${i}`}
            className="fp-room"
            points={points(part)}
            data-entity-kind="room"
            data-entity-id={r.id}
            data-verification={r.verification}
            data-source-kind={r.source.kind}
          >
            <title>{r.name}</title>
          </polygon>
        )))}
      </g>
      <g className="fp-objects">
        {dataset.objects.map((o) => (
          <polygon
            key={o.id}
            className="fp-object"
            points={points(o.polygon)}
            data-entity-kind="object"
            data-entity-id={o.id}
            data-verification={o.verification}
            data-classification={o.classification}
          >
            <title>{objectName(o)}</title>
          </polygon>
        ))}
      </g>
      <g className="fp-workstations">
        {dataset.workstations.map((w) => (
          <polygon
            key={w.id}
            className="fp-ws"
            points={points(w.polygon)}
            data-entity-kind="workstation"
            data-entity-id={w.id}
            data-verification={w.verification}
            data-classification={w.classification}
            data-source-kind={w.source.kind}
          >
            <title>{w.id}</title>
          </polygon>
        ))}
      </g>
    </g>
  )
})

function DeskShape({ w, status }: { w: FloorDataset['workstations'][number]; status: DeskStatus }) {
  return (
    <g data-desk-status={status}>
      <polygon className="fp-desk-shape" points={points(w.polygon)} />
      {status === 'conflict' && (
        <text className="fp-desk-glyph" x={w.center[0]} y={w.center[1]}>
          !
        </text>
      )}
    </g>
  )
}

/** Desk status fills (workspace mode). Pointer events go to the entity layer above. */
const DeskStatusLayer = memo(function DeskStatusLayer({
  dataset,
  statuses,
}: {
  dataset: FloorDataset
  statuses: ReadonlyMap<string, DeskStatus>
}) {
  return (
    <g className="fp-desk-status" aria-hidden="true">
      {dataset.workstations.map((w) => {
        const status = statuses.get(w.id)
        return status ? <DeskShape key={w.id} w={w} status={status} /> : null
      })}
    </g>
  )
})

/** Undimmed copy of the selected desk drawn above the dimmed status layer. */
const SelectedDesk = memo(function SelectedDesk({ dataset, id, status }: { dataset: FloorDataset; id: string; status?: DeskStatus }) {
  const w = useMemo(() => dataset.workstations.find((k) => k.id === id), [dataset, id])
  if (!w || !status) return null
  return (
    <g className="fp-desk-selected" aria-hidden="true">
      <DeskShape w={w} status={status} />
    </g>
  )
})

const Labels = memo(function Labels({
  dataset,
  selectedZoneId,
  draggedLabel,
}: {
  dataset: FloorDataset
  selectedZoneId?: string | null
  draggedLabel?: { zoneId: string; anchor: Point } | null
}) {
  const { layout, zones } = dataset
  return (
    <g className="fp-labels">
      {/* Extracted rooms are already named by the drawing's own CAD text. */}
      {dataset.rooms.filter((r) => r.source.kind === 'user-authored').map((r) => {
        const [x, y] = roomLabelPoint(r)
        return (
          <text key={r.id} className="fp-room-label" x={x} y={y} textAnchor="middle" dominantBaseline="middle" aria-hidden="true">
            {r.name}
          </text>
        )
      })}
      {layout.labels.filter((l) => !isSheetAnnotation(l)).map((l, i) => (
        <text
          key={i}
          className="fp-cad-label"
          x={l.x}
          y={l.y}
          fontSize={l.size}
          transform={l.angle ? `rotate(${l.angle} ${l.x} ${l.y})` : undefined}
          aria-hidden="true"
        >
          {l.text}
        </text>
      ))}
      {zones.map((z) => {
        const isDragged = draggedLabel?.zoneId === z.id
        const anchor = isDragged ? draggedLabel.anchor : z.labelAnchor
        const isSelected = selectedZoneId === z.id
        // The drawing's figure stays out of the map label. It reads as capacity
        // next to a department name and is not one — Facilities has confirmed it
        // as a superseded CAD total. The raw label, figure and all, is still on
        // the zone's "Nhãn trên bản vẽ" row, and dropping it here makes this map
        // agree with the 2.5D workspace, which has always drawn the name alone.
        const text = z.name ?? UNLABELED_ZONE.toUpperCase()
        const zoneCentroid: Point = [(z.bbox[0] + z.bbox[2]) / 2, (z.bbox[1] + z.bbox[3]) / 2]
        const distFromCentroid = Math.hypot(anchor[0] - zoneCentroid[0], anchor[1] - zoneCentroid[1])

        return (
          <g
            key={z.id}
            className={`fp-zone-label-group${isSelected ? ' is-selected' : ''}${isDragged ? ' is-dragging' : ''}`}
            data-entity-kind="zone"
            data-entity-id={z.id}
            data-zone-label="true"
          >
            {(isDragged || (isSelected && distFromCentroid > 45)) && (
              <line
                x1={zoneCentroid[0]}
                y1={zoneCentroid[1]}
                x2={anchor[0]}
                y2={anchor[1]}
                className="fp-zone-label-leader"
              />
            )}
            {isSelected && (
              <circle
                cx={anchor[0]}
                cy={anchor[1]}
                r={3.5}
                className="fp-zone-label-handle"
              />
            )}
            <text
              className={`fp-zone-label${z.name ? '' : ' is-unknown'}${isSelected ? ' is-selected' : ''}${isDragged ? ' is-dragging' : ''}`}
              x={anchor[0]}
              y={anchor[1]}
            >
              {text}
            </text>
          </g>
        )
      })}
    </g>
  )
})

const Selection = memo(function Selection({
  dataset,
  selected,
  editingZoneId,
}: {
  dataset: FloorDataset
  selected: EntityRef | null
  editingZoneId: string | null
}) {
  const shapes = useMemo(() => {
    if (!selected) return []
    switch (selected.kind) {
      case 'zone':
        return dataset.zones.filter((z) => z.id === selected.id).map((z) => z.polygon)
      case 'room':
        return dataset.rooms.filter((r) => r.id === selected.id).flatMap(roomParts)
      case 'object':
        return dataset.objects.filter((o) => o.id === selected.id).map((o) => o.polygon)
      case 'workstation':
        return dataset.workstations.filter((w) => w.id === selected.id).map((w) => w.polygon)
      case 'cluster': {
        const c = dataset.clusters.find((k) => k.id === selected.id)
        return c ? dataset.workstations.filter((w) => w.clusterId === c.id).map((w) => w.polygon) : []
      }
    }
  }, [dataset, selected])
  if (!shapes.length) return null
  return (
    <g
      className={`fp-selection fp-selection-${selected!.kind}${selected!.kind === 'zone' && selected!.id === editingZoneId ? ' is-editing' : ''}`}
      aria-hidden="true"
    >
      {shapes.map((p, i) => (
        <polygon key={i} points={points(p)} />
      ))}
    </g>
  )
})

const DebugLayer = memo(function DebugLayer({ dataset, settings }: { dataset: FloorDataset; settings: MapSettings }) {
  const { ids, bboxes, classification } = settings.debug
  const box = (b: [number, number, number, number]) => ({ x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1] })
  return (
    <g className="fp-debug" aria-hidden="true">
      {classification && (
        <g className="fp-debug-class">
          {dataset.workstations.map((w) => (
            <g key={w.id} data-classification={w.classification}>
              <polygon points={points(w.polygon)} />
              {w.chair && <rect className="fp-debug-chair" {...box(w.chair.bbox)} />}
            </g>
          ))}
          {dataset.objects.map((o) => (
            <polygon key={o.id} data-classification={o.classification} points={points(o.polygon)} />
          ))}
        </g>
      )}
      {bboxes && (
        <g className="fp-debug-bbox">
          {dataset.zones.map((z) => (
            <rect key={z.id} className="is-zone" {...box(z.bbox)} />
          ))}
          {dataset.clusters.map((c) => (
            <rect key={c.id} className="is-cluster" {...box(c.bbox)} />
          ))}
          {dataset.objects.map((o) => (
            <rect key={o.id} className="is-object" {...box(o.bbox)} />
          ))}
        </g>
      )}
      {ids && (
        <g className="fp-debug-ids">
          {dataset.workstations.map((w) => (
            <text key={w.id} x={w.center[0]} y={w.center[1]} className="is-ws">
              {w.id.replace(/^ws-\d+-/, '')}
            </text>
          ))}
          {dataset.clusters.map((c) => (
            <text key={c.id} x={c.bbox[0]} y={c.bbox[1] - 0.6} className="is-cluster">
              {c.id}
            </text>
          ))}
          {dataset.zones.map((z) => (
            <text key={z.id} x={z.labelAnchor[0]} y={z.labelAnchor[1] + 7} className="is-zone">
              {z.id}
            </text>
          ))}
          {[...dataset.objects, ...dataset.rooms].map((o) => (
            <text key={o.id} x={o.bbox[0]} y={o.bbox[1] - 0.5} className="is-object">
              {o.id}
            </text>
          ))}
        </g>
      )}
    </g>
  )
})

function bboxFromCorners(a: Point, b: Point): BBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
}
