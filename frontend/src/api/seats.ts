/**
 * Đề 1 — chỗ ngồi. Ranh giới với `app/modules/resource_allocation/seat`.
 *
 * Backend chỉ trả lời **ai ngồi đâu**. Bàn, phòng, vật cản và tọa độ nằm
 * trong dataset mà frontend tự nạp (`data/README.md`), nên không có endpoint
 * nào ở đây trả về hình học.
 */

import { api } from '@/api/client';

/** Rút gọn của `EmployeeBrief` ở `seat/schemas.py`. */
export interface SeatEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  department_id: string | null;
}

export interface SeatAssignment {
  id: string;
  floor_id: string;
  /** `id` của workstation trong dataset, ví dụ `ws-16-001`. */
  workstation_id: string;
  layout_version: string;
  employee: SeatEmployee;
  assigned_at: string;
  released_at: string | null;
  assigned_by: string | null;
  /** accept | override | manual — mẫu số của KPI Tuần 6. */
  decision: string;
  note: string | null;
}

export interface FloorOccupancy {
  floor_id: string;
  layout_version: string;
  seats: number;
  occupied: number;
  free: number;
}

export interface StaleAssignment {
  assignment_id: string;
  floor_id: string;
  workstation_id: string;
  employee_code: string;
  reason: 'missing-seat' | 'old-layout';
  assigned_layout_version: string;
  current_layout_version: string;
}

export interface ReconcileReport {
  floor_id: string;
  current_layout_version: string;
  checked: number;
  stale: StaleAssignment[];
}

export type SeatDecision = 'accept' | 'override' | 'manual';

export interface AssignSeatRequest {
  floor_id: string;
  workstation_id: string;
  employee_id: string;
  decision?: SeatDecision;
  note?: string | null;
}

export function listAssignments(floorId: string) {
  return api.get<SeatAssignment[]>(`/seats/floors/${encodeURIComponent(floorId)}/assignments`);
}

export function floorOccupancy(floorId: string) {
  return api.get<FloorOccupancy>(`/seats/floors/${encodeURIComponent(floorId)}/occupancy`);
}

export function seatHistory(floorId: string, workstationId: string) {
  return api.get<SeatAssignment[]>(
    `/seats/floors/${encodeURIComponent(floorId)}/seats/${encodeURIComponent(workstationId)}/history`,
  );
}

export function assignSeat(payload: AssignSeatRequest) {
  return api.post<SeatAssignment>('/seats/assignments', payload);
}

export function releaseSeat(assignmentId: string, note?: string | null) {
  return api.post<SeatAssignment>(
    `/seats/assignments/${encodeURIComponent(assignmentId)}/release`,
    { note: note ?? null },
  );
}

export function moveSeat(assignmentId: string, payload: AssignSeatRequest) {
  return api.post<SeatAssignment>(
    `/seats/assignments/${encodeURIComponent(assignmentId)}/move`,
    payload,
  );
}

export function reconcileFloor(floorId: string) {
  return api.get<ReconcileReport>(`/seats/floors/${encodeURIComponent(floorId)}/reconcile`);
}
