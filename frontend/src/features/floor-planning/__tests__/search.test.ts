import { beforeAll, describe, expect, it } from 'vitest'
import { createDemoAllocation } from '../allocation/demoAllocation'
import { FLOORS } from '../data/registry'
import { buildDeskIndex } from '../domain/desk'
import type { FloorDataset } from '../domain/spatial'
import { buildSearchIndex, fold, searchItems } from '../search/searchIndex'

const NOW = new Date('2026-09-15T02:50:00Z')
let ds: FloorDataset

beforeAll(async () => {
  ds = await FLOORS.find((f) => f.id === 'floor-16')!.load()
})

describe('fold', () => {
  it('drops Vietnamese diacritics and case', () => {
    expect(fold('MÔ HÌNH & NỀN TẢNG AI')).toBe('mo hinh & nen tang ai')
    expect(fold('Đặng Minh Khoa')).toBe('dang minh khoa')
  })
})

describe('verification view search', () => {
  it('finds physical entities without accents and never returns people', () => {
    const index = buildSearchIndex(ds)
    expect(searchItems(index, 'nen tang ai')[0]).toMatchObject({ kind: 'zone', title: 'MÔ HÌNH & NỀN TẢNG AI' })
    expect(searchItems(index, 'ws-16-030')[0]).toMatchObject({ kind: 'workstation', target: { kind: 'workstation', id: 'ws-16-030' } })
    expect(searchItems(index, 'may in').every((i) => i.kind === 'object')).toBe(true)
    expect(index.some((i) => i.kind === 'person' || i.kind === 'desk')).toBe(false)
  })

  it('returns nothing for an empty query and caps results', () => {
    const index = buildSearchIndex(ds)
    expect(searchItems(index, '   ')).toEqual([])
    expect(searchItems(index, 'ws', 5)).toHaveLength(5)
  })
})

describe('workspace view search', () => {
  it('finds desks by seat code and physical id, and people by name or employee code', () => {
    const desks = buildDeskIndex(ds, createDemoAllocation(ds, NOW), NOW)
    const index = buildSearchIndex(ds, desks)
    const minh = searchItems(index, 'nguyen van minh')[0]
    expect(minh).toMatchObject({ kind: 'person', target: { kind: 'workstation', id: 'ws-16-065' }, deskStatus: 'occupied' })
    expect(searchItems(index, 'VSF-0182')[0].title).toBe('Nguyễn Văn Minh')
    const code = desks.get('ws-16-065')!.seat.code
    expect(searchItems(index, code)[0]).toMatchObject({ kind: 'desk', title: code })
    expect(searchItems(index, 'ws-16-065')[0]).toMatchObject({ kind: 'desk', title: code })
    expect(searchItems(index, 'le hoang nam')[0].subtitle).toContain('Đặt trước bàn')
    // a given name outranks the same word used as a middle name
    const byGivenName = searchItems(index, 'minh', 50).map((i) => i.title)
    expect(byGivenName.indexOf('Nguyễn Văn Minh')).toBeGreaterThanOrEqual(0)
    expect(byGivenName.indexOf('Nguyễn Văn Minh')).toBeLessThan(byGivenName.indexOf('Đặng Minh Khoa'))
  })
})
