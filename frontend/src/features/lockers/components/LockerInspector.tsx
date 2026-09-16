import { useRef, useEffect, useState } from 'react'
import type { LockerItem, LockerStats } from '../types'
import { STATUS_META } from '../lockersData'
import { DeskStatusBadge } from '../../floor-planning/components/desk-inspector/DeskStatusBadge'

interface LockerInspectorProps {
  locker: LockerItem | null
  stats?: LockerStats
  onRecallLocker: (lockerId: string) => void
  onAssignLocker: (lockerId: string) => void
  onRemindLocker: (lockerId: string) => void
  onSelectCompartment?: (compartmentId: string) => void
  onClose: () => void
}

const DESK_STATUS_MAP: Record<LockerItem['status'], 'occupied' | 'available' | 'conflict' | 'unavailable'> = {
  in_use: 'occupied',
  available: 'available',
  recall: 'conflict',
  broken: 'unavailable',
}

function LockerLegend({ stats }: { stats?: LockerStats }) {
  const inUse = stats?.inUse ?? 13
  const available = stats?.available ?? 3
  const recall = stats?.recall ?? 1
  const broken = stats?.broken ?? 1

  return (
    <details className="fp-section" open>
      <summary>
        <h3>Chú giải</h3>
      </summary>
      <ul className="fp-key">
        <li title="Ngăn tủ đang được nhân sự sử dụng">
          <span className="status-dot in_use" aria-hidden="true" />
          <span>Đang dùng ({inUse})</span>
        </li>
        <li title="Ngăn tủ còn trống, sẵn sàng cấp phát">
          <span className="status-dot available" aria-hidden="true" />
          <span>Còn trống ({available})</span>
        </li>
        <li title="Ngăn tủ hết hạn hoặc cần thu hồi">
          <span className="status-dot recall" aria-hidden="true" />
          <span>Cần thu hồi ({recall})</span>
        </li>
        <li title="Ngăn tủ đang báo hỏng, cần kỹ thuật xử lý">
          <span className="status-dot broken" aria-hidden="true" />
          <span>Hỏng ({broken})</span>
        </li>
      </ul>
    </details>
  )
}

