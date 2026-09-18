// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeskInspector } from '../components/desk-inspector/DeskInspector'
import type { Employee, Seat } from '../domain/allocation'
import type { DeskRecord, DeskStatus, PersonOnDesk } from '../domain/desk'
import type { Workstation } from '../domain/spatial'

afterEach(cleanup)

const NOW = new Date('2026-09-15T02:50:00Z')
const SOURCE = { kind: 'demo' as const, asOf: NOW.toISOString() }

const workstation: Workstation = {
  id: 'ws-16-065',
  floorId: 'floor-16',
  clusterId: 'cluster-16-20',
  zoneId: null,
  classification: 'WORKSTATION',
  verification: 'EXTRACTED',
  polygon: [],
  center: [0, 0],
  rotationDeg: 0,
  chair: null,
  bbox: [0, 0, 1, 1],
  gridRef: 'B-A / 5-4',
  source: { kind: 'pdf-vector' },
  notes: [],
}

const authoredWorkstation: Workstation = {
  ...workstation,
  source: { kind: 'user-authored', authoredBy: 'admin-1', authoredAt: NOW.toISOString() },
}

const employee = (id: string, name: string, over: Partial<Employee> = {}): Employee => ({
  id,
  employeeCode: `VSF-${id}`,
  name,
  jobTitle: 'AI Engineer',
  departmentId: 'dept-ai',
  team: 'AI Platform',
  presence: 'in_office',
  ...over,
})

const person = (e: Employee, over: Partial<PersonOnDesk['assignment']> = {}): PersonOnDesk => ({
  employee: e,
  manager: employee('m', 'Trần Đức Anh'),
  department: { id: 'dept-ai', name: 'AI & Data', zonePreferences: [] },
  assignment: { id: `a-${e.id}`, employeeId: e.id, seatId: 'seat-1', type: 'permanent', validFrom: '2026-09-12T02:00:00Z', validTo: null, updatedAt: '2026-09-15T01:14:00Z', ...over },
})

function desk(status: DeskStatus, over: Partial<DeskRecord> = {}, seatOver: Partial<Seat> = {}): DeskRecord {
  return {
    workstation,
    seat: {
      id: 'seat-1',
      code: 'F16-A-023',
      workstationId: workstation.id,
      status: status === 'unavailable' ? 'OUT_OF_SERVICE' : 'ACTIVE',
      seatType: 'FIXED',
      departmentId: 'dept-ai',
      capabilities: { power: true, monitor: true, dockingStation: false },
      verifiedBy: null,
      verifiedAt: null,
      layoutVersion: 'test',
      ...seatOver,
    },
    status,
    zone: null,
    department: { id: 'dept-ai', name: 'AI & Data', zonePreferences: [] },
    occupants: [],
    reservation: null,
    devices: [],
    conflictDetectedAt: null,
    ...over,
  }
}

const minh = employee('0182', 'Nguyễn Văn Minh')
const nam = employee('0190', 'Lê Hoàng Nam', { jobTitle: 'Data Engineer' })

const renderInspector = (d: DeskRecord, props: Partial<Parameters<typeof DeskInspector>[0]> = {}) =>
  render(<DeskInspector desk={d} source={SOURCE} now={NOW} onClose={() => {}} {...props} />)

