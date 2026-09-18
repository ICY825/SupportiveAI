import type { ReactNode } from 'react'
import type { Device, Employee, SeatCapabilities } from '../../domain/allocation'
import type { DeskRecord, PersonOnDesk } from '../../domain/desk'
import { ASSIGNMENT_TYPE, DEVICE_TYPE, PRESENCE, SEAT_TYPE, UNLABELED_ZONE } from '../../labels'
import { DeskStatusIcon } from './DeskStatusBadge'
import { formatDateTime, formatDay, initials } from './format'

/* ---------------------------------------------------------------- primitives */

export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="fp-di-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

type Pair = [label: string, value: ReactNode | null | undefined]

/** Label/value list that simply omits rows without a value (no "null" rows). */
export function PropertyList({ rows }: { rows: Pair[] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (!shown.length) return null
  return (
    <dl className="fp-di-props">
      {shown.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Avatar({ employee, size = 'lg' }: { employee: Employee; size?: 'sm' | 'lg' }) {
  return (
    <span className={`fp-avatar is-${size}`} aria-hidden="true">
      {employee.avatarUrl ? <img src={employee.avatarUrl} alt="" /> : initials(employee.name)}
    </span>
  )
}

function Presence({ employee }: { employee: Employee }) {
  const p = employee.presence ?? 'unknown'
  return (
    <span className="fp-presence" data-presence={p}>
      <span className="fp-presence-dot" aria-hidden="true" />
      {PRESENCE[p]}
    </span>
  )
}

/* ---------------------------------------------------------------- people */

export function EmployeeSummary({ person }: { person: PersonOnDesk }) {
  const { employee, department } = person
  const org = [department?.name, employee.team].filter(Boolean).join(' · ')
  return (
    <div className="fp-di-person">
      <Avatar employee={employee} />
      <div className="fp-di-person-text">
        <p className="fp-di-person-name">{employee.name}</p>
        {employee.jobTitle && <p className="fp-di-person-title">{employee.jobTitle}</p>}
        {org && <p className="fp-di-person-org">{org}</p>}
        <Presence employee={employee} />
      </div>
    </div>
  )
}

export function PersonRow({ person, now }: { person: PersonOnDesk; now: Date }) {
  const { employee, assignment } = person
  return (
    <li className="fp-di-person-row">
      <Avatar employee={employee} size="sm" />
      <div>
        <p className="fp-di-person-name">{employee.name}</p>
        <p className="fp-di-person-title">
          {[employee.jobTitle, `${ASSIGNMENT_TYPE[assignment.type]} từ ${formatDay(assignment.validFrom, now).toLowerCase()}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </li>
  )
}

export function EmployeeDetails({ person }: { person: PersonOnDesk }) {
  const { employee, department, manager } = person
  return (
    <InspectorSection title="Nhân sự">
      <PropertyList
        rows={[
          ['Mã nhân viên', <span key="code" className="fp-mono">{employee.employeeCode}</span>],
          ['Phòng ban', department?.name],
          ['Nhóm', employee.team],
          ['Quản lý', manager?.name],
        ]}
      />
    </InspectorSection>
  )
}

/* ---------------------------------------------------------------- desk */

export function WorkspaceProperties({ desk, showDepartment }: { desk: DeskRecord; showDepartment: boolean }) {
  const { seat, zone, workstation } = desk
  return (
    <InspectorSection title="Chỗ ngồi">
      <PropertyList
        rows={[
          ['Mã chỗ', <span key="code" className="fp-mono">{seat.code}</span>],
          ['Khu vực', workstation.zoneId ? (zone?.name ?? UNLABELED_ZONE) : 'Ngoài các khu vực'],
          ['Tầng', workstation.floorId.replace(/^floor-/, '')],
          ['Phòng ban', showDepartment ? (desk.department?.name ?? 'Chưa phân bổ') : null],
          ['Loại chỗ', seat.seatType ? SEAT_TYPE[seat.seatType] : undefined],
        ]}
      />
    </InspectorSection>
  )
}

export function AssignmentDetails({ person, now }: { person: PersonOnDesk; now: Date }) {
  const a = person.assignment
  return (
    <InspectorSection title="Phân công">
      <PropertyList
        rows={[
          ['Loại', ASSIGNMENT_TYPE[a.type]],
          ['Ngày gán', formatDay(a.validFrom, now)],
          ['Hiệu lực đến', a.validTo ? formatDay(a.validTo, now) : 'Không thời hạn'],
          ['Cập nhật', a.updatedAt ? formatDateTime(a.updatedAt, now) : null],
        ]}
      />
    </InspectorSection>
  )
}

const DEVICE_ORDER = { laptop: 0, monitor: 1, dock: 2, other: 3 }

export function DeviceList({ devices }: { devices: Device[] }) {
  return (
    <InspectorSection title="Thiết bị">
      {devices.length === 0 ? (
        <p className="fp-di-muted">Chưa ghi nhận thiết bị tại chỗ ngồi này</p>
      ) : (
        <ul className="fp-di-devices">
          {[...devices]
            .sort((a, b) => DEVICE_ORDER[a.type] - DEVICE_ORDER[b.type])
            .map((d) => (
              <li key={d.id}>
                <span>{DEVICE_TYPE[d.type]}</span>
                <span className="fp-mono">{d.assetCode}</span>
              </li>
            ))}
        </ul>
      )}
    </InspectorSection>
  )
}

type Check = { ok: boolean | undefined; yes: string; no: string }

export function DeskConditions({ desk }: { desk: DeskRecord }) {
  const caps: SeatCapabilities = desk.seat.capabilities ?? {}
  const ready = desk.status === 'available' && caps.power !== false
  const checks: Check[] = [
    {
      ok: desk.status === 'available' ? ready : false,
      yes: 'Sẵn sàng để gán',
      no: desk.status === 'available' ? 'Chưa sẵn sàng: thiếu nguồn điện' : 'Chưa thể gán',
    },
    { ok: caps.power, yes: 'Có nguồn điện', no: 'Không có nguồn điện' },
    { ok: caps.monitor, yes: 'Đã lắp màn hình', no: 'Chưa lắp màn hình' },
    { ok: caps.dockingStation, yes: 'Có dock sạc', no: 'Chưa có dock sạc' },
  ]
  return (
    <InspectorSection title="Điều kiện">
      <ul className="fp-di-checks">
        {checks.map((c) => (
          <li key={c.yes} data-ok={c.ok === undefined ? 'unknown' : String(c.ok)}>
            <span className="fp-di-check-icon" aria-hidden="true">
              {c.ok === undefined ? '?' : c.ok ? '✓' : '✕'}
            </span>
            {c.ok === undefined ? `${c.yes}: chưa rõ` : c.ok ? c.yes : c.no}
          </li>
        ))}
      </ul>
    </InspectorSection>
  )
}

/* ---------------------------------------------------------------- state summaries */

export function AvailableSummary() {
  return (
    <div className="fp-di-empty" data-desk-status="available">
      <span className="fp-di-empty-icon" aria-hidden="true">
        <DeskStatusIcon status="available" size={18} />
      </span>
      <div>
        <p className="fp-di-empty-title">Chỗ ngồi còn trống</p>
        <p className="fp-di-muted">Chưa có nhân sự được gán</p>
      </div>
    </div>
  )
}

export function ReservationSummary({ desk, now }: { desk: DeskRecord; now: Date }) {
  const r = desk.reservation
  if (!r) {
    return (
      <div className="fp-di-empty" data-desk-status="reserved">
        <span className="fp-di-empty-icon" aria-hidden="true">
          <DeskStatusIcon status="reserved" size={18} />
        </span>
        <div>
          <p className="fp-di-empty-title">Đang được giữ chỗ</p>
          <p className="fp-di-muted">Chưa có nhân sự cụ thể cho lịch giữ chỗ này</p>
        </div>
      </div>
    )
  }
  const started = Date.parse(r.assignment.validFrom) <= now.getTime()
  return (
    <div className="fp-di-card" data-desk-status="reserved">
      <p className="fp-di-card-kicker">Đặt trước cho</p>
      <EmployeeSummary person={r} />
      <PropertyList
        rows={[
          ['Bắt đầu', formatDateTime(r.assignment.validFrom, now)],
          ['Kết thúc', r.assignment.validTo ? formatDateTime(r.assignment.validTo, now) : 'Không thời hạn'],
          ['Hiện tại', started ? 'Đang trong thời gian đặt chỗ' : 'Còn trống cho đến khi bắt đầu đặt chỗ'],
        ]}
      />
    </div>
  )
}

const COUNT_WORD = ['', 'Một', 'Hai', 'Ba', 'Bốn', 'Năm']

export function ConflictSummary({ desk, now }: { desk: DeskRecord; now: Date }) {
  const n = desk.occupants.length
  return (
    <div className="fp-di-card is-conflict" data-desk-status="conflict" role="group" aria-labelledby="fp-di-conflict-title">
      <p id="fp-di-conflict-title" className="fp-di-card-title">
        <DeskStatusIcon status="conflict" size={14} />
        {COUNT_WORD[n] ?? n} phân công đang hiệu lực
      </p>
      <ul className="fp-di-people">
        {desk.occupants.map((p) => (
          <PersonRow key={p.assignment.id} person={p} now={now} />
        ))}
      </ul>
      <PropertyList rows={[['Phát hiện', desk.conflictDetectedAt ? formatDateTime(desk.conflictDetectedAt, now).replace(', ', ' • ') : null]]} />
      <p className="fp-di-muted">Các nhân sự trên đang cùng được gán vào một vị trí làm việc vật lý.</p>
    </div>
  )
}

export function UnavailableSummary({ desk, now }: { desk: DeskRecord; now: Date }) {
  const { seat } = desk
  return (
    <div className="fp-di-card is-unavailable" data-desk-status="unavailable">
      <p className="fp-di-card-title">
        <DeskStatusIcon status="unavailable" size={14} />
        Tạm ngưng sử dụng
      </p>
      <PropertyList
        rows={[
          ['Lý do', seat.statusReason ?? 'Chưa ghi lý do'],
          ['Từ', seat.statusChangedAt ? formatDateTime(seat.statusChangedAt, now) : null],
        ]}
      />
    </div>
  )
}
