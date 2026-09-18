// @vitest-environment jsdom

/**
 * Ô chọn nhân sự khi chạy với dữ liệu thật.
 *
 * Danh sách phân công chỉ kể tên người **đang có chỗ ngồi**, nên nếu ô tìm chỉ
 * lọc trong đó thì không bao giờ xếp được người mới vào bàn trống — mất đúng
 * thao tác hay dùng nhất. Có `onSearch` thì nó hỏi thẳng danh mục nhân sự.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmployeePicker } from '../components/desk-inspector/EmployeePicker'
import type { Employee, Seat } from '../domain/allocation'

const seated: Employee = {
  id: 'emp-1',
  employeeCode: 'VSF001',
  name: 'Nguyễn Thị Thu Hương',
  departmentId: null,
}

const unseated: Employee = {
  id: 'emp-2',
  employeeCode: 'VSF002',
  name: 'Lưu Hải Nam',
  departmentId: null,
}

const seat: Seat = {
  id: 'seat-ws-16-001',
  code: 'F16-A-001',
  workstationId: 'ws-16-001',
  status: 'ACTIVE',
  seatType: 'FIXED',
  departmentId: null,
  verifiedBy: null,
  verifiedAt: null,
  layoutVersion: 'sha-1',
}

const now = new Date('2026-09-18T03:00:00Z')

function renderPicker(props: Partial<Parameters<typeof EmployeePicker>[0]> = {}) {
  const onSelect = vi.fn()
  render(
    <EmployeePicker
      employees={[seated]}
      departments={[]}
      seats={[seat]}
      assignments={[
        {
          id: 'sa-1',
          employeeId: seated.id,
          seatId: seat.id,
          type: 'permanent',
          validFrom: '2026-09-17T01:00:00Z',
          validTo: null,
          updatedAt: '2026-09-17T01:00:00Z',
        },
      ]}
      now={now}
      onSelect={onSelect}
      {...props}
    />,
  )
  return { onSelect }
}

afterEach(cleanup)

describe('employee picker with a staff directory', () => {
  it('offers someone who holds no seat at all', async () => {
    const onSearch = vi.fn(async () => [unseated])
    const { onSelect } = renderPicker({ onSearch })
    const user = userEvent.setup()

    await user.type(screen.getByRole('searchbox', { name: 'Chọn nhân sự' }), 'Nam')

    expect(await screen.findByText('Lưu Hải Nam')).toBeTruthy()
    expect(onSearch).toHaveBeenCalledWith('Nam')
    // Người chưa có chỗ phải nhìn ra ngay, đó là lý do mở ô tìm.
    expect(screen.getByText('Chưa được gán chỗ')).toBeTruthy()

    await user.click(screen.getByText('Lưu Hải Nam'))
    expect(onSelect).toHaveBeenCalledWith(unseated)
  })

  it('asks for one more character before troubling the server', async () => {
    const onSearch = vi.fn(async () => [unseated])
    renderPicker({ onSearch })

    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Chọn nhân sự' }), 'N')

    expect(await screen.findByText('Gõ thêm một ký tự nữa để tìm')).toBeTruthy()
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('says so when the directory cannot be reached, instead of showing nobody', async () => {
    const onSearch = vi.fn(async () => {
      throw new Error('offline')
    })
    renderPicker({ onSearch })

    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Chọn nhân sự' }), 'Nam')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Không tra được danh mục nhân sự. Thử lại.',
    )
  })

  it('ignores an answer that arrives after a newer keystroke', async () => {
    const answers: Record<string, Employee[]> = {
      Na: [{ ...unseated, id: 'emp-old', name: 'Kết quả cũ' }],
      Nam: [unseated],
    }
    const onSearch = vi.fn(
      (query: string) =>
        new Promise<Employee[]>((resolve) =>
          // The shorter query answers last, the way a slow first request would.
          setTimeout(() => resolve(answers[query] ?? []), query.length === 2 ? 60 : 0),
        ),
    )
    renderPicker({ onSearch })

    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Chọn nhân sự' }), 'Nam')

    expect(await screen.findByText('Lưu Hải Nam')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Kết quả cũ')).toBeNull())
  })

  it('keeps filtering in place when no directory is wired, for the demo fixtures', async () => {
    const { onSelect } = renderPicker()
    const user = userEvent.setup()

    await user.type(screen.getByRole('searchbox', { name: 'Chọn nhân sự' }), 'Hương')
    await user.click(screen.getByText('Nguyễn Thị Thu Hương'))

    expect(onSelect).toHaveBeenCalledWith(seated)
    expect(screen.getByText('Đang ở F16-A-001')).toBeTruthy()
  })
})
