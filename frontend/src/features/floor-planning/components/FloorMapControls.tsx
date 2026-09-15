import type { BaseLayer, BaseLayerId } from '../domain/spatial'
import { BASE_LAYER_LABELS, type DebugOptions, type MapSettings, type SourceMode } from '../map/mapSettings'

interface ViewControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
  onFocusSelection?: () => void
}

export function ViewControls({ onZoomIn, onZoomOut, onFit, onReset, onFocusSelection }: ViewControlsProps) {
  return (
    <div className="fp-view-controls" role="toolbar" aria-label="Map view">
      <button type="button" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
        +
      </button>
      <button type="button" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
        −
      </button>
      <button type="button" onClick={onFit} title="Fit floor plate to screen">
        Fit
      </button>
      <button type="button" onClick={onReset} title="Reset view to the whole source sheet">
        Reset
      </button>
      {onFocusSelection && (
        <button type="button" onClick={onFocusSelection} title="Zoom to selection">
          Focus
        </button>
      )}
    </div>
  )
}

const SOURCE_MODES: { id: SourceMode; label: string; hint: string }[] = [
  { id: 'digital', label: 'Digital map', hint: 'Structured SVG geometry only' },
  { id: 'overlay', label: 'Overlay', hint: 'Source PDF raster over the digital map' },
  { id: 'source', label: 'Source PDF', hint: 'Source PDF raster only (entities still outlined)' },
]

interface FloorMapControlsProps {
  settings: MapSettings
  layers: BaseLayer[]
  onChange: (next: MapSettings) => void
}

/** Source comparison, layer visibility and debug switches. */
export function FloorMapControls({ settings, layers, onChange }: FloorMapControlsProps) {
  const set = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => onChange({ ...settings, [key]: value })
  const setDebug = (key: keyof DebugOptions, value: boolean) => set('debug', { ...settings.debug, [key]: value })
  const setLayer = (id: BaseLayerId, value: boolean) => set('layers', { ...settings.layers, [id]: value })

  return (
    <div className="fp-controls">
      <section>
        <h3>Source comparison</h3>
        <div className="fp-segmented" role="radiogroup" aria-label="Source comparison mode">
          {SOURCE_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={settings.sourceMode === m.id}
              className={settings.sourceMode === m.id ? 'is-active' : ''}
              title={m.hint}
              onClick={() => set('sourceMode', m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="fp-slider">
          <span>PDF opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.sourceOpacity * 100)}
            disabled={settings.sourceMode !== 'overlay'}
            onChange={(e) => set('sourceOpacity', Number(e.target.value) / 100)}
          />
          <output>{Math.round(settings.sourceOpacity * 100)}%</output>
        </label>
      </section>

      <section>
        <h3>Layers</h3>
        <label className="fp-check">
          <input type="checkbox" checked={settings.zoneFills} onChange={(e) => set('zoneFills', e.target.checked)} />
          Zone fills
        </label>
        <label className="fp-check">
          <input type="checkbox" checked={settings.labels} onChange={(e) => set('labels', e.target.checked)} />
          Labels
        </label>
        {layers.map((l) => (
          <label key={l.id} className="fp-check" title={`CAD layers: ${l.cadLayers.join(', ')}`}>
            <input type="checkbox" checked={settings.layers[l.id]} onChange={(e) => setLayer(l.id, e.target.checked)} />
            {BASE_LAYER_LABELS[l.id]}
            <span className="fp-tag" data-classification={l.classification}>
              {l.classification}
            </span>
          </label>
        ))}
      </section>

      <section>
        <h3>Debug / verification</h3>
        <label className="fp-check">
          <input type="checkbox" checked={settings.debug.enabled} onChange={(e) => setDebug('enabled', e.target.checked)} />
          Debug mode
        </label>
        <fieldset disabled={!settings.debug.enabled} className="fp-debug-options">
          <label className="fp-check">
            <input type="checkbox" checked={settings.debug.ids} onChange={(e) => setDebug('ids', e.target.checked)} />
            Entity IDs
          </label>
          <label className="fp-check">
            <input type="checkbox" checked={settings.debug.bboxes} onChange={(e) => setDebug('bboxes', e.target.checked)} />
            Bounding boxes
          </label>
          <label className="fp-check">
            <input
              type="checkbox"
              checked={settings.debug.classification}
              onChange={(e) => setDebug('classification', e.target.checked)}
            />
            Classification colours
          </label>
          <label className="fp-check">
            <input type="checkbox" checked={settings.debug.coords} onChange={(e) => setDebug('coords', e.target.checked)} />
            Source coordinates
          </label>
        </fieldset>
      </section>
    </div>
  )
}
