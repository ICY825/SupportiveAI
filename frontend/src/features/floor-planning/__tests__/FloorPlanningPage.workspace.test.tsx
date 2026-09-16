// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SPATIAL_OUT_OF_SCOPE } from '../labels'
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

const deskMarker = (id: string) => document.querySelector<SVGGElement>(`.sw-marker[data-workstation-id="${id}"]`)!

function clickDesk(id: string) {
  const el = deskMarker(id)
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
    expect(within(inspector).getByText('Thông tin chỗ ngồi').closest('details')?.hasAttribute('open')).toBe(true)
    expect(deskMarker(OCCUPIED).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.sw-selection')).not.toBeNull()
    expect(window.location.hash).toContain(`select=workstation%3A${OCCUPIED}`)

    clickDesk(AVAILABLE)
    const updated = screen.getByRole('complementary', { name: /^F16-.-066$/ })
    expect(updated).toBe(inspector)
    expect(within(updated).getByText('Chưa có nhân sự được gán')).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByRole('complementary', { name: /^F16-/ })).toBeNull()
    expect(document.querySelector('.sw-selection')).toBeNull()
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
    expect(document.querySelector('.sw-scene')).toBeNull()
    expect(document.querySelector('.fp-svg')).not.toBeNull()
  }, 30000)

  it('limits the scene and search to 19 desks, keeping all five operational states', async () => {
    await openWorkspace()
    const markers = [...document.querySelectorAll('.sw-marker')]
    expect(markers).toHaveLength(19)
    expect(new Set(markers.map((m) => m.getAttribute('data-status')))).toEqual(new Set(['occupied', 'available', 'reserved', 'conflict', 'unavailable']))
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox'), 'ws-16-001')
    expect(screen.queryByRole('option')).toBeNull()
    expect(screen.getByText(/Không tìm thấy kết quả/)).toBeTruthy()
  }, 30000)

  it('preserves selection when switching to the existing verification renderer and back', async () => {
    await openWorkspace()
    clickDesk(OCCUPIED)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Đối chiếu trên bản vẽ' }))
    expect(document.querySelector('.sw-scene')).toBeNull()
    expect(document.querySelector('.fp-svg')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: OCCUPIED })).toBeTruthy()
    expect(screen.queryByText('Nguyễn Văn Minh')).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Bố trí chỗ ngồi' }))
    expect(deskMarker(OCCUPIED).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Nguyễn Văn Minh')).toBeTruthy()
  }, 30000)

  /*
   * The seat count and scope belong to the side panel's summary. They were
   * duplicated under the page title and removed; this keeps them removed.
   */
  it('states the seat count once, in the side panel and not under the page title', async () => {
    await openWorkspace()
    const heading = document.querySelector('.sw-heading')!
    expect(heading.textContent).not.toMatch(/cụm bàn/)
    expect(heading.textContent).not.toMatch(/chỗ ngồi/)
    expect(document.querySelector('.sw-heading-meta')).toBeNull()
    // still stated exactly once, in the summary
    const summary = document.querySelector('.sw-summary')!
    expect(summary.textContent).toMatch(/19/)
    expect(summary.textContent).toMatch(/chỗ ngồi/)
  }, 30000)

  it('explains out-of-crop deep links instead of silently expanding the spike', async () => {
    window.location.hash = '#/floor-planning?floor=floor-16&view=workspace&select=workstation:ws-16-001'
    render(<FloorPlanningPage />)
    await screen.findByRole('application', {}, { timeout: 15000 })
    expect(screen.getByText(SPATIAL_OUT_OF_SCOPE)).toBeTruthy()
    expect(document.querySelectorAll('.sw-marker')).toHaveLength(19)
    expect(document.querySelector('.sw-selection')).toBeNull()
  }, 30000)

  it('search: typing a name and pressing Enter selects that person\'s desk', async () => {
    await openWorkspace()
    const user = userEvent.setup()
    const box = screen.getByRole('combobox', { name: 'Tìm kiếm trên mặt bằng' })
    await user.click(box)
    await user.type(box, 'nguyen van minh')
    const options = screen.getAllByRole('option')
    expect(options[0].textContent).toContain('Nguyễn Văn Minh')
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0].id)
    await user.keyboard('{Enter}')
    const inspector = await screen.findByRole('complementary', { name: /^F16-.-065$/ })
    expect(within(inspector).getByText('Nguyễn Văn Minh')).toBeTruthy()
    expect(screen.queryByRole('option')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('application'))
  }, 30000)

  it('search: shows an empty state and Escape clears the query without closing the inspector', async () => {
    await openWorkspace()
    clickDesk(OCCUPIED)
    await screen.findByRole('complementary', { name: /^F16-/ })
    const user = userEvent.setup()
    const box = screen.getByRole('combobox')
    await user.click(box)
    await user.type(box, 'khong-co-gi')
    expect(screen.getByText(/Không tìm thấy kết quả/)).toBeTruthy()
    await user.keyboard('{Escape}')
    expect((box as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('complementary', { name: /^F16-/ })).toBeTruthy()
  }, 30000)

  it('help: ? opens the shortcuts popover; Escape closes it before clearing the selection', async () => {
    await openWorkspace()
    clickDesk(OCCUPIED)
    await screen.findByRole('complementary', { name: /^F16-/ })
    const user = userEvent.setup()
    screen.getByRole('application').focus()
    await user.keyboard('?')
    const dialog = screen.getByRole('dialog', { name: 'Thao tác trên mặt bằng' })
    expect(within(dialog).getByText('Tìm kiếm')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('complementary', { name: /^F16-/ })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Trợ giúp và phím tắt' }))
  }, 30000)
})

describe('unsaved layout changes guard the page', () => {
  it('asks before switching view mode and applies the switch only after discarding', async () => {
    await openWorkspace()
    fireEvent.click(screen.getByRole('radio', { name: 'Chỉnh sửa bố trí' }))
    clickDesk(OCCUPIED)
    fireEvent.keyDown(document.querySelector('.sw-scene')!, { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: 'Lưu bố trí' })).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('radio', { name: 'Xác minh mặt bằng' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    // still in the spatial view, draft intact
    expect(screen.getByRole('application')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Bố trí chỗ ngồi' })).toHaveProperty('ariaChecked', 'true')

    fireEvent.click(screen.getByRole('radio', { name: 'Xác minh mặt bằng' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hủy thay đổi' }))
    })
    expect(screen.getByRole('radio', { name: 'Xác minh mặt bằng' })).toHaveProperty('ariaChecked', 'true')
  })
})
