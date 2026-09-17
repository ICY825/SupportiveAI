/**
 * Vietnamese UI text for the floor verification view.
 *
 * One place for user-facing wording. Not an i18n framework: the app has one
 * language. Domain constants (SOURCE_VERIFIED, WORKSTATION, …) stay in code and
 * are translated here only for display.
 */
import type { FloorOccupancy } from './data/registry'
import type { PlacementIssue } from './domain/placement'
import type { BaseLayerId, Classification, VerificationState } from './domain/spatial'
import type { AssignmentType, DeviceType, Presence, SeatType } from './domain/allocation'
import type { AssignmentIssue } from './domain/assignment'
import type { DeskStatus } from './domain/desk'
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
    hint: 'Suy ra theo quy tắc từ hình học nguồn hoặc mẫu bố trí; cần Admin xác nhận.',
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

/** How much of a plate the company occupies; A is the upper wing, B the lower. */
export const FLOOR_OCCUPANCY: Record<FloorOccupancy, string> = {
  full: 'Toàn sàn',
  'zone-a': 'Khu A',
  'zone-b': 'Khu B',
}

/** Said on the floor picker for a floor the extractor has not produced yet. */
export const FLOOR_NO_DATASET = 'chưa có dữ liệu'

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

/* ------------------------------------------------------------------ workspace / desks */

export const VIEW_MODES = [
  { id: 'verification', label: 'Xác minh mặt bằng' },
  { id: 'workspace', label: 'Bố trí chỗ ngồi' },
] as const

/* ------------------------------------------------------------------ spatial (operational) view */

/**
 * The operational view currently covers one department area of floor 16 rather
 * than the whole floor. Wording says so plainly instead of calling itself a
 * preview: what it shows is real extracted geometry.
 */
export const SPATIAL_SCOPE_LABEL = 'Phạm vi hiện tại'
export const SPATIAL_SCOPE_BREADCRUMB = 'Khu vực làm việc'
export const SPATIAL_OUT_OF_SCOPE = 'Vị trí ngoài phạm vi hiện tại'
export const SPATIAL_OUT_OF_SCOPE_HINT = 'Chuyển sang bản vẽ để xem vị trí đang chọn.'
export const SPATIAL_UNAVAILABLE = 'Bố trí chỗ ngồi hiện chỉ có tại Tầng 16.'
export const SPATIAL_NO_EDIT_AREAS = 'Tầng này chưa có khu vực chỉnh sửa.'

export const DEMO_DATA_LABEL = 'Dữ liệu minh họa'
export const DEMO_DATA_HINT = 'Nhân sự, chỗ ngồi và thiết bị là dữ liệu giả lập để thiết kế giao diện; chưa kết nối HR/Admin.'

/**
 * `short` is for dense lists (the sidebar summary and key) where the full
 * wording would wrap. The full `label` stays on badges, tooltips and anywhere
 * the state is stated on its own.
 */
export const DESK_STATUS: Record<DeskStatus, { label: string; short: string; hint: string }> = {
  occupied: { label: 'Đang sử dụng', short: 'Đang sử dụng', hint: 'Có một nhân sự đang được gán vào chỗ ngồi này' },
  available: { label: 'Còn trống', short: 'Còn trống', hint: 'Chưa có nhân sự được gán; có thể gán ngay' },
  reserved: { label: 'Đã đặt trước', short: 'Đã đặt trước', hint: 'Đã có lịch đặt chỗ cho nhân sự' },
  conflict: { label: 'Xung đột phân công', short: 'Xung đột', hint: 'Nhiều hơn một phân công đang hiệu lực trên cùng một bàn' },
  unavailable: { label: 'Không khả dụng', short: 'Không khả dụng', hint: 'Chỗ ngồi đang tạm ngưng sử dụng' },
}

export const SEAT_TYPE: Record<SeatType, string> = {
  FIXED: 'Cố định',
  HOT_DESK: 'Linh hoạt (hot desk)',
  SHARED: 'Dùng chung',
  MANAGER: 'Quản lý',
  OTHER: 'Khác',
}

