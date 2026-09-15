/**
 * Vietnamese UI text for the floor verification view.
 *
 * One place for user-facing wording. Not an i18n framework: the app has one
 * language. Domain constants (SOURCE_VERIFIED, WORKSTATION, …) stay in code and
 * are translated here only for display.
 */
import type { BaseLayerId, Classification, VerificationState } from './domain/spatial'
import type { SourceMode } from './map/mapSettings'

/** Extraction verification state. This is NOT an occupancy/operational state. */
export const VERIFICATION: Record<VerificationState, { label: string; short: string; glyph: string; hint: string }> = {
  SOURCE_VERIFIED: {
    label: 'Đã xác minh từ nguồn',
    short: 'Từ nguồn',
    glyph: '✓',
    hint: 'Lấy trực tiếp từ bản vẽ nguồn (có chú thích hoặc nhãn trên bản vẽ).',
  },
  EXTRACTED: {
    label: 'Tự động trích xuất',
    short: 'Tự động',
    glyph: '≈',
    hint: 'Suy ra từ hình học vector theo quy tắc; cần Admin xác nhận.',
  },
  UNVERIFIED: {
    label: 'Chờ xác minh',
    short: 'Chờ xác minh',
    glyph: '!',
    hint: 'Chỉ trích xuất được một phần (ví dụ có nhãn nhưng chưa nhận diện được đường viền).',
  },
  UNKNOWN: {
    label: 'Chưa xác định',
    short: 'Chưa xác định',
    glyph: '?',
    hint: 'Bản vẽ nguồn không đủ thông tin để xác định.',
  },
}

export const VERIFICATION_ORDER: VerificationState[] = ['SOURCE_VERIFIED', 'EXTRACTED', 'UNVERIFIED', 'UNKNOWN']

export const CLASSIFICATION: Record<Classification, string> = {
  WORKSTATION: 'Vị trí làm việc',
  FURNITURE: 'Nội thất',
  FACILITY: 'Tiện ích / thiết bị',
  STRUCTURAL: 'Kết cấu',
  UNKNOWN: 'Chưa xác định',
}

export const SOURCE_MODES: { id: SourceMode; label: string; hint: string }[] = [
  { id: 'digital', label: 'Bản đồ số', hint: 'Chỉ hiển thị hình học đã trích xuất' },
  { id: 'overlay', label: 'Chồng lớp', hint: 'Bản vẽ gốc phủ lên bản đồ số để so khớp' },
  { id: 'source', label: 'Bản vẽ gốc', hint: 'Chỉ hiển thị ảnh bản vẽ nguồn, giữ đường viền đối tượng' },
]

export const BASE_LAYER_LABELS: Record<BaseLayerId, string> = {
  facade: 'Mặt dựng & kính',
  structure: 'Cột & lõi công trình',
  core: 'Cầu thang & giếng kỹ thuật',
  walls: 'Tường',
  partitions: 'Vách ngăn',
  doors: 'Cửa',
  fixtures: 'Thiết bị & ký hiệu',
  furniture: 'Nội thất',
  grid: 'Lưới kết cấu',
  dimensions: 'Kích thước',
}

export const UNLABELED_ZONE = 'Khu vực chưa có nhãn'

/** Display names by object kind; the raw CAD text stays visible as source text. */
const OBJECT_KIND: Record<string, string> = {
  printer: 'Máy in',
  network_rack: 'Tủ rack mạng',
  electrical_panel: 'Tủ điện',
  hvac: 'Điều hòa âm trần VRV',
  cable_tray: 'Máng cáp',
  unknown_2400x400: 'Vật thể chưa xác định (2400x400)',
}

export const objectName = (o: { kind: string; name: string }) => OBJECT_KIND[o.kind] ?? o.name

/**
 * Generated notes/rules are written in English by the extractor. Known strings
 * are shown in Vietnamese; anything new falls back to the original text.
 */
const GENERATED_TEXT: Record<string, string> = {
  'Figure in parentheses on the source label; its meaning (headcount, planned seats, other) is not stated.':
    'Bản vẽ không giải thích con số trong ngoặc trên nhãn (có thể là định biên, số chỗ dự kiến hoặc ý nghĩa khác).',
  'Highlighted on the source drawing without a label; purpose UNKNOWN.':
    'Được tô màu trên bản vẽ nguồn nhưng không có nhãn; chưa rõ mục đích.',
  'Source label names an occupant. Occupant NOT imported: assignment data is out of scope and must come from HR/Admin.':
    'Nhãn nguồn có ghi tên người sử dụng. Thông tin này không được nhập: dữ liệu bố trí nhân sự phải do HR/Admin cung cấp.',
  'Cluster lies outside every source zone.': 'Cụm bàn nằm ngoài mọi khu vực trên bản vẽ nguồn.',
  'Only a dimension label is present; object type UNKNOWN.': 'Chỉ có nhãn kích thước; chưa xác định được loại vật thể.',
  "'1200x600' desk outline with dimension label; exactly one chair symbol on a long edge, not shared with another desk":
    'Đường viền bàn 1200x600 có nhãn kích thước, kèm đúng một ký hiệu ghế ở cạnh dài và không dùng chung với bàn khác.',
  'highlight annotation rectangle': 'Khung chữ nhật của chú thích tô sáng',
  'polygon annotation vertices': 'Các đỉnh của chú thích đa giác',
  'CAD label bounding box only (object outline not identified)':
    'Chỉ có khung bao của nhãn CAD (chưa nhận diện được đường viền vật thể)',
  'smallest closed shape enclosing the CAD label': 'Hình kín nhỏ nhất bao quanh nhãn CAD',
  Highlight: 'Tô sáng',
  Polygon: 'Đa giác',
}

export const generated = (text: string | undefined | null) => (text ? (GENERATED_TEXT[text] ?? text) : text)

export const NO_OPERATIONAL_DATA = 'Chưa có dữ liệu chỗ ngồi hoặc nhân sự'
export const NO_OPERATIONAL_DATA_HINT = 'Dữ liệu nhân sự sẽ được hiển thị sau khi được Admin/HR xác minh.'
export const NOT_AVAILABLE = 'Chưa có dữ liệu'
