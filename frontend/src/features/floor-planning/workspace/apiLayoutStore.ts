/**
 * `LayoutStore` gọi backend thật.
 *
 * Một chỗ vênh phải xử lý ở đây: `LayoutStore.read()` là **đồng bộ** — nó
 * chạy trong `useState` khởi tạo của `useLayoutEditor`, tức là trước khi có
 * bất kỳ request nào kịp trả về. Vì vậy store này được *nạp sẵn* bằng ảnh
 * chụp tầng mà `useFloorLayout` đã đọc xong, và `read()` chỉ đọc lại ảnh đó.
 * Không phải bộ nhớ đệm để tiết kiệm request; nó là cách duy nhất để một API
 * bất đồng bộ trả lời được một giao diện đồng bộ mà không đoán.
 *
 * `write()` là PATCH: một lần lưu phủ một khu vực đang sửa, không phủ cả
 * tầng. Backend gộp, và trả lại toàn bộ tầng — ảnh chụp được thay bằng thứ
 * server vừa xác nhận chứ không phải thứ frontend vừa gửi đi.
 */

import { saveFloorLayout, type FloorLayout, type PlacementPayload, type PlacementRead } from '@/api/layout'
import type { SpatialPlacement } from '../domain/placement'
import type { LayoutStore } from './layoutDraft'

export interface ApiLayoutStoreOptions {
  floorId: string
  /** Ảnh chụp tầng đã đọc xong, dùng làm câu trả lời cho `read()`. */
  snapshot: FloorLayout
  /** Gọi sau khi ghi xong, kèm ảnh chụp mới server vừa xác nhận. */
  onCommitted?: (layout: FloorLayout) => void
  /** Gọi khi backend từ chối; màn hình dùng để báo và giữ nguyên bản nháp. */
  onError?: (error: unknown) => void
}

export function createApiLayoutStore({
  floorId,
  snapshot,
  onCommitted,
  onError,
}: ApiLayoutStoreOptions): LayoutStore {
  let current = toPlacements(snapshot)

  return {
    read: (id) => (id === floorId ? current : null),

    write: async (id, placements) => {
      const payload = Object.values(placements).map(toPayload)
      if (payload.length === 0) return
      try {
        const saved = await saveFloorLayout(id, payload)
        current = toPlacements(saved)
        onCommitted?.(saved)
      } catch (error) {
        onError?.(error)
        throw error
      }
    },
  }
}

/** Ảnh chụp của backend → thứ `mergeStoredPlacements` biết đọc. */
export function toPlacements(layout: FloorLayout): Record<string, SpatialPlacement> {
  const result: Record<string, SpatialPlacement> = {}
  for (const row of layout.placements) {
    result[row.entity_id] = toPlacement(row)
  }
  return result
}

function toPlacement(row: PlacementRead): SpatialPlacement {
  return {
    entityId: row.entity_id,
    x: row.x,
    y: row.y,
    width: row.width,
    depth: row.depth,
    rotation: row.rotation,
    chair: (row.chair as SpatialPlacement['chair']) ?? null,
    ...(row.seated_side ? { seatedSide: row.seated_side as SpatialPlacement['seatedSide'] } : {}),
  }
}

function toPayload(placement: SpatialPlacement): PlacementPayload {
  return {
    entity_id: placement.entityId,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    depth: placement.depth,
    rotation: placement.rotation,
    chair: (placement.chair as Record<string, unknown> | null | undefined) ?? null,
    seated_side: placement.seatedSide ?? null,
  }
}
