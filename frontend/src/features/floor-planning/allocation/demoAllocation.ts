/**
 * DEMO allocation fixtures. NOT real data.
 *
 * People, seats, assignments and devices below are invented so the desk
 * inspector can be designed and tested before the HR/Admin API exists.
 * They are generated deterministically from the physical workstations of a
 * floor, only ever shown in the "workspace" view mode with a visible
 * "dữ liệu minh họa" label, and never written into FloorDataset.
 *
 * Replace with an API-backed loader returning FloorAllocationData.
 */
import type {
  Assignment,
  Department,
  Device,
  Employee,
  FloorAllocationData,
  Presence,
  Seat,
  SeatType,
} from '../domain/allocation'
import type { FloorDataset, Workstation } from '../domain/spatial'

const DAY = 86_400_000

/** FNV-1a: stable pseudo-random value in [0, 1) per key. */
function rand(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0x1_0000_0000
}

const pick = <T>(items: readonly T[], key: string): T => items[Math.floor(rand(key) * items.length)]

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý']
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Quang', 'Thu', 'Đức', 'Ngọc', 'Hải', 'Thanh', 'Hoàng']
const GIVEN = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hiếu', 'Hương', 'Khoa', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Phúc', 'Quân', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Tuấn', 'Vy']

/** Department per source zone. Zone names come from the drawing; teams/titles are invented. */
const DEPARTMENTS: { match: RegExp; id: string; name: string; teams: string[]; titles: string[] }[] = [
  {
    match: /NỀN TẢNG AI/,
    id: 'dept-ai-data',
    name: 'AI & Data',
    teams: ['AI Platform', 'Data Engineering', 'Applied ML'],
    titles: ['AI Engineer', 'Data Engineer', 'ML Engineer', 'Data Analyst'],
  },
  {
    match: /SMART CITY/,
    id: 'dept-smart-city',
    name: 'Bất động sản - Smart City',
    teams: ['Sản phẩm', 'Vận hành dự án', 'Kỹ thuật hệ thống'],
    titles: ['Chuyên viên sản phẩm', 'Kỹ sư hệ thống', 'Quản lý dự án'],
  },
  {
    match: /GSM/,
    id: 'dept-gsm',
    name: 'Kinh doanh & Vận hành GSM',
    teams: ['Kinh doanh', 'Vận hành'],
    titles: ['Chuyên viên kinh doanh', 'Chuyên viên vận hành'],
  },
  {
    match: /VINFAST/,
    id: 'dept-vinfast-kdo2o',
    name: 'VinFast KDO2O',
    teams: ['Online-to-Offline'],
    titles: ['Chuyên viên O2O', 'Chuyên viên phân tích'],
  },
]

const iso = (ms: number) => new Date(ms).toISOString()
const VN_OFFSET = 7 * 3_600_000
/** Wall-clock time in Asia/Ho_Chi_Minh, `dayOffset` days from `base`. */
const atTime = (base: Date, dayOffset: number, h: number, m: number) => {
  const d = new Date(base.getTime() + VN_OFFSET + dayOffset * DAY)
  d.setUTCHours(h, m, 0, 0)
  return d.getTime() - VN_OFFSET
}
/** Earlier today at h:m, or one minute ago if that time has not come yet (keeps "today" events in the past). */
const earlierToday = (base: Date, h: number, m: number) => Math.min(atTime(base, 0, h, m), base.getTime() - 60_000)
/** Later today at h:m, or two hours from now if that time has passed. */
const laterToday = (base: Date, h: number, m: number) => Math.max(atTime(base, 0, h, m), base.getTime() + 2 * 3_600_000)

