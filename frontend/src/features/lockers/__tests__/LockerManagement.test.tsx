// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LockerManagementPage } from '../pages/LockerManagementPage'
import { LockerDetailGrid } from '../components/LockerDetailGrid'
import { LockerInspector } from '../components/LockerInspector'

const mockLocations = [
  {
    id: 1,
    site: 'Bắc',
    building: 'Technopark',
    floor: '16',
    name: 'Technopark Tầng 16',
    code: 'TP-16',
  },
]

const mockLockers = [
  {
    id: 'L1-04',
    code: 'L1-04',
    name: 'Tủ L1-04',
    zone: 'L1',
    zone_group: 'KHU L1 · SẢNH THANG MÁY TÂY & BĐS',
    physical_location: 'Tầng 16 · Khu L1',
    status: 'recall',
    employee_name: 'Trần Minh Quân',
    department: 'Khối Kỹ thuật (Đã thôi việc)',
    center: [200, 200],
    size: [28, 28],
    is_combined: true,
    compartments: [
      {
        id: 'L1-01',
        code: 'L1-01',
        status: 'in_use',
        employee_name: 'Lê Thị Mai',
        department: 'Ban Nhân sự Tập đoàn',
      },
      {
        id: 'L1-02',
        code: 'L1-02',
        status: 'available',
        employee_name: 'Lê Thị Mai',
        department: 'Ban Nhân sự Tập đoàn',
      },
      {
        id: 'L1-03',
        code: 'L1-03',
        status: 'available',
        employee_name: null,
        department: null,
      },
      {
        id: 'L1-04',
        code: 'L1-04',
        status: 'recall',
        employee_name: 'Trần Minh Quân',
        department: 'Khối Kỹ thuật (Đã thôi việc)',
      },
    ],
  },
]

