// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../data/registry'
import type { SpatialPlacement } from '../domain/placement'
import type { FloorDataset } from '../domain/spatial'
import { clearSessionLayouts, type LayoutStore } from '../workspace/layoutDraft'
import { SpatialWorkspace } from '../workspace/SpatialWorkspace'

let dataset: FloorDataset
/** A desk in the middle of a cluster, so a short drag lands on its neighbour. */
const DESK = 'ws-16-065'

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

/** rAF is deferred so a gesture can be flushed one frame at a time. */
let frames: FrameRequestCallback[]

beforeEach(() => {
  frames = []
  clearSessionLayouts()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(cb)
    return frames.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const flush = () =>
  act(() => {
    const pending = frames
    frames = []
    for (const cb of pending) cb(performance.now())
  })

function setup(store?: LayoutStore) {
  const onSelect = vi.fn()
  const view = render(
    <Harness store={store} onSelect={onSelect} />,
  )
  return { ...view, onSelect }
}

/** Mirrors how the page drives the component: selection is owned upstream. */
function Harness({ store, onSelect }: { store?: LayoutStore; onSelect: (ref: unknown) => void }) {
  const [selected, setSelected] = useStateSelection(onSelect)
  return (
    <SpatialWorkspace
      dataset={dataset}
      selected={selected}
      onSelect={setSelected}
      onVerify={vi.fn()}
      searchSlot={null}
      settingsOpen={false}
      onCloseSettings={vi.fn()}
      layoutStore={store}
    />
  )
}

import { useCallback, useState } from 'react'
import type { EntityRef } from '../domain/spatial'

function useStateSelection(onSelect: (ref: unknown) => void) {
  const [selected, setSelected] = useState<EntityRef | null>(null)
  const set = useCallback(
    (ref: EntityRef | null) => {
      onSelect(ref)
      setSelected(ref)
    },
    [onSelect],
  )
  return [selected, set] as const
}

const scene = (container: HTMLElement) => container.querySelector<SVGSVGElement>('.sw-scene')!
const content = (container: HTMLElement) => container.querySelector<SVGGElement>('.sw-scene-content')!
const deskTop = (container: HTMLElement, id = DESK) =>
  [...container.querySelectorAll(`.sw-furniture[data-workstation-id="${id}"] .sw-desktop polygon`)]
    .map((p) => p.getAttribute('points'))
    .join('|')
const deskNode = (container: HTMLElement, id = DESK) =>
  container.querySelector<SVGGElement>(`.sw-furniture[data-workstation-id="${id}"]`)!

const saveButton = () => screen.getByRole('button', { name: /Lưu bố trí|Đang lưu/ }) as HTMLButtonElement
const enterEdit = () => fireEvent.click(screen.getByRole('radio', { name: 'Chỉnh sửa bố trí' }))
const leaveEdit = () => fireEvent.click(screen.getByRole('radio', { name: 'Xem mặt bằng' }))

function clickDesk(container: HTMLElement, id = DESK) {
  const node = deskNode(container, id)
  fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 400, clientY: 400 })
  fireEvent.pointerUp(node, { pointerId: 1, clientX: 400, clientY: 400 })
}

/** Deterministic, valid edit: one grid cell along the floor's -Y axis. */
function nudgeUp(container: HTMLElement) {
  clickDesk(container)
  fireEvent.keyDown(scene(container), { key: 'ArrowUp' })
}

function dragBy(container: HTMLElement, from: Element, dx: number, dy: number) {
  const svg = scene(container)
  fireEvent.pointerDown(from, { button: 0, pointerId: 1, clientX: 400, clientY: 400 })
  fireEvent.pointerMove(svg, { pointerId: 1, clientX: 400 + dx, clientY: 400 + dy })
  flush()
  fireEvent.pointerUp(svg, { pointerId: 1, clientX: 400 + dx, clientY: 400 + dy })
  flush()
}

