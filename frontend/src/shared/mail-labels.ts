/**
 * Nhãn tiếng Việt và ký hiệu cho các tập giá trị của phân hệ.
 *
 * ⚠️ **Mỗi mức phải có ký hiệu riêng, không chỉ có màu riêng.**
 * mail-tracking.md §5.2 yêu cầu như vậy để người khó phân biệt màu vẫn
 * dùng được màn hình soát. Thêm một giá trị mới thì phải đặt cả `symbol`.
 */

import type { HandoverMethod, MailStatus, MatchMethod, MatchTier } from '@/api/types';

/**
 * Bảy tông, ánh xạ sang bảng 5 màu trạng thái vận hành của wireframe mới
 * (artboard 0a) — dùng chung cho cả bốn đề bài:
 *
 * | Tông       | Màu wireframe        | Nghĩa               |
 * |------------|----------------------|---------------------|
 * | `critical` | Đỏ VSF đặc           | Vượt hạn, xử lý ngay |
 * | `danger`   | Đỏ viền              | Chưa xử lý           |
 * | `warn`     | Vàng đồng `#9A701E`  | Chờ duyệt            |
 * | `info`     | Xanh lam `#3D617F`   | Đang diễn ra         |
 * | `success`  | Xanh lục `#297A60`   | Sẵn sàng / xong      |
 * | `neutral`  | Xám viền             | Bình thường          |
 * | `done`     | Xám nhạt             | Kết thúc, hết việc   |
 */
export type Tone = 'critical' | 'danger' | 'warn' | 'info' | 'success' | 'neutral' | 'done';

export interface Descriptor {
  label: string;
  symbol: string;
  tone: Tone;
  hint?: string;
}

export const TIER: Record<MatchTier, Descriptor> = {
  confirmed: {
    label: 'Khớp chắc',
    symbol: '✓',
    // Xanh lục = sẵn sàng. Dòng này đi được ngay trong đợt gửi tới.
    tone: 'success',
    hint: 'Điền sẵn, gửi được ngay',
  },
  review: {
    label: 'Cần soát',
    symbol: '!',
    // Vàng đồng = chờ duyệt. Máy đã đề xuất, còn chờ người gật.
    tone: 'warn',
    hint: 'Khớp gần đúng — phải bấm xác nhận mới gửi',
  },
  choose: {
    label: 'Phải chọn',
    symbol: '?',
    tone: 'danger',
    hint: 'Chưa xác định được người nhận',
  },
};

export const STATUS: Record<MailStatus, Descriptor> = {
  pending_match: { label: 'Chờ khớp', symbol: '?', tone: 'danger' },
  // Xanh lam = đang diễn ra: đã báo, đang chờ người xuống lấy.
  notified: { label: 'Đã thông báo', symbol: '→', tone: 'info' },
  collected: { label: 'Đã nhận', symbol: '✓', tone: 'success' },
  // Đỏ đặc — đây là thứ duy nhất trong phân hệ đã vượt hạn và cần HC xử
  // lý. Không dùng tông này cho bất kỳ trạng thái nào khác.
  abandoned: { label: 'Tồn đọng', symbol: '!', tone: 'critical' },
};

export const MATCH_METHOD: Record<MatchMethod, string> = {
  phone: 'Số điện thoại',
  alias: 'Đã học từ lần trước',
  name_exact: 'Tên khớp chính xác',
  name_fuzzy: 'Tên gần đúng',
  manual: 'HC chọn tay',
  none: 'Không khớp được',
};

export const HANDOVER: Record<HandoverMethod, string> = {
  self_qr_station: 'Quét QR tại khu để đơn',
  self_link: 'Bấm link trong email',
  hc_reconciled: 'HC đối chiếu tờ ký',
};

export const DUPLICATE: Descriptor = {
  label: 'Nghi trùng',
  symbol: '⧉',
  tone: 'danger',
  hint: 'Trùng với một dòng đã gửi — mặc định không gửi lại',
};
