import { useMemo } from 'react'
import type { LockerItem } from '../types'
import { STATUS_META } from '../lockersData'

interface LockerDetailGridProps {
  lockers: LockerItem[]
  selectedLocker: LockerItem | null
  onSelectLocker: (locker: LockerItem) => void
  onOpenLockerOnMap?: (locker: LockerItem) => void
  onLockerClick?: (locker: LockerItem) => void
  onOpenLocker?: (locker: LockerItem) => void
}

/**
 * Chuẩn hóa giá trị hiển thị mã ngăn locker trong tab Chi tiết:
 * Tách theo dấu '-' và lấy segment cuối sau khi trim.
 * Nếu mã không có segment hợp lệ thì fallback về toàn bộ mã đã trim.
 *
 * @param code Mã locker đầy đủ (ví dụ: 'BT16-01-21', 'BT16-01-02')
 * @returns Segment cuối cùng đã trim hoặc fallback về toàn bộ mã đã trim
 */
function getCompartmentDisplayCode(code?: string | null): string {
  if (!code || typeof code !== 'string') {
    return ''
  }

  const trimmed = code.trim()
  if (!trimmed) {
    return ''
  }

  const segments = trimmed.split('-')
  const lastSegment = segments[segments.length - 1]?.trim()

  return lastSegment || trimmed
}

function getCompartments(locker: LockerItem) {
  return locker.compartments && locker.compartments.length > 0
    ? locker.compartments
    : [locker]
}

export function LockerDetailGrid({
  lockers,
  selectedLocker,
  onSelectLocker,
  onOpenLockerOnMap,
  onLockerClick,
  onOpenLocker,
}: LockerDetailGridProps) {
  const allCompartments = useMemo(
    () => lockers.flatMap(getCompartments),
    [lockers]
  )

  const inUseCount = useMemo(
    () => allCompartments.filter((c) => c.status === 'in_use').length,
    [allCompartments]
  )
  const availableCount = useMemo(
    () => allCompartments.filter((c) => c.status === 'available').length,
    [allCompartments]
  )
  const recallCount = useMemo(
    () => allCompartments.filter((c) => c.status === 'recall').length,
    [allCompartments]
  )

  const handleLockerHeaderClick = (locker: LockerItem) => {
    const callback = onOpenLockerOnMap || onLockerClick || onOpenLocker
    callback?.(locker)
  }

  return (
    <div className="locker-detail-wrapper" role="region" aria-label="Sơ đồ chi tiết tủ locker">
      <div className="locker-detail-legend-strip">
        <div className="locker-detail-legend-items">
          <span className="locker-detail-legend-item">
            <span className="status-dot in_use" aria-hidden="true" />
            Đang sử dụng
          </span>
          <span className="locker-detail-legend-item">
            <span className="status-dot available" aria-hidden="true" />
            Còn trống
          </span>
          <span className="locker-detail-legend-item">
            <span className="status-dot recall" aria-hidden="true" />
            Cần thu hồi
          </span>
          <span className="locker-detail-legend-item">
            <span className="status-dot broken" aria-hidden="true" />
            Hỏng
          </span>
        </div>
        <div className="locker-detail-summary-count">
          {lockers.length} tủ · {allCompartments.length} ngăn · {inUseCount} đang dùng · {availableCount} trống · {recallCount} cần thu hồi
        </div>
      </div>

      <div className="locker-detail-zones-grid">
        {lockers.map((locker) => {
          const compartments = getCompartments(locker)

          return (
            <div key={locker.id} className="locker-detail-zone-card">
              <div className="locker-detail-zone-header">
                <div>
                  <button
                    type="button"
                    className="locker-detail-zone-title"
                    onClick={() => handleLockerHeaderClick(locker)}
                    aria-label={`Mở tủ ${locker.code} trên sơ đồ`}
                    title={`Mở tủ ${locker.code} trên sơ đồ`}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      color: 'inherit',
                      textAlign: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {locker.code}
                  </button>
                  <div className="locker-detail-zone-subtitle">
                    Zone : {locker.zoneGroupName || locker.physicalLocation}
                  </div>
                </div>
                <span className="locker-detail-zone-badge">
                  {compartments.length} ngăn
                </span>
              </div>

              <div className="locker-compartments-grid">
                {compartments.map((comp) => {
                  const isSelected = selectedLocker?.id === comp.id
                  const displayCode = getCompartmentDisplayCode(comp.code)

                  return (
                    <button
                      key={comp.id}
                      type="button"
                      aria-label={comp.code}
                      data-locker-code={comp.code}
                      data-full-code={comp.code}
                      title={comp.code}
                      className={
                        'locker-compartment-box is-' +
                        comp.status +
                        (isSelected ? ' is-selected' : '')
                      }
                      onClick={() => {
                        onSelectLocker({
                          ...locker,
                          ...comp,
                          lockType: locker.lockType,
                          compartments: locker.compartments,
                        })
                      }}
                    >
                      <div className="locker-comp-top">
                        <span className="locker-comp-code" data-full-code={comp.code}>
                          {displayCode}
                        </span>
                        <span className={'locker-comp-dot status-dot ' + comp.status} aria-hidden='true' />
                      </div>

                      <div className='locker-comp-center'><svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6' className='locker-comp-icon' aria-hidden='true'><rect x='5' y='3' width='14' height='18' rx='2' /><line x1='5' y1='12' x2='19' y2='12' /><circle cx='9' cy='7.5' r='1' fill='currentColor' /><circle cx='9' cy='16.5' r='1' fill='currentColor' /></svg></div>

                      <div className="locker-comp-bottom">
                        <div className="locker-comp-name">
                          {comp.employeeName || STATUS_META[comp.status].label}
                        </div>
                        {comp.department ? (
                          <div className="locker-comp-dept">{comp.department}</div>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>

            </div>
          )
        })}
      </div>
    </div>
  )
}
