import { useMemo } from 'react'
import type { LockerItem } from '../types'
import { STATUS_META } from '../lockersData'

interface LockerDetailGridProps {
  lockers: LockerItem[]
  selectedLocker: LockerItem | null
  onSelectLocker: (locker: LockerItem) => void
}

interface ZoneGroupData {
  key: string
  title: string
  subtitle: string
  items: LockerItem[]
}

export function LockerDetailGrid({
  lockers,
  selectedLocker,
  onSelectLocker,
}: LockerDetailGridProps) {
  // Group compartments by Zone
  const zoneGroups = useMemo<ZoneGroupData[]>(() => {
    const groups: Record<string, ZoneGroupData> = {
      L1: {
        key: 'L1',
        title: 'KHU L1 · SẢNH THANG MÁY TÂY & BĐS',
        subtitle: 'Cột T1 & Dãy Bất Động Sản Smart City',
        items: [],
      },
      L2: {
        key: 'L2',
        title: 'KHU L2 · SẢNH TRUNG TÂM & LÕI KỸ THUẬT',
        subtitle: 'Sảnh thang máy chính & Hành lang Đông',
        items: [],
      },
      L3: {
        key: 'L3',
        title: 'KHU L3 · KHỐI AI & CÔNG NGHỆ',
        subtitle: 'Cụm Mô hình Nền tảng & Trục Kỹ thuật AI',
        items: [],
      },
      L4: {
        key: 'L4',
        title: 'KHU L4 · PANTRY & ĐỔI MỚI SÁNG TẠO',
        subtitle: 'Khu vực Nghỉ ngơi & Đổi mới',
        items: [],
      },
    }

    for (const locker of lockers) {
      if (groups[locker.zoneGroup]) {
        groups[locker.zoneGroup].items.push(locker)
      }
    }

    return Object.values(groups).filter((g) => g.items.length > 0)
  }, [lockers])

  return (
    <div className="locker-detail-wrapper" role="region" aria-label="Sơ đồ chi tiết tủ locker theo khu vực">
      {/* Top Legend matching wireframe (Artboard 1c) */}
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
          {lockers.length} tủ · {lockers.filter((l) => l.status === 'in_use').length} đang dùng ·{' '}
          {lockers.filter((l) => l.status === 'available').length} trống ·{' '}
          {lockers.filter((l) => l.status === 'recall').length} cần thu hồi
        </div>
      </div>

      {/* Grid of Zone Cards */}
      <div className="locker-detail-zones-grid">
        {zoneGroups.map((zone) => {
          const availableCount = zone.items.filter((l) => l.status === 'available').length
          const recallCount = zone.items.filter((l) => l.status === 'recall').length

          return (
            <div key={zone.key} className="locker-detail-zone-card">
              <div className="locker-detail-zone-header">
                <div>
                  <div className="locker-detail-zone-title">{zone.title}</div>
                  <div className="locker-detail-zone-subtitle">{zone.subtitle}</div>
                </div>
                <span className="locker-detail-zone-badge">
                  {zone.items.length} ngăn
                </span>
              </div>

              {/* Locker compartments grid matching wireframe */}
              <div className="locker-compartments-grid">
                {zone.items.map((item) => {
                  const isSelected =
                    selectedLocker?.id === item.id ||
                    selectedLocker?.code === item.code
                  const meta = STATUS_META[item.status]

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`locker-compartment-box is-${item.status}${isSelected ? ' is-selected' : ''}`}
                      onClick={() => onSelectLocker(item)}
                      aria-label={`${item.code} - ${meta.label} - ${item.employeeName || 'Còn trống'}`}
                      title={`${item.code} (${meta.label}) - ${item.employeeName || 'Còn trống'}`}
                    >
                      <div className="locker-comp-top">
                        <span className="locker-comp-code">{item.code}</span>
                        <span
                          className={`locker-comp-dot status-dot ${item.status}`}
                          aria-hidden="true"
                        />
                      </div>

                      <div className="locker-comp-center">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          className="locker-comp-icon"
                          aria-hidden="true"
                        >
                          <rect x="5" y="3" width="14" height="18" rx="2" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <circle cx="9" cy="7.5" r="1" fill="currentColor" />
                          <circle cx="9" cy="16.5" r="1" fill="currentColor" />
                        </svg>
                      </div>

                      <div className="locker-comp-bottom">
                        <div className="locker-comp-name">
                          {item.employeeName || meta.label}
                        </div>
                        {item.department ? (
                          <div className="locker-comp-dept">{item.department}</div>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="locker-detail-zone-footer">
                <span>{zone.items.length} tủ</span>
                {recallCount > 0 ? (
                  <span style={{ color: 'var(--vsf-red, #d2181f)', fontWeight: 600 }}>
                    · {recallCount} cần thu hồi
                  </span>
                ) : null}
                <span>· {availableCount} trống</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
