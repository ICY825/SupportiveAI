import type { ReactNode } from 'react'
import type { AllocationSource } from '../domain/allocation'
import { DESK_STATUSES, type DeskRecord } from '../domain/desk'
import type { EntityRef, FloorDataset, Point, VerificationState } from '../domain/spatial'
import type { ValidationIssue } from '../data/validateFloorDataset'
import {
  CLASSIFICATION,
  DEMO_DATA_LABEL,
  NO_OPERATIONAL_DATA,
  NO_OPERATIONAL_DATA_HINT,
  NOT_AVAILABLE,
  UNLABELED_ZONE,
  VERIFICATION,
  generated,
  objectName,
} from '../labels'
import { DeskStatusBadge } from './desk-inspector/DeskStatusBadge'
import { VerificationStatus } from './VerificationStatus'

interface FloorDetailsPanelProps {
  dataset: FloorDataset
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
  debug: boolean
  issues: ValidationIssue[]
  /** workspace view: desks derived from attached allocation data (demo or API) */
  desks?: ReadonlyMap<string, DeskRecord>
  allocationSource?: AllocationSource
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

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`fp-section${className ? ` ${className}` : ''}`}>
      <h3>{title}</h3>
      {children}
    </section>
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
const fmtMm = (p: Point, mmPerPt: number) => `${nf.format(Math.round(p[0] * mmPerPt))}, ${nf.format(Math.round(p[1] * mmPerPt))}`

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

function VerificationRow({ state }: { state: VerificationState }) {
  return (
    <Row label="Trạng thái">
      {VERIFICATION[state].label}
      <span className="fp-sub">{VERIFICATION[state].hint}</span>
    </Row>
  )
}

function SourceFileRow({ dataset }: { dataset: FloorDataset }) {
  return (
    <Row label="Bản vẽ gốc">
      <span className="fp-filename" title={dataset.layout.floor.sourcePdf}>
        {dataset.sourceName}
      </span>
    </Row>
  )
}

/**
 * Seat/people data. Without attached allocation data every field is "—" (never
 * computed from geometry). With desks, shows status counts for the given scope.
 */
