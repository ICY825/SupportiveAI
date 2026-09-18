/**
 * DTO của backend, chép sang TypeScript.
 *
 * Nguồn: `backend/app/modules/document_flow/mail/schemas.py` và
 * `backend/app/shared/employee/schemas.py`. Sửa bên kia thì phải sửa ở đây —
 * chưa sinh tự động từ OpenAPI vì pilot chỉ có một phân hệ dùng tới.
 */

// --- Bậc khớp (mail-tracking.md §4.2) ---

export type MatchMethod =
  | 'phone'
  | 'alias'
  | 'name_exact'
  | 'name_fuzzy'
  | 'manual'
  | 'none';

/**
 * Mức chắc chắn — thứ quyết định dòng có gửi được không, KHÔNG phải
 * `match_method`. Cùng là `name_exact` nhưng ra một người thì `confirmed`,
 * ra nhiều người trùng tên thì `choose`.
 */
export type MatchTier = 'confirmed' | 'review' | 'choose';

export type MailStatus = 'pending_match' | 'notified' | 'collected' | 'abandoned';

export type HandoverMethod = 'self_qr_station' | 'self_link' | 'hc_reconciled';

// --- Nhân sự ---

export interface EmployeeBrief {
  id: string;
  employee_code: string;
  full_name: string;
  department_id: string | null;
}

export interface EmployeeRead extends EmployeeBrief {
  email: string | null;
  upn: string | null;
  email_source: string | null;
  phone: string | null;
  job_title: string | null;
  status: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  employee: EmployeeRead;
}

// --- Kiện ---

export interface MatchCandidate {
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_id: string | null;
  score: number;
  /** Số lần người này đã nhận hàng từ cùng người gửi (§4.3). */
  sender_history: number;
}

export interface DuplicateReference {
  item_id: string;
  batch_id: string;
  receipt_date: string | null;
  quantity: number;
  sent_at: string | null;
}

export interface MailItem {
  id: string;
  batch_id: string;
  row_index: number | null;
  sender_raw: string | null;
  recipient_name_raw: string | null;
  recipient_phone_raw: string | null;
  quantity: number;
  content_type: string | null;
  employee_id: string | null;
  match_method: MatchMethod;
  match_tier: MatchTier;
  match_confidence: number | null;
  review_confirmed: boolean;
  duplicate_suspect: boolean;
  status: MailStatus;
  received_at: string | null;
  notified_at: string | null;
  collected_at: string | null;
  handover_method: HandoverMethod | null;
  note: string | null;
}

export interface MailItemReview extends MailItem {
  needs_review: boolean;
  ready_to_send: boolean;
  missing_email: boolean;
  duplicate_of: DuplicateReference | null;
  candidates: MatchCandidate[];
}

export interface PendingMatchItem extends MailItem {
  batch_filename: string;
  waiting_days: number;
  /** Quá `MAIL_PENDING_MATCH_ALERT_DAYS` — đẩy lên đầu, nhưng KHÔNG tự
   *  chuyển sang `Tồn đọng` (§6.4). */
  overdue: boolean;
  candidates: MatchCandidate[];
}

// --- Lô ---

/**
 * Đếm cả **dòng** và **kiện**: lễ tân gộp nhiều kiện cùng nguồn trong cùng
 * ngày vào một dòng rồi ghi `số lượng`, nên hai con số này khác nhau (§5.2).
 */
export interface BatchSummary {
  total_rows: number;
  total_parcels: number;
  confirmed: number;
  review: number;
  choose: number;
  duplicate_suspect: number;
  pending_match: number;
  sent: number;
  missing_email: number;
  ambiguous_date: boolean;
}

export interface SameDateBatch {
  batch_id: string;
  source_filename: string;
  uploaded_at: string;
  row_count: number;
}

export interface MailBatch {
  id: string;
  source_filename: string;
  uploaded_by: string;
  uploaded_at: string;
  receipt_date: string | null;
  row_count: number;
  matched_count: number;
  sent_count: number;
  pending_match_count: number;
  duplicate_suspect_count: number;
  ambiguous_date: boolean;
  status: 'reviewing' | 'sent';
  sent_at: string | null;
}

export interface MailBatchDetail extends MailBatch {
  summary: BatchSummary;
  items: MailItemReview[];
  same_date_batches: SameDateBatch[];
}

export interface ImportResult {
  batch_id: string;
  row_count: number;
  matched_count: number;
  summary: BatchSummary;
  same_date_batches: SameDateBatch[];
  warnings: string[];
}

/** Con số của **đợt gửi vừa rồi**, không phải của cả lô (§6.4). */
export interface SendResult {
  batch_id: string;
  notified_items: number;
  pending_match: number;
  notifications_sent: number;
  failed: number;
}

// --- Khu để đơn ---

export interface StationItem {
  item_id: string;
  sender: string | null;
  content_type: string | null;
  quantity: number;
  recipient_name: string;
  received_at: string | null;
  status: MailStatus;
}

// --- Báo cáo ---

export interface WeeklyMatchRate {
  week: string;
  total: number;
  auto: number;
  rate: number;
}

export interface MailReports {
  by_status: Partial<Record<MailStatus, number>>;
  by_match_method: Partial<Record<MatchMethod, number>>;
  by_handover_method: Partial<Record<HandoverMethod, number>>;
  /** Phải đọc theo tuần: alias làm tỷ lệ tăng dần, trung bình cả kỳ sẽ
   *  làm hệ thống trông tệ hơn thực lực (§9.3). */
  auto_match_rate_by_week: WeeklyMatchRate[];
  hc_interventions: {
    total_interventions: number;
    machine_had_no_suggestion: number;
    alias_learned: number;
  };
}
