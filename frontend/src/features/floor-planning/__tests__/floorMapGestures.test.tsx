// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { DEFAULT_SETTINGS } from '../map/mapSettings'
import { FloorMap } from '../components/FloorMap'

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

describe('FloorMap gesture coalescing and pointer isolation', () => {
  it('does not cancel active pointer drag when secondary pointer releases', () => {
    let vp = { scale: 1, x: 0, y: 0 }
    const onViewportChange = vi.fn((update: (v: typeof vp) => typeof vp) => {
      vp = update(vp)
    })
    const onSelect = vi.fn()
    const containerRef = { current: document.createElement('div') }

    const { container } = render(
      <FloorMap
        dataset={dataset}
        settings={DEFAULT_SETTINGS}
        viewport={vp}
        minFitScale={0.5}
        onViewportChange={onViewportChange}
        containerRef={containerRef}
        selected={null}
        onSelect={onSelect}
        onHover={vi.fn()}
        assetBase=""
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.fp-svg')!
    expect(svg).toBeTruthy()

    // Mock getBoundingClientRect
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 800,
      bottom: 800,
      right: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Pointer 1 down
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })

    // Secondary pointer 2 down & up (e.g. accidental multitouch or tap)
    fireEvent.pointerDown(svg, { button: 0, pointerId: 2, clientX: 500, clientY: 500 })
    fireEvent.pointerUp(svg, { button: 0, pointerId: 2, clientX: 500, clientY: 500 })

    // Secondary pointer up must NOT have triggered onSelect or cleared pointer 1 drag
    expect(onSelect).not.toHaveBeenCalled()

    // Pointer 1 moves beyond DRAG_THRESHOLD_PX (4px)
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 120, clientY: 130 })

    // Panning state is active
    expect(svg.classList.contains('is-panning')).toBe(true)

    // Secondary pointer cancel must NOT destroy pointer 1
    fireEvent.pointerCancel(svg, { pointerId: 2 })
    expect(svg.classList.contains('is-panning')).toBe(true)

    // Pointer 1 releases
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 120, clientY: 130 })
    expect(svg.classList.contains('is-panning')).toBe(false)
    // Dragged release should not select
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('coalesces rapid wheel events into single batched rAF dispatch', () => {
    let vp = { scale: 1, x: 100, y: 100 }
    const onViewportChange = vi.fn((update: (v: typeof vp) => typeof vp) => {
      vp = update(vp)
    })
    const containerRef = { current: document.createElement('div') }

    const rafCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })

    const { container } = render(
      <FloorMap
        dataset={dataset}
        settings={DEFAULT_SETTINGS}
        viewport={vp}
        minFitScale={0.5}
        onViewportChange={onViewportChange}
        containerRef={containerRef}
        selected={null}
        onSelect={vi.fn()}
        onHover={vi.fn()}
        assetBase=""
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.fp-svg')!

    // Fire 5 rapid wheel events in the same frame
    fireEvent.wheel(svg, { deltaY: -50, deltaMode: 0, clientX: 200, clientY: 200 })
    fireEvent.wheel(svg, { deltaY: -50, deltaMode: 0, clientX: 200, clientY: 200 })
    fireEvent.wheel(svg, { deltaY: -50, deltaMode: 0, clientX: 200, clientY: 200 })
    fireEvent.wheel(svg, { deltaY: -50, deltaMode: 0, clientX: 200, clientY: 200 })
    fireEvent.wheel(svg, { deltaY: -50, deltaMode: 0, clientX: 200, clientY: 200 })

    // Even though 5 wheel events fired, exactly 1 rAF was scheduled and 0 state updates dispatched so far
    expect(rafCallbacks.length).toBe(1)
    expect(onViewportChange).not.toHaveBeenCalled()

    // Flush the frame
    act(() => {
      rafCallbacks[0](1000)
    })

    // Viewport updated exactly once with the coalesced zoom factor
    expect(onViewportChange).toHaveBeenCalledTimes(1)
    expect(vp.scale).toBeGreaterThan(1)
  })

  it('handles pointer cancel gracefully without selection', () => {
    const onSelect = vi.fn()
    const containerRef = { current: document.createElement('div') }
    const vp = { scale: 1, x: 0, y: 0 }

    const { container } = render(
      <FloorMap
        dataset={dataset}
        settings={DEFAULT_SETTINGS}
        viewport={vp}
        minFitScale={0.5}
        onViewportChange={vi.fn()}
        containerRef={containerRef}
        selected={null}
        onSelect={onSelect}
        onHover={vi.fn()}
        assetBase=""
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.fp-svg')!
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 150, clientY: 150 })
    expect(svg.classList.contains('is-panning')).toBe(true)

    fireEvent.pointerCancel(svg, { pointerId: 1 })
    expect(svg.classList.contains('is-panning')).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('resets active drag and panning when window blur occurs', () => {
    const onSelect = vi.fn()
    const containerRef = { current: document.createElement('div') }
    const vp = { scale: 1, x: 0, y: 0 }

    const { container } = render(
      <FloorMap
        dataset={dataset}
        settings={DEFAULT_SETTINGS}
        viewport={vp}
        minFitScale={0.5}
        onViewportChange={vi.fn()}
        containerRef={containerRef}
        selected={null}
        onSelect={onSelect}
        onHover={vi.fn()}
        assetBase=""
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.fp-svg')!
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 150, clientY: 150 })
    expect(svg.classList.contains('is-panning')).toBe(true)

    // Window blur event fires (e.g. user Alt-Tabs or click outside window)
    fireEvent(window, new Event('blur'))
    expect(svg.classList.contains('is-panning')).toBe(false)

    // A subsequent click with a new pointer must work normally and not be blocked
    fireEvent.pointerDown(svg, { button: 0, pointerId: 2, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: 100, clientY: 100 })
    expect(onSelect).toHaveBeenCalled()
  })

  it('does not trigger onHover from secondary pointer move while primary drag is active', () => {
    const onHover = vi.fn()
    const containerRef = { current: document.createElement('div') }
    const vp = { scale: 1, x: 0, y: 0 }

    const { container } = render(
      <FloorMap
        dataset={dataset}
        settings={DEFAULT_SETTINGS}
        viewport={vp}
        minFitScale={0.5}
        onViewportChange={vi.fn()}
        containerRef={containerRef}
        selected={null}
        onSelect={vi.fn()}
        onHover={onHover}
        assetBase=""
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.fp-svg')!
    // Start dragging with pointer 1
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 150, clientY: 150 })
    expect(svg.classList.contains('is-panning')).toBe(true)

    onHover.mockClear()

    // Secondary pointer moves across the canvas
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 300, clientY: 300 })
    // Must NOT fire onHover during active drag
    expect(onHover).not.toHaveBeenCalled()
  })

  it('handles click on non-Element Text node target without dropping selection', () => {
    const onSelect = vi.fn()
    const containerRef = { current: document.createElement('div') }
    const vp = { scale: 1, x: 0, y: 0 }

    const { container } = render(
      <FloorMap
        dataset={dataset}
        settings={DEFAULT_SETTINGS}
        viewport={vp}
        minFitScale={0.5}
        onViewportChange={vi.fn()}
        containerRef={containerRef}
        selected={null}
        onSelect={onSelect}
        onHover={vi.fn()}
        assetBase=""
      />
    )

    const wsPolygon = container.querySelector<SVGPolygonElement>('.fp-ws[data-entity-id]')
    expect(wsPolygon).toBeTruthy()
    const titleEl = wsPolygon!.querySelector('title')
    expect(titleEl).toBeTruthy()
    const textNode = titleEl!.firstChild!
    expect(textNode).toBeTruthy()

    // Simulate clicking directly on the Text node child of <title>
    expect(() => {
      fireEvent.pointerDown(wsPolygon!, { button: 0, pointerId: 1, clientX: 100, clientY: 100, target: textNode })
      fireEvent.pointerUp(wsPolygon!, { pointerId: 1, clientX: 100, clientY: 100, target: textNode })
    }).not.toThrow()

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'workstation',
        id: wsPolygon!.getAttribute('data-entity-id'),
      })
    )
  })

  it('clears panning state when orphan mouse drag is superseded by new pointerDown', () => {
    const containerRef = { current: document.createElement('div') }
    const vp = { scale: 1, x: 0, y: 0 }

    const { container } = render(
      <FloorMap
        dataset={dataset}
        settings={DEFAULT_SETTINGS}
        viewport={vp}
        minFitScale={0.5}
        onViewportChange={vi.fn()}
        containerRef={containerRef}
        selected={null}
        onSelect={vi.fn()}
        onHover={vi.fn()}
        assetBase=""
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.fp-svg')!
    // Start dragging with mouse pointer 1
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', clientX: 150, clientY: 150 })
    expect(svg.classList.contains('is-panning')).toBe(true)

    // A second mouse pointerDown occurs without pointerUp (e.g. lost buttonup in OS / synthetic)
    fireEvent.pointerDown(svg, { button: 0, pointerId: 2, pointerType: 'mouse', clientX: 200, clientY: 200 })
    // Prior panning state must be cleared
    expect(svg.classList.contains('is-panning')).toBe(false)
  })

  it('prevents compound zoom factor underflow or overflow under continuous wheel bursts', () => {
    let vp = { scale: 1, x: 0, y: 0 }
    const onViewportChange = vi.fn((update: (v: typeof vp) => typeof vp) => {
      vp = update(vp)
    })
    const containerRef = { current: document.createElement('div') }

    const rafCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })

    const { container } = render(
      <FloorMap
        dataset={dataset}
        settings={DEFAULT_SETTINGS}
        viewport={vp}
        minFitScale={0.5}
        onViewportChange={onViewportChange}
        containerRef={containerRef}
        selected={null}
        onSelect={vi.fn()}
        onHover={vi.fn()}
        assetBase=""
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.fp-svg')!
    // 50 rapid zoom-out wheel events in a single frame
    for (let i = 0; i < 50; i++) {
      fireEvent.wheel(svg, { deltaY: 1000, deltaMode: 0, clientX: 500, clientY: 400 })
    }

    expect(rafCallbacks.length).toBe(1)
    act(() => {
      rafCallbacks[0](1000)
    })

    expect(Number.isFinite(vp.scale)).toBe(true)
    expect(vp.scale).toBeGreaterThan(0)
    expect(Number.isFinite(vp.x)).toBe(true)
    expect(Number.isFinite(vp.y)).toBe(true)
  })
})
