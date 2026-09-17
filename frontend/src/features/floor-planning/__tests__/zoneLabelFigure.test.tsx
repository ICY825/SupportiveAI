// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FloorMap } from '../components/FloorMap'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { contentBounds } from '../map/contentBounds'
import { DEFAULT_SETTINGS } from '../map/mapSettings'

/**
 * The figure the CAD author wrote after a department name — `(145)` on the AI
 * zone — is a superseded capacity total, confirmed as such by Facilities. It
 * stays in the dataset as provenance and on the zone's source row, but it is
 * not drawn beside the department name on the verification map.
 */

let dataset: FloorDataset

beforeAll(async () => {
  dataset = await FLOORS[0].load()
  globalThis.ResizeObserver = class {
    cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
    }
    observe() {
      this.cb([{ contentRect: { width: 1000, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderMap = () =>
  render(
    <FloorMap
      dataset={dataset}
      settings={DEFAULT_SETTINGS}
      viewport={{ scale: 1, x: 0, y: 0 }}
      minFitScale={0.5}
      onViewportChange={vi.fn()}
      containerRef={{ current: document.createElement('div') }}
      selected={null}
      onSelect={vi.fn()}
      onHover={vi.fn()}
      assetBase=""
    />,
  )

describe('zone labels on the verification map', () => {
  it('names the department without the drawing figure', () => {
    const { container } = renderMap()
    const labels = [...container.querySelectorAll('.fp-zone-label')].map((node) => node.textContent)

    expect(labels).toContain('MÔ HÌNH & NỀN TẢNG AI')
    expect(labels).toContain('BẤT ĐỘNG SẢN - SMART CITY')
    for (const label of labels) expect(label).not.toMatch(/\(\d+\)/)
  })

  it('keeps the figure in the dataset, where the source row reads it', () => {
    const zone = dataset.zones.find((z) => z.id === 'zone-16-ai-platform')!
    expect(zone.sourceLabel).toBe('MÔ HÌNH & NỀN TẢNG AI (145)')
    expect(zone.sourceLabelFigure).toBe(145)
  })

  it('measures the label it actually draws', () => {
    // A reservation computed from the longer "name (figure)" string would no
    // longer bound the drawn label, so the two must move together.
    const { container } = renderMap()
    const drawn = [...container.querySelectorAll('.fp-zone-label')].map((node) => node.textContent ?? '')
    const longest = Math.max(...drawn.map((text) => text.length))
    const withFigures = Math.max(
      ...dataset.zones.map((z) => ((z.name ?? '') + (z.sourceLabelFigure !== null ? ` (${z.sourceLabelFigure})` : '')).length),
    )

    expect(longest).toBeLessThan(withFigures)
    expect(contentBounds(dataset)).toHaveLength(4)
  })
})
