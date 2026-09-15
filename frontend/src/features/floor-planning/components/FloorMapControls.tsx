import type { BaseLayer, BaseLayerId } from '../domain/spatial'
import { BASE_LAYER_LABELS, CLASSIFICATION, SOURCE_MODES } from '../labels'
import type { DebugOptions, MapSettings } from '../map/mapSettings'

interface ViewControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
  onFocusSelection?: () => void
}

export function ViewControls({ onZoomIn, onZoomOut, onFit, onReset, onFocusSelection }: ViewControlsProps) {
  return (
    <div className="fp-view-controls" role="toolbar" aria-label="Điều khiển khung nhìn">
      <div className="fp-btn-group">
        <button type="button" onClick={onZoomIn} title="Phóng to" aria-label="Phóng to">
          +
        </button>
        <button type="button" onClick={onZoomOut} title="Thu nhỏ" aria-label="Thu nhỏ">
          −
        </button>
      </div>
      <div className="fp-btn-group">
        <button type="button" onClick={onFit} title="Vừa khung mặt bằng công trình">
          Vừa khung
        </button>
        <button type="button" onClick={onReset} title="Hiển thị toàn bộ tờ bản vẽ">
          Toàn tờ
        </button>
      </div>
      {onFocusSelection && (
        <button type="button" className="fp-btn-accent" onClick={onFocusSelection} title="Phóng tới đối tượng đang chọn">
          Tới đối tượng
        </button>
      )}
    </div>
  )
}

interface FloorMapControlsProps {
  settings: MapSettings
  layers: BaseLayer[]
  onChange: (next: MapSettings) => void
}

const DEBUG_OPTIONS: { key: Exclude<keyof DebugOptions, 'enabled'>; label: string; hint: string }[] = [
  { key: 'ids', label: 'Mã đối tượng', hint: 'Hiện mã (ID) của vị trí, cụm bàn, khu vực và thiết bị trên bản đồ' },
  { key: 'bboxes', label: 'Khung bao', hint: 'Hiện khung bao (bounding box) của khu vực, cụm bàn và thiết bị' },
  { key: 'classification', label: 'Màu phân loại', hint: 'Tô màu theo phân loại trích xuất và hiện khung ký hiệu ghế' },
  { key: 'coords', label: 'Tọa độ bản vẽ', hint: 'Hiện tọa độ con trỏ theo điểm PDF, milimét và lưới trục' },
]

/** Source comparison, layer visibility and technical inspection switches. */
export function FloorMapControls({ settings, layers, onChange }: FloorMapControlsProps) {
  const set = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => onChange({ ...settings, [key]: value })
  const setDebug = (key: keyof DebugOptions, value: boolean) => set('debug', { ...settings.debug, [key]: value })
  const setLayer = (id: BaseLayerId, value: boolean) => set('layers', { ...settings.layers, [id]: value })
  const activeMode = SOURCE_MODES.find((m) => m.id === settings.sourceMode)!
  const opacity = Math.round(settings.sourceOpacity * 100)

  return (
    <div className="fp-controls">
      <section aria-labelledby="fp-ctl-compare">
        <h2 id="fp-ctl-compare">Đối chiếu bản vẽ</h2>
        <div className="fp-segmented" role="radiogroup" aria-labelledby="fp-ctl-compare">
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
        <p className="fp-hint">{activeMode.hint}</p>
        <label className="fp-slider" data-disabled={settings.sourceMode !== 'overlay' || undefined}>
          <span>Độ mờ bản vẽ</span>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            disabled={settings.sourceMode !== 'overlay'}
            aria-valuetext={`${opacity}%`}
            title={settings.sourceMode !== 'overlay' ? 'Chỉ dùng ở chế độ Chồng lớp' : undefined}
            onChange={(e) => set('sourceOpacity', Number(e.target.value) / 100)}
          />
          <output>{opacity}%</output>
        </label>
      </section>

      <section aria-labelledby="fp-ctl-layers">
        <h2 id="fp-ctl-layers">Lớp hiển thị</h2>
        <div className="fp-check-group">
          <label className="fp-check">
            <input type="checkbox" checked={settings.zoneFills} onChange={(e) => set('zoneFills', e.target.checked)} />
            Màu khu vực
          </label>
          <label className="fp-check">
            <input type="checkbox" checked={settings.labels} onChange={(e) => set('labels', e.target.checked)} />
            Nhãn
          </label>
        </div>
        <h3 className="fp-subhead">Lớp bản vẽ CAD</h3>
        <div className="fp-check-group">
          {layers.map((l) => {
            const unclassified = l.classification === 'UNKNOWN'
            return (
              <label
                key={l.id}
                className="fp-check"
                title={`Lớp CAD: ${l.cadLayers.join(', ')}\nPhân loại: ${CLASSIFICATION[l.classification]}`}
              >
                <input
                  type="checkbox"
                  checked={settings.layers[l.id]}
                  onChange={(e) => setLayer(l.id, e.target.checked)}
                />
                <span className="fp-check-text">{BASE_LAYER_LABELS[l.id]}</span>
                {unclassified && (
                  <span className="fp-layer-flag" aria-label="phân loại chưa xác định">
                    ?
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <p className="fp-hint">
          <span className="fp-layer-flag" aria-hidden="true">
            ?
          </span>{' '}
          Lớp gồm nhiều loại đối tượng, chưa xác định phân loại.
        </p>
      </section>

      <section className="fp-advanced" aria-labelledby="fp-ctl-debug">
        <label className="fp-switch">
          <span className="fp-switch-text">
            <span id="fp-ctl-debug" className="fp-advanced-title">
              Kiểm tra kỹ thuật
            </span>
            <span className="fp-hint">Mã, khung bao, phân loại, tọa độ</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Chế độ kiểm tra"
            checked={settings.debug.enabled}
            onChange={(e) => setDebug('enabled', e.target.checked)}
          />
        </label>
        {settings.debug.enabled && (
          <div className="fp-check-group fp-debug-options">
            {DEBUG_OPTIONS.map((o) => (
              <label key={o.key} className="fp-check" title={o.hint}>
                <input type="checkbox" checked={settings.debug[o.key]} onChange={(e) => setDebug(o.key, e.target.checked)} />
                {o.label}
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
