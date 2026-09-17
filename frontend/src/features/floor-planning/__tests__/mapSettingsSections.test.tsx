// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { DEFAULT_SETTINGS } from '../map/mapSettings'
import { FloorDetailsPanel } from '../components/FloorDetailsPanel'
import { FloorMapControls } from '../components/FloorMapControls'
import { buildDeskIndex } from '../domain/desk'
import { createDemoAllocation } from '../allocation/demoAllocation'

let dataset: FloorDataset

beforeAll(async () => {
  dataset = await FLOORS[0].load()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Map Settings Sections & Details Panel Cleanup', () => {
  it('does not display OperationalData, Nguồn dữ liệu, or Chi tiết kỹ thuật in FloorDetailsPanel', () => {
    render(
      <FloorDetailsPanel
        dataset={dataset}
        baseDataset={dataset}
        selected={null}
        onSelect={vi.fn()}
        debug={false}
        issues={[]}
      />
    )

    // Ensure the 3 sections were removed from FloorDetailsPanel
    expect(screen.queryByRole('heading', { name: /Dữ liệu vận hành/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /Nguồn dữ liệu/i })).toBeNull()
    expect(screen.queryByText(/Chi tiết kỹ thuật/i)).toBeNull()
  })

  it('renders Dữ liệu vận hành, Nguồn dữ liệu, and Chi tiết kỹ thuật inside FloorMapControls', () => {
    const onChange = vi.fn()
    const now = new Date('2026-09-17T00:00:00Z')
    const allocation = createDemoAllocation(dataset, now)
    const desks = buildDeskIndex(dataset, allocation, now)

    render(
      <FloorMapControls
        settings={DEFAULT_SETTINGS}
        layers={dataset.layout.layers}
        onChange={onChange}
        dataset={dataset}
        desks={desks}
        allocationSource={allocation.source}
        selected={null}
      />
    )

    // Check headings in FloorMapControls
    expect(screen.getByRole('heading', { name: /Dữ liệu vận hành/i })).toBeDefined()
    expect(screen.getByRole('heading', { name: /Nguồn dữ liệu/i })).toBeDefined()
    expect(screen.getByText(/Chi tiết kỹ thuật/i)).toBeDefined()

    // Check data points
    expect(screen.getAllByText(/Bản vẽ gốc/i).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/Hệ tọa độ/i)).toBeDefined()
    expect(screen.getByText(/Toàn tầng/i)).toBeDefined()
  })

  it('renders placeholder operational fields in FloorMapControls when no desks are loaded', () => {
    render(
      <FloorMapControls
        settings={DEFAULT_SETTINGS}
        layers={dataset.layout.layers}
        onChange={vi.fn()}
        dataset={dataset}
        selected={null}
      />
    )

    expect(screen.getByRole('heading', { name: /Dữ liệu vận hành/i })).toBeDefined()
    expect(screen.getByText(/Chưa có dữ liệu chỗ ngồi hoặc nhân sự/i)).toBeDefined()
  })
})
