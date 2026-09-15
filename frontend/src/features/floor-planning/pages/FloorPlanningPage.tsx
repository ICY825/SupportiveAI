import { useCallback, useEffect, useMemo, useState } from 'react'
import { FloorDetailsPanel } from '../components/FloorDetailsPanel'
import { FloorMap } from '../components/FloorMap'
import { FloorMapControls, ViewControls } from '../components/FloorMapControls'
import { FloorSelector } from '../components/FloorSelector'
import { MapLegend } from '../components/MapLegend'
import { FLOORS, findFloor } from '../data/registry'
import { validateFloorDataset } from '../data/validateFloorDataset'
import type { EntityRef, FloorDataset } from '../domain/spatial'
import { gridBounds } from '../map/grid'
import { DEFAULT_SETTINGS, type MapSettings } from '../map/mapSettings'
import { useViewport } from '../map/useViewport'
import { buildHash, parseHash } from './urlState'
import '../floorPlanning.css'

export function FloorPlanningPage() {
  const initial = useMemo(() => parseHash(window.location.hash), [])
  const [floorId, setFloorId] = useState(findFloor(initial.floorId)?.id ?? FLOORS[0].id)
  const [selected, setSelected] = useState<EntityRef | null>(initial.selected)
  const [state, setState] = useState<{ id: string; dataset?: FloorDataset; error?: string } | null>(null)

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
    const next = buildHash({ floorId, selected })
    if (window.location.hash !== next) window.history.replaceState(null, '', next)
  }, [floorId, selected])

  const changeFloor = (id: string) => {
    setSelected(null)
    setFloorId(id)
  }

  const current = state?.id === floorId ? state : null

  return (
    <div className="fp-page">
      <header className="fp-topbar">
        <h1>
          Floor Planning <span className="fp-muted">· Quy hoạch văn phòng</span>
        </h1>
        <FloorSelector floors={FLOORS} value={floorId} onChange={changeFloor} />
        <span className="fp-poc">V1 POC · physical layout only</span>
      </header>
      {!current && <div className="fp-status">Loading floor data…</div>}
      {current?.error && <div className="fp-status is-error">Could not load floor data: {current.error}</div>}
      {current?.dataset && (
        <FloorWorkspace key={floorId} dataset={current.dataset} selected={selected} onSelect={setSelected} />
      )}
    </div>
  )
}

function FloorWorkspace({
  dataset,
  selected,
  onSelect,
}: {
  dataset: FloorDataset
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
}) {
  const [settings, setSettings] = useState<MapSettings>(DEFAULT_SETTINGS)
  const [hovered, setHovered] = useState<EntityRef | null>(null)
  const { floor } = dataset.layout
  const content = useMemo(() => ({ width: floor.width, height: floor.height }), [floor])
  const home = useMemo(() => gridBounds(dataset.layout), [dataset])
  const vp = useViewport(content, home)
  const issues = useMemo(() => validateFloorDataset(dataset), [dataset])

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

  const hoverLabel = useMemo(() => {
    if (!hovered) return null
    if (hovered.kind === 'zone') return dataset.zones.find((z) => z.id === hovered.id)?.name ?? 'Unlabeled zone (UNKNOWN)'
    if (hovered.kind === 'room') return dataset.rooms.find((r) => r.id === hovered.id)?.name
    if (hovered.kind === 'object') return dataset.objects.find((o) => o.id === hovered.id)?.name
    return hovered.id
  }, [hovered, dataset])

  const selBBox = selected ? bboxOf(selected) : undefined
  const setViewport = vp.setViewport

  return (
    <div className="fp-workspace">
      <aside className="fp-sidebar">
        <FloorMapControls settings={settings} layers={dataset.layout.layers} onChange={setSettings} />
      </aside>
      <main className="fp-main">
        <div className="fp-map-toolbar">
          <MapLegend />
          <ViewControls
            onZoomIn={() => vp.zoomBy(1.4)}
            onZoomOut={() => vp.zoomBy(1 / 1.4)}
            onFit={vp.fit}
            onReset={vp.reset}
            onFocusSelection={selBBox ? () => vp.focus(selBBox) : undefined}
          />
        </div>
        <div className="fp-map-wrap">
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
          />
          <div className="fp-hover" aria-live="polite">
            {hoverLabel ?? <span className="fp-muted">Drag to pan · scroll to zoom · click to select</span>}
          </div>
          {settings.sourceMode !== 'digital' && (
            <div className="fp-source-banner">
              Source: {dataset.sourceName} · raster reference with the reviewer's markup
            </div>
          )}
        </div>
      </main>
      <FloorDetailsPanel
        dataset={dataset}
        selected={selected}
        onSelect={onSelect}
        debug={settings.debug.enabled}
        issues={issues}
      />
    </div>
  )
}
