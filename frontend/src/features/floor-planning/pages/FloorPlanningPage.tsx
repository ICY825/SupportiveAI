import { useCallback, useEffect, useMemo, useState } from 'react'
import { FloorDetailsPanel } from '../components/FloorDetailsPanel'
import { FloorMap } from '../components/FloorMap'
import { FloorMapControls, ViewControls } from '../components/FloorMapControls'
import { FloorSelector } from '../components/FloorSelector'
import { MapLegend } from '../components/MapLegend'
import { FLOORS, findFloor } from '../data/registry'
import { validateFloorDataset } from '../data/validateFloorDataset'
import type { BBox, EntityRef, FloorDataset } from '../domain/spatial'
import { UNLABELED_ZONE, objectName } from '../labels'
import { gridBounds } from '../map/grid'
import { DEFAULT_SETTINGS, type MapSettings } from '../map/mapSettings'
import { useViewport } from '../map/useViewport'
import { buildHash, parseHash } from './urlState'
import '../floorPlanning.css'

/** Smallest area (floor points) "focus" frames, so a single desk keeps its surroundings in view. */
const FOCUS_MIN_PT = 160

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

  // A pasted or edited link in the same tab only changes the hash.
  useEffect(() => {
    const onHash = () => {
      const next = parseHash(window.location.hash)
      const floor = findFloor(next.floorId)
      if (floor) setFloorId(floor.id)
      setSelected(next.selected)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const changeFloor = (id: string) => {
    setSelected(null)
    setFloorId(id)
  }

  const current = state?.id === floorId ? state : null
  const floorLabel = findFloor(floorId)?.label

  return (
    <div className="fp-page">
      <header className="fp-topbar">
        <h1>Mặt bằng văn phòng</h1>
        <FloorSelector floors={FLOORS} value={floorId} onChange={changeFloor} />
        <p className="fp-scope" title="Dữ liệu trích xuất từ bản vẽ nguồn. Chưa bao gồm chỗ ngồi, nhân sự hay tình trạng sử dụng.">
          <span className="fp-scope-dot" aria-hidden="true" />
          Dữ liệu mặt bằng vật lý
        </p>
      </header>
      {!current && (
        <div className="fp-state" role="status">
          Đang tải dữ liệu {floorLabel?.toLowerCase()}…
        </div>
      )}
      {current?.error && (
        <div className="fp-state is-error" role="alert">
          <strong>Không tải được dữ liệu mặt bằng.</strong>
          <span className="fp-mono">{current.error}</span>
        </div>
      )}
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
  // extra padding keeps source zone labels near the plate edge inside the fitted view
  const home = useMemo(() => gridBounds(dataset.layout, 60), [dataset])
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
    if (hovered.kind === 'zone') return dataset.zones.find((z) => z.id === hovered.id)?.name ?? UNLABELED_ZONE
    if (hovered.kind === 'room') return dataset.rooms.find((r) => r.id === hovered.id)?.name
    if (hovered.kind === 'object') {
      const o = dataset.objects.find((k) => k.id === hovered.id)
      return o && objectName(o)
    }
    return `Vị trí làm việc ${hovered.id}`
  }, [hovered, dataset])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !selected) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable]')) return
      onSelect(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, onSelect])

  const selBBox = selected ? bboxOf(selected) : undefined
  const setViewport = vp.setViewport
  const focusSelection = (b: BBox) => {
    const cx = (b[0] + b[2]) / 2
    const cy = (b[1] + b[3]) / 2
    const hw = Math.max(b[2] - b[0], FOCUS_MIN_PT) / 2
    const hh = Math.max(b[3] - b[1], FOCUS_MIN_PT) / 2
    vp.focus([cx - hw, cy - hh, cx + hw, cy + hh])
  }

  return (
    <div className="fp-workspace">
      <aside className="fp-sidebar" aria-label="Điều khiển bản đồ">
        <FloorMapControls settings={settings} layers={dataset.layout.layers} onChange={setSettings} />
      </aside>
      <main className="fp-main">
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
          {hoverLabel ?? <span className="fp-hover-hint">Kéo để di chuyển · Cuộn để thu phóng · Nhấp để chọn</span>}
        </div>
        <ViewControls
          onZoomIn={() => vp.zoomBy(1.4)}
          onZoomOut={() => vp.zoomBy(1 / 1.4)}
          onFit={vp.fit}
          onReset={vp.reset}
          onFocusSelection={selBBox ? () => focusSelection(selBBox) : undefined}
        />
        <div className="fp-map-foot">
          {settings.sourceMode !== 'digital' && (
            <p className="fp-source-note" title={dataset.layout.floor.sourcePdf}>
              <span className="fp-source-note-label">Bản vẽ gốc</span>
              <span className="fp-filename">{dataset.sourceName}</span>
              <span className="fp-source-note-extra">· ảnh raster, gồm chú thích của người rà soát</span>
            </p>
          )}
          <MapLegend />
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
