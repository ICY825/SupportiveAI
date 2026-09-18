// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { clearSessionAllocations } from '../allocation/allocationStore'
import { FloorPlanningPage } from '../pages/FloorPlanningPage'

beforeAll(() => {
  globalThis.ResizeObserver = class {
    cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) { this.cb = cb }
    observe() { this.cb([{ contentRect: { width: 1200, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  cleanup()
  clearSessionAllocations()
  window.location.hash = ''
})

function clickDesk(id: string) {
  const el = document.querySelector<SVGGElement>(`.sw-furniture[data-workstation-id="${id}"]`)
  if (!el) throw new Error(`Desk ${id} was not rendered`)
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(el, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
}

async function openAvailableDesk() {
  window.location.hash = '#/floor-planning?floor=floor-16&view=workspace'
  render(<FloorPlanningPage />)
  // The seating view opens on the department chooser.
  fireEvent.click(await screen.findByRole('button', { name: /AI & Data/ }, { timeout: 15000 }))
  await screen.findByRole('application', {}, { timeout: 15000 })
  clickDesk('ws-16-066')
  return screen.findByRole('complementary', { name: /^F16-.-066$/ })
}

describe('workspace employee assignment', () => {
  it('opens Chỉnh sửa in the right sidebar and assigns an unseated employee immediately', async () => {
    const user = userEvent.setup()
    const inspector = await openAvailableDesk()
    await user.click(within(inspector).getByRole('button', { name: 'Chỉnh sửa' }))
    const picker = within(inspector).getByRole('region', { name: 'Chỉnh sửa phân công' })
    const unseated = within(picker).getAllByRole('button').find((button) => button.textContent?.includes('Chưa được gán chỗ'))
    expect(unseated).toBeTruthy()
    const employeeName = unseated?.querySelector('strong')?.textContent
    await user.click(unseated!)
    expect(within(inspector).getByText('Đang sử dụng')).toBeTruthy()
    expect(employeeName ? within(inspector).getByText(employeeName) : null).toBeTruthy()
    expect(within(inspector).getByText(/Đã gán/)).toBeTruthy()
  }, 30000)

  it('releases a selected occupant from the overflow menu and can undo it', async () => {
    const user = userEvent.setup()
    const inspector = await (async () => {
      window.location.hash = '#/floor-planning?floor=floor-16&view=workspace'
      render(<FloorPlanningPage />)
      fireEvent.click(await screen.findByRole('button', { name: /AI & Data/ }, { timeout: 15000 }))
      await screen.findByRole('application', {}, { timeout: 15000 })
      clickDesk('ws-16-065')
      return screen.findByRole('complementary', { name: /^F16-.-065$/ })
    })()
    await user.click(within(inspector).getByRole('button', { name: 'Thao tác khác' }))
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Giải phóng chỗ ngồi' }))
    expect(within(inspector).getByText('Chỗ ngồi còn trống')).toBeTruthy()
    expect(within(inspector).getByRole('button', { name: 'Hoàn tác' })).toBeTruthy()
    await user.click(within(inspector).getByRole('button', { name: 'Hoàn tác' }))
    expect(within(inspector).getByText('Nguyễn Văn Minh')).toBeTruthy()
  }, 30000)
})
