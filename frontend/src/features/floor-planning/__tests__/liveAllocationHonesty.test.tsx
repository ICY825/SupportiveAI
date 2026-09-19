// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type { SeatAssignment } from '@/api/seats'
import { FloorPlanningPage } from '../pages/FloorPlanningPage'

const apiMocks = vi.hoisted(() => ({
  listAssignments: vi.fn(),
  reconcileFloor: vi.fn(),
  releaseSeat: vi.fn(),
  assignSeat: vi.fn(),
}))

vi.mock('@/shared/auth', () => ({
  // `ready` matters: the layout store waits for the session to be verified
  // before deciding whether edits go to the server or stay in the page.
  useOptionalSession: () => ({ employee: { id: 'admin-1' }, ready: true }),
}))

vi.mock('@/api/layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/layout')>()),
  readFloorLayout: vi.fn().mockResolvedValue({
    floor_id: 'floor-16',
    current_layout_version: 'layout-2',
    placements: [],
    stale: 0,
  }),
}))

vi.mock('@/api/seats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/seats')>()),
  ...apiMocks,
}))

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
  window.location.hash = ''
})

function assignment(): SeatAssignment {
  return {
    id: 'server-assignment-1',
    floor_id: 'floor-16',
    workstation_id: 'ws-16-065',
    layout_version: 'layout-1',
    employee: {
      id: 'emp-1',
      employee_code: 'VSF001',
      full_name: 'Nguyễn Văn Minh',
      department_id: null,
    },
    assigned_at: '2020-01-01T00:00:00Z',
    released_at: null,
    assigned_by: 'admin-1',
    decision: 'manual',
    note: null,
  }
}

function clickDesk(id: string) {
  const el = document.querySelector<SVGGElement>(`.sw-furniture[data-workstation-id="${id}"]`)
  if (!el) throw new Error(`Desk ${id} was not rendered`)
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(el, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
}

describe('live allocation honesty', () => {
  beforeEach(() => {
    apiMocks.listAssignments.mockResolvedValue([assignment()])
    apiMocks.reconcileFloor.mockResolvedValue({
      floor_id: 'floor-16',
      current_layout_version: 'layout-2',
      checked: 1,
      stale: [{
        assignment_id: 'server-assignment-1',
        floor_id: 'floor-16',
        workstation_id: 'ws-16-gone',
        employee_code: 'VSF001',
        reason: 'missing-seat',
        assigned_layout_version: 'layout-1',
        current_layout_version: 'layout-2',
      }],
    })
    apiMocks.releaseSeat.mockRejectedValue(new ApiError(409, 'seat_taken', 'Chỗ ngồi ws-16-065 đang được cấp cho Lưu Hải Nam'))
  })

  it('shows stale assignments and restores the real occupant after a refused write', async () => {
    window.location.hash = '#/floor-planning?floor=floor-16&view=workspace'
    render(<FloorPlanningPage />)

    // With live data the chooser lists departments by the names on the drawing,
    // not the demo fixtures' English ones.
    fireEvent.click(
      await screen.findByRole('button', { name: /MÔ HÌNH & NỀN TẢNG AI/ }, { timeout: 15000 }),
    )
    await screen.findByRole('application', {}, { timeout: 15000 })
    expect(await screen.findByRole('link', { name: 'Xem danh sách đối chiếu' }, { timeout: 15000 })).toBeTruthy()
    expect(screen.getByText(/ws-16-gone/)).toBeTruthy()

    clickDesk('ws-16-065')
    const inspector = await screen.findByRole('complementary', { name: /^F16-.-065$/ })
    expect(within(inspector).getByText('Nguyễn Văn Minh')).toBeTruthy()
    await userEvent.setup().click(within(inspector).getByRole('button', { name: 'Thao tác khác' }))
    await userEvent.setup().click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Giải phóng chỗ ngồi' }))

    expect(await screen.findByText('Chỗ ngồi ws-16-065 đang được cấp cho Lưu Hải Nam')).toBeTruthy()
    await waitFor(() => expect(within(inspector).getByText('Nguyễn Văn Minh')).toBeTruthy())
    expect(within(inspector).queryByRole('button', { name: 'Hoàn tác' })).toBeNull()
  }, 30000)
})
