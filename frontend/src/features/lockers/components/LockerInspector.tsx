import { useRef, useEffect } from 'react'
import type { LockerItem, LockerStats } from '../types'
import { STATUS_META } from '../lockersData'

interface LockerInspectorProps {
  locker: LockerItem | null
  stats?: LockerStats
  onRecallLocker: (lockerId: string) => void
  onAssignLocker: (lockerId: string) => void
  onRemindLocker: (lockerId: string) => void
  onSelectCompartment?: (compartmentId: string) => void
  onClose: () => void
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

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 })
  }, [locker?.id])

  // When no locker is selected: render FloorDetailsPanel style overview
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
          <p className="fp-sub">Tầng 16 · Tòa nhà Technopark</p>
        </header>

        <div className="fp-panel-scroll">
          <section className="fp-panel-section">
            <h3>Chỉ số vận hành</h3>
            <div className="fp-stat-grid">
              <div className="fp-stat">
                <span className="fp-stat-val">{total}</span>
                <span className="fp-stat-lbl">Tổng số ngăn</span>
              </div>
              <div className="fp-stat">
                <span className="fp-stat-val" style={{ color: '#3d617f' }}>
                  {inUse}
                </span>
                <span className="fp-stat-lbl">Đang dùng</span>
              </div>
              <div className="fp-stat">
                <span className="fp-stat-val" style={{ color: '#297a60' }}>
                  {available}
                </span>
                <span className="fp-stat-lbl">Còn trống</span>
              </div>
              <div className="fp-stat">
                <span className="fp-stat-val" style={{ color: '#8a6f20' }}>
                  {recall}
                </span>
                <span className="fp-stat-lbl">Cần thu hồi</span>
              </div>
              <div className="fp-stat">
                <span className="fp-stat-val" style={{ color: '#b3161d' }}>
                  {broken}
                </span>
                <span className="fp-stat-lbl">Hỏng</span>
              </div>
            </div>
          </section>

          <section className="fp-panel-section">
            <h3>Phân bổ theo khu vực</h3>
            <div className="fp-row">
              <dt>Khu L1 · Sảnh Tây & BĐS</dt>
              <dd>4 ngăn (1 cần thu hồi, 1 trống)</dd>
            </div>
            <div className="fp-row">
              <dt>Khu L2 · Sảnh Thang máy</dt>
              <dd>6 ngăn (1 hỏng, 1 trống)</dd>
            </div>
            <div className="fp-row">
              <dt>Khu L3 · Hành lang AI</dt>
              <dd>7 ngăn (1 trống)</dd>
            </div>
            <div className="fp-row">
              <dt>Khu L4 · Khu Pantry</dt>
              <dd>1 ngăn (đang dùng)</dd>
            </div>
          </section>

          <section className="fp-panel-section">
            <p className="fp-hint">
              Nhấp vào một tủ trên sơ đồ mặt bằng, ô chi tiết hoặc danh sách để xem thông tin và thao tác.
            </p>
          </section>
        </div>
      </aside>
    )
  }

  const meta = STATUS_META[locker.status]

  return (
    <aside className="fp-desk-inspector" aria-label={`Chi tiết tủ ${locker.code}`}>
      {/* Header matching DeskInspector */}
      <header className="fp-di-head">
        <div className="fp-di-head-main">
          <p className="fp-di-kicker">
            {locker.isCombined ? 'Cụm tủ locker' : 'Tủ locker'} · {locker.zoneGroupName.split('·')[0].trim()}
          </p>
          <h2 className="fp-mono-title">{locker.code}</h2>
          <span
            className="fp-desk-badge is-md"
            data-desk-status={
              locker.status === 'in_use'
                ? 'occupied'
                : locker.status === 'recall'
                  ? 'conflict'
                  : locker.status === 'broken'
                    ? 'unavailable'
                    : 'available'
            }
          >
            {meta.label}
          </span>
        </div>

        <div className="fp-di-head-tools">
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
          {/* If combined cabinet, show sub-compartments */}
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
                        border: isCur ? '1.5px solid var(--vsf-red, #d2181f)' : '1px solid var(--line, #e2ded7)',
                        background: isCur ? '#fdf5f5' : '#ffffff',
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
                      <span style={{ fontSize: '9px', color: compMeta.color }}>
                        {compMeta.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Employee summary if assigned */}
          {locker.employeeName ? (
            <div className="fp-di-section">
              <h3 className="fp-di-heading">Nhân sự sử dụng</h3>
              <div className="locker-person-card">
                <div className="locker-person-avatar">
                  {locker.employeeName.charAt(0)}
                </div>
                <div className="locker-person-info">
                  <div className="locker-person-name">{locker.employeeName}</div>
                  <div className="locker-person-dept">{locker.department}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="fp-di-section">
              <h3 className="fp-di-heading">Tình trạng sử dụng</h3>
              <p className="fp-muted" style={{ margin: 0 }}>
                {locker.status === 'broken'
                  ? 'Tủ đang báo hỏng, tạm ngừng sử dụng để kỹ thuật xử lý.'
                  : 'Tủ chưa được gán nhân sự, sẵn sàng cấp phát.'}
              </p>
            </div>
          )}

          {/* Properties Section */}
          <div className="fp-di-section">
            <h3 className="fp-di-heading">Thông tin vị trí & ngày cấp</h3>
            <div className="fp-row">
              <dt>Vị trí vật lý</dt>
              <dd>{locker.physicalLocation}</dd>
            </div>
            {locker.recallDueDate ? (
              <div className="fp-row">
                <dt>Hạn thu hồi</dt>
                <dd style={{ color: 'var(--vsf-red)', fontWeight: 600 }}>{locker.recallDueDate}</dd>
              </div>
            ) : locker.assignedDate ? (
              <div className="fp-row">
                <dt>Ngày cấp phát</dt>
                <dd>{locker.assignedDate}</dd>
              </div>
            ) : null}
            {locker.notes && (
              <div className="fp-row">
                <dt>Ghi chú</dt>
                <dd style={{ color: '#b3161d' }}>{locker.notes}</dd>
              </div>
            )}
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
        </div>
      </div>

      {/* Action footer matching DeskInspector */}
      <footer className="fp-di-actions">
        {locker.status === 'recall' ? (
          <>
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
              className="fp-btn is-secondary"
              onClick={() => onRemindLocker(locker.id)}
            >
              Nhắc trả
            </button>
          </>
        ) : locker.status === 'available' ? (
          <button
            type="button"
            className="fp-btn is-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => onAssignLocker(locker.id)}
          >
            + Cấp phát tủ này
          </button>
        ) : locker.status === 'broken' ? (
          <button
            type="button"
            className="fp-btn is-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => onRecallLocker(locker.id)}
          >
            Xác nhận sửa xong
          </button>
        ) : (
          <>
            <button
              type="button"
              className="fp-btn is-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onRecallLocker(locker.id)}
            >
              Thu hồi tủ
            </button>
            <button
              type="button"
              className="fp-btn is-secondary"
              onClick={() => onRemindLocker(locker.id)}
            >
              Nhắc nhở
            </button>
          </>
        )}
      </footer>
    </aside>
  )
}
