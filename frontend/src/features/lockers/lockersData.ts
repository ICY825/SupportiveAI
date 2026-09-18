import type { LockerItem, LockerStats, LockerStatus } from './types'

/**
 * Lockers positioned from the Floor 19 locker-icons PDF mapped onto Floor 16,
 * with the 3 adjacent lockers combined into 1 cabinet unit, and outside markers erased.
 */
export const MAP_LOCKERS: LockerItem[] = [
  // --- KHU A: SẢNH THANG MÁY TÂY & KHỐI BẤT ĐỘNG SẢN ---
  {
    id: 'L1-01',
    code: 'L1-01',
    name: 'Tủ L1-01',
    zoneGroup: 'A',
    zoneGroupName: 'KHU A · SẢNH THANG MÁY TÂY',
    physicalLocation: 'Khu L1 · Sảnh thang máy Tây · Cột T1',
    center: [147.0, 475.2],
    bbox: [138.0, 466.2, 156.0, 484.2],
    size: [18.0, 18.0],
    status: 'in_use',
    employeeName: 'Nguyễn Văn An',
    department: 'Khối Phát triển Dự án',
    assignedDate: '10/01/2026',
    aiSuggestion: 'Đúng vị trí trục di chuyển sảnh Tây. Nhân sự sử dụng đều đặn.',
  },
  {
    id: 'L1-04',
    code: 'L1-04',
    name: 'Cụm tủ L1 (3 ngăn)',
    zoneGroup: 'A',
    zoneGroupName: 'KHU A · SẢNH THANG MÁY TÂY',
    physicalLocation: 'Khu L1 · Sảnh thang máy · Dãy BĐS Smart City',
    center: [169.0, 377.2],
    bbox: [148.0, 368.2, 190.0, 386.2],
    size: [40.0, 18.0],
    isCombined: true,
    orientation: 'horizontal',
    status: 'recall',
    employeeName: 'Trần Minh Quân',
    department: 'Khối Kỹ thuật (Đã thôi việc)',
    assignedDate: '12/03/2025',
    recallDueDate: 'Hôm nay (16/09/2026)',
    aiSuggestion: 'Thu hồi tủ L1-04 và ưu tiên tái cấp phát cho nhân sự mới nhóm AI dự kiến nhận việc 01/10 (cùng trục di chuyển).',
    compartments: [
      {
        id: 'L1-02',
        code: 'L1-02',
        status: 'in_use',
        employeeName: 'Lê Thị Mai',
        department: 'Ban Nhân sự Tập đoàn',
        assignedDate: '15/02/2026',
        aiSuggestion: 'Tủ gần khu vực làm việc của ban Nhân sự, thuận tiện di chuyển.',
      },
      {
        id: 'L1-03',
        code: 'L1-03',
        status: 'available',
        employeeName: null,
        department: null,
        assignedDate: null,
        aiSuggestion: 'Sẵn sàng cấp phát cho nhân sự mới khu vực phía Tây hoặc Ban BĐS.',
      },
      {
        id: 'L1-04',
        code: 'L1-04',
        status: 'recall',
        employeeName: 'Trần Minh Quân',
        department: 'Khối Kỹ thuật (Đã thôi việc)',
        assignedDate: '12/03/2025',
        recallDueDate: 'Hôm nay (16/09/2026)',
        aiSuggestion: 'Thu hồi tủ L1-04 và ưu tiên tái cấp phát cho nhân sự mới nhóm AI dự kiến nhận việc 01/10 (cùng trục di chuyển).',
      },
    ],
  },

  // --- KHU B: SẢNH THANG MÁY TRUNG TÂM & HÀNH LANG NAM ---
  {
    id: 'L2-01',
    code: 'L2-01',
    name: 'Cụm tủ L2 (3 ngăn)',
    zoneGroup: 'B',
    zoneGroupName: 'KHU B · SẢNH THANG MÁY TRUNG TÂM',
    physicalLocation: 'Khu L2 · Sảnh thang máy Trung tâm · Dãy Nam',
    center: [395.0, 466.6],
    bbox: [385.0, 446.6, 404.0, 486.6],
    size: [18.0, 38.0],
    isCombined: true,
    orientation: 'vertical',
    status: 'in_use',
    employeeName: 'Phạm Tuấn Khang',
    department: 'Ban Chiến lược & Đầu tư',
    assignedDate: '03/11/2025',
    compartments: [
      {
        id: 'L2-01',
        code: 'L2-01',
        status: 'in_use',
        employeeName: 'Phạm Tuấn Khang',
        department: 'Ban Chiến lược & Đầu tư',
        assignedDate: '03/11/2025',
      },
      {
        id: 'L2-02',
        code: 'L2-02',
        status: 'available',
        employeeName: null,
        department: null,
        assignedDate: null,
        aiSuggestion: 'Vị trí đắc địa gần sảnh thang máy chính, nên ưu tiên cho nhân sự thường xuyên tiếp khách.',
      },
      {
        id: 'L2-03',
        code: 'L2-03',
        status: 'in_use',
        employeeName: 'Vũ Hoàng Long',
        department: 'Khối Tài chính Kế toán',
        assignedDate: '20/09/2025',
      },
    ],
  },
  {
    id: 'L2-04',
    code: 'L2-04',
    name: 'Tủ L2-04',
    zoneGroup: 'B',
    zoneGroupName: 'KHU B · SẢNH THANG MÁY TRUNG TÂM',
    physicalLocation: 'Khu L2 · Cụm Kỹ thuật Lõi Trung tâm',
    center: [668.4, 348.9],
    bbox: [655.7, 336.1, 681.1, 361.6],
    size: [25.5, 25.5],
    status: 'broken',
    employeeName: null,
    department: null,
    assignedDate: null,
    notes: 'Kẹt khóa thông minh RFID, bộ phận IT đang xử lý linh kiện thay thế.',
    aiSuggestion: 'Đã tạo phiếu bảo trì thiết bị số #TK-8821 gửi bộ phận Vận hành Tòa nhà.',
  },
  {
    id: 'L2-05',
    code: 'L2-05',
    name: 'Tủ L2-05',
    zoneGroup: 'B',
    zoneGroupName: 'KHU B · SẢNH THANG MÁY TRUNG TÂM',
    physicalLocation: 'Khu L2 · Sảnh chuyển tiếp Lõi Trung tâm',
    center: [646.4, 367.9],
    bbox: [633.7, 355.1, 659.1, 380.6],
    size: [25.5, 25.5],
    status: 'in_use',
    employeeName: 'Đặng Thu Hà',
    department: 'Văn phòng Tổng Giám đốc',
    assignedDate: '14/01/2026',
  },
  {
    id: 'L2-06',
    code: 'L2-06',
    name: 'Tủ L2-06',
    zoneGroup: 'B',
    zoneGroupName: 'KHU B · SẢNH THANG MÁY TRUNG TÂM',
    physicalLocation: 'Khu L2 · Hành lang Đông · Vị trí 06',
    center: [666.4, 370.9],
    bbox: [653.7, 358.1, 679.1, 383.6],
    size: [25.5, 25.5],
    status: 'in_use',
    employeeName: 'Nguyễn Minh Anh',
    department: 'Ban Pháp chế',
    assignedDate: '08/01/2026',
  },

  // --- KHU LOUNGE: HÀNH LANG ĐÔNG & KHỐI AI & CÔNG NGHỆ ---
  {
    id: 'L3-01',
    code: 'L3-01',
    name: 'Tủ L3-01',
    zoneGroup: 'Lounge',
    zoneGroupName: 'KHU LOUNGE · HÀNH LANG ĐÔNG & KHỐI AI',
    physicalLocation: 'Khu L3 · Hành lang Phía Đông · Ô 01',
    center: [777.4, 549.6],
    bbox: [768.4, 540.6, 786.4, 558.6],
    size: [18.0, 18.0],
    status: 'in_use',
    employeeName: 'Hoàng Hải Nam',
    department: 'Khối Quản lý Vận hành',
    assignedDate: '02/12/2025',
  },
  {
    id: 'L3-02',
    code: 'L3-02',
    name: 'Tủ L3-02',
    zoneGroup: 'Lounge',
    zoneGroupName: 'KHU LOUNGE · HÀNH LANG ĐÔNG & KHỐI AI',
    physicalLocation: 'Khu L3 · Cụm Mô hình & Nền tảng AI · Dãy 1',
    center: [853.4, 376.6],
    bbox: [844.4, 367.6, 862.4, 385.6],
    size: [18.0, 18.0],
    status: 'in_use',
    employeeName: 'Trần Quốc Bảo',
    department: 'Mô hình & Nền tảng AI',
    assignedDate: '18/02/2026',
  },
  {
    id: 'L3-03',
    code: 'L3-03',
    name: 'Tủ L3-03',
    zoneGroup: 'Lounge',
    zoneGroupName: 'KHU LOUNGE · HÀNH LANG ĐÔNG & KHỐI AI',
    physicalLocation: 'Khu L3 · Cụm Mô hình & Nền tảng AI · Dãy 1',
    center: [851.4, 392.6],
    bbox: [842.4, 383.6, 860.4, 401.6],
    size: [18.0, 18.0],
    status: 'available',
    employeeName: null,
    department: null,
    assignedDate: null,
    aiSuggestion: 'Đề xuất gán cho nghiên cứu sinh AI mới gia nhập đợt tuyển dụng tháng 9.',
  },
  {
    id: 'L3-04',
    code: 'L3-04',
    name: 'Tủ L3-04',
    zoneGroup: 'Lounge',
    zoneGroupName: 'KHU LOUNGE · HÀNH LANG ĐÔNG & KHỐI AI',
    physicalLocation: 'Khu L3 · Cụm Mô hình & Nền tảng AI · Dãy 2',
    center: [945.4, 379.6],
    bbox: [936.4, 370.6, 954.4, 388.6],
    size: [18.0, 18.0],
    status: 'in_use',
    employeeName: 'Bùi Đức Thịnh',
    department: 'Mô hình & Nền tảng AI',
    assignedDate: '25/01/2026',
  },
  {
    id: 'L3-05',
    code: 'L3-05',
    name: 'Cụm tủ L3 (3 ngăn)',
    zoneGroup: 'Lounge',
    zoneGroupName: 'KHU LOUNGE · HÀNH LANG ĐÔNG & KHỐI AI',
    physicalLocation: 'Khu L3 · Trục Kỹ thuật AI · Dãy 3 ngăn',
    center: [980.4, 417.6],
    bbox: [971.4, 396.6, 989.4, 437.6],
    size: [18.0, 38.0],
    isCombined: true,
    orientation: 'vertical',
    status: 'in_use',
    employeeName: 'Đỗ Thu Trang',
    department: 'Mô hình & Nền tảng AI',
    assignedDate: '05/03/2026',
    compartments: [
      {
        id: 'L3-05',
        code: 'L3-05',
        status: 'in_use',
        employeeName: 'Đỗ Thu Trang',
        department: 'Mô hình & Nền tảng AI',
        assignedDate: '05/03/2026',
      },
      {
        id: 'L3-06',
        code: 'L3-06',
        status: 'in_use',
        employeeName: 'Ngô Văn Hùng',
        department: 'Mô hình & Nền tảng AI',
        assignedDate: '12/02/2026',
      },
      {
        id: 'L3-07',
        code: 'L3-07',
        status: 'in_use',
        employeeName: 'Lý Gia Huy',
        department: 'Mô hình & Nền tảng AI',
        assignedDate: '19/02/2026',
      },
    ],
  },

  // --- KHU OPEN SPACE: KHU VỰC PANTRY & ĐỔI MỚI SÁNG TẠO ---
  {
    id: 'L4-01',
    code: 'L4-01',
    name: 'Tủ L4-01',
    zoneGroup: 'Open Space',
    zoneGroupName: 'KHU OPEN SPACE · KHU VỰC PANTRY & ĐỔI MỚI',
    physicalLocation: 'Khu L4 · Hành lang Đổi mới & Sáng tạo',
    center: [980.4, 641.6],
    bbox: [971.4, 632.6, 989.4, 650.6],
    size: [18.0, 18.0],
    status: 'in_use',
    employeeName: 'Trịnh Thu Thảo',
    department: 'Ban Đổi mới & Sáng tạo',
    assignedDate: '15/01/2026',
  },
]

