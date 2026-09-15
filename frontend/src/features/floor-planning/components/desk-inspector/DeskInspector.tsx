import { useEffect, useId, useRef, useState } from 'react'
import type { AllocationSource } from '../../domain/allocation'
import type { DeskRecord } from '../../domain/desk'
import { DEMO_DATA_HINT, DEMO_DATA_LABEL } from '../../labels'
import { VerificationStatus } from '../VerificationStatus'
import {
  AssignmentDetails,
  AvailableSummary,
  ConflictSummary,
  DeskConditions,
  DeviceList,
  EmployeeDetails,
  EmployeeSummary,
  ReservationSummary,
  UnavailableSummary,
  WorkspaceProperties,
} from './DeskInspectorSections'
import { DeskStatusBadge } from './DeskStatusBadge'
import { DESK_ACTION_LABEL, overflowItems, PRIMARY_ACTIONS, type DeskAction } from './deskActions'
import { OverflowMenu } from './OverflowMenu'
import './deskInspector.css'

export interface DeskInspectorProps {
  desk: DeskRecord
  source: AllocationSource
  now: Date
  onClose: () => void
  onAction?: (action: DeskAction, desk: DeskRecord) => void
  /** jump to the physical/verification data of this desk */
  onShowWorkstation?: (desk: DeskRecord) => void
}

/**
 * Persistent workspace inspector for one desk. Stays mounted while the
 * selection changes; only the body re-keys (short fade) per desk.
 */
export function DeskInspector({ desk, source, now, onClose, onAction, onShowWorkstation }: DeskInspectorProps) {
  const titleId = useId()
  const [notice, setNotice] = useState<{ seatId: string; text: string } | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { status, seat } = desk

  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 })
  }, [seat.id])

  const run = (action: DeskAction) => {
    if (onAction) onAction(action, desk)
    setNotice({ seatId: seat.id, text: `“${DESK_ACTION_LABEL[action]}” chưa được kết nối API.` })
  }

  const [main, ...rest] = PRIMARY_ACTIONS[status]
  const person = status === 'occupied' ? desk.occupants[0] : undefined

  return (
    <aside className="fp-desk-inspector" aria-labelledby={titleId} data-desk-status={status} data-collapsed={collapsed || undefined}>
      <header className="fp-di-head">
        <div className="fp-di-head-main">
          <p className="fp-di-kicker">Bàn làm việc</p>
          <h2 id={titleId} className="fp-mono-title">
            {seat.code}
          </h2>
          <DeskStatusBadge status={status} />
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
          <OverflowMenu label="Thao tác khác" items={overflowItems(status)} onSelect={run} />
          <button type="button" className="fp-icon-btn" aria-label="Đóng bảng thông tin bàn" title="Đóng (Esc)" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className="fp-di-scroll" ref={bodyRef}>
        <div className="fp-di-body" key={seat.id}>
          {source.kind === 'demo' && (
            <p className="fp-di-demo" title={DEMO_DATA_HINT}>
              {DEMO_DATA_LABEL}
            </p>
          )}

          {status === 'occupied' && person && (
            <>
              <EmployeeSummary person={person} />
              <WorkspaceProperties desk={desk} showDepartment={false} />
              <EmployeeDetails person={person} />
              <AssignmentDetails person={person} now={now} />
              <DeviceList devices={desk.devices} />
            </>
          )}

          {status === 'occupied' && !person && (
            <>
              <p className="fp-di-card is-unavailable">Có phân công đang hiệu lực nhưng không tìm thấy hồ sơ nhân sự tương ứng.</p>
              <WorkspaceProperties desk={desk} showDepartment />
            </>
          )}

          {status === 'available' && (
            <>
              <AvailableSummary />
              <WorkspaceProperties desk={desk} showDepartment />
              <DeskConditions desk={desk} />
              {desk.devices.length > 0 && <DeviceList devices={desk.devices} />}
            </>
          )}

          {status === 'reserved' && (
            <>
              <ReservationSummary desk={desk} now={now} />
              <WorkspaceProperties desk={desk} showDepartment />
              <DeviceList devices={desk.devices} />
            </>
          )}

          {status === 'conflict' && (
            <>
              <ConflictSummary desk={desk} now={now} />
              <WorkspaceProperties desk={desk} showDepartment />
              <DeviceList devices={desk.devices} />
            </>
          )}

          {status === 'unavailable' && (
            <>
              <UnavailableSummary desk={desk} now={now} />
              <WorkspaceProperties desk={desk} showDepartment />
              <DeskConditions desk={desk} />
            </>
          )}

          <section className="fp-di-physical" aria-label="Vị trí vật lý">
            <span className="fp-di-muted">Vị trí vật lý</span>
            <span className="fp-mono">{desk.workstation.id}</span>
            <VerificationStatus state={desk.workstation.verification} compact />
            {onShowWorkstation && (
              <button type="button" className="fp-di-textbtn" onClick={() => onShowWorkstation(desk)}>
                Xem trên bản vẽ
              </button>
            )}
          </section>
        </div>
      </div>

      <footer className="fp-di-actions">
        <div className="fp-di-actions-row">
          <button type="button" className="fp-btn is-primary" onClick={() => run(main)}>
            {main === 'assign-employee' && <span aria-hidden="true">+ </span>}
            {DESK_ACTION_LABEL[main]}
          </button>
          {rest.map((a) => (
            <button key={a} type="button" className="fp-btn" onClick={() => run(a)}>
              {DESK_ACTION_LABEL[a]}
            </button>
          ))}
        </div>
        <p className="fp-di-notice" role="status" aria-live="polite">
          {notice?.seatId === seat.id ? notice.text : null}
        </p>
      </footer>
    </aside>
  )
}
