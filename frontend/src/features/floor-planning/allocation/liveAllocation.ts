/**
 * Dữ liệu chỗ ngồi thật, dựng từ dataset + API.
 *
 * Chia việc đúng như đã chốt ở Issue #2 mục 2:
 *
 * - **Ghế** suy ra từ dataset. Backend không biết bàn nào ở đâu, và cũng
 *   không cần biết: một chỗ ngồi tồn tại vì bản vẽ có bàn đó.
 * - **Kỳ hạn ngồi và người ngồi** đến từ `/api/seats/...`. Đó là thứ duy
 *   nhất DB giữ.
 *
 * Những gì bản demo có mà bản thật chưa có — thiết bị, trạng thái hiện diện,
 * loại ghế — đều **để trống**, không đoán. Chỗ nào màn
 * hình cần mà backend chưa trả lời thì phải nhìn thấy là trống, chứ không
 * được nhìn thấy số liệu bịa.
 */

import type { SeatAssignment as ApiSeatAssignment } from '@/api/seats'
import type { Assignment, Department, Employee, FloorAllocationData, Seat } from '../domain/allocation'
import type { FloorDataset, Workstation } from '../domain/spatial'

/** `seat-ws-16-001` ↔ `ws-16-001`. Một ghế gắn với đúng một workstation. */
export const seatIdOf = (workstationId: string) => `seat-${workstationId}`
export const workstationIdOf = (seatId: string) =>
  seatId.startsWith('seat-') ? seatId.slice('seat-'.length) : seatId

/**
 * Mã hiển thị của ghế, ví dụ `F16-A-023`.
 *
 * Chữ cái ở giữa là thứ tự khu vực trong dataset, nên nó **đổi khi thứ tự
 * khu vực đổi**. Vì thế nó chỉ để đọc; khóa gửi lên backend luôn là
 * `workstationId` (xem `seat/models.py`).
 */
export function seatCodeOf(dataset: FloorDataset, workstation: Workstation): string {
  if (workstation.source.deskCode) return workstation.source.deskCode
  const letters = new Map(dataset.zones.map((zone, index) => [zone.id, String.fromCharCode(65 + index)]))
  const zoneLetter = workstation.zoneId ? letters.get(workstation.zoneId) ?? 'X' : 'X'
  const number = workstation.id.split('-').at(-1) ?? workstation.id
  return `F${dataset.layout.floor.level}-${zoneLetter}-${number}`
}

/**
 * Phòng ban của từng tầng, đọc từ chính bản vẽ.
 *
 * Khu vực nào cũng mang `departmentCode`, và hai khu vực dùng chung một mã thì
 * đó là **một phòng ban ngồi hai chỗ** — Mô hình & Nền tảng AI bị lõi thang máy
 * chia đôi. Gộp theo mã chứ không theo khu vực, nếu không màn hình sẽ hiện hai
 * phòng ban trùng tên.
 */
export function departmentsOf(dataset: FloorDataset): Department[] {
  const byCode = new Map<string, Department>()
  for (const zone of dataset.zones) {
    if (!zone.departmentCode || !zone.name) continue
    const existing = byCode.get(zone.departmentCode)
    if (existing) existing.zonePreferences.push(zone.id)
    else byCode.set(zone.departmentCode, {
      id: zone.departmentCode,
      name: zone.name,
      zonePreferences: [zone.id],
    })
  }
  return [...byCode.values()]
}

/** Ghế của một tầng, suy ra từ bản vẽ. */
export function seatsOf(dataset: FloorDataset, layoutVersion: string): Seat[] {
  const departmentOfZone = new Map(dataset.zones.map((zone) => [zone.id, zone.departmentCode]))
  return dataset.workstations
    .filter((workstation) => workstation.classification === 'WORKSTATION')
    .map((workstation) => ({
      id: seatIdOf(workstation.id),
      code: seatCodeOf(dataset, workstation),
      workstationId: workstation.id,
      // Phòng ban của ghế là phòng ban của khu vực chứa nó. Đó là điều bản vẽ
      // nói, và là thứ duy nhất nói được — không có bảng nào gán ghế cho phòng
      // ban riêng lẻ.
      departmentId: workstation.zoneId ? departmentOfZone.get(workstation.zoneId) ?? null : null,
      verifiedBy: null,
      verifiedAt: null,
      layoutVersion,
    }))
}

/**
 * Gộp dataset với các kỳ hạn đang hiệu lực thành dữ liệu màn hình cần.
 *
 * Bỏ qua kỳ hạn trỏ vào workstation không có trong bản vẽ: backend đã có
 * lệnh đối chiếu để kể ra những dòng như vậy (`reconcileFloor`), còn sơ đồ
 * thì không vẽ được một cái ghế không tồn tại.
 */
export function buildLiveAllocation(
  dataset: FloorDataset,
  assignments: readonly ApiSeatAssignment[],
  options: { layoutVersion?: string; asOf?: string } = {},
): FloorAllocationData {
  const layoutVersion =
    options.layoutVersion ?? assignments[0]?.layout_version ?? dataset.layout.floor.id
  const seats = seatsOf(dataset, layoutVersion)
  const known = new Set(seats.map((seat) => seat.workstationId))

  const employees = new Map<string, Employee>()
  const mapped: Assignment[] = []

  for (const row of assignments) {
    if (!known.has(row.workstation_id)) continue

    if (!employees.has(row.employee.id)) {
      employees.set(row.employee.id, {
        id: row.employee.id,
        employeeCode: row.employee.employee_code,
        name: row.employee.full_name,
        departmentId: row.employee.department_id,
        // Hiện diện là dữ liệu thời gian thực, chưa phân hệ nào có.
        presence: 'unknown',
      })
    }

    mapped.push({
      // Giữ nguyên id của backend: thu hồi và chuyển chỗ đều gọi theo id này.
      id: row.id,
      employeeId: row.employee.id,
      seatId: seatIdOf(row.workstation_id),
      type: 'permanent',
      validFrom: row.assigned_at,
      validTo: row.released_at,
      updatedAt: row.released_at ?? row.assigned_at,
    })
  }

  return {
    // `kind: 'api'` là thứ màn hình đọc để biết có phải dán nhãn "dữ liệu
    // minh họa" hay không.
    source: { kind: 'api', asOf: options.asOf ?? new Date().toISOString() },
    seats,
    employees: [...employees.values()],
    assignments: mapped,
    departments: departmentsOf(dataset),
    devices: [],
  }
}
