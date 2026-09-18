import { useEffect, useMemo, useRef, useState } from 'react'
import type { Assignment, Department, Employee, Seat } from '../../domain/allocation'
import { SEAT_ASSIGNMENT } from '../../labels'
import './deskInspector.css'

export interface EmployeePickerProps {
  employees: readonly Employee[]
  departments: readonly Department[]
  seats: readonly Seat[]
  assignments: readonly Assignment[]
  now: Date
  onSelect: (employee: Employee) => void
  /**
   * Tra nhân sự ở máy chủ thay vì lọc trong danh sách sẵn có.
   *
   * Với dữ liệu thật, `employees` chỉ chứa **người đang có chỗ ngồi** — đó là
   * tất cả những gì một danh sách phân công trả về. Lọc trong đó thì không
   * bao giờ xếp được người mới vào bàn trống, tức là mất đúng thao tác hay
   * dùng nhất. Có hàm này thì ô tìm hỏi thẳng danh mục nhân sự.
   *
   * Không truyền: lọc tại chỗ như cũ, dùng cho dữ liệu minh họa.
   */
  onSearch?: (query: string) => Promise<Employee[]>
}

const active = (assignment: Assignment, now: Date) =>
  assignment.type !== 'reservation' &&
  Date.parse(assignment.validFrom) <= now.getTime() &&
  (assignment.validTo === null || Date.parse(assignment.validTo) > now.getTime())

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

/** Gõ bao nhiêu ký tự mới hỏi máy chủ. Một ký tự thì trả về gần như cả công ty. */
const MIN_REMOTE_QUERY = 2
/** Chờ ngừng gõ bao lâu. Đủ để không bắn một lượt gọi cho mỗi phím. */
const SEARCH_DEBOUNCE_MS = 250

/** Inline, searchable employee selection for assignment and reassignment. */
export function EmployeePicker({ employees, departments, seats, assignments, now, onSelect, onSearch }: EmployeePickerProps) {
  const [query, setQuery] = useState('')
  /**
   * Kết quả tra cứu **kèm chuỗi đã hỏi**. Giữ chung một chỗ để lúc vẽ chỉ cần
   * so với chuỗi hiện tại là biết kết quả còn đúng hay đã cũ — khỏi phải dọn
   * ba biến trạng thái mỗi lần người dùng gõ thêm một phím.
   */
  const [search, setSearch] = useState<{
    query: string
    employees?: readonly Employee[]
    error?: string
  } | null>(null)
  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments])
  const seatById = useMemo(() => new Map(seats.map((seat) => [seat.id, seat])), [seats])
  const currentSeatByEmployee = useMemo(() => {
    const result = new Map<string, Seat>()
    for (const assignment of assignments) {
      if (active(assignment, now)) {
        const seat = seatById.get(assignment.seatId)
        if (seat) result.set(assignment.employeeId, seat)
      }
    }
    return result
  }, [assignments, now, seatById])

  const normalizedQuery = fold(query.trim())
  const remoteQuery = onSearch && query.trim().length >= MIN_REMOTE_QUERY ? query.trim() : null
  const latestSearch = useRef(0)

  useEffect(() => {
    if (!onSearch || !remoteQuery) return
    const ticket = ++latestSearch.current
    const timer = setTimeout(() => {
      onSearch(remoteQuery)
        .then((employees) => {
          // Câu trả lời đến muộn hơn lần gõ sau thì bỏ, nếu không danh sách
          // sẽ nhảy về kết quả của chuỗi cũ.
          if (ticket === latestSearch.current) setSearch({ query: remoteQuery, employees })
        })
        .catch(() => {
          if (ticket === latestSearch.current) {
            setSearch({ query: remoteQuery, error: SEAT_ASSIGNMENT.searchFailed })
          }
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [onSearch, remoteQuery])

  const answer = search && search.query === remoteQuery ? search : null
  const searching = Boolean(remoteQuery) && answer === null
  const searchError = answer?.error ?? null
  const remote = answer?.employees ?? null

  const local = employees.filter((employee) => {
    if (!normalizedQuery) return true
    return fold(`${employee.name} ${employee.employeeCode}`).includes(normalizedQuery)
  })
  /**
   * Ở chế độ tra danh mục, kết quả lọc tại chỗ **không** được lấp vào lúc
   * chuỗi tìm còn ngắn: hai danh sách trả lời hai câu hỏi khác nhau, và hiện
   * vài người đang ngồi sẵn ra như thể đó là kết quả tìm thì người dùng tưởng
   * danh mục chỉ có ngần ấy người.
   */
  const visible = !onSearch
    ? local
    : remoteQuery
      ? (remote ?? [])
      : query.trim()
        ? []
        : local

  const empty = onSearch && !remoteQuery && query.trim().length > 0
    ? SEAT_ASSIGNMENT.searchTooShort
    : SEAT_ASSIGNMENT.noResults

  return (
    <section className="fp-di-employee-picker" aria-labelledby="fp-di-employee-picker-title">
      <h3 id="fp-di-employee-picker-title">{SEAT_ASSIGNMENT.pickerTitle}</h3>
      <input
        className="fp-di-employee-search"
        type="search"
        aria-label={SEAT_ASSIGNMENT.pickerTitle}
        placeholder={SEAT_ASSIGNMENT.searchPlaceholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {searchError && <p className="fp-di-muted" role="alert">{searchError}</p>}
      {searching && <p className="fp-di-muted" role="status">{SEAT_ASSIGNMENT.searching}</p>}
      {visible.length === 0 ? (
        <p className="fp-di-muted">{empty}</p>
      ) : (
        <ul className="fp-di-employee-results" aria-label={SEAT_ASSIGNMENT.pickerTitle}>
          {visible.map((employee) => {
            const department = employee.departmentId ? departmentById.get(employee.departmentId) : undefined
            const seat = currentSeatByEmployee.get(employee.id)
            return (
              <li key={employee.id}>
                <button type="button" onClick={() => onSelect(employee)}>
                  <span className="fp-di-employee-result-main">
                    <strong>{employee.name}</strong>
                    <span>{employee.employeeCode} · {department?.name ?? 'Chưa phân bổ'}</span>
                  </span>
                  <span className={`fp-di-employee-seat${seat ? '' : ' is-unseated'}`}>
                    {seat ? SEAT_ASSIGNMENT.currentSeat(seat.code) : SEAT_ASSIGNMENT.unseated}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
