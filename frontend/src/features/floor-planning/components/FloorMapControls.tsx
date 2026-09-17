import { useMemo, type ReactNode } from 'react'
import type { AllocationSource } from '../domain/allocation'
import { DESK_STATUSES, type DeskRecord } from '../domain/desk'
import type { BaseLayer, BaseLayerId, EntityRef, FloorDataset } from '../domain/spatial'
import {
  BASE_LAYER_LABELS,
  CLASSIFICATION,
  DEMO_DATA_LABEL,
  NO_OPERATIONAL_DATA,
  NO_OPERATIONAL_DATA_HINT,
  NOT_AVAILABLE,
  SOURCE_MODES,
  UNLABELED_ZONE,
} from '../labels'
import type { DebugOptions, MapSettings } from '../map/mapSettings'
import { DeskStatusBadge } from './desk-inspector/DeskStatusBadge'

interface ViewControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
  onFocusSelection?: () => void
}

export function ViewControls({ onZoomIn, onZoomOut, onFit, onReset, onFocusSelection }: ViewControlsProps) {
  return (
    <div className="fp-toolbar fp-view-controls" role="toolbar" aria-label="Điều khiển khung nhìn">
      <div className="fp-btn-group">
        <button type="button" onClick={onZoomOut} title="Thu nhỏ" aria-label="Thu nhỏ">
          −
        </button>
        <button type="button" onClick={onZoomIn} title="Phóng to" aria-label="Phóng to">
          +
        </button>
      </div>
      <div className="fp-btn-group">
        <button type="button" onClick={onFit} title="Đưa toàn bộ mặt bằng vào khung nhìn">
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
  dataset: FloorDataset
  desks?: ReadonlyMap<string, DeskRecord>
  allocationSource?: AllocationSource
  selected?: EntityRef | null
}

const DASH = '—'
const nf = new Intl.NumberFormat('vi-VN')

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="fp-row">
      <dt title={hint}>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const DEBUG_OPTIONS: { key: Exclude<keyof DebugOptions, 'enabled'>; label: string; hint: string }[] = [
  { key: 'ids', label: 'Mã đối tượng', hint: 'Hiện mã (ID) của vị trí, cụm bàn, khu vực và thiết bị trên bản đồ' },
  { key: 'bboxes', label: 'Khung bao', hint: 'Hiện khung bao (bounding box) của khu vực, cụm bàn và thiết bị' },
  { key: 'classification', label: 'Màu phân loại', hint: 'Tô màu theo phân loại trích xuất và hiện khung ký hiệu ghế' },
  { key: 'coords', label: 'Tọa độ bản vẽ', hint: 'Hiện tọa độ con trỏ theo điểm PDF, milimét và lưới trục' },
]

/** Source comparison, layer visibility, operational data, source specs and technical inspection. */
export function FloorMapControls({
  settings,
  layers,
  onChange,
  dataset,
  desks,
  allocationSource,
  selected,
}: FloorMapControlsProps) {
  const set = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => onChange({ ...settings, [key]: value })
  const setDebug = (key: keyof DebugOptions, value: boolean) => set('debug', { ...settings.debug, [key]: value })
  const setLayer = (id: BaseLayerId, value: boolean) => set('layers', { ...settings.layers, [id]: value })
  const activeMode = SOURCE_MODES.find((m) => m.id === settings.sourceMode)!
  const opacity = Math.round(settings.sourceOpacity * 100)

  const { floor } = dataset.layout
  const { pdf } = dataset.extraction

  const scopeInfo = useMemo(() => {
    if (!selected) {
      return {
        label: 'Toàn tầng',
        workstations: dataset.workstations.filter((w) => w.classification === 'WORKSTATION'),
      }
    }
    if (selected.kind === 'zone') {
      const z = dataset.zones.find((k) => k.id === selected.id)
      return {
        label: `Khu vực: ${z?.name ?? UNLABELED_ZONE}`,
        workstations: dataset.workstations.filter((w) => w.zoneId === selected.id && w.classification === 'WORKSTATION'),
      }
    }
    if (selected.kind === 'cluster') {
      return {
        label: `Cụm bàn: ${selected.id}`,
        workstations: dataset.workstations.filter((w) => w.clusterId === selected.id),
      }
    }
    if (selected.kind === 'workstation') {
      return {
        label: `Vị trí: ${selected.id}`,
        workstations: dataset.workstations.filter((w) => w.id === selected.id),
      }
    }
    return {
      label: 'Toàn tầng',
      workstations: dataset.workstations.filter((w) => w.classification === 'WORKSTATION'),
    }
  }, [selected, dataset])

  const inScopeDesks = useMemo(() => {
    if (!desks) return []
    const ids = new Set(scopeInfo.workstations.map((w) => w.id))
    return [...desks.values()].filter((d) => ids.has(d.workstation.id))
  }, [desks, scopeInfo])

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

      <section aria-labelledby="fp-ctl-operational">
        <details className="fp-section fp-operational" open>
          <summary>
            <h3 id="fp-ctl-operational">Dữ liệu vận hành</h3>
          </summary>
          {desks && desks.size > 0 ? (
            <div>
              {allocationSource?.kind === 'demo' && (
                <p className="fp-sub" style={{ margin: '4px 0 8px' }}>
                  {DEMO_DATA_LABEL} · chưa kết nối HR/Admin
                </p>
              )}
              <div className="fp-hint" style={{ margin: '4px 0 8px', fontWeight: 500 }}>
                Phạm vi: {scopeInfo.label} ({scopeInfo.workstations.length} vị trí)
              </div>
              {inScopeDesks.length === 0 ? (
                <p className="fp-empty">Không có chỗ ngồi trong phạm vi này</p>
              ) : (
                <ul className="fp-list">
                  {DESK_STATUSES.map((st) => (
                    <li key={st}>
                      <DeskStatusBadge status={st} size="sm" />
                      <span className="fp-count">
                        {inScopeDesks.filter((d) => d.status === st).length}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div>
              <p className="fp-empty">
                {NO_OPERATIONAL_DATA}
                <span className="fp-sub" style={{ display: 'block', marginTop: 2, color: 'var(--muted)' }}>
                  {NO_OPERATIONAL_DATA_HINT}
                </span>
              </p>
              <dl>
                <Row label="Chỗ ngồi đã xác minh">
                  <span aria-label={NOT_AVAILABLE} title={NOT_AVAILABLE} className="fp-muted">
                    {desks ? 'Chọn bàn trên bản đồ' : DASH}
                  </span>
                </Row>
                <Row label="Nhân sự đã bố trí">
                  <span aria-label={NOT_AVAILABLE} title={NOT_AVAILABLE} className="fp-muted">
                    {desks ? 'Chọn bàn trên bản đồ' : DASH}
                  </span>
                </Row>
                <Row label="Tỷ lệ sử dụng">
                  <span aria-label={NOT_AVAILABLE} title={NOT_AVAILABLE} className="fp-muted">
                    {desks ? 'Chọn bàn trên bản đồ' : DASH}
                  </span>
                </Row>
              </dl>
            </div>
          )}
        </details>
      </section>

      <section aria-labelledby="fp-ctl-source">
        <details className="fp-section" open>
          <summary>
            <h3 id="fp-ctl-source">Nguồn dữ liệu</h3>
          </summary>
          <dl>
            <Row label="Bản vẽ gốc">
              <span className="fp-filename" title={floor.sourcePdf}>
                {dataset.sourceName}
              </span>
            </Row>
            <Row label="Tỷ lệ bản vẽ">{floor.sourceScale}</Row>
            <Row label="Phần mềm xuất">{pdf.creator || DASH}</Row>
            {pdf.producer && <Row label="Trình tạo PDF">{pdf.producer}</Row>}
            <Row label="Ghế nhận diện">{dataset.extraction.chairSymbolsDetected} ký hiệu</Row>
          </dl>
        </details>
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

      <section className="fp-advanced" aria-labelledby="fp-ctl-tech">
        <details className="fp-technical">
          <summary id="fp-ctl-tech">Chi tiết kỹ thuật</summary>
          <dl>
            <Row label="Hệ tọa độ">Điểm PDF, gốc trên-trái</Row>
            <Row label="Quy đổi">1 pt ≈ {floor.mmPerPt.toFixed(2)} mm</Row>
            <Row label="Khổ vẽ">
              {nf.format(Math.round(floor.width * floor.mmPerPt))} × {nf.format(Math.round(floor.height * floor.mmPerPt))} mm
            </Row>
            <Row label="Đối tượng vector">{nf.format(pdf.vectorPathObjects)}</Row>
            <Row label="Dòng chữ">{nf.format(pdf.textLines)}</Row>
            <Row label="Chú thích PDF">{pdf.annotations}</Row>
            <Row label="Mã SHA-256">
              <span className="fp-mono fp-filename" title={dataset.layout.sourcePdfSha256}>
                {dataset.layout.sourcePdfSha256.slice(0, 16)}…
              </span>
            </Row>
            {selected && (
              <Row label="Đối tượng chọn">
                <span className="fp-mono">{selected.id}</span> ({selected.kind})
              </Row>
            )}
          </dl>
        </details>
      </section>
    </div>
  )
}