/**
 * All individual locker compartments across all zones (flattened for Chi tiết & Danh sách).
 * Total: 18 compartments (zero outside the map).
 */
export function getFlatLockerCompartments(mapLockers: LockerItem[] = MAP_LOCKERS): LockerItem[] {
  const result: LockerItem[] = []
  for (const item of mapLockers) {
    if (item.compartments && item.compartments.length > 0) {
      for (const comp of item.compartments) {
        result.push({
          ...item,
          id: comp.id,
          code: comp.code,
          name: `Tủ ${comp.code}`,
          status: comp.status,
          employeeName: comp.employeeName,
          employeeCode: comp.employeeCode,
          employeeEmail: comp.employeeEmail,
          jobTitle: comp.jobTitle,
          department: comp.department,
          assignedDate: comp.assignedDate,
          recallDueDate: comp.recallDueDate,
          aiSuggestion: comp.aiSuggestion,
          notes: comp.notes,
          isCombined: false,
          compartments: undefined,
        })
      }
    } else {
      result.push(item)
    }
  }
  return result
}

export const INITIAL_LOCKERS = MAP_LOCKERS

export const STATUS_META: Record<
  LockerStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  in_use: {
    label: 'Đang sử dụng',
    color: '#1c3d5a',
    bg: '#3d617f',
    border: '#2e4c66',
  },
  available: {
    label: 'Còn trống',
    color: '#57524b',
    bg: '#ffffff',
    border: '#c9c3ba',
  },
  recall: {
    label: 'Cần thu hồi',
    color: '#8a6f20',
    bg: '#fdf9ef',
    border: '#cdb479',
  },
  broken: {
    label: 'Hỏng',
    color: '#b3161d',
    bg: '#fcf1f1',
    border: '#b3161d',
  },
}

export function calculateLockerStats(items: LockerItem[]): LockerStats {
  const flat = getFlatLockerCompartments(items)
  return {
    total: flat.length,
    inUse: flat.filter((l) => l.status === 'in_use').length,
    available: flat.filter((l) => l.status === 'available').length,
    recall: flat.filter((l) => l.status === 'recall').length,
    broken: flat.filter((l) => l.status === 'broken').length,
  }
}
