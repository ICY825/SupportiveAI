// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { SpatialWorkspace } from '../workspace/SpatialWorkspace'

let dataset: FloorDataset

beforeAll(async () => {
  dataset = await FLOORS[0].load()
  globalThis.ResizeObserver = class {
    cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
    }
    observe() {
      this.cb([{ contentRect: { width: 1200, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SpatialWorkspace gestures, pointer isolation, and blur resilience', () => {
  it('opens a department dashboard before the seating map', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SpatialWorkspace
        dataset={dataset}
        selected={null}
        onSelect={onSelect}
        onVerify={vi.fn()}
        searchSlot={null}
        startWithDepartmentPicker
      />
    )

    expect(screen.getByRole('heading', { name: 'Chọn bộ phận' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /AI & Data/ }))
    expect(container.querySelector('.sw-scene')).toBeTruthy()
  })

  it('does not cancel active pointer drag when secondary pointer down/up/cancel fires', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SpatialWorkspace
        dataset={dataset}
        selected={null}
        onSelect={onSelect}
        onVerify={vi.fn()}
        searchSlot={null}
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.sw-scene')!
    expect(svg).toBeTruthy()

    // Primary pointer 1 down
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 200, clientY: 200 })

    // Secondary pointer 2 down & up (e.g. secondary touch contact)
    fireEvent.pointerDown(svg, { button: 0, pointerId: 2, clientX: 400, clientY: 400 })
    fireEvent.pointerUp(svg, { button: 0, pointerId: 2, clientX: 400, clientY: 400 })
    expect(onSelect).not.toHaveBeenCalled()

    // Pointer 1 moves beyond 4px drag threshold
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 230, clientY: 230 })

    // Secondary pointer 2 cancel must not abort pointer 1
    fireEvent.pointerCancel(svg, { pointerId: 2 })

    // Pointer 1 releases after dragging
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 230, clientY: 230 })
    // Dragged release should not select
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('resets drag state on window blur so subsequent clicks are not blocked', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SpatialWorkspace
        dataset={dataset}
        selected={null}
        onSelect={onSelect}
        onVerify={vi.fn()}
        searchSlot={null}
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.sw-scene')!
    // Start drag with pointer 1
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 250, clientY: 250 })

    // Window blur (e.g. Alt-Tab or browser loses focus)
    fireEvent(window, new Event('blur'))

    // Next interaction with new pointer must not be blocked
    const marker = container.querySelector<SVGGElement>('.sw-furniture')!
    expect(marker).toBeTruthy()

    fireEvent.pointerDown(marker, { button: 0, pointerId: 2, clientX: 300, clientY: 300 })
    fireEvent.pointerUp(marker, { pointerId: 2, clientX: 300, clientY: 300 })
    expect(onSelect).toHaveBeenCalled()
  })

  it('coalesces rapid wheel events into single frame batches', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })

    const { container } = render(
      <SpatialWorkspace
        dataset={dataset}
        selected={null}
        onSelect={vi.fn()}
        onVerify={vi.fn()}
        searchSlot={null}
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.sw-scene')!

    // Fire 4 rapid wheel events in the same frame
    fireEvent.wheel(svg, { deltaY: -50, deltaMode: 0, clientX: 200, clientY: 200 })
    fireEvent.wheel(svg, { deltaY: -50, deltaMode: 0, clientX: 200, clientY: 200 })
    fireEvent.wheel(svg, { deltaY: -50, deltaMode: 0, clientX: 200, clientY: 200 })
    fireEvent.wheel(svg, { deltaY: -50, deltaMode: 0, clientX: 200, clientY: 200 })

    // Exactly 1 rAF scheduled
    expect(rafCallbacks.length).toBe(1)

    // Flush the frame
    act(() => {
      rafCallbacks[0](1000)
    })

    // Output zoom indicator updated
    const output = container.querySelector('output')
    expect(output).toBeTruthy()
    expect(parseInt(output?.textContent ?? '100', 10)).toBeGreaterThan(100)
  })

  it('handles click on text node target without throwing TypeError', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SpatialWorkspace
        dataset={dataset}
        selected={null}
        onSelect={onSelect}
        onVerify={vi.fn()}
        searchSlot={null}
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.sw-scene')!
    const textEl = container.querySelector<SVGTextElement>('.sw-avatar-text')
    expect(textEl).toBeTruthy()
    const textNode = textEl!.firstChild!
    expect(textNode).toBeTruthy()

    // Simulate clicking directly on the Text node child
    expect(() => {
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100, target: textNode })
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 100, clientY: 100, target: textNode })
    }).not.toThrow()

    expect(onSelect).toHaveBeenCalled()
  })

  it('cleans up pointer cancellation gracefully without selection', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SpatialWorkspace
        dataset={dataset}
        selected={null}
        onSelect={onSelect}
        onVerify={vi.fn()}
        searchSlot={null}
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.sw-scene')!
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerCancel(svg, { pointerId: 1 })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('prevents compound zoom factor underflow or overflow under continuous wheel bursts', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })

    const { container } = render(
      <SpatialWorkspace
        dataset={dataset}
        selected={null}
        onSelect={vi.fn()}
        onVerify={vi.fn()}
        searchSlot={null}
      />
    )

    const svg = container.querySelector<SVGSVGElement>('.sw-scene')!
    // 50 rapid zoom-out wheel events
    for (let i = 0; i < 50; i++) {
      fireEvent.wheel(svg, { deltaY: 1000, deltaMode: 0, clientX: 200, clientY: 200 })
    }

    expect(rafCallbacks.length).toBe(1)
    act(() => {
      rafCallbacks[0](1000)
    })

    const output = container.querySelector('output')
    expect(output).toBeTruthy()
    const zoomVal = parseInt(output?.textContent ?? '0', 10)
    expect(Number.isFinite(zoomVal)).toBe(true)
    expect(zoomVal).toBeGreaterThan(0)
  })
})
