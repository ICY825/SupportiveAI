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
})
