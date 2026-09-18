/**
 * `AllocationStore` gọi backend thật.
 *
 * Màn hình vẫn nói bằng `AllocationMutation` như cũ; chỗ này dịch sang HTTP:
 *
 *     assign  → POST /seats/assignments
 *     release → POST /seats/assignments/{id}/release
 *
 * Hai điều đáng biết trước khi sửa file này:
 *
 * 1. **`seatId` không phải thứ backend hiểu.** Bảng `seat_assignment` khóa
 *    theo `workstation_id`; `seat-ws-16-001` là cách frontend gọi cùng một
 *    cái bàn. Dịch ở đây, không dịch rải rác trong màn hình.
 * 2. **Id của kỳ hạn do backend cấp.** `planAssignment` sinh sẵn một id cục
 *    bộ để vẽ ngay, nhưng id đó không tồn tại phía server. Vì vậy sau mỗi
 *    lần ghi thành công, store gọi `onCommitted` để màn hình nạp lại danh
 *    sách thật thay vì tự đoán. Không làm vậy thì nút "thu hồi" ngay sau
 *    khi gán sẽ gửi lên một id lạ.
 *
 * `read()` trả về `null`: lịch sử thao tác nằm ở server, không phải một
 * hàng đợi cục bộ cần phát lại.
 */

import { assignSeat, releaseSeat } from '@/api/seats'
import type { AllocationMutation, AllocationStore } from './allocationStore'
import { workstationIdOf } from './liveAllocation'

export interface ApiAllocationStoreOptions {
  floorId: string
  /** Gọi sau khi mọi thay đổi trong một đợt đã ghi xong. */
  onCommitted?: () => void
  /** Gọi khi backend từ chối; màn hình dùng để báo và nạp lại trạng thái thật. */
  onError?: (error: unknown) => void
}

export function createApiAllocationStore({
  floorId,
  onCommitted,
  onError,
}: ApiAllocationStoreOptions): AllocationStore {
  return {
    read: () => null,

    append: async (_floorId, mutations) => {
      if (mutations.length === 0) return
      try {
        // Tuần tự, không song song: một đợt "chuyển chỗ" là thu hồi rồi gán
        // lại, và gán trước khi thu hồi xong thì backend từ chối đúng theo
        // luật một người một chỗ.
        for (const mutation of mutations) {
          await send(floorId, mutation)
        }
        onCommitted?.()
      } catch (error) {
        onError?.(error)
        throw error
      }
    },
  }
}

async function send(floorId: string, mutation: AllocationMutation): Promise<void> {
  if (mutation.kind === 'release') {
    await releaseSeat(mutation.assignmentId)
    return
  }
  await assignSeat({
    floor_id: floorId,
    workstation_id: workstationIdOf(mutation.seatId),
    employee_id: mutation.employeeId,
    // Sơ đồ chưa gợi ý chỗ ngồi, nên mọi thao tác hiện giờ là người tự làm.
    // Khi có gợi ý thì chỗ này phải gửi `accept` hoặc `override`, nếu không
    // thì KPI Tuần 6 đọc ra con số vô nghĩa (Issue #2 mục 5).
    decision: 'manual',
  })
}
