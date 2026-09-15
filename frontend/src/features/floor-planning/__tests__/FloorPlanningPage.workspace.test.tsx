// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { FloorPlanningPage } from '../pages/FloorPlanningPage'

beforeAll(() => {
  // jsdom has no layout engine
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
  window.location.hash = ''
})

// the AI zone's first desks carry the demo showcase states
const OCCUPIED = 'ws-16-065'
const AVAILABLE = 'ws-16-066'

const deskPolygon = (id: string) => document.querySelector<SVGPolygonElement>(`.fp-ws[data-entity-id="${id}"]`)!

function clickDesk(id: string) {
  const el = deskPolygon(id)
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(el, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
}

async function openWorkspace() {
  window.location.hash = '#/floor-planning?floor=floor-16&view=workspace'
  render(<FloorPlanningPage />)
  await screen.findByRole('application', {}, { timeout: 15000 })
}

describe('desk selection → workspace inspector', () => {
  it('opens, updates in place, and closes with Escape', async () => {
    await openWorkspace()
    expect(screen.queryByRole('complementary', { name: /^F16-/ })).toBeNull()

    clickDesk(OCCUPIED)
    const inspector = await screen.findByRole('complementary', { name: /^F16-.-065$/ })
    expect(within(inspector).getByText('Nguyễn Văn Minh')).toBeTruthy()
    expect(document.querySelector('.fp-svg')!.classList.contains('has-desk-selection')).toBe(true)
    expect(window.location.hash).toContain(`select=workstation%3A${OCCUPIED}`)

    clickDesk(AVAILABLE)
    const updated = screen.getByRole('complementary', { name: /^F16-.-066$/ })
    expect(updated).toBe(inspector)
    expect(within(updated).getByText('Chưa có nhân sự được gán')).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByRole('complementary', { name: /^F16-/ })).toBeNull()
    expect(document.querySelector('.fp-svg')!.classList.contains('has-desk-selection')).toBe(false)
    expect(window.location.hash).not.toContain('select=')
  }, 30000)

  it('close button clears the selection and returns focus to the map', async () => {
    await openWorkspace()
    clickDesk(OCCUPIED)
    const inspector = await screen.findByRole('complementary', { name: /^F16-/ })
    await userEvent.setup().click(within(inspector).getByRole('button', { name: 'Đóng bảng thông tin bàn' }))
    expect(screen.queryByRole('complementary', { name: /^F16-/ })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('application'))
  }, 30000)

  it('arrow keys on the focused map select desks', async () => {
    await openWorkspace()
    const map = screen.getByRole('application')
    map.focus()
    fireEvent.keyDown(map, { key: 'ArrowRight' })
    const inspector = await screen.findByRole('complementary', { name: /^F16-/ })
    const first = within(inspector).getByRole('heading', { level: 2 }).textContent
    fireEvent.keyDown(map, { key: 'ArrowDown' })
    expect(within(inspector).getByRole('heading', { level: 2 }).textContent).not.toBe(first)
  }, 30000)

  it('verification view keeps the physical details panel and shows no people', async () => {
    window.location.hash = `#/floor-planning?floor=floor-16&select=workstation:${OCCUPIED}`
    render(<FloorPlanningPage />)
    await screen.findByRole('application', {}, { timeout: 15000 })
    expect(screen.queryByText('Nguyễn Văn Minh')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: OCCUPIED })).toBeTruthy()
  }, 30000)
})