describe('DeskInspector', () => {
  it('occupied: shows who is here first, then desk, assignment and devices', () => {
    renderInspector(
      desk('occupied', {
        occupants: [person(minh)],
        devices: [{ id: 'd1', type: 'laptop', assetCode: 'VSF-LT-1842', employeeId: minh.id }],
      }),
    )
    const panel = screen.getByRole('complementary', { name: 'F16-A-023' })
    expect(within(panel).getByText('Đang sử dụng')).toBeTruthy()
    const text = panel.textContent ?? ''
    const order = ['Nguyễn Văn Minh', 'Chỗ ngồi', 'Nhân sự', 'Phân công', 'Thiết bị'].map((t) => text.indexOf(t))
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]))).toBe(true)
    expect(within(panel).getByText('Trần Đức Anh')).toBeTruthy()
    expect(within(panel).getByText('Hôm nay, 08:14')).toBeTruthy()
    expect(within(panel).getByText('VSF-LT-1842')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Xem hồ sơ' })).toBeTruthy()
  })

  it('available: renders an intentional empty state without employee rows or null values', () => {
    renderInspector(desk('available'))
    const panel = screen.getByRole('complementary')
    expect(within(panel).getByText('Chưa có nhân sự được gán')).toBeTruthy()
    expect(within(panel).queryByText('Mã nhân viên')).toBeNull()
    expect(panel.textContent).not.toMatch(/null|undefined/)
    expect(within(panel).getByText('Sẵn sàng để gán')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /Gán nhân sự/ })).toBeTruthy()
  })

  it('reserved: shows who it is reserved for and when it starts', () => {
    renderInspector(desk('reserved', { reservation: person(nam, { type: 'reservation', validFrom: '2026-09-16T01:00:00Z' }) }))
    const panel = screen.getByRole('complementary')
    expect(within(panel).getByText('Đặt trước cho')).toBeTruthy()
    expect(within(panel).getByText('Lê Hoàng Nam')).toBeTruthy()
    expect(within(panel).getByText('Ngày mai, 08:00')).toBeTruthy()
    expect(within(panel).getByText('Còn trống cho đến khi bắt đầu đặt chỗ')).toBeTruthy()
    for (const name of ['Xem đặt chỗ', 'Đổi đặt chỗ', 'Hủy đặt chỗ']) expect(within(panel).getByRole('button', { name })).toBeTruthy()
  })

  it('conflict: lists every active assignment and offers resolution', () => {
    renderInspector(
      desk('conflict', {
        occupants: [person(minh), person(nam, { type: 'temporary', updatedAt: '2026-09-15T02:42:00Z' })],
        conflictDetectedAt: '2026-09-15T02:42:00Z',
      }),
    )
    const group = screen.getByRole('group', { name: 'Hai phân công đang hiệu lực' })
    expect(within(group).getByText('Nguyễn Văn Minh')).toBeTruthy()
    expect(within(group).getByText('Lê Hoàng Nam')).toBeTruthy()
    expect(within(group).getByText('Hôm nay • 09:42')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Xử lý xung đột' })).toBeTruthy()
  })

  it('unavailable: explains why and offers to reopen', () => {
    renderInspector(desk('unavailable', {}, { statusReason: 'Đang sửa ổ điện âm sàn' }))
    expect(screen.getByText('Đang sửa ổ điện âm sàn')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mở lại chỗ ngồi' })).toBeTruthy()
  })

  it('keeps destructive actions out of the primary row, inside the overflow menu', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderInspector(desk('occupied', { workstation: authoredWorkstation, occupants: [person(minh)] }), { onAction })
    expect(screen.queryByRole('button', { name: 'Xóa bàn' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    const menu = screen.getByRole('menu')
    expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[0])
    await user.click(within(menu).getByRole('menuitem', { name: 'Xóa bàn' }))
    expect(onAction).toHaveBeenCalledWith('delete-desk', expect.objectContaining({ status: 'occupied' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('does not offer deletion for extracted desks', async () => {
    const user = userEvent.setup()
    renderInspector(desk('available'))
    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    expect(screen.queryByRole('menuitem', { name: 'Xóa bàn' })).toBeNull()
  })

  it('Escape inside the menu closes only the menu', async () => {
    const user = userEvent.setup()
    const onWindowEscape = vi.fn((e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented)
    window.addEventListener('keydown', onWindowEscape)
    renderInspector(desk('available'))
    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onWindowEscape.mock.results.every((r) => r.value === false)).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Thao tác khác' }))
    window.removeEventListener('keydown', onWindowEscape)
  })

  it('updates in place when another desk is selected', () => {
    const { rerender } = renderInspector(desk('available'))
    const panel = screen.getByRole('complementary')
    rerender(
      <DeskInspector
        desk={desk('occupied', { occupants: [person(minh)] }, { id: 'seat-2', code: 'F16-A-024' })}
        source={SOURCE}
        now={NOW}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('complementary')).toBe(panel)
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('F16-A-024')
  })

  it('close button calls onClose', async () => {
    const onClose = vi.fn()
    renderInspector(desk('available'), { onClose })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Đóng bảng thông tin bàn' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
