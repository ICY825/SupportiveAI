/**
 * Nguồn dữ liệu chỗ ngồi của một tầng: thật nếu có phiên đăng nhập, minh họa
 * nếu không.
 *
 * Vì sao không bắt đăng nhập cho cả sơ đồ: hình học nằm trong dataset đi kèm
 * bản build, nên mặt bằng vẽ được mà không cần gọi API. Chỉ phần *ai ngồi
 * đâu* là dữ liệu nhân sự và phải có phiên. Khóa cả màn hình lại thì mất
 * đúng thứ hay được mở ra xem nhất trong pilot, đổi lấy một lớp bảo vệ mà
 * backend đã tự làm rồi (`requires(PERM_VIEW)`).
 *
 * Khi API hỏng hoặc từ chối, màn hình **quay về dữ liệu minh họa và nói rõ
 * là đang minh họa** — nhãn có sẵn ở `labels.ts`. Im lặng hiện sơ đồ trống
 * thì người dùng tưởng cả tầng không ai ngồi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/api/client'
import { listAssignments, reconcileFloor, type ReconcileReport } from '@/api/seats'
import { useOptionalSession } from '@/shared/auth'
import type { FloorAllocationData } from '../domain/allocation'
import type { FloorDataset } from '../domain/spatial'
import { createDemoAllocation } from './demoAllocation'
import { buildLiveAllocation } from './liveAllocation'

export type AllocationStatus = 'demo' | 'loading' | 'live' | 'failed'

export interface FloorAllocation {
  /** `undefined` chừng nào dataset của tầng chưa nạp xong. */
  data: FloorAllocationData | undefined
  status: AllocationStatus
  /** Lý do phải lùi về dữ liệu minh họa, nếu có. */
  error: string | null
  /** Assignments that no longer match the current drawing, if checked. */
  reconcile: ReconcileReport | null
  reload: () => void
}

export function useFloorAllocation(
  dataset: FloorDataset | undefined,
  now: Date,
): FloorAllocation {
  const floorId = dataset?.layout.floor.id
  const session = useOptionalSession()
  const signedIn = Boolean(session?.employee)

  const demo = useMemo(() => (dataset ? createDemoAllocation(dataset, now) : undefined), [dataset, now])
  const [live, setLive] = useState<FloorAllocationData | null>(null)
  const [status, setStatus] = useState<AllocationStatus>('demo')
  const [error, setError] = useState<string | null>(null)
  const [reconcile, setReconcile] = useState<ReconcileReport | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!dataset || !floorId || !signedIn) {
      setLive(null)
      setStatus('demo')
      setError(null)
      setReconcile(null)
      return
    }

    let cancelled = false
    setStatus('loading')
    setReconcile(null)
    listAssignments(floorId)
      .then((assignments) => {
        if (cancelled) return
        setLive(buildLiveAllocation(dataset, assignments))
        setStatus('live')
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setLive(null)
        setStatus('failed')
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Không đọc được dữ liệu chỗ ngồi từ máy chủ.',
        )
      })
    reconcileFloor(floorId)
      .then((report) => {
        if (!cancelled) setReconcile(report)
      })
      .catch(() => {
        // Reconciliation is an advisory check. A permissions or network
        // failure here must not hide otherwise valid live assignments.
        if (!cancelled) setReconcile(null)
      })
    return () => {
      cancelled = true
    }
  }, [dataset, floorId, signedIn, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return { data: live ?? demo, status, error, reconcile, reload }
}
