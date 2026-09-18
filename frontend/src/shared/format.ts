/** Định dạng hiển thị. Quy ước Việt Nam: ngày trước, tháng sau. */

const DASH = '—';

/**
 * File lễ tân chỉ ghi ngày, không ghi giờ — in giờ ra là giả chính xác
 * (mail-tracking.md §6.2). Dùng cho `received_at`.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Cho mốc do hệ thống sinh ra (`uploaded_at`, `notified_at`) — có giờ thật. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** "3 ngày" / "hôm nay" cho cột số ngày đã chờ. */
export function formatWaiting(days: number): string {
  if (days <= 0) return 'hôm nay';
  return `${days} ngày`;
}

/**
 * Đếm dòng và kiện là hai con số khác nhau — lễ tân gộp nhiều kiện cùng
 * nguồn vào một dòng rồi ghi `số lượng` (§5.2). Hàm này để chỗ nào hiển
 * thị cũng nói rõ đang đếm cái gì.
 */
export function rowsAndParcels(rows: number, parcels: number): string {
  return `${rows} dòng · ${parcels} kiện`;
}
