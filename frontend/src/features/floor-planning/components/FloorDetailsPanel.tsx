import { useState, type ReactNode } from 'react'
import type { AllocationSource } from '../domain/allocation'
import type { DeskRecord } from '../domain/desk'
import type { EntityRef, FloorDataset, Point, Room, VerificationState, Zone } from '../domain/spatial'
import { ROOM_TYPES, ROOM_TYPE_LABEL, type RoomType } from '../domain/roomTypes'
import { polygonCentroid } from '../domain/zoneCustomization'
import type { ValidationIssue } from '../data/validateFloorDataset'
import {
  CLASSIFICATION,
  UNLABELED_ZONE,
  generated,
  objectName,
} from '../labels'
import { MapLegend } from './MapLegend'
import { VerificationStatus } from './VerificationStatus'

interface FloorDetailsPanelProps {
  dataset: FloorDataset
  baseDataset?: FloorDataset
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
  debug: boolean
  issues: ValidationIssue[]
  /** workspace view: desks derived from attached allocation data (demo or API) */
  desks?: ReadonlyMap<string, DeskRecord>
  allocationSource?: AllocationSource
  onZoneUpdate?: (update: {
    zoneId: string
    name?: string | null
    labelAnchor?: Point
    sourceColor?: string | null
    verification?: VerificationState
    type?: 'WORKSPACE_ZONE' | 'UNKNOWN'
  }) => void
  onResetZone?: (zoneId: string) => void
  onResetAllZones?: () => void
  onBeginRoomDraw?: () => void
  pendingRoom?: Point[][] | null
  roomDrawing?: boolean
  roomOverlapCount?: number
  roomError?: string | null
  onCancelRoomDraw?: () => void
  onAddRoomPart?: () => void
  onRemoveLastRoomPart?: () => void
  onSaveAuthoredRoom?: (payload: { polygons: Point[][]; name: string; type: RoomType }) => string | null | undefined
  onDeleteAuthoredRoom?: (roomId: string) => void
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

/**
 * A collapsible block of the details panel. Every section in this panel is one,
 * so the whole panel folds the same way "Chi tiết kỹ thuật" always has.
 *
 * Collapsed by default, and re-collapsed whenever the selection changes (see
 * the keyed wrapper below): the panel opens as a short index of what is known
 * about the entity, and the reader expands only the part they came for.
 */
function Section({
  title,
  children,
  className,
  open = false,
}: {
  title: string
  children: ReactNode
  className?: string
  open?: boolean
}) {
  return (
    <details className={`fp-section${className ? ` ${className}` : ''}`} open={open}>
      <summary>
        <h3>{title}</h3>
      </summary>
      {children}
    </details>
  )
}

function Link({ to, onSelect, children }: { to: EntityRef; onSelect: (r: EntityRef) => void; children: ReactNode }) {
  return (
    <button type="button" className="fp-link" onClick={() => onSelect(to)}>
      {children}
    </button>
  )
}

function Head({ kicker, title, state }: { kicker: string; title: ReactNode; state: VerificationState }) {
  return (
    <header className="fp-panel-head">
      <p className="fp-kicker">{kicker}</p>
      <h2>{title}</h2>
      <VerificationStatus state={state} />
    </header>
  )
}

const fmtPt = (p: Point) => `${p[0].toFixed(1)}, ${p[1].toFixed(1)}`

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null
  return (
    <ul className="fp-notes" aria-label="Lưu ý từ bản vẽ">
      {notes.map((n) => (
        <li key={n} title={generated(n) !== n ? n : undefined}>
          {generated(n)}
        </li>
      ))}
    </ul>
  )
}

