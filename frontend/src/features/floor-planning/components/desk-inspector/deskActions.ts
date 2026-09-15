import type { DeskStatus } from '../../domain/desk'
import type { MenuItem } from './OverflowMenu'

export type DeskAction =
  | 'view-profile'
  | 'edit-seat'
  | 'reassign'
  | 'assign-employee'
  | 'view-reservation'
  | 'change-reservation'
  | 'cancel-reservation'
  | 'resolve-conflict'
  | 'reopen-seat'
  | 'mark-unavailable'
  | 'release-seat'
  | 'view-history'
  | 'view-audit-log'
  | 'delete-desk'

export const DESK_ACTION_LABEL: Record<DeskAction, string> = {
  'view-profile': 'Xem hồ sơ',
  'edit-seat': 'Sửa chỗ ngồi',
  reassign: 'Đổi chỗ',
  'assign-employee': 'Gán nhân sự',
  'view-reservation': 'Xem đặt chỗ',
  'change-reservation': 'Đổi đặt chỗ',
  'cancel-reservation': 'Hủy đặt chỗ',
  'resolve-conflict': 'Xử lý xung đột',
  'reopen-seat': 'Mở lại chỗ ngồi',
  'mark-unavailable': 'Đánh dấu không khả dụng',
  'release-seat': 'Giải phóng chỗ ngồi',
  'view-history': 'Xem lịch sử phân công',
  'view-audit-log': 'Xem nhật ký thay đổi',
  'delete-desk': 'Xóa bàn',
}

/** Primary actions per status: [main, ...secondary]. Destructive actions never appear here. */
export const PRIMARY_ACTIONS: Record<DeskStatus, DeskAction[]> = {
  occupied: ['view-profile', 'edit-seat', 'reassign'],
  available: ['assign-employee', 'edit-seat'],
  reserved: ['view-reservation', 'change-reservation', 'cancel-reservation'],
  conflict: ['resolve-conflict', 'view-history'],
  unavailable: ['reopen-seat', 'edit-seat'],
}

export function overflowItems(status: DeskStatus): MenuItem<DeskAction>[] {
  const items: MenuItem<DeskAction>[] = []
  if (status !== 'unavailable') items.push({ id: 'mark-unavailable', label: DESK_ACTION_LABEL['mark-unavailable'] })
  if (status === 'occupied' || status === 'conflict' || status === 'reserved') {
    items.push({ id: 'release-seat', label: DESK_ACTION_LABEL['release-seat'] })
  }
  if (!PRIMARY_ACTIONS[status].includes('view-history')) {
    items.push({ id: 'view-history', label: DESK_ACTION_LABEL['view-history'], separated: items.length > 0 })
  }
  items.push({ id: 'view-audit-log', label: DESK_ACTION_LABEL['view-audit-log'] })
  items.push({ id: 'delete-desk', label: DESK_ACTION_LABEL['delete-desk'], danger: true, separated: true })
  return items
}