export const PRESENCE: Record<Presence, string> = {
  in_office: 'Đang ở văn phòng',
  remote: 'Làm việc từ xa',
  away: 'Vắng mặt',
  unknown: 'Chưa rõ trạng thái',
}

export const ASSIGNMENT_TYPE: Record<AssignmentType, string> = {
  permanent: 'Cố định',
  temporary: 'Tạm thời',
  reservation: 'Đặt trước',
}

export const DEVICE_TYPE: Record<DeviceType, string> = {
  laptop: 'Laptop',
  monitor: 'Màn hình',
  dock: 'Dock sạc',
  other: 'Thiết bị khác',
}

/** Wording for the employee-to-seat assignment flow. */
export const SEAT_ASSIGNMENT = {
  pickerTitle: 'Chọn nhân sự',
  searchPlaceholder: 'Tìm theo tên hoặc mã nhân viên…',
  currentSeat: (code: string) => `Đang ở ${code}`,
  noResults: 'Không tìm thấy nhân sự phù hợp',
  unseated: 'Chưa được gán chỗ',
  edit: 'Chỉnh sửa',
  assign: 'Gán nhân sự',
  reassign: 'Đổi chỗ',
  release: 'Giải phóng chỗ ngồi',
  undo: 'Hoàn tác',
  assigned: (name: string) => `Đã gán ${name}`,
  released: 'Đã giải phóng chỗ ngồi',
} as const

export const ASSIGNMENT_ISSUE = {
  seatUnavailable: 'Chỗ ngồi không khả dụng',
  seatOccupied: 'Chỗ ngồi đã có nhân sự',
  employeeSeatedElsewhere: (seatCode: string) => `Nhân sự đang được gán tại ${seatCode}`,
  unknownEmployee: 'Không tìm thấy hồ sơ nhân sự',
  unknownSeat: 'Không tìm thấy chỗ ngồi',
} as const

export function assignmentIssueText(issue: AssignmentIssue): string {
  switch (issue.type) {
    case 'seat-unavailable': return ASSIGNMENT_ISSUE.seatUnavailable
    case 'seat-occupied': return ASSIGNMENT_ISSUE.seatOccupied
    case 'employee-seated-elsewhere': return ASSIGNMENT_ISSUE.employeeSeatedElsewhere(issue.seatCode)
    case 'unknown-employee': return ASSIGNMENT_ISSUE.unknownEmployee
    case 'unknown-seat': return ASSIGNMENT_ISSUE.unknownSeat
  }
}

/* --------------------------------------------- layout editor (spatial view) */

/**
 * Wording for the layout editor. The product is an administrative tool, so the
 * task names the control ("chỉnh sửa bố trí"), never the borrowed interaction
 * model.
 *
 * Editing is entered as an ACTION, not chosen as a peer view: the top bar's
 * view switch is the only segmented control on the page, so nothing competes
 * with it for the same meaning.
 */