function ZoneDepartmentEditor({
  zone,
  baseDataset,
  onZoneUpdate,
  onResetZone,
}: {
  zone: Zone
  baseDataset?: FloorDataset
  onZoneUpdate?: (update: {
    zoneId: string
    name?: string | null
    labelAnchor?: Point
    sourceColor?: string | null
    verification?: VerificationState
    type?: 'WORKSPACE_ZONE' | 'UNKNOWN'
  }) => void
  onResetZone?: (zoneId: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [nameInput, setNameInput] = useState(zone.name ?? '')
  const [selectedColor, setSelectedColor] = useState(zone.sourceColor ?? '#c3d6f8')

  const baseZone = baseDataset?.zones.find((z) => z.id === zone.id)
  const isModified =
    baseZone &&
    (baseZone.name !== zone.name ||
      baseZone.sourceColor !== zone.sourceColor ||
      baseZone.labelAnchor[0] !== zone.labelAnchor[0] ||
      baseZone.labelAnchor[1] !== zone.labelAnchor[1] ||
      baseZone.verification !== zone.verification)

  const colorPalette = [
    { label: 'Xanh AI', value: '#c3d6f8' },
    { label: 'Xanh Smart City', value: '#8de7ed' },
    { label: 'Vàng GSM', value: '#fffbe1' },
    { label: 'Hồng VinFast', value: '#fbcecc' },
    { label: 'Tím nhạt', value: '#dadef8' },
    { label: 'Xanh lá pastel', value: '#d4f0d0' },
  ]

  const handleSave = () => {
    const trimmed = nameInput.trim()
    if (trimmed) {
      onZoneUpdate?.({
        zoneId: zone.id,
        name: trimmed,
        verification: 'SOURCE_VERIFIED',
        type: 'WORKSPACE_ZONE',
        sourceColor: selectedColor,
      })
    } else {
      onZoneUpdate?.({
        zoneId: zone.id,
        name: null,
        verification: 'UNKNOWN',
        type: 'UNKNOWN',
        sourceColor: null,
      })
    }
    setIsEditing(false)
  }

  const handleUnassign = () => {
    onZoneUpdate?.({
      zoneId: zone.id,
      name: null,
      verification: 'UNKNOWN',
      type: 'UNKNOWN',
      sourceColor: null,
    })
    setNameInput('')
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="fp-zone-edit-box">
        <div className="fp-form-group">
          <label className="fp-form-label" htmlFor="dept-name-input">
            Tên phòng ban:
          </label>
          <input
            id="dept-name-input"
            type="text"
            className="fp-input"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Nhập tên phòng ban..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') setIsEditing(false)
            }}
          />
        </div>

        <div className="fp-form-group">
          <span className="fp-form-label">Màu nhận diện khu vực:</span>
          <div className="fp-color-palette">
            {colorPalette.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`fp-color-dot${selectedColor === c.value ? ' is-active' : ''}`}
                style={{ backgroundColor: c.value }}
                title={c.label}
                onClick={() => setSelectedColor(c.value)}
              />
            ))}
          </div>
        </div>

        <div className="fp-zone-form-actions">
          <div className="fp-zone-form-primary-actions">
            <button type="button" className="fp-btn is-primary fp-btn-sm" onClick={handleSave}>
              Lưu thay đổi
            </button>
            <button
              type="button"
              className="fp-btn fp-btn-sm"
              onClick={() => {
                setNameInput(zone.name ?? '')
                setIsEditing(false)
              }}
            >
              Hủy
            </button>
          </div>
          {zone.name && (
            <button type="button" className="fp-btn fp-btn-sm is-danger" onClick={handleUnassign}>
              Xóa phòng ban
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fp-zone-actions-wrap">
      {!zone.name ? (
        <p className="fp-callout" data-verification="UNKNOWN">
          <span aria-hidden="true">? </span>
          <span>Chưa có phòng ban</span>
          <span className="fp-sub"> ({UNLABELED_ZONE})</span>
        </p>
      ) : (
        <span className="fp-sr-only">Đã gán phòng ban</span>
      )}
      <div className="fp-zone-actions">
        <button
          type="button"
          className={`fp-action-btn${!zone.name ? ' is-primary' : ''}`}
          onClick={() => {
            setNameInput(zone.name ?? '')
            setSelectedColor(zone.sourceColor ?? '#c3d6f8')
            setIsEditing(true)
          }}
        >
          {zone.name ? 'Đổi tên phòng ban' : '+ Gán tên phòng ban'}
        </button>
        {zone.name && (
          <button type="button" className="fp-action-btn is-danger" onClick={handleUnassign}>
            Xóa phòng ban
          </button>
        )}
        {isModified && (
          <button
            type="button"
            className="fp-action-btn"
            title="Khôi phục thông tin phòng ban và vị trí theo bản vẽ gốc"
            onClick={() => onResetZone?.(zone.id)}
          >
            ↺ Khôi phục gốc
          </button>
        )}
      </div>
    </div>
  )
}

