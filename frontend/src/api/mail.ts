import { api } from '@/api/client';
import type {
  ImportResult,
  MailBatch,
  MailBatchDetail,
  MailItem,
  MailReports,
  PendingMatchItem,
  SendResult,
  StationItem,
} from '@/api/types';

// --- Lô và màn hình soát ---

/** Tải file lễ tân (`.xlsx` khuyến nghị, `.csv` cũng nhận) — §3.1. */
export function uploadBatch(file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.post<ImportResult>('/mail/batches/upload', form);
}

export function listBatches() {
  return api.get<MailBatch[]>('/mail/batches');
}

export function getBatch(batchId: string) {
  return api.get<MailBatchDetail>(`/mail/batches/${batchId}`);
}

/** Xóa lô tải nhầm. Backend trả 409 nếu lô đã gửi thông báo cho dòng nào. */
export function deleteBatch(batchId: string) {
  return api.delete<void>(`/mail/batches/${batchId}`);
}

/**
 * HC chọn hoặc sửa người nhận.
 *
 * `applyToBatch` mặc định bật (§4.4): mười dòng của cùng một người thì HC
 * chỉ phải chọn một lần. Tắt khi hai người khác nhau viết trùng tên.
 */
export function assignRecipient(
  itemId: string,
  employeeId: string | null,
  options: { applyToBatch?: boolean; note?: string } = {},
) {
  return api.patch<MailItem>(`/mail/items/${itemId}`, {
    employee_id: employeeId,
    apply_to_batch: options.applyToBatch ?? true,
    note: options.note ?? null,
  });
}

/** Xác nhận nhanh dòng ở mức `review` (§5.2). */
export function confirmReview(itemId: string, confirmed = true) {
  return api.post<MailItem>(`/mail/items/${itemId}/confirm`, { confirmed });
}

/** Giữ lại (hoặc bỏ lại) một dòng bị nghi trùng (§3.3). */
export function keepDuplicate(itemId: string, keep = true) {
  return api.post<MailItem>(`/mail/items/${itemId}/keep-duplicate`, { keep });
}

/** Gọi lại được nhiều lần — mỗi lần gửi phần đã sẵn sàng (§6.4). */
export function sendBatch(batchId: string) {
  return api.post<SendResult>(`/mail/batches/${batchId}/send`);
}

// --- Màn hình "Chờ khớp" xuyên lô (§6.4) ---

export function listPendingMatch() {
  return api.get<PendingMatchItem[]>('/mail/items/pending-match');
}

/** Gửi ngay một dòng vừa gán người nhận. SLA tính từ đây. */
export function sendItem(itemId: string) {
  return api.post<MailItem>(`/mail/items/${itemId}/send`);
}

// --- Màn hình kiện hàng và báo cáo ---

export function listItems(params: { status?: string[]; departmentId?: string } = {}) {
  const query = new URLSearchParams();
  for (const status of params.status ?? []) query.append('status', status);
  if (params.departmentId) query.set('department_id', params.departmentId);
  const suffix = query.toString();
  return api.get<MailItem[]>(`/mail/items${suffix ? `?${suffix}` : ''}`);
}

/** HC đối chiếu tờ ký giấy và tick những kiện chưa ai bấm (§7.3). */
export function hcCollect(itemId: string) {
  return api.post<MailItem>(`/mail/items/${itemId}/collect`, {
    handover_method: 'hc_reconciled',
  });
}

export function getReports() {
  return api.get<MailReports>('/mail/reports');
}

// --- Khu để đơn (công khai, không đăng nhập) ---

export function stationLookup(phoneLast4: string, stationToken: string | null) {
  return api.post<StationItem[]>(
    '/mail/station/lookup',
    { phone_last4: phoneLast4 },
    { anonymous: true, stationToken },
  );
}

export function stationCollect(itemId: string, stationToken: string | null) {
  return api.post<MailItem>(`/mail/station/collect/${itemId}`, undefined, {
    anonymous: true,
    stationToken,
  });
}
