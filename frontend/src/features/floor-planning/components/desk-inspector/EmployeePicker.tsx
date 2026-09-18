import { useMemo, useState } from 'react'
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
}

const active = (assignment: Assignment, now: Date) =>
  assignment.type !== 'reservation' &&
  Date.parse(assignment.validFrom) <= now.getTime() &&
  (assignment.validTo === null || Date.parse(assignment.validTo) > now.getTime())

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

/** Inline, searchable employee selection for assignment and reassignment. */
export function EmployeePicker({ employees, departments, seats, assignments, now, onSelect }: EmployeePickerProps) {
  const [query, setQuery] = useState('')
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
  const visible = employees.filter((employee) => {
    if (!normalizedQuery) return true
    return fold(`${employee.name} ${employee.employeeCode}`).includes(normalizedQuery)
  })

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
      {visible.length === 0 ? (
        <p className="fp-di-muted">{SEAT_ASSIGNMENT.noResults}</p>
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
