// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { LockerManagementPage } from '../pages/LockerManagementPage'
import { MAP_LOCKERS } from '../lockersData'

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
})

afterEach(() => {
  cleanup()
})

describe('LockerManagementPage', () => {
  it('renders unified topbar, floor selector, and 3-mode segmented switcher without teammate banner', () => {
    render(<LockerManagementPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Quản lý tủ locker' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tầng 16' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Sơ đồ' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Chi tiết' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Danh sách' })).toBeTruthy()
    expect(screen.getByText(/18 ngăn tủ/)).toBeTruthy()

    // Ensure yellow teammate banner is completely erased
    expect(screen.queryByText(/Phân hệ đồng đội/)).toBeNull()
    expect(screen.queryByText(/Đề bài 2: Quản lý tủ locker/)).toBeNull()
  })

  it('renders map view with combined adjacent lockers and erased outside lockers, selecting L1-04 by default', () => {
    render(<LockerManagementPage />)

    // Check all MAP_LOCKERS exist
    for (const locker of MAP_LOCKERS) {
      const el = document.querySelector(`[data-locker-id="${locker.id}"]`)
      expect(el).toBeTruthy()
    }

    // Outside lockers (L4-02 and L3-08) should be erased
    expect(document.querySelector('[data-locker-id="L4-02"]')).toBeNull()
    expect(document.querySelector('[data-locker-id="L3-08"]')).toBeNull()

    // Default selected locker is L1-04
    expect(screen.getAllByText('Trần Minh Quân').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Khối Kỹ thuật (Đã thôi việc)').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Thu hồi tủ L1-04/)).toBeTruthy()
  })

  it('switches to Chi tiết view, displaying locker compartments grouped by zone with occupancy status', () => {
    render(<LockerManagementPage />)

    const detailTab = screen.getByRole('tab', { name: 'Chi tiết' })
    fireEvent.click(detailTab)

    // Zone headers
    expect(screen.getByText('KHU L1 · SẢNH THANG MÁY TÂY & BĐS')).toBeTruthy()
    expect(screen.getByText('KHU L2 · SẢNH TRUNG TÂM & LÕI KỸ THUẬT')).toBeTruthy()
    expect(screen.getByText('KHU L3 · KHỐI AI & CÔNG NGHỆ')).toBeTruthy()
    expect(screen.getByText('KHU L4 · PANTRY & ĐỔI MỚI SÁNG TẠO')).toBeTruthy()

    // Status legends
    expect(screen.getAllByText('Đang sử dụng').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Còn trống').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Cần thu hồi').length).toBeGreaterThanOrEqual(1)

    // Individual compartments rendered
    expect(screen.getAllByRole('button', { name: /L1-01/ }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /L1-02/ }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /L1-04/ }).length).toBeGreaterThanOrEqual(1)

    // Click L1-02 compartment to inspect
    const [l102Comp] = screen.getAllByRole('button', { name: /L1-02/ })
    fireEvent.click(l102Comp)

    expect(screen.getAllByText('Lê Thị Mai').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Ban Nhân sự Tập đoàn').length).toBeGreaterThanOrEqual(1)
  })

  it('switches to table list view and filters by search query', () => {
    render(<LockerManagementPage />)

    const listTab = screen.getByRole('tab', { name: 'Danh sách' })
    fireEvent.click(listTab)

    expect(screen.getByText('Mã tủ')).toBeTruthy()
    expect(screen.getAllByText('Vị trí vật lý').length).toBeGreaterThanOrEqual(1)

    // Search for "Minh Quân"
    const searchInput = screen.getByPlaceholderText(/Tìm mã tủ, nhân sự/i)
    fireEvent.change(searchInput, { target: { value: 'Minh Quân' } })

    expect(screen.getAllByText('L1-04').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Nguyễn Minh Anh')).toBeNull()
  })

  it('allows recalling a locker and updates its status', () => {
    render(<LockerManagementPage />)

    // L1-04 is selected, click "Thu hồi tủ"
    const recallBtn = screen.getByRole('button', { name: 'Thu hồi tủ' })
    fireEvent.click(recallBtn)

    // Status updates to available, toast shows
    expect(screen.getByText(/Đã thu hồi tủ L1-04 thành công/)).toBeTruthy()
  })
})
