// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SPATIAL_OUT_OF_SCOPE } from '../labels'
import { FloorPlanningPage } from '../pages/FloorPlanningPage'

/**
 * Search results, scoped to the search listbox: the floor picker is a <select>,
 * so its floors are options in the document too.
 */
const searchResults = () => {
  const list = screen.queryByRole('listbox', { name: 'Kết quả tìm kiếm' })
  return list ? within(list).queryAllByRole('option') : []
}

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

const deskNode = (id: string) => document.querySelector<SVGGElement>(`.sw-furniture[data-workstation-id="${id}"]`)!

function clickDesk(id: string) {
  const el = deskNode(id)
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

  it('renders all 116 accepted department desks while excluding other departments from search', async () => {
    await openWorkspace()
    const desks = [...document.querySelectorAll('.sw-desktop')]
    expect(desks).toHaveLength(116)
    expect(new Set([...document.querySelectorAll('.sw-furniture')].map((node) => node.getAttribute('data-status')))).toEqual(new Set(['occupied', 'available', 'reserved', 'conflict', 'unavailable']))
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox', { name: 'Tìm kiếm trên mặt bằng' }), 'ws-16-001')
    expect(searchResults()).toHaveLength(0)
    expect(screen.getByText(/Không tìm thấy kết quả/)).toBeTruthy()
  }, 30000)

  it('offers six display areas and renders canonical context without expanding the target count', async () => {
    await openWorkspace()
    const stage = document.querySelector('.sw-map-stage')
    expect(stage?.querySelector('.sw-minimap')).not.toBeNull()
    expect(stage?.querySelector('.sw-map-controls')).not.toBeNull()
    expect(document.querySelector('.sw-context .sw-minimap')).toBeNull()
    expect(document.querySelector('.sw-minimap-plan')).not.toBeNull()
    expect(document.querySelector('.sw-minimap-locator')).toBeNull()
    expect(screen.queryByText('Vị trí trên mặt bằng')).toBeNull()
    expect(screen.queryByText('Toàn bộ bộ phận')).toBeNull()
    const picker = screen.getByRole('combobox', { name: 'Tập trung khu vực' }) as HTMLSelectElement
    expect(picker.options).toHaveLength(7)
    expect([...picker.options].slice(1).map((option) => option.textContent)).toEqual([
      'Khu vực A · 28 chỗ',
      'Khu vực B · 21 chỗ',
      'Khu vực C · 15 chỗ',
      'Khu vực D · 14 chỗ',
      'Khu vực E · 22 chỗ',
      'Khu vực F · 16 chỗ',
    ])
    const editButton = screen.getByRole('button', { name: /Chỉnh sửa bố trí/ })
    expect(editButton).not.toHaveProperty('disabled', true)
    await userEvent.setup().click(editButton)
    expect(screen.getByText('Chọn khu vực trước khi chỉnh sửa bố trí.')).toBeTruthy()
    expect(document.querySelector('.sw-minimap[data-prompt="true"]')).not.toBeNull()

    await userEvent.setup().selectOptions(picker, picker.options[1])
    const map = screen.getByRole('application')
    expect(map.getAttribute('data-rendered-workstations')).toBe('28')
    expect(['medium', 'close']).toContain(map.getAttribute('data-detail-tier'))
    expect(map.querySelectorAll('.sw-desk-code')).toHaveLength(28)
    expect(map.querySelectorAll('.sw-marker')).toHaveLength(28)
    expect(map.querySelectorAll('.sw-context-furniture').length).toBeGreaterThan(0)
    expect(map.querySelector('.sw-context-furniture[data-workstation-id]')).toBeNull()
    expect(screen.getByRole('button', { name: /Chỉnh sửa bố trí/ })).toHaveProperty('disabled', false)
    expect(screen.getByText('28')).toBeTruthy()
    expect(document.querySelectorAll('.sw-minimap-area')).toHaveLength(6)
    expect(document.querySelector('.sw-minimap-area.is-active')?.getAttribute('data-area-id')).toBe('ai-area-a')
    expect(document.querySelectorAll('.sw-minimap-area[role="button"]')).toHaveLength(0)
  }, 30000)

  it('enters edit mode for the currently focused area instead of a fixed first cluster', async () => {
    await openWorkspace()
    const picker = screen.getByRole('combobox', { name: 'Tập trung khu vực' }) as HTMLSelectElement
    await userEvent.setup().selectOptions(picker, picker.options[2])
    await userEvent.setup().click(screen.getByRole('button', { name: /Chỉnh sửa bố trí/ }))
    const map = screen.getByRole('application')
    expect(map.getAttribute('data-rendered-workstations')).toBe('21')
    expect(document.querySelector('.sw-minimap-area.is-active')?.getAttribute('data-area-id')).toBe('ai-area-b')
    expect(document.querySelectorAll('.sw-minimap-area[role="button"]')).toHaveLength(0)
    const target = document.querySelector<SVGGElement>('.sw-furniture[data-workstation-id="ws-16-085"]')!
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(target, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    expect(await screen.findByRole('complementary', { name: /Thông tin nhân sự bàn .*085/ })).toBeTruthy()
  }, 30000)

  it('reveals desk IDs/status markers at medium zoom and employee initials only at close zoom', async () => {
    await openWorkspace()
    const map = screen.getByRole('application')
    const zoomIn = screen.getByRole('button', { name: 'Phóng to' })
    expect(map.getAttribute('data-detail-tier')).toBe('far')
    expect(map.querySelector('.sw-desk-code')).toBeNull()
    expect(map.querySelector('.sw-marker')).toBeNull()

    fireEvent.click(zoomIn)
    fireEvent.click(zoomIn)
    expect(map.getAttribute('data-detail-tier')).toBe('medium')
    expect(map.querySelectorAll('.sw-desk-code')).toHaveLength(116)
    expect(map.querySelectorAll('.sw-marker')).toHaveLength(116)
    expect(map.querySelector('.sw-avatar-text')).toBeNull()

    fireEvent.click(zoomIn)
    fireEvent.click(zoomIn)
    expect(map.getAttribute('data-detail-tier')).toBe('close')
    expect(map.querySelector('.sw-avatar-text')).not.toBeNull()
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
    expect(document.querySelector('.sw-selection')).not.toBeNull()
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
    expect(summary.textContent).toMatch(/116/)
    expect(summary.textContent).toMatch(/chỗ ngồi/)
  }, 30000)

  it('explains deep links outside the accepted department without expanding its scope', async () => {
    window.location.hash = '#/floor-planning?floor=floor-16&view=workspace&select=workstation:ws-16-001'
    render(<FloorPlanningPage />)
    await screen.findByRole('application', {}, { timeout: 15000 })
    expect(screen.getByText(SPATIAL_OUT_OF_SCOPE)).toBeTruthy()
    expect(document.querySelectorAll('.sw-desktop')).toHaveLength(116)
    expect(document.querySelector('.sw-selection')).toBeNull()
  }, 30000)

  it('search: typing a name and pressing Enter selects that person\'s desk', async () => {
    await openWorkspace()
    const user = userEvent.setup()
    const box = screen.getByRole('combobox', { name: 'Tìm kiếm trên mặt bằng' })
    await user.click(box)
    await user.type(box, 'nguyen van minh')
    const options = searchResults()
    expect(options[0].textContent).toContain('Nguyễn Văn Minh')
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0].id)
    await user.keyboard('{Enter}')
    const inspector = await screen.findByRole('complementary', { name: /^F16-.-065$/ })
    expect(within(inspector).getByText('Nguyễn Văn Minh')).toBeTruthy()
    expect(searchResults()).toHaveLength(0)
    expect(document.activeElement).toBe(screen.getByRole('application'))
  }, 30000)

  it('search resolves an AI workstation outside the former 19-seat crop', async () => {
    await openWorkspace()
    const user = userEvent.setup()
    const box = screen.getByRole('combobox', { name: 'Tìm kiếm trên mặt bằng' })
    await user.type(box, 'ws-16-382')
    expect(searchResults()[0]?.textContent).toContain('F16')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('complementary', { name: /^F16-.-382$/ })).toBeTruthy()
    expect(document.querySelector('.sw-selection')).not.toBeNull()
  }, 30000)

  it('focuses an extracted cluster and returns to the department without losing selection', async () => {
    await openWorkspace()
    clickDesk(OCCUPIED)
    const user = userEvent.setup()
    const selector = screen.getByRole('combobox', { name: 'Tập trung khu vực' })
    await user.selectOptions(selector, selector.querySelectorAll('option')[1])
    expect(document.querySelectorAll('.sw-desktop').length).toBeLessThan(116)
    expect(screen.getByRole('complementary', { name: /^F16-.-065$/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Tổng quan' }))
    expect(document.querySelectorAll('.sw-desktop')).toHaveLength(116)
    expect(screen.getByRole('complementary', { name: /^F16-.-065$/ })).toBeTruthy()
  }, 30000)

  it('keeps focus for an in-area search and returns to overview for an out-of-area hit', async () => {
    await openWorkspace()
    const user = userEvent.setup()
    const selector = screen.getByRole('combobox', { name: 'Tập trung khu vực' })
    await user.selectOptions(selector, selector.querySelectorAll('option')[1])
    const box = screen.getByRole('combobox', { name: 'Tìm kiếm trên mặt bằng' })

    await user.type(box, 'ws-16-065')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('application').getAttribute('data-rendered-workstations')).toBe('28')
    expect(document.querySelector('.sw-minimap-area.is-active')?.getAttribute('data-area-id')).toBe('ai-area-a')

    await user.type(box, 'ws-16-382')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('application').getAttribute('data-rendered-workstations')).toBe('116')
    expect(document.querySelector('.sw-minimap-area.is-active')?.getAttribute('data-area-id')).toBe('ai-area-f')
  }, 30000)

  it('search: shows an empty state and Escape clears the query without closing the inspector', async () => {
    await openWorkspace()
    clickDesk(OCCUPIED)
    await screen.findByRole('complementary', { name: /^F16-/ })
    const user = userEvent.setup()
    const box = screen.getByRole('combobox', { name: 'Tìm kiếm trên mặt bằng' })
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
    const picker = screen.getByRole('combobox', { name: 'Tập trung khu vực' }) as HTMLSelectElement
    fireEvent.change(picker, { target: { value: picker.options[1].value } })
    fireEvent.click(screen.getByRole('button', { name: /Chỉnh sửa bố trí/ }))
    clickDesk(OCCUPIED)
    fireEvent.keyDown(document.querySelector('.sw-scene')!, { key: 'ArrowLeft' })
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