function ZoneLabelSection({
  zone,
  baseDataset,
  onZoneUpdate,
}: {
  zone: Zone
  baseDataset?: FloorDataset
  onZoneUpdate?: (update: {
    zoneId: string
    labelAnchor?: Point
  }) => void
}) {
  const baseZone = baseDataset?.zones.find((z) => z.id === zone.id)
  const isPositionModified =
    baseZone &&
    (baseZone.labelAnchor[0] !== zone.labelAnchor[0] || baseZone.labelAnchor[1] !== zone.labelAnchor[1])

  const handleCenterLabel = () => {
    const centroid = polygonCentroid(zone.polygon)
    onZoneUpdate?.({
      zoneId: zone.id,
      labelAnchor: centroid,
    })
  }

  const handleResetPosition = () => {
    if (baseZone) {
      onZoneUpdate?.({
        zoneId: zone.id,
        labelAnchor: [...baseZone.labelAnchor],
      })
    }
  }

  const handleNudge = (dx: number, dy: number) => {
    const newX = Number((zone.labelAnchor[0] + dx).toFixed(1))
    const newY = Number((zone.labelAnchor[1] + dy).toFixed(1))
    onZoneUpdate?.({
      zoneId: zone.id,
      labelAnchor: [newX, newY],
    })
  }

  return (
    <Section title="Vị trí nhãn">
      <dl>
        <Row label="Tọa độ nhãn (pt)" hint="Tọa độ điểm neo của chữ trên bản vẽ gốc">
          <span className="fp-mono">{fmtPt(zone.labelAnchor)}</span>
        </Row>
        <Row label="Dịch chuyển" hint="Dịch vị trí nhãn 10pt theo từng hướng">
          <div className="fp-nudge-group">
            <button
              type="button"
              className="fp-nudge-btn"
              onClick={() => handleNudge(-10, 0)}
              title="Dịch trái 10pt"
            >
              ← Trái
            </button>
            <button
              type="button"
              className="fp-nudge-btn"
              onClick={() => handleNudge(10, 0)}
              title="Dịch phải 10pt"
            >
              Phải →
            </button>
            <button
              type="button"
              className="fp-nudge-btn"
              onClick={() => handleNudge(0, -10)}
              title="Dịch lên 10pt"
            >
              ↑ Lên
            </button>
            <button
              type="button"
              className="fp-nudge-btn"
              onClick={() => handleNudge(0, 10)}
              title="Dịch xuống 10pt"
            >
              ↓ Xuống
            </button>
          </div>
        </Row>
        <Row label="Căn chỉnh">
          <div className="fp-inline-actions">
            <button
              type="button"
              className="fp-link"
              onClick={handleCenterLabel}
              title="Căn giữa tiêu đề theo trọng tâm khu vực"
            >
              Căn giữa khu vực
            </button>
            {isPositionModified && (
              <>
                <span className="fp-sep">·</span>
                <button
                  type="button"
                  className="fp-link"
                  onClick={handleResetPosition}
                  title="Khôi phục vị trí tiêu đề về mặc định bản vẽ gốc"
                >
                  Đặt lại vị trí
                </button>
              </>
            )}
          </div>
        </Row>
      </dl>
      <p className="fp-panel-hint">
        💡 Kéo trực tiếp nhãn trên bản đồ để di chuyển tự do như công cụ PDF.
      </p>
    </Section>
  )
}

