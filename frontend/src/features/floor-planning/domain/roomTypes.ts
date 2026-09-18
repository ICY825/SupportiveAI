import type { Room } from './spatial'

export type RoomType = 'MEETING' | 'PANTRY' | 'LOUNGE' | 'OFFICE' | 'PHONE_BOOTH' | 'SERVICE' | 'OTHER'

export const ROOM_TYPES: readonly { value: RoomType; label: string }[] = [
  { value: 'MEETING', label: 'Phòng họp' },
  { value: 'PANTRY', label: 'Pantry' },
  { value: 'LOUNGE', label: 'Khu thư giãn' },
  { value: 'OFFICE', label: 'Văn phòng' },
  { value: 'PHONE_BOOTH', label: 'Buồng điện thoại' },
  { value: 'SERVICE', label: 'Phòng dịch vụ' },
  { value: 'OTHER', label: 'Khác' },
]

export const ROOM_TYPE_LABEL: Record<RoomType, string> = Object.fromEntries(ROOM_TYPES.map((type) => [type.value, type.label])) as Record<RoomType, string>

/** Maps source labels to the domain meaning without inferring an occupant. */
export function roomTypeFromSourceLabel(label: string | null | undefined): RoomType {
  if (!label) return 'OTHER'
  if (/CBLĐ|quản lý|lãnh đạo|manager|office/i.test(label)) return 'OFFICE'
  if (/pantry|tea|bếp/i.test(label)) return 'PANTRY'
  if (/lounge|thư giãn/i.test(label)) return 'LOUNGE'
  if (/họp|meeting/i.test(label)) return 'MEETING'
  if (/phone|call|điện thoại/i.test(label)) return 'PHONE_BOOTH'
  if (/dịch vụ|service/i.test(label)) return 'SERVICE'
  return 'OTHER'
}

/** Keeps extracted data honest when older JSON still says `ROOM`. */
export function normalizeRoomType(value: unknown, sourceLabel?: string | null): RoomType {
  if (typeof value === 'string' && ROOM_TYPES.some((type) => type.value === value)) return value as RoomType
  return roomTypeFromSourceLabel(sourceLabel)
}

export function roomTypeLabel(room: Pick<Room, 'type'>): string {
  return ROOM_TYPE_LABEL[room.type]
}
