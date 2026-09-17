// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { App } from '../App'

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
  localStorage.clear()
  window.location.hash = ''
})

describe('app shell', () => {
  it('keeps map settings hidden until the sidebar settings button opens them', async () => {
    localStorage.setItem('vsf.nav.collapsed', '0')
    render(<App />)
    await screen.findByRole('application', {}, { timeout: 15000 })
    expect(screen.queryByText('Đối chiếu bản vẽ')).toBeNull()
    expect(screen.queryByText('Pilot')).toBeNull()

    const user = userEvent.setup()
    const toggle = screen.getByRole('button', { name: 'Cài đặt bản đồ' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await user.click(toggle)
    expect(screen.getByRole('complementary', { name: 'Cài đặt bản đồ' })).toBeTruthy()
    expect(screen.getByText('Đối chiếu bản vẽ')).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'Đóng cài đặt bản đồ' }))
    expect(screen.queryByText('Đối chiếu bản vẽ')).toBeNull()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  }, 30000)

  /**
   * The panel holds CAD layer toggles and the source-drawing modes, which exist
   * to check the extraction against the sheet. The seating view has no use for
   * them, and the card it used to show there only repeated the "?" shortcuts and
   * the "Vừa khung" button already in its toolbar.
   */
  it('offers map settings on the verification view and not on the seating view', async () => {
    localStorage.setItem('vsf.nav.collapsed', '0')
    render(<App />)
    await screen.findByRole('application', {}, { timeout: 15000 })
    expect(screen.getByRole('button', { name: 'Cài đặt bản đồ' })).toBeTruthy()

    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Bố trí chỗ ngồi' }))
    await screen.findByRole('button', { name: /Chỉnh sửa bố trí/ }, { timeout: 15000 })

    expect(screen.queryByRole('button', { name: 'Cài đặt bản đồ' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Cài đặt bản đồ' })).toBeNull()
    // the card the seating view used to carry, and what it duplicated
    expect(screen.queryByText('Góc nhìn không gian')).toBeNull()
    expect(screen.getAllByRole('button', { name: /Vừa khung/ }).length).toBe(1)

    await user.click(screen.getByRole('radio', { name: 'Xác minh mặt bằng' }))
    expect(await screen.findByRole('button', { name: 'Cài đặt bản đồ' }, { timeout: 15000 })).toBeTruthy()
  }, 45000)

  it('navigates to lockers module when hash is #/lockers', async () => {
    localStorage.setItem('vsf.nav.collapsed', '0')
    window.location.hash = '#/lockers'
    render(<App />)

    expect(await screen.findByText('Quản lý tủ locker')).toBeTruthy()
    expect(screen.getByText(/18 ngăn tủ/)).toBeTruthy()
    const activeNavItem = screen.getByRole('link', { name: /Tủ locker/ })
    expect(activeNavItem.classList.contains('is-active')).toBe(true)
  })
})
