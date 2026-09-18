import type { LockerItem } from '../types'
import { STATUS_META } from '../lockersData'

interface LockerListProps {
  lockers: LockerItem[]
  selectedLocker: LockerItem | null
  onSelectLocker: (locker: LockerItem) => void
}

export function LockerList({ lockers, selectedLocker, onSelectLocker }: LockerListProps) {
  return (
    <div className="locker-table-wrapper">
      <table className="locker-table" role="table" aria-label="Danh sách tủ locker">
        <thead>
          <tr>
            <th>Mã tủ</th>
            <th>Nhân sự sử dụng</th>
            <th>Bộ phận</th>
            <th>Vị trí vật lý</th>
            <th>Trạng thái</th>
            <th>Ngày cấp / Hạn</th>
          </tr>
        </thead>
        <tbody>
          {lockers.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--muted)' }}>
                Không tìm thấy tủ locker phù hợp với điều kiện tìm kiếm.
              </td>
            </tr>
          ) : (
            lockers.map((locker) => {
              const isSelected = selectedLocker?.id === locker.id
              const meta = STATUS_META[locker.status]

              return (
                <tr
                  key={locker.id}
                  className={isSelected ? 'is-selected' : ''}
                  onClick={() => onSelectLocker(locker)}
                  tabIndex={0}
                  role="row"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectLocker(locker)
                    }
                  }}
                >
                  <td style={{ fontWeight: 600 }}>{locker.code}</td>
                  <td style={{ color: locker.employeeName ? 'var(--ink)' : 'var(--muted)' }}>
                    {locker.employeeName || '—'}
                  </td>
                  <td style={{ color: locker.department ? 'var(--ink)' : 'var(--muted)' }}>
                    {locker.department || '—'}
                  </td>
                  <td style={{ color: 'var(--fp-text-2, #57524b)' }}>{locker.physicalLocation}</td>
                  <td>
                    <span
                      className="fp-desk-badge is-sm"
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
                  </td>
                  <td style={{ color: locker.recallDueDate ? 'var(--vsf-red)' : 'var(--muted)' }}>
                    {locker.recallDueDate || locker.assignedDate || '—'}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