function OperationalData({
  fields,
  desks,
  source,
  scope,
}: {
  fields: string[]
  desks?: ReadonlyMap<string, DeskRecord>
  source?: AllocationSource
  /** workstation ids the counts cover */
  scope?: string[]
}) {
  if (desks && scope) {
    const inScope = scope.map((id) => desks.get(id)).filter((d): d is DeskRecord => d !== undefined)
    return (
      <Section title="Chỗ ngồi" className="fp-operational">
        {source?.kind === 'demo' && <p className="fp-sub">{DEMO_DATA_LABEL} · chưa kết nối HR/Admin</p>}
        {inScope.length === 0 ? (
          <p className="fp-empty">Không có chỗ ngồi trong phạm vi này</p>
        ) : (
          <ul className="fp-list">
            {DESK_STATUSES.map((st) => (
              <li key={st}>
                <DeskStatusBadge status={st} size="sm" />
                <span className="fp-count">{inScope.filter((d) => d.status === st).length}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    )
  }
  const value = desks ? 'Chọn bàn trên bản đồ' : DASH
  return (
    <Section title="Dữ liệu vận hành" className="fp-operational">
      <p className="fp-empty">
        {NO_OPERATIONAL_DATA}
        <span className="fp-sub">{NO_OPERATIONAL_DATA_HINT}</span>
      </p>
      <dl>
        {fields.map((f) => (
          <Row key={f} label={f}>
            <span aria-label={NOT_AVAILABLE} title={NOT_AVAILABLE} className="fp-muted">
              {value}
            </span>
          </Row>
        ))}
      </dl>
    </Section>
  )
}

function Technical({ children }: { children: ReactNode }) {
  return (
    <details className="fp-technical">
      <summary>Chi tiết kỹ thuật</summary>
      <dl>{children}</dl>
    </details>
  )
}

export function FloorDetailsPanel({ dataset, selected, onSelect, debug, issues, desks, allocationSource }: FloorDetailsPanelProps) {
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
  const position = (p: Point) => (
    <>
      <Row label="Tọa độ tâm (pt)" hint="Điểm PDF, gốc ở góc trên-trái tờ bản vẽ">
        <span className="fp-mono">{fmtPt(p)}</span>
      </Row>
      <Row label="Tọa độ tâm (mm)" hint="Quy đổi theo tỷ lệ bản vẽ, gốc ở góc trên-trái tờ bản vẽ">
        <span className="fp-mono">{fmtMm(p, floor.mmPerPt)}</span>
      </Row>
    </>
  )

  let body: ReactNode
  let raw: unknown = null

  if (!selected) {
    const ws = dataset.workstations.filter((w) => w.classification === 'WORKSTATION')
    const unknownCount =
      dataset.zones.filter((z) => z.verification === 'UNKNOWN').length +
      dataset.workstations.filter((w) => w.classification === 'UNKNOWN').length +
      dataset.objects.filter((o) => o.classification === 'UNKNOWN').length
    const { pdf } = dataset.extraction
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
        {unknownCount > 0 && (
          <p className="fp-callout" data-verification="UNKNOWN">
            <span aria-hidden="true">?</span> {unknownCount} đối tượng chưa xác định cần Admin làm rõ
          </p>
        )}

        <Section title="Khu vực">
          <ul className="fp-list">
            {dataset.zones.map((z) => {
              const count = dataset.workstations.filter((w) => w.zoneId === z.id).length
              return (
                <li key={z.id}>
                  <Link to={{ kind: 'zone', id: z.id }} onSelect={onSelect}>
                    {z.name ?? <span className="fp-unknown">{UNLABELED_ZONE}</span>}
                  </Link>
                  <span className="fp-list-meta">
                    <span className="fp-count" title="Số vị trí làm việc vật lý có tâm nằm trong khu vực">
                      {count} vị trí
                    </span>
                    <VerificationStatus state={z.verification} compact />
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>

        <OperationalData
          fields={['Chỗ ngồi đã xác minh', 'Nhân sự đã bố trí', 'Tỷ lệ sử dụng']}
          desks={desks}
          source={allocationSource}
          scope={dataset.workstations.map((w) => w.id)}
        />

        <Section title="Nguồn dữ liệu">
          <dl>
            <SourceFileRow dataset={dataset} />
            <Row label="Tỷ lệ bản vẽ">{floor.sourceScale}</Row>
            <Row label="Phần mềm xuất">{pdf.creator || DASH}</Row>
          </dl>
        </Section>

        <Technical>
          <Row label="Hệ tọa độ">Điểm PDF, gốc trên-trái</Row>
          <Row label="Quy đổi">1 pt ≈ {floor.mmPerPt.toFixed(2)} mm</Row>
          <Row label="Đối tượng vector">{nf.format(pdf.vectorPathObjects)}</Row>
          <Row label="Dòng chữ">{nf.format(pdf.textLines)}</Row>
          <Row label="Chú thích PDF">{pdf.annotations}</Row>
          <Row label="SHA-256">
            <span className="fp-mono fp-filename" title={layout.sourcePdfSha256}>
              {layout.sourcePdfSha256.slice(0, 16)}…
            </span>
          </Row>
        </Technical>
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

          <OperationalData
            fields={['Chỗ ngồi đã xác minh', 'Nhân sự đã bố trí', 'Tỷ lệ sử dụng']}
            desks={desks}
            source={allocationSource}
            scope={dataset.workstations.filter((w) => w.zoneId === z.id).map((w) => w.id)}
          />

          <Section title="Nguồn & xác minh">
            <dl>
              <VerificationRow state={z.verification} />
              <Row label="Nhãn trên bản vẽ">{z.sourceLabel ?? <span className="fp-unknown">Không có nhãn</span>}</Row>
              {z.sourceLabelFigure !== null && (
                <Row label="Số trên nhãn">
                  ({z.sourceLabelFigure})<span className="fp-sub">Bản vẽ không nêu ý nghĩa; không dùng làm sức chứa</span>
                </Row>
              )}
              <Row label="Loại chú thích">{generated(z.source.annotationType) ?? DASH}</Row>
              <SourceFileRow dataset={dataset} />
            </dl>
          </Section>

          <Technical>
            <Row label="Mã">
              <span className="fp-mono">{z.id}</span>
            </Row>
            <Row label="Hình học">{generated(z.source.geometry) ?? DASH}</Row>
            <Row label="Mã chú thích PDF">
              <span className="fp-mono fp-filename" title={z.source.annotationId}>
                {z.source.annotationId ?? DASH}
              </span>
            </Row>
          </Technical>
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

          <OperationalData fields={['Chỗ ngồi', 'Nhân sự đã bố trí']} desks={desks} />

          <Section title="Nguồn & xác minh">
            <dl>
              <VerificationRow state={w.verification} />
              <Row label="Phân loại">{CLASSIFICATION[w.classification]}</Row>
              <Row label="Quy tắc trích xuất">
                <span title={w.source.rule}>{generated(w.source.rule) ?? DASH}</span>
              </Row>
              <Row label="Nhãn trên bản vẽ">{w.source.deskLabel ?? DASH}</Row>
              <SourceFileRow dataset={dataset} />
            </dl>
            <p className="fp-sub">Vị trí làm việc vật lý chưa phải chỗ ngồi; cần Admin xác minh trước khi bố trí.</p>
          </Section>

          <Technical>
            <Row label="Mã">
              <span className="fp-mono">{w.id}</span>
            </Row>
            <Row label="Góc xoay">{w.rotationDeg}°</Row>
            {position(w.center)}
          </Technical>
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

          <OperationalData
            fields={['Chỗ ngồi đã xác minh', 'Nhân sự đã bố trí']}
            desks={desks}
            source={allocationSource}
            scope={c.workstationIds}
          />

          <Section title="Nguồn & xác minh">
            <dl>
              <VerificationRow state={c.verification} />
              <Row label="Cách xác định">Các bàn chạm nhau được gom thành một cụm</Row>
            </dl>
          </Section>

          <Technical>
            <Row label="Mã">
              <span className="fp-mono">{c.id}</span>
            </Row>
            {position(c.center)}
          </Technical>
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
            <Row label="Khu vực">{zoneName(r.zoneId)}</Row>
            <Row label="Diện tích ước tính">{nf.format(r.areaM2)} m²</Row>
            <Row label="Lưới trục">{r.gridRef}</Row>
          </dl>
          <Notes notes={r.notes} />

          <OperationalData fields={['Người sử dụng']} desks={desks} />

          <Section title="Nguồn & xác minh">
            <dl>
              <VerificationRow state={r.verification} />
              <Row label="Hình học">{generated(r.source.geometry) ?? DASH}</Row>
              <SourceFileRow dataset={dataset} />
            </dl>
          </Section>

          <Technical>
            <Row label="Mã">
              <span className="fp-mono">{r.id}</span>
            </Row>
            <Row label="Mã chú thích PDF">
              <span className="fp-mono fp-filename" title={r.source.annotationId}>
                {r.source.annotationId ?? DASH}
              </span>
            </Row>
          </Technical>
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

          <Section title="Nguồn & xác minh">
            <dl>
              <VerificationRow state={o.verification} />
              <Row label="Chữ trên bản vẽ">{o.source.text ? `“${o.source.text}”` : DASH}</Row>
              <Row label="Cách xác định">{generated(o.source.geometry) ?? DASH}</Row>
              <SourceFileRow dataset={dataset} />
            </dl>
          </Section>

          <Technical>
            <Row label="Mã">
              <span className="fp-mono">{o.id}</span>
            </Row>
            <Row label="Loại (kind)">
              <span className="fp-mono">{o.kind}</span>
            </Row>
          </Technical>
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
        <button type="button" className="fp-back" onClick={() => onSelect(null)}>
          <span aria-hidden="true">←</span> Tổng quan tầng
        </button>
      )}
      {body}
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
