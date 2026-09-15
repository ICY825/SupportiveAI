import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { BaseLayer, EntityKind, EntityRef, FloorDataset, Point } from '../domain/spatial'
import { gridRefAt } from '../map/grid'
import type { MapSettings } from '../map/mapSettings'
import { panBy, screenToFloor, zoomAt, type Viewport } from '../map/viewport'

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
}

const DRAG_THRESHOLD_PX = 4

const points = (poly: Point[]) => poly.map(([x, y]) => `${x},${y}`).join(' ')

function entityFromTarget(target: EventTarget | null): EntityRef | null {
  const el = (target as Element | null)?.closest?.('[data-entity-id]')
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
}: FloorMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [panning, setPanning] = useState(false)
  const lastHover = useRef<string | null>(null)
  const { layout } = dataset
  const { width, height } = layout.floor

  // wheel must be non-passive to prevent page scroll
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015))
      onViewportChange((vp) => zoomAt(vp, factor, e.clientX - rect.left, e.clientY - rect.top, minFitScale))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [onViewportChange, minFitScale])

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        d.moved = true
        svgRef.current?.setPointerCapture(e.pointerId)
        setPanning(true)
      }
      if (d.moved) {
        d.x = e.clientX
        d.y = e.clientY
        onViewportChange((vp) => panBy(vp, dx, dy))
        return
      }
    }
    const ref = entityFromTarget(e.target)
    const key = ref ? `${ref.kind}:${ref.id}` : null
    if (key !== lastHover.current) {
      lastHover.current = key
      onHover(ref)
    }
    if (settings.debug.enabled && settings.debug.coords) {
      const rect = svgRef.current!.getBoundingClientRect()
      setCursor(screenToFloor(viewport, e.clientX - rect.left, e.clientY - rect.top))
    }
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId) return
    if (d.moved) {
      svgRef.current?.releasePointerCapture(e.pointerId)
      setPanning(false)
      return
    }
    onSelect(entityFromTarget(e.target))
  }

  const showDigital = settings.sourceMode !== 'source'
  const showSource = settings.sourceMode !== 'digital'
  const debug = settings.debug.enabled

  return (
    <div ref={containerRef} className="fp-map">
      <svg
        ref={svgRef}
        className={`fp-svg${panning ? ' is-panning' : ''}${debug ? ' is-debug' : ''}`}
        role="application"
        aria-label={`${layout.floor.name} interactive floor map`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null
          setPanning(false)
        }}
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
        </defs>
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
          <rect className="fp-sheet" x={0} y={0} width={width} height={height} />

          {settings.zoneFills && <ZoneFills dataset={dataset} />}

          {showSource && settings.sourceMode === 'source' && (
            <SourceImage dataset={dataset} assetBase={assetBase} opacity={1} />
          )}

          {showDigital && <BaseLayers layers={layout.layers} visible={settings.layers} />}

          {showSource && settings.sourceMode === 'overlay' && (
            <SourceImage dataset={dataset} assetBase={assetBase} opacity={settings.sourceOpacity} />
          )}

          <EntityLayer dataset={dataset} />

          {settings.labels && showDigital && <Labels dataset={dataset} />}

          <Selection dataset={dataset} selected={selected} />

          {debug && <DebugLayer dataset={dataset} settings={settings} />}
        </g>
      </svg>

      {debug && settings.debug.coords && cursor && (
        <div className="fp-coords" aria-live="off">
          <span>pt {cursor[0].toFixed(1)}, {cursor[1].toFixed(1)}</span>
          <span>
            mm {Math.round(cursor[0] * layout.floor.mmPerPt)}, {Math.round(cursor[1] * layout.floor.mmPerPt)}
          </span>
          <span>grid {gridRefAt(layout, cursor[0], cursor[1])}</span>
          <span>zoom {viewport.scale.toFixed(2)} px/pt</span>
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
          points={points(z.polygon)}
          fill={z.verification === 'UNKNOWN' ? 'url(#fp-hatch-unknown)' : (z.sourceColor ?? 'transparent')}
          className="fp-zone-fill"
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
            points={points(z.polygon)}
            data-entity-kind="zone"
            data-entity-id={z.id}
            data-verification={z.verification}
            style={{ ['--zone-color' as string]: z.sourceColor ?? 'var(--fp-unknown)' }}
          >
            <title>{z.name ?? 'Unlabeled zone (UNKNOWN)'}</title>
          </polygon>
        ))}
      </g>
      <g className="fp-rooms">
        {dataset.rooms.map((r) => (
          <polygon
            key={r.id}
            className="fp-room"
            points={points(r.polygon)}
            data-entity-kind="room"
            data-entity-id={r.id}
            data-verification={r.verification}
          >
            <title>{r.name}</title>
          </polygon>
        ))}
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
            <title>{o.name}</title>
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
          >
            <title>{w.id}</title>
          </polygon>
        ))}
      </g>
    </g>
  )
})

const Labels = memo(function Labels({ dataset }: { dataset: FloorDataset }) {
  const { layout, zones } = dataset
  return (
    <g className="fp-labels" aria-hidden="true">
      {layout.labels.map((l, i) => (
        <text
          key={i}
          className="fp-cad-label"
          x={l.x}
          y={l.y}
          fontSize={l.size}
          transform={l.angle ? `rotate(${l.angle} ${l.x} ${l.y})` : undefined}
        >
          {l.text}
        </text>
      ))}
      {zones.map((z) => (
        <text
          key={z.id}
          className={`fp-zone-label${z.name ? '' : ' is-unknown'}`}
          x={z.labelAnchor[0]}
          y={z.labelAnchor[1]}
        >
          {z.name ?? 'UNLABELED · UNKNOWN'}
          {z.sourceLabelFigure !== null ? ` (${z.sourceLabelFigure})` : ''}
        </text>
      ))}
    </g>
  )
})

function Selection({ dataset, selected }: { dataset: FloorDataset; selected: EntityRef | null }) {
  const shapes = useMemo(() => {
    if (!selected) return []
    switch (selected.kind) {
      case 'zone':
        return dataset.zones.filter((z) => z.id === selected.id).map((z) => z.polygon)
      case 'room':
        return dataset.rooms.filter((r) => r.id === selected.id).map((r) => r.polygon)
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
    <g className={`fp-selection fp-selection-${selected!.kind}`} aria-hidden="true">
      {shapes.map((p, i) => (
        <polygon key={i} points={points(p)} />
      ))}
    </g>
  )
}

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
