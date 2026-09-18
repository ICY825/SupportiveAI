// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmployeePicker } from '../components/desk-inspector/EmployeePicker'
import type { Assignment, Department, Employee, Seat } from '../domain/allocation'

afterEach(cleanup)

const now = new Date('2026-09-17T03:00:00Z')
const department: Department = { id: 'dept-ai', name: 'AI & Data', zonePreferences: [] }
const employees: Employee[] = [
  { id: 'emp-1', employeeCode: 'VSF-0001', name: 'Nguyễn Văn Minh', departmentId: department.id, jobTitle: 'AI Engineer' },
  { id: 'emp-2', employeeCode: 'VSF-0002', name: 'Lê Hoàng Nam', departmentId: department.id, jobTitle: 'Data Engineer' },
]
const seats: Seat[] = [{
  id: 'seat-1', code: 'F16-A-023', workstationId: 'ws-1', status: 'ACTIVE', seatType: 'FIXED', departmentId: department.id,
  verifiedBy: null, verifiedAt: null, layoutVersion: 'test',
}]
const assignments: Assignment[] = [{
  id: 'assignment-1', employeeId: 'emp-1', seatId: 'seat-1', type: 'permanent',
  validFrom: '2026-09-01T00:00:00Z', validTo: null,
}]

const renderPicker = () => render(
  <EmployeePicker
    employees={employees}
    departments={[department]}
    seats={seats}
    assignments={assignments}
    now={now}
    onSelect={() => {}}
  />,
)

describe('EmployeePicker', () => {
  it('shows department and current seat for seated employees', () => {
    renderPicker()
    expect(screen.getByText('Nguyễn Văn Minh')).toBeTruthy()
    expect(screen.getByText('VSF-0001 · AI & Data')).toBeTruthy()
    expect(screen.getByText('Đang ở F16-A-023')).toBeTruthy()
    expect(screen.getByText('Chưa được gán chỗ')).toBeTruthy()
  })

  it('filters by name and employee code', async () => {
    const user = userEvent.setup()
    renderPicker()
    const input = screen.getByRole('searchbox', { name: 'Chọn nhân sự' })
    await user.type(input, '0002')
    expect(screen.getByText('Lê Hoàng Nam')).toBeTruthy()
    expect(screen.queryByText('Nguyễn Văn Minh')).toBeNull()
    await user.clear(input)
    await user.type(input, 'nguyen van')
    expect(screen.getByText('Nguyễn Văn Minh')).toBeTruthy()
    expect(screen.queryByText('Lê Hoàng Nam')).toBeNull()
  })

  it('returns the selected employee', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<EmployeePicker employees={employees} departments={[department]} seats={seats} assignments={assignments} now={now} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: /Lê Hoàng Nam/ }))
    expect(onSelect).toHaveBeenCalledWith(employees[1])
  })
})
