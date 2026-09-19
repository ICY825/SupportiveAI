/**
 * Nơi cất vị trí bàn của một tầng: server nếu có phiên đăng nhập, bộ nhớ của
 * trang nếu không.
 *
 * Cùng lối nghĩ với `useFloorAllocation`: hình học đi kèm bản build nên sơ đồ
 * vẽ được mà không cần API, chỉ phần *đã có ai kéo bàn đi đâu chưa* mới phải
 * hỏi server. Khi không có phiên, hoặc server từ chối, màn hình vẫn sửa được
 * nhưng **nói rõ là sửa xong reload sẽ mất** — nhãn ở `labels.ts`. Im lặng
 * lùi về bộ nhớ trang thì người dùng tưởng đã lưu.
 *
 * Vì sao phải đợi đọc xong trước khi dựng `SpatialWorkspace`:
 * `LayoutStore.read()` là đồng bộ, chạy ngay trong `useState` khởi tạo của
 * `useLayoutEditor`. Ảnh chụp tới muộn một nhịp thì trình sửa đã khởi tạo
 * bằng vị trí gốc của bản vẽ và không đọc lại nữa. Request này nhỏ, còn
 * dataset thì 2,9 MB — trên thực tế nó xong trước.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/api/client'
import { readFloorLayout, type FloorLayout } from '@/api/layout'
import { useOptionalSession } from '@/shared/auth'
import { sessionLayoutStore, type LayoutStore } from './layoutDraft'
import { createApiLayoutStore } from './apiLayoutStore'

export type LayoutStorageStatus = 'session' | 'loading' | 'server' | 'failed'

export interface FloorLayoutStorage {
  /** Store để đưa cho `SpatialWorkspace`. Luôn có, kể cả khi không có phiên. */
  store: LayoutStore
  status: LayoutStorageStatus
  /** Lý do phải lùi về bộ nhớ của trang, nếu có. */
  error: string | null
  /** `true` khi đã biết chắc nên dùng store nào — chưa xong thì đừng dựng trình sửa. */
  ready: boolean
  /** Số bản ghi trên server đặt theo một bản vẽ khác bản vẽ hiện tại. */
  stale: number
}

export function useFloorLayout(floorId: string | undefined): FloorLayoutStorage {
  const session = useOptionalSession()
  /**
   * Không có provider nghĩa là màn hình chạy ngoài phần đăng nhập — đó là một
   * câu trả lời, không phải một câu hỏi còn treo. Còn khi có provider thì phải
   * đợi nó xác minh xong: `employee` ban đầu là null rồi mới được điền từ bản
   * lưu, và nếu coi nhịp đầu là "chưa đăng nhập" thì trình sửa dựng lên bằng
   * store của trang rồi bị tháo ra dựng lại ngay sau đó.
   */
  const sessionResolved = session === null || session.ready
  const signedIn = Boolean(session?.employee)

  const [snapshot, setSnapshot] = useState<FloorLayout | null>(null)
  const [status, setStatus] = useState<LayoutStorageStatus>(sessionResolved ? 'session' : 'loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionResolved) {
      setStatus('loading')
      return
    }
    if (!floorId || !signedIn) {
      setSnapshot(null)
      setStatus('session')
      setError(null)
      return
    }
    let cancelled = false
    setStatus('loading')
    setError(null)
    readFloorLayout(floorId)
      .then((layout) => {
        if (cancelled) return
        setSnapshot(layout)
        setStatus('server')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setSnapshot(null)
        setStatus('failed')
        setError(err instanceof ApiError ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [floorId, signedIn, sessionResolved])

  const onCommitted = useCallback((layout: FloorLayout) => setSnapshot(layout), [])

  const store = useMemo(() => {
    if (!floorId || !snapshot) return sessionLayoutStore
    return createApiLayoutStore({ floorId, snapshot, onCommitted })
  }, [floorId, snapshot, onCommitted])

  return {
    store,
    status,
    error,
    ready: status !== 'loading',
    stale: snapshot?.stale ?? 0,
  }
}
