// @vitest-environment jsdom

/**
 * Chắn đăng nhập, kiểm cả hai chiều.
 *
 * Bản Next diễn đạt việc này bằng route group: trang nằm trong `(admin)` là có
 * chắn, nằm ngoài là không. Chuyển sang react-router thì phải tự bọc, và bọc
 * sai thì hỏng theo hai chiều ngược nhau — cả hai đều không lộ ra khi bấm thử
 * lúc đang đăng nhập:
 *
 * 1. `/mail/*` mở toang cho người chưa đăng nhập;
 * 2. `/station` hay `/confirm` đòi đăng nhập, trong khi người quét QR tại khu
 *    để đơn hoặc bấm link trong email không có tài khoản (mail-tracking.md §7.2).
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_KEY } from '../../api/client'
import { App } from '../App'

const me = vi.fn()
const listBatches = vi.fn()
const confirmLinkLookup = vi.fn()

vi.mock('../../api/auth', () => ({
  me: () => me(),
  login: vi.fn(),
}))

vi.mock('../../api/mail', () => ({
  listBatches: () => listBatches(),
  listItems: vi.fn(),
  listPendingMatch: vi.fn(),
  getReport: vi.fn(),
  stationLookup: vi.fn(),
  stationCollect: vi.fn(),
  confirmLinkLookup: (token: string) => confirmLinkLookup(token),
  confirmLinkCollect: vi.fn(),
  getStationSign: vi.fn(() => new Promise(() => {})),
}))

beforeAll(() => {
  // The floor plan measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver = class {
    cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
    }
    observe() {
      this.cb(
        [{ contentRect: { width: 1200, height: 800 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
    unobserve() {}
    disconnect() {}
  }
})

function signIn() {
  localStorage.setItem(TOKEN_KEY, 'a-token')
  me.mockResolvedValue({
    id: 'emp-1',
    employee_code: 'VSF001',
    full_name: 'Trần Thu Hà',
    email: null,
    phone: null,
    department_id: null,
    job_title: null,
    status: 'active',
  })
}

beforeEach(() => {
  me.mockReset()
  listBatches.mockReset()
  listBatches.mockResolvedValue([])
  confirmLinkLookup.mockReset()
  confirmLinkLookup.mockResolvedValue({ recipient_name: 'Trần Thu Hà', items: [] })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.location.hash = ''
})

describe('route guard', () => {
  it('sends an anonymous visitor from a mail screen to the sign-in page', async () => {
    window.location.hash = '#/mail/batches'
    render(<App />)

    expect(await screen.findByLabelText('Mã nhân viên')).toBeTruthy()
    expect(window.location.hash).toBe('#/login')
    expect(me).not.toHaveBeenCalled()
  })

  it('opens the parcel-bench screen with no session and no sign-in prompt', async () => {
    window.location.hash = '#/station?t=station-token'
    render(<App />)

    expect(await screen.findByText('Xác nhận đã nhận hàng')).toBeTruthy()
    expect(screen.queryByLabelText('Mã nhân viên')).toBeNull()
    expect(window.location.hash).toBe('#/station?t=station-token')
  })

  it('opens the email confirm link with no session and no sign-in prompt', async () => {
    window.location.hash = '#/confirm?token=link-token'
    render(<App />)

    expect(await screen.findByText('Kiện hàng của', { exact: false })).toBeTruthy()
    expect(screen.queryByLabelText('Mã nhân viên')).toBeNull()
    expect(confirmLinkLookup).toHaveBeenCalledWith('link-token')
    expect(window.location.hash).toBe('#/confirm?token=link-token')
  })

  it('sends an anonymous visitor from the QR sign screen to the sign-in page', async () => {
    // Ai cầm URL trên biển là gọi được API xác nhận của khu để đơn, nên màn
    // hình in biển chỉ dành cho HC.
    window.location.hash = '#/mail/station-sign'
    render(<App />)

    expect(await screen.findByLabelText('Mã nhân viên')).toBeTruthy()
    expect(window.location.hash).toBe('#/login')
  })

  it('lets a signed-in employee through to the mail screens', async () => {
    signIn()
    window.location.hash = '#/mail/batches'
    render(<App />)

    expect(await screen.findByRole('navigation', { name: 'Màn hình Đề 3' })).toBeTruthy()
    expect(window.location.hash).toBe('#/mail/batches')
  })

  it('sends an anonymous visitor from the floor plan to the sign-in page too', async () => {
    // Chắn bao cả bốn phân hệ, không riêng Đề 3: phân hệ nào cũng đọc dữ liệu
    // nhân sự.
    window.location.hash = '#/floor-planning'
    render(<App />)

    expect(await screen.findByLabelText('Mã nhân viên')).toBeTruthy()
    expect(window.location.hash).toBe('#/login')
  })

  it('sends an anonymous visitor from the lockers to the sign-in page too', async () => {
    window.location.hash = '#/lockers'
    render(<App />)

    expect(await screen.findByLabelText('Mã nhân viên')).toBeTruthy()
    expect(window.location.hash).toBe('#/login')
  })

  it('shows the floor plan, not a mail screen, once signed in', async () => {
    signIn()
    render(<App />)

    expect(await screen.findByRole('application', {}, { timeout: 15000 })).toBeTruthy()
    // The floor plan appends its own deep-link query (`?floor=…&view=…`) to the
    // same hash the router reads, and the two coexist.
    expect(window.location.hash.startsWith('#/floor-planning')).toBe(true)
  }, 30000)
})
