import { useCallback, useEffect, useRef, useState, type WheelEvent as ReactWheelEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { LockerItem } from '../types'
import { LockerMarker } from './LockerMarker'
import floor16Layout from '../../floor-planning/data/floors/floor-16/floor16.layout.json'
import type { BaseLayer } from '../../floor-planning/domain/spatial'
import { ViewControls } from '../../floor-planning/components/FloorMapControls'
import { STATUS_META } from '../lockersData'

interface LockerMapProps {
  lockers: LockerItem[]
  selectedLocker: LockerItem | null
  onSelectLocker: (locker: LockerItem | null) => void
}

interface Viewport {
  scale: number
  x: number
  y: number
}

interface LayoutData {
  floor: {
    width: number
    height: number
  }
  layers: BaseLayer[]
  grid: {
    columns: Array<{ name: string; x: number }>
    rows: Array<{ name: string; y: number }>
  }
}

const layout = floor16Layout as unknown as LayoutData
const FLOOR_WIDTH = layout.floor.width // 1190.55
const FLOOR_HEIGHT = layout.floor.height // 841.89
const MIN_SCALE = 0.35
const MAX_SCALE = 5.0

const PLATE_BBOX: [number, number, number, number] = [112.8, 141.55, 1050.96, 709.3]
const PLATE_WIDTH = PLATE_BBOX[2] - PLATE_BBOX[0]
const PLATE_HEIGHT = PLATE_BBOX[3] - PLATE_BBOX[1]
const FIT_PADDING = 28

export function LockerMap({ lockers, selectedLocker, onSelectLocker }: LockerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoveredLocker, setHoveredLocker] = useState<LockerItem | null>(null)
  const [panning, setPanning] = useState(false)
  const dragRef = useRef<{ id: number; startX: number; startY: number; moved: boolean } | null>(null)

  const [viewport, setViewport] = useState<Viewport>(() => ({
    scale: 1,
    x: 0,
    y: 0,
  }))

  // Fit viewport to building plate (matching FloorPlanningPage default size)
  const fitToContainer = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const availW = Math.max(1, rect.width - FIT_PADDING * 2)
    const availH = Math.max(1, rect.height - FIT_PADDING * 2)
    const scale = Math.min(availW / PLATE_WIDTH, availH / PLATE_HEIGHT)
    const x = (rect.width - PLATE_WIDTH * scale) / 2 - PLATE_BBOX[0] * scale
    const y = (rect.height - PLATE_HEIGHT * scale) / 2 - PLATE_BBOX[1] * scale
    setViewport({ scale, x, y })
  }, [])

  // Reset to full sheet (Toàn tờ)
  const resetToSheet = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const availW = Math.max(1, rect.width - FIT_PADDING * 2)
    const availH = Math.max(1, rect.height - FIT_PADDING * 2)
    const scale = Math.min(availW / FLOOR_WIDTH, availH / FLOOR_HEIGHT)
    const x = (rect.width - FLOOR_WIDTH * scale) / 2
    const y = (rect.height - FLOOR_HEIGHT * scale) / 2
    setViewport({ scale, x, y })
  }, [])

  useEffect(() => {
    fitToContainer()
    const onResize = () => fitToContainer()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fitToContainer])

  // Center on a locker
  const focusOnLocker = useCallback((locker: LockerItem) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const targetScale = 1.6
    const [cx, cy] = locker.center
    const x = rect.width / 2 - cx * targetScale
    const y = rect.height / 2 - cy * targetScale
    setViewport({ scale: targetScale, x, y })
  }, [])

  // Zoom by factor
  const handleZoom = (factor: number) => {
    setViewport((prev) => {
      const el = containerRef.current
      const rect = el ? el.getBoundingClientRect() : { width: 800, height: 600 }
      const cx = rect.width / 2
      const cy = rect.height / 2
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor))
      const k = newScale / prev.scale
      return {
        scale: newScale,
        x: cx - (cx - prev.x) * k,
        y: cy - (cy - prev.y) * k,
      }
    })
  }

  // Wheel zoom
  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.14 : 0.88

    setViewport((prev) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor))
      const k = newScale / prev.scale
      return {
        scale: newScale,
        x: sx - (sx - prev.x) * k,
        y: sy - (sy - prev.y) * k,
      }
    })
  }

  // Pointer / Pan interactions
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    dragRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return

    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY

    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true
      setPanning(true)
      try {
        svgRef.current?.setPointerCapture(e.pointerId)
      } catch {}
    }

    if (d.moved) {
      d.startX = e.clientX
      d.startY = e.clientY
      setViewport((prev) => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }))
    }
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    dragRef.current = null
    setPanning(false)

    try {
      if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
        svgRef.current.releasePointerCapture(e.pointerId)
      }
    } catch {}

    // Click on canvas clears selection
    if (!d.moved) {
      const target = e.target as Element
      if (!target.closest('[data-locker-id]')) {
        onSelectLocker(null)
      }
    }
  }

  const layers = layout.layers

  // Hover hint label
  const hoverLabel = hoveredLocker
    ? `${hoveredLocker.code} · ${STATUS_META[hoveredLocker.status].label}${hoveredLocker.employeeName ? ` · ${hoveredLocker.employeeName}` : ''}`
    : null

  return (
    <div ref={containerRef} className="fp-map">
      <svg
        ref={svgRef}
        className={`fp-svg${panning ? ' is-panning' : ''}`}
        role="application"
        aria-label="Sơ đồ bố trí tủ locker Tầng 16"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <g
          className="fp-viewport-layer"
          transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`}
          style={{ willChange: 'transform' }}
        >
          {/* Sheet background */}
          <rect
            className="fp-sheet"
            x={0}
            y={0}
            width={FLOOR_WIDTH}
            height={FLOOR_HEIGHT}
          />

          {/*
            Base CAD architectural layers (Mặt bằng bố trí).
            Coloured section fills (ZoneFills / colored polygons) are removed as requested,
            keeping only clean CAD lines.
          */}
          <g className="fp-base" aria-hidden="true">
            {layers.map((l) => (
              <path
                key={l.id}
                className={`fp-layer fp-layer-${l.id}`}
                d={l.d}
                data-layer={l.id}
              />
            ))}
          </g>

          {/* Grid lines in background */}
          <g className="fp-grid-lines" aria-hidden="true" style={{ pointerEvents: 'none', opacity: 0.35 }}>
            {layout.grid.columns.map((col: { name: string; x: number }) => (
              <line
                key={`c-${col.name}`}
                x1={col.x}
                y1={0}
                x2={col.x}
                y2={FLOOR_HEIGHT}
                stroke="#c9c3ba"
                strokeWidth="0.4"
                strokeDasharray="2 3"
              />
            ))}
          </g>

          {/* Interactive Lockers layer: ONLY lockers are clickable */}
          <g className="locker-interactive-layer">
            {lockers.map((locker) => (
              <LockerMarker
                key={locker.id}
                locker={locker}
                isSelected={selectedLocker?.id === locker.id}
                isHovered={hoveredLocker?.id === locker.id}
                onSelect={(loc) => {
                  onSelectLocker(loc)
                  focusOnLocker(loc)
                }}
                onHover={setHoveredLocker}
              />
            ))}
          </g>
        </g>
      </svg>

      {/* Hover information bar (same as FloorPlanningPage) */}
      <div className="fp-hover" aria-live="polite">
        {hoverLabel ?? (
          <span className="fp-hover-hint">
            Kéo để di chuyển · Cuộn để thu phóng · Nhấp vào tủ để chọn · Nhấn ? để xem phím tắt
          </span>
        )}
      </div>

      {/* Map Footer Controls (matching FloorPlanningPage) */}
      <div className="fp-map-foot">
        <ViewControls
          onZoomIn={() => handleZoom(1.35)}
          onZoomOut={() => handleZoom(1 / 1.35)}
          onFit={fitToContainer}
          onReset={resetToSheet}
        />
      </div>
    </div>
  )
}