function AuthoredRoomControls({
  rooms,
  pendingRoom,
  roomDrawing,
  roomOverlapCount,
  roomError,
  onBeginRoomDraw,
  onCancelRoomDraw,
  onAddRoomPart,
  onRemoveLastRoomPart,
  onSaveAuthoredRoom,
  onDeleteAuthoredRoom,
}: {
  rooms: readonly Room[]
  pendingRoom?: Point[][] | null
  roomDrawing?: boolean
  roomOverlapCount?: number
  roomError?: string | null
  onBeginRoomDraw?: () => void
  onCancelRoomDraw?: () => void
  onAddRoomPart?: () => void
  onRemoveLastRoomPart?: () => void
  onSaveAuthoredRoom?: (payload: { polygons: Point[][]; name: string; type: RoomType }) => string | null | undefined
  onDeleteAuthoredRoom?: (roomId: string) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<RoomType>('OTHER')
  const [formError, setFormError] = useState<string | null>(null)
  const authoredRooms = rooms.filter((room) => room.source.kind === 'user-authored')

  const save = () => {
    if (!pendingRoom || !onSaveAuthoredRoom) return
    const trimmed = name.trim()
    if (!trimmed) {
      setFormError('Nhập tên phòng trước khi lưu.')
      return
    }
    const error = onSaveAuthoredRoom({ polygons: pendingRoom, name: trimmed, type })
    if (error) {
      setFormError(error)
      return
    }
    setName('')
    setType('OTHER')
    setFormError(null)
  }

  return (
    <section className="fp-authored-tools" aria-label="Thực thể do người dùng tạo">
      <div className="fp-authored-tools-head">
        <div>
          <p className="fp-eyebrow">Tạo trên mặt bằng</p>
          <h3>Phòng do người dùng tạo</h3>
        </div>
        {!pendingRoom && !roomDrawing && onBeginRoomDraw && (
          <button type="button" className="fp-action-btn is-primary" onClick={onBeginRoomDraw}>+ Tạo phòng</button>
        )}
      </div>
      {roomDrawing && (
        <div className="fp-authored-room-form" role="status">
          {pendingRoom && <p className="fp-sub"><strong>Đang vẽ phần {pendingRoom.length + 1} của phòng.</strong></p>}
          <p className="fp-sub">
            Kéo để vẽ phòng hình chữ nhật, hoặc nhấp từng góc cho phòng có hình dạng khác. Cạnh tự bám theo góc 0°, 45° và 90°; giữ Shift để vẽ tự do.
          </p>
          <p className="fp-sub">Nhấp lại góc đầu tiên, nhấp đúp hoặc nhấn Enter để khép kín. Backspace xóa góc vừa đặt.</p>
          <div className="fp-zone-form-actions">
            <button type="button" className="fp-btn-sm" onClick={() => onCancelRoomDraw?.()}>Hủy</button>
          </div>
        </div>
      )}
      {pendingRoom && !roomDrawing && (
        <div className="fp-authored-room-form">
          <p className="fp-sub">Đặt tên và loại cho phòng vừa vẽ.</p>
          <div className="fp-room-parts" role="group" aria-label="Các phần của phòng">
            <span>{pendingRoom.length === 1 ? '1 phần' : `${pendingRoom.length} phần · một phòng, một nhãn`}</span>
            {onAddRoomPart && <button type="button" className="fp-btn-sm" onClick={onAddRoomPart}>+ Thêm phần</button>}
            {onRemoveLastRoomPart && pendingRoom.length > 1 && <button type="button" className="fp-btn-sm" onClick={onRemoveLastRoomPart}>Bỏ phần cuối</button>}
          </div>
          {roomOverlapCount ? (
            <p className="fp-form-warning" role="status">
              {roomOverlapCount} chỗ ngồi nằm trong phòng này. Tạo phòng không thay đổi trạng thái bàn.
            </p>
          ) : null}
          <label className="fp-form-label" htmlFor="authored-room-name">Tên phòng</label>
          <input id="authored-room-name" className="fp-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Phòng họp nhỏ" autoFocus />
          <label className="fp-form-label" htmlFor="authored-room-type">Loại phòng</label>
          <select id="authored-room-type" className="fp-input" value={type} onChange={(event) => setType(event.target.value as RoomType)}>
            {ROOM_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {(formError || roomError) && <p className="fp-form-error" role="alert">{formError ?? roomError}</p>}
          <div className="fp-zone-form-actions">
            <button type="button" className="fp-btn-sm is-primary" onClick={save}>Lưu phòng</button>
            <button type="button" className="fp-btn-sm" onClick={() => { setFormError(null); onCancelRoomDraw?.() }}>Hủy</button>
          </div>
        </div>
      )}
      {authoredRooms.length > 0 && (
        <ul className="fp-authored-entity-list">
          {authoredRooms.map((room) => (
            <li key={room.id}>
              <span><strong>{room.name}</strong><small>{ROOM_TYPE_LABEL[room.type]}</small></span>
              {onDeleteAuthoredRoom && <button type="button" className="fp-action-btn is-danger" onClick={() => onDeleteAuthoredRoom(room.id)}>Xóa</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function FloorDetailsPanel({
  dataset,
  baseDataset,
  selected,
  onSelect,
  debug,
  issues,
  onZoneUpdate,
  onResetZone,
  onResetAllZones,
  onBeginRoomDraw,
  pendingRoom,
  roomDrawing,
  roomOverlapCount,
  roomError,
  onCancelRoomDraw,
  onAddRoomPart,
  onRemoveLastRoomPart,
  onSaveAuthoredRoom,
  onDeleteAuthoredRoom,
}: FloorDetailsPanelProps) {
  const { layout } = dataset
  const floor = layout.floor
  const zoneName = (id: string | null) => {
    if (!id) return <span className="fp-unknown">Ngoài các khu vực</span>
    const z = dataset.zones.find((k) => k.id === id)
    return (
      <Link to={{ kind: 'zone', id }} onSelect={onSelect}>
        {z?.name ?? UNLABELED_ZONE}
      </Link>
    )
  }

  let body: ReactNode
  let raw: unknown = null

  if (!selected) {
    const ws = dataset.workstations.filter((w) => w.classification === 'WORKSTATION')
    const unknownCount =
      dataset.zones.filter((z) => z.verification === 'UNKNOWN').length +
      dataset.workstations.filter((w) => w.classification === 'UNKNOWN').length +
      dataset.objects.filter((o) => o.classification === 'UNKNOWN').length
    body = (
      <>
        <header className="fp-panel-head">
          <h2>{floor.name}</h2>
          <p className="fp-head-meta">
            Tòa nhà:{' '}
            {dataset.building.name ?? (
              <span className="fp-unknown" title="Bản vẽ nguồn không ghi tên tòa nhà">
                chưa xác định
              </span>
            )}
          </p>
        </header>

        <dl className="fp-stats">
          <div>
            <dt>Khu vực</dt>
            <dd>{dataset.zones.length}</dd>
          </div>
          <div>
            <dt>Cụm bàn</dt>
            <dd>{dataset.clusters.length}</dd>
          </div>
          <div>
            <dt title="Bàn có ký hiệu ghế, trích xuất tự động và chưa được xác minh">Vị trí làm việc vật lý</dt>
            <dd>{ws.length}</dd>
          </div>
          <div>
            <dt>Tiện ích / thiết bị</dt>
            <dd>{dataset.objects.filter((o) => o.classification === 'FACILITY').length}</dd>
          </div>
        </dl>
        {(onBeginRoomDraw || pendingRoom || roomDrawing || dataset.rooms.some((room) => room.source.kind === 'user-authored')) && (
          <AuthoredRoomControls
            rooms={dataset.rooms}
            pendingRoom={pendingRoom}
            roomDrawing={roomDrawing}
            roomOverlapCount={roomOverlapCount}
            roomError={roomError}
            onBeginRoomDraw={onBeginRoomDraw}
            onCancelRoomDraw={onCancelRoomDraw}
            onAddRoomPart={onAddRoomPart}
            onRemoveLastRoomPart={onRemoveLastRoomPart}
            onSaveAuthoredRoom={onSaveAuthoredRoom}
            onDeleteAuthoredRoom={onDeleteAuthoredRoom}
          />
        )}
        {unknownCount > 0 && (
          <p className="fp-callout" data-verification="UNKNOWN">
            <span aria-hidden="true">?</span> {unknownCount} đối tượng chưa xác định cần Admin làm rõ
          </p>
        )}

        <Section title="Khu vực" open>
          <ul className="fp-list">
            {dataset.zones.map((z) => {
              return (
                <li key={z.id}>
                  <Link to={{ kind: 'zone', id: z.id }} onSelect={onSelect}>
                    {z.name ?? <span className="fp-unknown">{UNLABELED_ZONE}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
          {onResetAllZones && baseDataset && (
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="fp-btn-sm"
                title="Khôi phục toàn bộ phòng ban trên tầng này về bản vẽ gốc"
                onClick={() => {
                  if (window.confirm('Bạn có chắc muốn khôi phục toàn bộ phòng ban và vị trí nhãn về mặc định bản vẽ gốc?')) {
                    onResetAllZones()
                  }
                }}
              >
                ↺ Đặt lại tất cả khu vực
              </button>
            </div>
          )}
        </Section>
      </>
    )
    raw = { floor, extraction: dataset.extraction }
  } else if (selected.kind === 'zone') {
    const z = dataset.zones.find((k) => k.id === selected.id)
    if (z) {
      const ws = dataset.workstations.filter((w) => w.zoneId === z.id && w.classification === 'WORKSTATION')
      const clusters = dataset.clusters.filter((c) => c.zoneId === z.id)
      const objects = dataset.objects.filter((o) => o.zoneId === z.id)
      raw = z
      body = (
        <>
          <Head
            kicker={z.type === 'WORKSPACE_ZONE' ? 'Khu vực làm việc' : 'Khu vực · chưa xác định loại'}
            title={z.name ?? <span className="fp-unknown">{UNLABELED_ZONE}</span>}
            state={z.verification}
          />
          <ZoneDepartmentEditor
            zone={z}
            baseDataset={baseDataset}
            onZoneUpdate={onZoneUpdate}
          onResetZone={onResetZone}
          />
          <dl>
            <Row label="Vị trí làm việc vật lý" hint="Bàn có ký hiệu ghế, tâm nằm trong đường viền khu vực">
              {ws.length}
            </Row>
            <Row label="Cụm bàn">{clusters.length}</Row>
            <Row label="Diện tích ước tính">
              {nf.format(z.areaM2)} m²<span className="fp-sub">Theo đường viền chú thích trên bản vẽ</span>
            </Row>
            <Row label="Lưới trục">{z.gridRef}</Row>
          </dl>
          <Notes notes={z.notes} />

          <ZoneLabelSection
            zone={z}
            baseDataset={baseDataset}
            onZoneUpdate={onZoneUpdate}
          />

          {objects.length > 0 && (
            <Section title="Tiện ích & thiết bị">
              <ul className="fp-list">
                {objects.map((o) => (
                  <li key={o.id}>
                    <Link to={{ kind: 'object', id: o.id }} onSelect={onSelect}>
                      {objectName(o)}
                    </Link>
                    <VerificationStatus state={o.verification} compact />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )
    }
  } else if (selected.kind === 'workstation') {
    const w = dataset.workstations.find((k) => k.id === selected.id)
    if (w) {
      raw = w
      body = (
        <>
          <Head kicker="Vị trí làm việc vật lý" title={w.id} state={w.verification} />
          <dl>
            <Row label="Khu vực">{zoneName(w.zoneId)}</Row>
            <Row label="Cụm bàn">
              <Link to={{ kind: 'cluster', id: w.clusterId }} onSelect={onSelect}>
                {w.clusterId}
              </Link>
            </Row>
            <Row label="Kích thước bàn">{w.source.nominalSizeMm ? `${w.source.nominalSizeMm.join(' × ')} mm` : DASH}</Row>
            <Row label="Ký hiệu ghế">{w.chair ? 'Đã nhận diện' : <span className="fp-unknown">Không nhận diện được</span>}</Row>
            <Row label="Lưới trục">{w.gridRef}</Row>
          </dl>
          <Notes notes={w.notes} />
        </>
      )
    }
  } else if (selected.kind === 'cluster') {
    const c = dataset.clusters.find((k) => k.id === selected.id)
    if (c) {
      raw = c
      body = (
        <>
          <Head kicker="Cụm bàn" title={c.id} state={c.verification} />
          <dl>
            <Row label="Khu vực">{zoneName(c.zoneId)}</Row>
            <Row label="Vị trí làm việc vật lý">{c.workstationIds.length}</Row>
            <Row label="Lưới trục">{c.gridRef}</Row>
          </dl>
          <Notes notes={c.notes} />
          <Section title="Vị trí trong cụm">
            <ul className="fp-chips">
              {c.workstationIds.map((id) => (
                <li key={id}>
                  <Link to={{ kind: 'workstation', id }} onSelect={onSelect}>
                    {id}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )
    }
  } else if (selected.kind === 'room') {
    const r = dataset.rooms.find((k) => k.id === selected.id)
    if (r) {
      raw = r
      body = (
        <>
          <Head kicker="Phòng" title={r.name} state={r.verification} />
          <dl>
            <Row label="Loại phòng">{ROOM_TYPE_LABEL[r.type]}</Row>
          </dl>
          {r.source.kind === 'user-authored' && onDeleteAuthoredRoom && (
            <div className="fp-authored-delete-row">
              <button type="button" className="fp-action-btn is-danger" onClick={() => onDeleteAuthoredRoom(r.id)}>Xóa phòng</button>
            </div>
          )}
          <dl>
            <Row label="Khu vực">{zoneName(r.zoneId)}</Row>
            <Row label="Diện tích ước tính">{nf.format(r.areaM2)} m²</Row>
            <Row label="Lưới trục">{r.gridRef}</Row>
          </dl>
          <Notes notes={r.notes} />
        </>
      )
    }
  } else if (selected.kind === 'object') {
    const o = dataset.objects.find((k) => k.id === selected.id)
    if (o) {
      raw = o
      body = (
        <>
          <Head
            kicker={o.classification === 'FACILITY' ? 'Tiện ích / thiết bị' : 'Vật thể · chưa xác định'}
            title={objectName(o)}
            state={o.verification}
          />
          <dl>
            <Row label="Khu vực">{zoneName(o.zoneId)}</Row>
            <Row label="Phân loại">{CLASSIFICATION[o.classification]}</Row>
            <Row label="Lưới trục">{o.gridRef}</Row>
          </dl>
          <Notes notes={o.notes} />
        </>
      )
    }
  }

  if (!body) {
    body = (
      <p className="fp-callout" data-verification="UNKNOWN">
        Không tìm thấy đối tượng <span className="fp-mono">{selected?.id}</span> trong dữ liệu tầng này.
      </p>
    )
  }

  const selIssues = selected ? issues.filter((i) => i.entityId === selected.id) : issues

  return (
    <aside className="fp-panel" aria-label="Thông tin chi tiết">
      {selected && (
        /* same header affordances as the workspace inspector: go back, or close */
        <div className="fp-panel-nav">
          <button type="button" className="fp-back" onClick={() => onSelect(null)}>
            <span aria-hidden="true">←</span> Tổng quan tầng
          </button>
          <button
            type="button"
            className="fp-icon-btn"
            aria-label="Đóng bảng thông tin"
            title="Đóng (Esc)"
            onClick={() => onSelect(null)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
      {/* remounts on every selection, so sections always start collapsed */}
      <div key={selected ? `${selected.kind}:${selected.id}` : 'floor'}>{body}</div>
      {/* the map's key belongs beside the map, not floating over the drawing */}
      <MapLegend />
      {debug && (
        <details className="fp-raw" open={selIssues.length > 0}>
          <summary>
            Dữ liệu gốc (JSON)
            {selIssues.length > 0 && <span className="fp-issue-count">{selIssues.length} vấn đề kiểm tra dữ liệu</span>}
          </summary>
          {selIssues.length > 0 && (
            <ul className="fp-issues">
              {selIssues.slice(0, 50).map((i, k) => (
                <li key={k} data-level={i.level}>
                  <span className="fp-issue-level">{i.level === 'error' ? 'Lỗi' : 'Cảnh báo'}</span>
                  {i.entityId ? `${i.entityId}: ` : ''}
                  {i.message}
                </li>
              ))}
            </ul>
          )}
          <pre>{JSON.stringify(raw, null, 2)}</pre>
        </details>
      )}
    </aside>
  )
}
