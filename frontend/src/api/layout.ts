/**
 * Đề 1 — bố trí bàn. Ranh giới với `app/modules/resource_allocation/layout`.
 *
 * Backend chỉ giữ *phần chênh* so với bản vẽ: bàn nào đã bị kéo đi đâu. Việc
 * tầng có những bàn nào vẫn do dataset quyết định, và frontend đọc thẳng
 * dataset đó.
 *
 * Ghi là **PATCH**: một lần lưu phủ một khu vực đang sửa, không phủ cả tầng.
 */

import { api } from '@/api/client';
import type { PlacementIssue } from '@/features/floor-planning/domain/placement'

/** Một vị trí đã lưu, theo đúng tên trường của backend. */
export interface PlacementPayload {
  entity_id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
  chair: Record<string, unknown> | null;
  seated_side: string | null;
  override_reason?: string | null;
  override_conflicts?: PlacementIssue[] | null;
}

export interface PlacementRead extends PlacementPayload {
  layout_version: string;
  updated_at: string;
  updated_by: string | null;
}

export interface FloorLayout {
  floor_id: string;
  /** Phiên bản bản vẽ hiện tại, không phải của từng bản ghi. */
  current_layout_version: string;
  placements: PlacementRead[];
  /** Số bản ghi đặt theo một bản vẽ khác bản vẽ hiện tại. */
  stale: number;
}

export interface StalePlacement {
  entity_id: string;
  /** `missing-entity` hoặc `old-layout`. */
  reason: string;
  saved_layout_version: string;
  current_layout_version: string;
}

export interface LayoutReconcileReport {
  floor_id: string;
  current_layout_version: string;
  checked: number;
  stale: StalePlacement[];
  overridden: Array<{
    entity_id: string;
    reason: string;
    actor_id: string | null;
    recorded_at: string;
    conflicts: PlacementIssue[];
  }>;
}

export function readFloorLayout(floorId: string) {
  return api.get<FloorLayout>(`/layouts/floors/${encodeURIComponent(floorId)}`);
}

/** Gộp một đợt vị trí vào tầng. Trả lại toàn bộ tầng sau khi ghi. */
export function saveFloorLayout(floorId: string, placements: PlacementPayload[]) {
  return api.patch<FloorLayout>(`/layouts/floors/${encodeURIComponent(floorId)}`, { placements });
}

export function reconcileFloorLayout(floorId: string) {
  return api.get<LayoutReconcileReport>(
    `/layouts/floors/${encodeURIComponent(floorId)}/reconcile`,
  );
}