export const LAYOUT_EDIT = {
  enter: 'Chỉnh sửa bố trí',
  enterHint: 'Di chuyển và xoay bàn làm việc trên mặt bằng',
  selectedTitle: 'Bàn đang chọn',
  position: 'Vị trí',
  rotation: 'Góc xoay',
  placementStatus: 'Trạng thái bố trí',
  valid: 'Vị trí hợp lệ',
  rotate: 'Xoay 90°',
  undo: 'Hoàn tác',
  redo: 'Làm lại',
  reset: 'Về vị trí gốc',
  save: 'Lưu bố trí',
  cancel: 'Hủy',
  saving: 'Đang lưu…',
  noSelection: 'Chọn một bàn trên mặt bằng để di chuyển hoặc xoay.',
  chooseArea: 'Chọn khu vực trước khi chỉnh sửa bố trí.',
  hint: 'Kéo bàn để di chuyển · Phím mũi tên để dịch từng ô · R để xoay · Esc để bỏ chọn',
  gridNote: 'Lưới bám theo vị trí gốc của bàn đang chọn, nên luôn đưa được bàn về đúng chỗ cũ.',
  changed: (n: number) => `${n} bàn đã đổi`,
  noChange: 'Chưa có thay đổi',
  invalidSummary: (n: number) => `${n} bàn chưa hợp lệ`,
  gridLabel: (mm: number) => `Lưới ${mm} mm`,
  /** Said plainly: a committed layout does not survive a reload yet. */
  persistenceNote: 'Bố trí đã lưu chỉ tồn tại trong phiên làm việc này; chưa kết nối máy chủ.',
  boundaryNote:
    'Phạm vi bố trí lấy theo ranh giới khu vực được đánh dấu trên bản vẽ nguồn, không phải ranh giới tường thực tế.',
  dirtyTitle: 'Bố trí hiện tại có thay đổi chưa được lưu.',
  dirtyBody: 'Nếu rời khỏi chế độ chỉnh sửa, các thay đổi sẽ bị bỏ.',
  dirtyStay: 'Tiếp tục chỉnh sửa',
  dirtyDiscard: 'Hủy thay đổi',
} as const

/** Placement problems, phrased for the person moving the desk. */
export const PLACEMENT_ISSUE = {
  overlap: (code: string, target?: 'desk' | 'chair') =>
    target === 'chair' ? `Không gian ghế chồng lấn bàn ${code}` : `Chồng lấn bàn ${code}`,
  outsideBoundary: 'Ngoài phạm vi bố trí',
  outsideRoomBoundary: (roomName?: string, target?: 'desk' | 'chair') => {
    const base = roomName ? `Ngoài ranh giới phòng ${roomName}` : 'Ngoài ranh giới phòng'
    return target === 'chair' ? `Không gian ghế ${base.toLowerCase()}` : base
  },
  outsideDepartmentZone: (zoneName?: string, target?: 'desk' | 'chair') => {
    const base = zoneName ? `Ngoài phạm vi khu vực ${zoneName}` : 'Ngoài phạm vi khu vực'
    return target === 'chair' ? `Không gian ghế ${base.toLowerCase()}` : base
  },
  obstacleCollision: (obstacleName?: string, obstacleKind?: 'column' | 'wall', target?: 'desk' | 'chair') => {
    const kindText = obstacleKind === 'column' ? 'cột kết cấu' : 'tường bê tông'
    const nameText = obstacleName ? ` (${obstacleName})` : ` ${kindText}`
    return target === 'chair' ? `Không gian ghế va chạm${nameText}` : `Va chạm${nameText}`
  },
  clearanceConflict: (obstacleName?: string, target?: 'desk' | 'chair') => {
    const nameText = obstacleName ? ` (${obstacleName})` : ''
    return target === 'chair'
      ? `Không gian ghế xung đột khoảng mở cửa${nameText}`
      : `Xung đột khoảng mở cửa${nameText}`
  },
} as const

/** Geometry reports issues as data; the wording is chosen here. */
export function placementIssueText(issue: PlacementIssue, codeOf: (entityId: string) => string): string {
  switch (issue.type) {
    case 'overlap':
      return PLACEMENT_ISSUE.overlap(codeOf(issue.entityId), issue.target)
    case 'outside-boundary':
      return issue.target === 'chair' ? 'Không gian ghế ngoài phạm vi bố trí' : PLACEMENT_ISSUE.outsideBoundary
    case 'outside-room-boundary':
      return PLACEMENT_ISSUE.outsideRoomBoundary(issue.roomName, issue.target)
    case 'outside-department-zone':
      return PLACEMENT_ISSUE.outsideDepartmentZone(issue.zoneName, issue.target)
    case 'obstacle-collision':
      return PLACEMENT_ISSUE.obstacleCollision(issue.obstacleName, issue.obstacleKind, issue.target)
    case 'clearance-conflict':
      return PLACEMENT_ISSUE.clearanceConflict(issue.obstacleName, issue.target)
  }
}