export function LockerInspector({
  locker,
  stats,
  onRecallLocker,
  onAssignLocker,
  onRemindLocker,
  onSelectCompartment,
  onClose,
}: LockerInspectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 })
  }, [locker?.id])

  // When no locker is selected: render FloorDetailsPanel splitting image overview
  if (!locker) {
    const total = stats?.total ?? 18
    const inUse = stats?.inUse ?? 13
    const available = stats?.available ?? 3
    const recall = stats?.recall ?? 1
    const broken = stats?.broken ?? 1

    return (
      <aside className="fp-panel" aria-label="Tổng quan tủ locker">
        <header className="fp-panel-head">
          <h2>Quản lý tủ locker</h2>
          <p className="fp-head-meta">Tòa nhà: Technopark · Tầng 16</p>
        </header>

        <dl className="fp-stats">
          <div>
            <dt>Tổng số ngăn</dt>
            <dd>{total}</dd>
          </div>
          <div>
            <dt>Đang dùng</dt>
            <dd>{inUse}</dd>
          </div>
          <div>
            <dt>Còn trống</dt>
            <dd>{available}</dd>
          </div>
          <div>
            <dt>Cần thu hồi / Hỏng</dt>
            <dd>{recall + broken}</dd>
          </div>
        </dl>

        <details className="fp-section" open>
          <summary>
            <h3>Phân bổ theo khu vực</h3>
          </summary>
          <dl>
            <div className="fp-row">
              <dt>Khu L1</dt>
              <dd>Sảnh Tây & BĐS (4 ngăn)</dd>
            </div>
            <div className="fp-row">
              <dt>Khu L2</dt>
              <dd>Sảnh Thang máy (6 ngăn)</dd>
            </div>
            <div className="fp-row">
              <dt>Khu L3</dt>
              <dd>Hành lang AI (7 ngăn)</dd>
            </div>
            <div className="fp-row">
              <dt>Khu L4</dt>
              <dd>Khu Pantry (1 ngăn)</dd>
            </div>
          </dl>
        </details>

        <p className="fp-callout" style={{ marginTop: '14px' }}>
          Nhấp vào tủ trên sơ đồ mặt bằng, ô chi tiết hoặc danh sách để xem thông tin và thao tác.
        </p>

        {/* Collapsible status legend near the footer of the right sidebar */}
        <LockerLegend stats={stats} />
      </aside>
    )
  }

  const mappedStatus = DESK_STATUS_MAP[locker.status]

  return (
    <aside
      className="fp-desk-inspector"
      aria-label={`Chi tiết tủ ${locker.code}`}
      data-desk-status={mappedStatus}
      data-collapsed={collapsed || undefined}
    >
      {/* Header matching DeskInspector */}
      <header className="fp-di-head">
        <div className="fp-di-head-main">
          <p className="fp-di-kicker">
            {locker.isCombined ? 'Cụm tủ locker' : 'Tủ locker'} · {locker.zoneGroupName.split('·')[0].trim()}
          </p>
          <h2 className="fp-mono-title">{locker.code}</h2>
          <DeskStatusBadge status={mappedStatus} />
        </div>

        <div className="fp-di-head-tools">
          <button
            type="button"
            className="fp-icon-btn fp-di-collapse"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Mở rộng bảng thông tin' : 'Thu gọn bảng thông tin'}
            onClick={() => setCollapsed((c) => !c)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d={collapsed ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
          <button
            type="button"
            className="fp-icon-btn"
            aria-label="Đóng bảng thông tin"
            title="Đóng (Esc)"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* Scrollable Body matching DeskInspector */}
      <div className="fp-di-scroll" ref={scrollRef}>
        <div className="fp-di-body" key={locker.id}>
          {/* If combined cabinet, show sub-compartments with clean neutral styling */}
          {locker.compartments && locker.compartments.length > 0 && (
            <div className="fp-di-section">
              <h3 className="fp-di-heading">Danh sách ngăn trong cụm ({locker.compartments.length} ngăn)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {locker.compartments.map((comp) => {
                  const compMeta = STATUS_META[comp.status]
                  const isCur = comp.id === locker.id
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => onSelectCompartment?.(comp.id)}
                      style={{
                        padding: '6px',
                        borderRadius: '5px',
                        border: isCur ? '1.5px solid var(--ink, #1c1b1a)' : '1px solid var(--line, #e2ded7)',
                        background: isCur ? 'var(--canvas-2, #f6f4f1)' : '#ffffff',
                        textAlign: 'center',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                        outline: 'none',
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                        {comp.code}
                      </span>
                      <span
                        className={`status-dot ${comp.status}`}
                        style={{ width: '6px', height: '8px' }}
                      />
                      <span style={{ fontSize: '9px', color: 'var(--fp-text-2, #57524b)' }}>
                        {compMeta.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Employee summary using authentic fp-di-person */}
          {locker.employeeName ? (
            <div className="fp-di-section">
              <h3 className="fp-di-heading">Nhân sự sử dụng</h3>
              <div className="fp-di-person">
                <span className="fp-avatar is-lg" aria-hidden="true">
                  {locker.employeeName.charAt(0)}
                </span>
                <div className="fp-di-person-text">
                  <p className="fp-di-person-name">{locker.employeeName}</p>
                  <p className="fp-di-person-org">{locker.department}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="fp-di-section">
              <h3 className="fp-di-heading">Tình trạng sử dụng</h3>
              <p className="fp-di-muted" style={{ margin: 0 }}>
                {locker.status === 'broken'
                  ? 'Tủ đang báo hỏng, tạm ngừng sử dụng để kỹ thuật xử lý.'
                  : 'Tủ chưa được gán nhân sự, sẵn sàng cấp phát.'}
              </p>
            </div>
          )}

          {/* Properties Section using authentic fp-di-props */}
          <div className="fp-di-section">
            <h3 className="fp-di-heading">Thông tin vị trí & ngày cấp</h3>
            <dl className="fp-di-props">
              <div>
                <dt>Vị trí vật lý</dt>
                <dd><span className="fp-mono">{locker.physicalLocation}</span></dd>
              </div>
              {locker.recallDueDate ? (
                <div>
                  <dt>Hạn thu hồi</dt>
                  <dd style={{ fontWeight: 600 }}>{locker.recallDueDate}</dd>
                </div>
              ) : locker.assignedDate ? (
                <div>
                  <dt>Ngày cấp phát</dt>
                  <dd>{locker.assignedDate}</dd>
                </div>
              ) : null}
              {locker.notes && (
                <div>
                  <dt>Ghi chú</dt>
                  <dd>{locker.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* SupportiveAI Recommendation */}
          {locker.aiSuggestion && (
            <div className="fp-di-section locker-ai-section">
              <h3 className="fp-di-heading locker-ai-heading">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M8 1.5v13M1.5 8h13M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
                </svg>
                Đề xuất SupportiveAI
              </h3>
              <div className="locker-ai-box">{locker.aiSuggestion}</div>
            </div>
          )}

          {/* Collapsible status legend near the footer of the right sidebar */}
          <LockerLegend stats={stats} />
        </div>
      </div>

      {/* Action footer matching DeskInspector */}
      <footer className="fp-di-actions">
        {locker.status === 'recall' ? (
          <div className="fp-di-actions-row">
            <button
              type="button"
              className="fp-btn is-primary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onRecallLocker(locker.id)}
            >
              Thu hồi tủ
            </button>
            <button
              type="button"
              className="fp-btn"
              onClick={() => onRemindLocker(locker.id)}
            >
              Nhắc trả
            </button>
          </div>
        ) : locker.status === 'available' ? (
          <div className="fp-di-actions-row">
            <button
              type="button"
              className="fp-btn is-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => onAssignLocker(locker.id)}
            >
              + Cấp phát tủ này
            </button>
          </div>
        ) : locker.status === 'broken' ? (
          <div className="fp-di-actions-row">
            <button
              type="button"
              className="fp-btn is-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => onRecallLocker(locker.id)}
            >
              Xác nhận sửa xong
            </button>
          </div>
        ) : (
          <div className="fp-di-actions-row">
            <button
              type="button"
              className="fp-btn is-primary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onRecallLocker(locker.id)}
            >
              Thu hồi tủ
            </button>
            <button
              type="button"
              className="fp-btn"
              onClick={() => onRemindLocker(locker.id)}
            >
              Nhắc nhở
            </button>
          </div>
        )}
      </footer>
    </aside>
  )
}