function createMockFetch() {
  return vi.fn(async (input: RequestInfo | URL | string, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : typeof (input as any)?.url === 'string'
            ? (input as any).url
            : String(input)

    if (url.includes('/locker-locations')) {
      return {
        ok: true,
        status: 200,
        json: async () => mockLocations,
        text: async () => JSON.stringify(mockLocations),
      } as Response
    }

    if (url.includes('/lockers')) {
      if (init?.method === 'POST') {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body || {}
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'created-locker', code: 'LK-NEW', ...body }),
          text: async () => JSON.stringify({ id: 'created-locker', code: 'LK-NEW', ...body }),
        } as Response
      }
      if (init?.method === 'DELETE') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: 'Deleted successfully' }),
          text: async () => JSON.stringify({ message: 'Deleted successfully' }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockLockers,
        text: async () => JSON.stringify(mockLockers),
      } as Response
    }

    return {
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '[]',
    } as Response
  })
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
    }
    observe() {
      this.cb([{ contentRect: { width: 1200, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('fetch', createMockFetch())
})

beforeEach(() => {
  vi.stubGlobal('fetch', createMockFetch())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LockerManagementPage', () => {
  it('renders unified topbar, floor selector, and 3-mode segmented switcher without teammate banner', async () => {
    render(<LockerManagementPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Quản lý tủ locker' })).toBeTruthy()
    expect(await screen.findByRole('tab', { name: 'Tầng 16' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Sơ đồ' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Chi tiết' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Danh sách' })).toBeTruthy()
    expect(await screen.findByText(/4 ngăn tủ/)).toBeTruthy()

    // Ensure yellow teammate banner is completely erased
    expect(screen.queryByText(/Phân hệ đồng đội/)).toBeNull()
    expect(screen.queryByText(/Đề bài 2: Quản lý tủ locker/)).toBeNull()
  })

  it('renders map view with combined adjacent lockers and erased outside lockers, selecting L1-04 by default', async () => {
    render(<LockerManagementPage />)

    const el = await waitFor(() => {
      const lockerEl = document.querySelector('[data-locker-id="L1-04"]')
      expect(lockerEl).toBeTruthy()
      return lockerEl!
    })

    // Outside lockers (L4-02 and L3-08) should be erased
    expect(document.querySelector('[data-locker-id="L4-02"]')).toBeNull()
    expect(document.querySelector('[data-locker-id="L3-08"]')).toBeNull()

    // Select L1-04 if not already selected
    if (!screen.queryByText('Trần Minh Quân')) {
      fireEvent.click(el)
    }

    expect((await screen.findAllByText('Trần Minh Quân')).length).toBeGreaterThanOrEqual(1)
    expect((await screen.findAllByText('Khối Kỹ thuật (Đã thôi việc)')).length).toBeGreaterThanOrEqual(1)
    expect(await screen.findByText(/Thu hồi tủ L1-04/)).toBeTruthy()
  })

  it('switches to Chi tiết view, displaying locker compartments grouped by zone with occupancy status', async () => {
    render(<LockerManagementPage />)

    await screen.findByText(/4 ngăn tủ/)

    const detailTab = screen.getByRole('tab', { name: 'Chi tiết' })
    fireEvent.click(detailTab)

    // Await UI tải xong rồi assert chỉ có 1 '.locker-detail-zone-card' cho tủ này và có badge '4 ngăn'
    await waitFor(() => {
      const cards = document.querySelectorAll('.locker-detail-zone-card')
      expect(cards.length).toBe(1)
    })

    const zoneCards = document.querySelectorAll('.locker-detail-zone-card')
    expect(zoneCards.length).toBe(1)
    expect(screen.getByText('4 ngăn')).toBeTruthy()
    expect(zoneCards[0].textContent).toContain('4 ngăn')

    // Status legends
    expect(screen.getAllByText('Đang sử dụng').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Còn trống').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Cần thu hồi').length).toBeGreaterThanOrEqual(1)

    // Individual compartments rendered
    expect(screen.getAllByRole('button', { name: /L1-01/ }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /L1-02/ }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /L1-04/ }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('01')).toBeTruthy()
    expect(screen.getByText('02')).toBeTruthy()
    expect(screen.getByText('04')).toBeTruthy()

    // Click L1-02 compartment to inspect
    const [l102Comp] = screen.getAllByRole('button', { name: /L1-02/ })
    fireEvent.click(l102Comp)

    expect((await screen.findAllByText('Lê Thị Mai')).length).toBeGreaterThanOrEqual(1)
    expect((await screen.findAllByText('Ban Nhân sự Tập đoàn')).length).toBeGreaterThanOrEqual(1)
  })

  it('switches to table list view and filters by search query', async () => {
    render(<LockerManagementPage />)

    await screen.findByText(/4 ngăn tủ/)

    const listTab = screen.getByRole('tab', { name: 'Danh sách' })
    fireEvent.click(listTab)

    expect(await screen.findByText('Mã tủ')).toBeTruthy()
    expect((await screen.findAllByText('Vị trí vật lý')).length).toBeGreaterThanOrEqual(1)

    // Search for "Minh Quân"
    const searchInput = screen.getByPlaceholderText(/Tìm mã tủ, nhân sự/i)
    fireEvent.change(searchInput, { target: { value: 'Minh Quân' } })

    expect((await screen.findAllByText('L1-04')).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Nguyễn Minh Anh')).toBeNull()
  })

  it('allows recalling a locker and updates its status', async () => {
    render(<LockerManagementPage />)

    const lockerEl = await waitFor(() => {
      const el = document.querySelector('[data-locker-id="L1-04"]')
      expect(el).toBeTruthy()
      return el!
    })

    if (!screen.queryByRole('button', { name: 'Thu hồi tủ' })) {
      fireEvent.click(lockerEl)
    }

    // L1-04 is selected, click "Thu hồi tủ"
    const recallBtn = await screen.findByRole('button', { name: 'Thu hồi tủ' })
    fireEvent.click(recallBtn)

    // Status updates to available, toast shows
    expect(await screen.findByText(/Đã thu hồi tủ L1-04 thành công/)).toBeTruthy()
  })

  it('renders collapsible Chú giải status legend in the right sidebar near the footer, without floating map legend', async () => {
    render(<LockerManagementPage />)

    const lockerEl = await waitFor(() => {
      const el = document.querySelector('[data-locker-id="L1-04"]')
      expect(el).toBeTruthy()
      return el!
    })

    // Ensure floating legend is NOT present on map canvas
    expect(document.querySelector('.locker-map-legend')).toBeNull()

    // Select locker if not already selected to open inspector with close button
    if (!screen.queryByRole('button', { name: 'Đóng bảng thông tin' })) {
      fireEvent.click(lockerEl)
    }

    // Sidebar has collapsible Chú giải section
    const legendHeading = await screen.findByRole('heading', { level: 3, name: 'Chú giải' })
    expect(legendHeading).toBeTruthy()

    // Legend items are present in sidebar
    expect((await screen.findAllByText(/Đang dùng/)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Còn trống/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Cần thu hồi/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Hỏng/).length).toBeGreaterThanOrEqual(1)

    // Close the inspector to view floor overview panel
    const closeBtn = screen.getByRole('button', { name: 'Đóng bảng thông tin' })
    fireEvent.click(closeBtn)

    // Overview panel renders identical to FloorDetailsPanel
    expect(await screen.findByRole('complementary', { name: 'Tổng quan tủ locker' })).toBeTruthy()
    expect(screen.getByText('Tòa nhà: Technopark · Tầng 16')).toBeTruthy()
    expect(screen.getByText('Tổng số ngăn')).toBeTruthy()

    // Legend is also present in overview panel near footer
    expect(screen.getByRole('heading', { level: 3, name: 'Chú giải' })).toBeTruthy()
  })

  it('when clicking on an available compartment, shows assignment and mark broken forms, preserves config, and hides legend, compartment list, and usage status', async () => {
    render(<LockerManagementPage />)

    // Switch to Chi tiết mode to click the L1-03 available compartment card
    const detailTab = screen.getByRole('tab', { name: 'Chi tiết' })
    fireEvent.click(detailTab)

    const comp3Btn = await screen.findByRole('button', { name: /L1-03/ })
    fireEvent.click(comp3Btn)

    // Verify Inspector opens for L1-03
    expect(await screen.findByRole('complementary', { name: 'Chi tiết tủ L1-03' })).toBeTruthy()

    // 1. Legend is hidden for available compartment
    expect(screen.queryByRole('heading', { level: 3, name: 'Chú giải' })).toBeNull()

    // 2. Compartment list is hidden
    expect(screen.queryByText(/Danh sách ngăn trong cụm/)).toBeNull()

    // 3. Static usage status is hidden
    expect(screen.queryByText('Tình trạng sử dụng')).toBeNull()

    // 4. Location & config is preserved
    expect(screen.getByText('Thông tin vị trí & cấu hình')).toBeTruthy()
    expect(screen.getByText('Loại khóa')).toBeTruthy()

    // 5. Assignment form is visible by default with all new employee fields
    expect(screen.getByText('Thông tin nhân sự cấp phát')).toBeTruthy()
    const nameInput = screen.getByLabelText(/Tên nhân sự/) as HTMLInputElement
    const codeInput = screen.getByLabelText(/Mã nhân viên/) as HTMLInputElement
    const titleInput = screen.getByLabelText(/Chức danh/) as HTMLInputElement
    const deptInput = screen.getByLabelText(/Phòng ban/) as HTMLInputElement
    const emailInput = screen.getByLabelText(/Email/) as HTMLInputElement
    const dateInput = screen.getByLabelText(/Ngày cấp phát/) as HTMLInputElement

    fireEvent.change(nameInput, { target: { value: 'Phạm Hồng Anh' } })
    fireEvent.change(codeInput, { target: { value: 'NV-10824' } })
    fireEvent.change(titleInput, { target: { value: 'Kỹ sư Trưởng AI' } })
    fireEvent.change(deptInput, { target: { value: 'Trung tâm Nghiên cứu AI' } })
    fireEvent.change(emailInput, { target: { value: 'honganh@vinai.io' } })
    fireEvent.change(dateInput, { target: { value: '2026-09-17' } })

    // 6. Switch to broken tab and back to verify state resilience
    const brokenTabBtn = screen.getByRole('button', { name: 'Đánh dấu là hỏng' })
    fireEvent.click(brokenTabBtn)
    expect(screen.getByText('Mô tả hư hỏng')).toBeTruthy()
    expect(screen.getByLabelText(/Hỏng gì/)).toBeTruthy()

    // Switch back to assignment and submit
    const assignTabBtn = screen.getByRole('button', { name: 'Cấp phát nhân sự' })
    fireEvent.click(assignTabBtn)
    const submitAssignBtn = screen.getByRole('button', { name: '+ Cấp phát ngăn này' })
    fireEvent.click(submitAssignBtn)

    // Toast appears with assigned name
    expect(await screen.findByText(/Đã cấp phát ngăn L1-03 cho nhân sự Phạm Hồng Anh/)).toBeTruthy()

    // Inspector now shows assigned employee details: code, title, email, date
    expect(screen.getByText('Nhân sự sử dụng')).toBeTruthy()
    expect(screen.getByText('NV-10824')).toBeTruthy()
    expect(screen.getAllByText(/Kỹ sư Trưởng AI/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('honganh@vinai.io')).toBeTruthy()
    expect(screen.getAllByText('17/09/2026').length).toBeGreaterThanOrEqual(1)

    // Test marking broken on another available compartment (L1-02)
    const comp2Btn = await screen.findByRole('button', { name: /L1-02/ })
    fireEvent.click(comp2Btn)

    const brokenTabBtn2 = screen.getByRole('button', { name: 'Đánh dấu là hỏng' })
    fireEvent.click(brokenTabBtn2)

    const brokenReasonInput = screen.getByLabelText(/Hỏng gì/) as HTMLInputElement
    fireEvent.change(brokenReasonInput, { target: { value: 'Kẹt ổ khóa thông minh' } })

    const confirmBrokenBtn = screen.getByRole('button', { name: 'Xác nhận báo hỏng' })
    fireEvent.click(confirmBrokenBtn)

    expect(await screen.findByText(/Đã ghi nhận báo hỏng ngăn L1-02: "Kẹt ổ khóa thông minh"/)).toBeTruthy()
  })

  it('displays only the last segment of locker compartment code (BT16-01-21 displays as 21) in Chi tiết view', () => {
    const mockLockerWithStandardCode = {
      id: 'BT16-01',
      code: 'BT16-01',
      name: 'Tủ BT16-01',
      zone: 'BT16',
      status: 'in_use' as const,
      compartments: [
        {
          id: 'BT16-01-21',
          code: 'BT16-01-21',
          status: 'in_use' as const,
          employeeName: 'Nguyễn Văn A',
        },
        {
          id: 'BT16-01-02',
          code: 'BT16-01-02',
          status: 'available' as const,
        },
      ],
    }

    render(
      <LockerDetailGrid
        lockers={[mockLockerWithStandardCode as any]}
        selectedLocker={null}
        onSelectLocker={vi.fn()}
      />
    )

    // Kiểm chứng mã đầy đủ BT16-01-21 được hiển thị thành 21, BT16-01-02 thành 02
    expect(screen.getByText('21')).toBeTruthy()
    expect(screen.getByText('02')).toBeTruthy()
    expect(screen.queryByText('BT16-01-21')).toBeNull()

    // Giữ nguyên mã đầy đủ trong thuộc tính data hoặc metadata để tìm kiếm sau này
    const comp21Btn = screen.getByRole('button', { name: /BT16-01-21/ })
    expect(comp21Btn.getAttribute('data-locker-code')).toBe('BT16-01-21')
    expect(comp21Btn.getAttribute('data-full-code')).toBe('BT16-01-21')
    const comp21CodeEl = screen.getByText('21')
    expect(comp21CodeEl.getAttribute('data-full-code')).toBe('BT16-01-21')
  })

  it('calls onOpenLockerOnMap callback with parent locker when clicking locker header button with accessible name "Mở tủ BT16-01 trên sơ đồ"', () => {
    const handleOpenLockerOnMap = vi.fn()
    const parentLocker = {
      id: 'BT16-01',
      code: 'BT16-01',
      name: 'Tủ BT16-01',
      zone: 'BT16',
      status: 'in_use' as const,
      compartments: [
        {
          id: 'BT16-01-21',
          code: 'BT16-01-21',
          status: 'in_use' as const,
          employeeName: 'Nguyễn Văn A',
        },
        {
          id: 'BT16-01-02',
          code: 'BT16-01-02',
          status: 'available' as const,
        },
      ],
    }

    render(
      <LockerDetailGrid
        lockers={[parentLocker as any]}
        selectedLocker={null}
        onSelectLocker={vi.fn()}
        onOpenLockerOnMap={handleOpenLockerOnMap}
      />
    )

    const mapButton = screen.getByRole('button', { name: 'Mở tủ BT16-01 trên sơ đồ' })
    fireEvent.click(mapButton)

    expect(handleOpenLockerOnMap).toHaveBeenCalledTimes(1)
    expect(handleOpenLockerOnMap).toHaveBeenCalledWith(parentLocker)
  })

  it('prefills edit form and calls onUpdateLocker with trimmed payload when editing in-use locker compartment with employee and notes', () => {
    const handleUpdateLocker = vi.fn()
    const handleRecallLocker = vi.fn()
    const handleAssignLocker = vi.fn()
    const handleRemindLocker = vi.fn()
    const handleClose = vi.fn()

    const mockInUseLocker = {
      id: 'L1-01',
      code: 'L1-01',
      name: 'Tủ L1-01',
      status: 'in_use' as const,
      employeeName: 'Nguyễn Văn A',
      notes: 'Ghi chú ban đầu',
    }

    render(
      <LockerInspector
        locker={mockInUseLocker as any}
        onRecallLocker={handleRecallLocker}
        onAssignLocker={handleAssignLocker}
        onRemindLocker={handleRemindLocker}
        onClose={handleClose}
        onUpdateLocker={handleUpdateLocker}
      />,
    )

    const editButton = screen.getByRole('button', { name: 'Chỉnh sửa' })
    fireEvent.click(editButton)

    const nameInput = screen.getByLabelText(/Tên nhân sự/) as HTMLInputElement
    const notesTextarea = screen.getByLabelText(/Ghi chú/) as HTMLTextAreaElement

    expect(nameInput.value).toBe('Nguyễn Văn A')
    expect(notesTextarea.value).toBe('Ghi chú ban đầu')

    fireEvent.change(nameInput, { target: { value: '  Trần Thị B  ' } })
    fireEvent.change(notesTextarea, { target: { value: '  Ghi chú đã cập nhật  ' } })

    const saveButton = screen.getByRole('button', { name: 'Lưu thay đổi' })
    fireEvent.click(saveButton)

    expect(handleUpdateLocker).toHaveBeenCalledTimes(1)
    expect(handleUpdateLocker).toHaveBeenCalledWith(
      'L1-01',
      expect.objectContaining({
        employeeName: 'Trần Thị B',
        notes: 'Ghi chú đã cập nhật',
      }),
    )
    const [calledLockerId, calledPayload] = handleUpdateLocker.mock.calls[0]
    expect(calledLockerId).toBe('L1-01')
    expect(calledPayload.employeeName).toBe('Trần Thị B')
    expect(calledPayload.notes).toBe('Ghi chú đã cập nhật')
  })
})