describe('view mode is unchanged by the editor', () => {
  it('starts in view mode with no grid, no boundary and no selection box', () => {
    const { container } = setup()
    expect(screen.getByRole('radio', { name: 'Xem mặt bằng' })).toHaveProperty('ariaChecked', 'true')
    expect(container.querySelector('.sw-edit-grid')).toBeNull()
    expect(container.querySelector('.sw-edit-boundary')).toBeNull()
    expect(container.querySelector('.sw-edit-layer')).toBeNull()
  })

  it('still selects a desk on click and pans on drag, and never moves a desk', () => {
    const { container, onSelect } = setup()
    const before = deskTop(container)

    clickDesk(container)
    expect(onSelect).toHaveBeenCalledWith({ kind: 'workstation', id: DESK })

    // dragging the same desk pans the map in view mode
    dragBy(container, deskNode(container), 60, 0)
    expect(content(container).getAttribute('transform')).not.toMatch(/^translate\(0 0\)/)
    expect(deskTop(container)).toBe(before)
  })
})

describe('edit mode', () => {
  it('shows the grid and the editable-area outline only while editing', () => {
    const { container } = setup()
    enterEdit()
    expect(container.querySelectorAll('.sw-edit-grid circle').length).toBeGreaterThan(50)
    expect(container.querySelector('.sw-edit-boundary')).not.toBeNull()
    leaveEdit()
    expect(container.querySelector('.sw-edit-grid')).toBeNull()
  })

  it('moves the dragged workstation and does not pan the map', () => {
    const { container } = setup()
    enterEdit()
    const before = deskTop(container)

    dragBy(container, deskNode(container), 90, 0)

    expect(deskTop(container)).not.toBe(before)
    expect(content(container).getAttribute('transform')).toMatch(/^translate\(0 0\)/)
  })

  it('still pans when the drag starts on empty canvas', () => {
    const { container } = setup()
    enterEdit()
    const before = deskTop(container)

    dragBy(container, scene(container), 70, 0)

    expect(content(container).getAttribute('transform')).not.toMatch(/^translate\(0 0\)/)
    expect(deskTop(container)).toBe(before)
  })

  it('snaps the dragged placement onto the grid', () => {
    const { container } = setup()
    enterEdit()
    dragBy(container, deskNode(container), 90, 0)
    dragBy(container, deskNode(container), 3, 2) // sub-cell wiggle
    const afterSmall = deskTop(container)
    dragBy(container, deskNode(container), 4, 1)
    expect(deskTop(container)).toBe(afterSmall)
  })

  it('names the desk it collides with, blocks Save, and clears once it moves away', () => {
    const { container } = setup()
    enterEdit()
    clickDesk(container)

    // one cell right puts it through the neighbour that shares its long edge
    fireEvent.keyDown(scene(container), { key: 'ArrowRight' })
    const status = () => container.querySelector('.sw-edit-inspector .sw-placement-status')!
    expect(status().getAttribute('data-valid')).toBe('false')
    expect(status().textContent).toContain('Chồng lấn bàn 066')
    expect(container.querySelector('.sw-edit-invalid')).not.toBeNull()
    expect(saveButton()).toHaveProperty('disabled', true)

    fireEvent.keyDown(scene(container), { key: 'ArrowLeft' })
    expect(status().getAttribute('data-valid')).toBe('true')
    expect(status().textContent).toContain('Vị trí hợp lệ')
    expect(container.querySelector('.sw-edit-invalid')).toBeNull()
    expect(saveButton()).toHaveProperty('disabled', false)
  })

  it('refuses a placement pushed outside the editable area', () => {
    const { container } = setup()
    enterEdit()
    clickDesk(container)
    for (let i = 0; i < 4; i++) fireEvent.keyDown(scene(container), { key: 'ArrowUp' })
    const status = container.querySelector('.sw-edit-inspector .sw-placement-status')!
    expect(status.getAttribute('data-valid')).toBe('false')
    expect(status.textContent).toContain('Ngoài phạm vi bố trí')
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('rotates the selected desk by a quarter turn with R and with the button', () => {
    const { container } = setup()
    enterEdit()
    clickDesk(container)

    const angle = () => within(container.querySelector<HTMLElement>('.sw-edit-inspector')!).getByText(/^\d+°$/).textContent
    expect(angle()).toBe('0°')
    fireEvent.keyDown(scene(container), { key: 'r' })
    expect(angle()).toBe('90°')
    fireEvent.click(container.querySelector<HTMLButtonElement>('.sw-edit-rotate')!)
    expect(angle()).toBe('180°')
  })

  it('nudges the selected desk one grid cell per arrow press', () => {
    const { container } = setup()
    enterEdit()
    clickDesk(container)

    const before = deskTop(container)
    fireEvent.keyDown(scene(container), { key: 'ArrowRight' })
    const once = deskTop(container)
    expect(once).not.toBe(before)
    fireEvent.keyDown(scene(container), { key: 'ArrowLeft' })
    expect(deskTop(container)).not.toBe(once)
  })

  it('abandons only the gesture on Escape while dragging, keeping the edit session', () => {
    const { container } = setup()
    enterEdit()
    const before = deskTop(container)

    const svg = scene(container)
    fireEvent.pointerDown(deskNode(container), { button: 0, pointerId: 1, clientX: 400, clientY: 400 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 490, clientY: 400 })
    flush()
    expect(deskTop(container)).not.toBe(before)

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(deskTop(container)).toBe(before)
    expect(screen.getByRole('radio', { name: 'Chỉnh sửa bố trí' })).toHaveProperty('ariaChecked', 'true')
  })
})

describe('draft, save and cancel', () => {
  it('disables Save until something changes', () => {
    setup()
    enterEdit()
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('Cancel restores the original placement exactly', () => {
    const { container } = setup()
    const original = deskTop(container)
    enterEdit()
    nudgeUp(container)
    expect(deskTop(container)).not.toBe(original)

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(deskTop(container)).toBe(original)
    expect(screen.getByRole('radio', { name: 'Xem mặt bằng' })).toHaveProperty('ariaChecked', 'true')
  })

  it('asks before leaving edit mode with unsaved changes, and keeps the draft on "stay"', () => {
    const { container } = setup()
    enterEdit()
    dragBy(container, deskNode(container), 90, 0)
    const moved = deskTop(container)

    leaveEdit()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }))
    expect(deskTop(container)).toBe(moved)
    expect(screen.getByRole('radio', { name: 'Chỉnh sửa bố trí' })).toHaveProperty('ariaChecked', 'true')
  })

  it('Save commits the draft to the store and returns to view mode', async () => {
    const written: Array<[string, Record<string, SpatialPlacement>]> = []
    const store: LayoutStore = {
      read: () => null,
      write: async (floorId, placements) => {
        written.push([floorId, placements])
      },
    }
    const { container } = setup(store)
    const original = deskTop(container)
    enterEdit()
    // one cell up, into the free strip above the cluster: a change Save accepts
    nudgeUp(container)
    const moved = deskTop(container)

    const save = screen.getByRole('button', { name: 'Lưu bố trí' })
    expect(save).toHaveProperty('disabled', false)
    await act(async () => {
      fireEvent.click(save)
    })

    expect(written).toHaveLength(1)
    expect(written[0][0]).toBe('floor-16')
    expect(written[0][1][DESK]).not.toEqual(expect.objectContaining({ x: expect.any(Number), y: NaN }))
    // committed, not reverted
    expect(deskTop(container)).toBe(moved)
    expect(deskTop(container)).not.toBe(original)
    expect(screen.getByRole('radio', { name: 'Xem mặt bằng' })).toHaveProperty('ariaChecked', 'true')
  })

  it('restores a previously saved layout when the workspace is remounted', async () => {
    const { container, unmount } = setup()
    const original = deskTop(container)
    enterEdit()
    nudgeUp(container)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lưu bố trí' }))
    })
    const saved = deskTop(container)
    unmount()

    const again = setup()
    expect(deskTop(again.container)).toBe(saved)
    expect(deskTop(again.container)).not.toBe(original)
  })
})
