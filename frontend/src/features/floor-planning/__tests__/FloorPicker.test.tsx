// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FloorPicker } from '../components/FloorPicker'
import { FLOORS, FLOOR_INVENTORY } from '../data/registry'

afterEach(cleanup)

const options = () => screen.getAllByRole('option') as HTMLOptionElement[]

describe('floor inventory', () => {
  it('lists every floor the company occupies, in ascending order', () => {
    expect(FLOOR_INVENTORY.map((f) => f.level)).toEqual([5, 9, 11, 16, 17, 19, 33, 34])
  })

  it('marks the two part-floors as zone B and the rest as whole plates', () => {
    const partial = FLOOR_INVENTORY.filter((f) => f.occupancy !== 'full')
    expect(partial.map((f) => [f.level, f.occupancy])).toEqual([
      [5, 'zone-b'],
      [33, 'zone-b'],
    ])
  })

  it('only claims a dataset for floors the renderer can actually draw', () => {
    const withData = FLOOR_INVENTORY.filter((f) => f.datasetId !== null)
    expect(withData.map((f) => f.datasetId)).toEqual(FLOORS.map((f) => f.id))
  })
})

describe('FloorPicker', () => {
  it('offers every floor and disables the ones without a dataset', () => {
    render(<FloorPicker inventory={FLOOR_INVENTORY} value="floor-16" onChange={vi.fn()} />)
    expect(options()).toHaveLength(FLOOR_INVENTORY.length)

    const enabled = options().filter((o) => !o.disabled)
    expect(enabled.map((o) => o.value)).toEqual(['floor-16'])
    for (const option of options().filter((o) => o.disabled)) {
      expect(option.textContent).toContain('chưa có dữ liệu')
    }
  })

  it('names the occupied wing only when the company does not hold the whole plate', () => {
    render(<FloorPicker inventory={FLOOR_INVENTORY} value="floor-16" onChange={vi.fn()} />)
    const text = (value: string) => options().find((o) => o.value === value)!.textContent ?? ''
    expect(text('floor-5')).toContain('Khu B')
    expect(text('floor-33')).toContain('Khu B')
    expect(text('floor-16')).not.toContain('Khu')
    expect(text('floor-9')).not.toContain('Khu')
  })

  it('reports the picked floor and reads the current one', () => {
    const onChange = vi.fn()
    render(<FloorPicker inventory={FLOOR_INVENTORY} value="floor-16" onChange={onChange} />)
    const select = screen.getByRole('combobox', { name: 'Chọn tầng' }) as HTMLSelectElement
    expect(select.value).toBe('floor-16')
    fireEvent.change(select, { target: { value: 'floor-16' } })
    expect(onChange).toHaveBeenCalledWith('floor-16')
  })
})