export function createDemoAllocation(dataset: FloorDataset, now: Date): FloorAllocationData {
  const level = dataset.layout.floor.level
  const departments: Department[] = []
  const deptByZone = new Map<string, (typeof DEPARTMENTS)[number]>()
  for (const zone of dataset.zones) {
    const def = zone.name ? DEPARTMENTS.find((d) => d.match.test(zone.name!)) : undefined
    if (!def) continue
    deptByZone.set(zone.id, def)
    const existing = departments.find((d) => d.id === def.id)
    if (existing) existing.zonePreferences.push(zone.id)
    else departments.push({ id: def.id, name: def.name, zonePreferences: [zone.id] })
  }

  const zoneLetter = new Map(dataset.zones.map((z, i) => [z.id, String.fromCharCode(65 + i)]))
  const seats: Seat[] = []
  const employees: Employee[] = []
  const assignments: Assignment[] = []
  const devices: Device[] = []

  const managers = new Map<string, Employee>()
  for (const def of DEPARTMENTS) {
    const m: Employee = {
      id: `emp-mgr-${def.id}`,
      employeeCode: `VSF-${String(9000 + managers.size).padStart(4, '0')}`,
      name: def.id === 'dept-ai-data' ? 'Trần Đức Anh' : `${pick(FAMILY, def.id)} ${pick(MIDDLE, `${def.id}m`)} ${pick(GIVEN, `${def.id}g`)}`,
      jobTitle: 'Trưởng phòng',
      departmentId: def.id,
      presence: 'in_office',
    }
    managers.set(def.id, m)
    employees.push(m)
  }

  let employeeSeq = 200
  const newEmployee = (key: string, deptId: string | null, over: Partial<Employee> = {}): Employee => {
    const def = DEPARTMENTS.find((d) => d.id === deptId)
    const presence: Presence = pick(['in_office', 'in_office', 'in_office', 'remote', 'away', 'unknown'], `${key}p`)
    const e: Employee = {
      id: `emp-${key}`,
      employeeCode: `VSF-${String(employeeSeq++).padStart(4, '0')}`,
      name: `${pick(FAMILY, `${key}f`)} ${pick(MIDDLE, `${key}m`)} ${pick(GIVEN, `${key}g`)}`,
      jobTitle: def ? pick(def.titles, `${key}t`) : 'Chuyên viên',
      departmentId: deptId,
      team: def ? pick(def.teams, `${key}team`) : undefined,
      managerId: deptId ? managers.get(deptId)?.id : null,
      presence,
      ...over,
    }
    employees.push(e)
    return e
  }
  const assign = (seat: Seat, e: Employee, type: Assignment['type'], from: number, to: number | null, updated?: number) => {
    assignments.push({
      id: `asg-${seat.id}-${e.id}`,
      employeeId: e.id,
      seatId: seat.id,
      type,
      validFrom: iso(from),
      validTo: to === null ? null : iso(to),
      updatedAt: iso(updated ?? from),
    })
  }
  const laptop = (e: Employee) =>
    devices.push({ id: `dev-lt-${e.id}`, type: 'laptop', assetCode: `VSF-LT-${String(1000 + devices.length).padStart(4, '0')}`, employeeId: e.id })

  const desks = dataset.workstations.filter((w) => w.classification === 'WORKSTATION')
  const showcase = demoShowcaseDesks(dataset)
  const showcaseRole = new Map<string, string>(showcase.map((w, i) => [w.id, ['occupied', 'available', 'reserved', 'conflict', 'unavailable', 'hotdesk'][i]]))

  for (const w of desks) {
    const def = w.zoneId ? deptByZone.get(w.zoneId) : undefined
    const num = w.id.replace(/^ws-\d+-/, '')
    const role = showcaseRole.get(w.id)
    const r = rand(w.id)
    const seatType: SeatType = role === 'hotdesk' ? 'HOT_DESK' : r > 0.93 ? 'HOT_DESK' : r > 0.9 ? 'SHARED' : 'FIXED'
    const seat: Seat = {
      id: `seat-${w.id}`,
      code: `F${level}-${w.zoneId ? zoneLetter.get(w.zoneId) : 'X'}-${num}`,
      workstationId: w.id,
      status: 'ACTIVE',
      seatType,
      departmentId: def?.id ?? null,
      capabilities:
        role === 'occupied'
          ? { power: true, monitor: true, dockingStation: false }
          : role === 'available'
            ? { power: true, monitor: true, dockingStation: true }
            : { power: rand(`${w.id}pw`) > 0.03, monitor: rand(`${w.id}mn`) > 0.2, dockingStation: rand(`${w.id}dk`) > 0.6 },
      verifiedBy: null,
      verifiedAt: null,
      layoutVersion: `${dataset.layout.floor.id}@demo`,
    }
    seats.push(seat)
    if (seat.capabilities?.monitor) {
      devices.push({ id: `dev-mn-${w.id}`, type: 'monitor', assetCode: `VSF-MN-${String(900 + seats.length).padStart(4, '0')}`, seatId: seat.id })
    }
    if (seat.capabilities?.dockingStation) {
      devices.push({ id: `dev-dk-${w.id}`, type: 'dock', assetCode: `VSF-DK-${String(300 + seats.length).padStart(4, '0')}`, seatId: seat.id })
    }
    const deptId = def?.id ?? null

    if (role === 'occupied') {
      const e = newEmployee(w.id, deptId, {
        name: 'Nguyễn Văn Minh',
        employeeCode: 'VSF-0182',
        jobTitle: 'AI Engineer',
        team: 'AI Platform',
        presence: 'in_office',
      })
      laptop(e)
      assign(seat, e, 'permanent', atTime(now, -3, 9, 0), null, earlierToday(now, 8, 14))
    } else if (role === 'available') {
      // stays free: showcase of the available state
    } else if (role === 'reserved') {
      const e = newEmployee(w.id, deptId, { name: 'Lê Hoàng Nam', jobTitle: 'Data Engineer', team: 'Data Engineering' })
      assign(seat, e, 'reservation', atTime(now, 1, 8, 0), null, atTime(now, -1, 16, 30))
    } else if (role === 'conflict') {
      const a = newEmployee(`${w.id}a`, deptId, { name: 'Vũ Thị Lan', jobTitle: 'ML Engineer' })
      const b = newEmployee(`${w.id}b`, deptId, { name: 'Đặng Minh Khoa', jobTitle: 'Data Analyst' })
      laptop(a)
      laptop(b)
      assign(seat, a, 'permanent', atTime(now, -40, 9, 0), null)
      assign(seat, b, 'temporary', earlierToday(now, 9, 0), atTime(now, 30, 18, 0), earlierToday(now, 9, 42))
    } else if (role === 'unavailable') {
      seat.status = 'OUT_OF_SERVICE'
      seat.statusReason = 'Đang sửa ổ điện âm sàn'
      seat.statusChangedAt = iso(atTime(now, -2, 14, 5))
    } else if (role === 'hotdesk') {
      const e = newEmployee(w.id, deptId)
      laptop(e)
      assign(seat, e, 'temporary', earlierToday(now, 8, 30), laterToday(now, 18, 0), earlierToday(now, 8, 30))
    } else if (r < 0.62) {
      const e = newEmployee(w.id, deptId)
      laptop(e)
      const since = -Math.floor(rand(`${w.id}since`) * 400) - 1
      assign(seat, e, seatType === 'FIXED' ? 'permanent' : 'temporary', atTime(now, since, 9, 0), seatType === 'FIXED' ? null : atTime(now, 7, 18, 0))
    } else if (r < 0.68) {
      const e = newEmployee(w.id, deptId)
      assign(seat, e, 'reservation', atTime(now, 1 + Math.floor(rand(`${w.id}res`) * 10), 8, 0), null, atTime(now, -1, 10, 0))
    } else if (r < 0.715) {
      seat.status = 'OUT_OF_SERVICE'
      seat.statusReason = pick(['Đang bảo trì', 'Thiếu ghế', 'Khu vực đang cải tạo'], `${w.id}why`)
      seat.statusChangedAt = iso(atTime(now, -5, 10, 0))
    }
  }

  return { source: { kind: 'demo', asOf: now.toISOString() }, seats, assignments, departments, employees, devices }
}

/**
 * Desks that receive each demo showcase state (occupied, available, reserved,
 * conflict, unavailable, hot desk): the first six desks of the AI zone when the
 * floor has one, otherwise of the largest labelled zone.
 */
export function demoShowcaseDesks(dataset: FloorDataset): Workstation[] {
  const desks = dataset.workstations.filter((w) => w.classification === 'WORKSTATION')
  const labelled = dataset.zones.filter((z) => z.name && DEPARTMENTS.some((d) => d.match.test(z.name!)))
  const preferred = labelled.find((z) => DEPARTMENTS[0].match.test(z.name!))
  const largest = [...labelled].sort(
    (a, b) => desks.filter((w) => w.zoneId === b.id).length - desks.filter((w) => w.zoneId === a.id).length,
  )[0]
  const zone = preferred ?? largest
  return zone ? desks.filter((w) => w.zoneId === zone.id).slice(0, 6) : []
}
