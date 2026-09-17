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
const enterEdit = (areaOption = 1) => {
  const picker = screen.getByRole('combobox', { name: 'Tập trung khu vực' }) as HTMLSelectElement
  fireEvent.change(picker, { target: { value: picker.options[areaOption].value } })
  fireEvent.click(screen.getByRole('button', { name: /Chỉnh sửa bố trí/ }))
}
/** Hủy is the only way out of edit mode; it confirms when there is work to lose. */
const leaveEdit = () => fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))
const inViewMode = () => screen.queryAllByRole('button', { name: /Chỉnh sửa bố trí/ }).length === 1

function clickDesk(container: HTMLElement, id = DESK) {
  const node = deskNode(container, id)
  fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 400, clientY: 400 })
  fireEvent.pointerUp(node, { pointerId: 1, clientX: 400, clientY: 400 })
}

/** Deterministic, valid edit: one grid cell along the floor's -Y axis. */
function nudgeUp(container: HTMLElement) {
  clickDesk(container)
  fireEvent.keyDown(scene(container), { key: 'ArrowLeft' })
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
    expect(inViewMode()).toBe(true)
    // one segmented control on the page, and it is not this one
    expect(screen.queryByRole('radiogroup', { name: 'Chế độ bố trí' })).toBeNull()
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
    // back at the authoritative position, so there is nothing left to commit
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('refuses a placement pushed outside the editable area', () => {
    const { container } = setup()
    enterEdit()
    clickDesk(container)
    for (let i = 0; i < 4; i++) fireEvent.keyDown(scene(container), { key: 'ArrowUp' })
    const status = container.querySelector('.sw-edit-inspector .sw-placement-status')!
    expect(status.getAttribute('data-valid')).toBe('false')
    expect(status.textContent).toMatch(/Ngoài phạm vi/i)
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
    // the snap lattice is anchored on this desk's own original corner, so the
    // way back is always reachable — moving away must never be one-way
    fireEvent.keyDown(scene(container), { key: 'ArrowLeft' })
    expect(deskTop(container)).toBe(before)
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('returns a desk to its original position from several cells away', () => {
    const { container } = setup()
    enterEdit()
    const before = deskTop(container)
    clickDesk(container)
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
      fireEvent.keyDown(scene(container), { key })
    }
    expect(deskTop(container)).not.toBe(before)

    fireEvent.click(container.querySelector<HTMLButtonElement>('.sw-edit-reset')!)
    expect(deskTop(container)).toBe(before)
    expect(container.querySelector('.sw-edit-reset')).toBeNull()
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('returns a dragged desk to its original position, which a drag alone can reach', () => {
    const { container } = setup()
    enterEdit()
    const before = deskTop(container)
    dragBy(container, deskNode(container), 90, 20)
    expect(deskTop(container)).not.toBe(before)

    fireEvent.click(container.querySelector<HTMLButtonElement>('.sw-edit-reset')!)
    expect(deskTop(container)).toBe(before)
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
    expect(inViewMode()).toBe(false)
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

    // discarding real work asks first
    leaveEdit()
    fireEvent.click(screen.getByRole('button', { name: 'Hủy thay đổi' }))
    expect(deskTop(container)).toBe(original)
    expect(inViewMode()).toBe(true)
  })

  it('leaves edit mode without asking when nothing has changed', () => {
    const { container } = setup()
    enterEdit()
    leaveEdit()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(inViewMode()).toBe(true)
    expect(container.querySelector('.sw-edit-grid')).toBeNull()
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
    expect(inViewMode()).toBe(false)
    expect(saveButton()).toBeTruthy()
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
    // one cell left, into open space: a change Save accepts
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
    expect(inViewMode()).toBe(true)
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

describe('undo and redo', () => {
  const undoButton = () => screen.getByRole('button', { name: 'Hoàn tác' }) as HTMLButtonElement
  const redoButton = () => screen.getByRole('button', { name: 'Làm lại' }) as HTMLButtonElement
  const undoKey = () => act(() => { fireEvent.keyDown(window, { key: 'z', ctrlKey: true }) })
  const redoKey = () => act(() => { fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true }) })

  it('offers nothing to undo on a fresh session', () => {
    setup()
    enterEdit()
    expect(undoButton()).toHaveProperty('disabled', true)
    expect(redoButton()).toHaveProperty('disabled', true)
  })

  it('steps back and forward through nudges one gesture at a time', () => {
    const { container } = setup()
    enterEdit()
    clickDesk(container)
    const start = deskTop(container)

    fireEvent.keyDown(scene(container), { key: 'ArrowRight' })
    const one = deskTop(container)
    fireEvent.keyDown(scene(container), { key: 'ArrowUp' })
    const two = deskTop(container)
    expect(new Set([start, one, two]).size).toBe(3)

    undoKey()
    expect(deskTop(container)).toBe(one)
    undoKey()
    expect(deskTop(container)).toBe(start)
    expect(undoButton()).toHaveProperty('disabled', true)
    expect(saveButton()).toHaveProperty('disabled', true)

    redoKey()
    expect(deskTop(container)).toBe(one)
    redoKey()
    expect(deskTop(container)).toBe(two)
    expect(redoButton()).toHaveProperty('disabled', true)
  })

  it('treats a whole drag as one step, and a press that never moved as none', () => {
    const { container } = setup()
    enterEdit()
    const start = deskTop(container)

    dragBy(container, deskNode(container), 90, 20)
    const dragged = deskTop(container)
    expect(dragged).not.toBe(start)

    // a plain click must not become an undoable step
    clickDesk(container)
    expect(undoButton()).toHaveProperty('disabled', false)

    fireEvent.click(undoButton())
    expect(deskTop(container)).toBe(start)
    expect(undoButton()).toHaveProperty('disabled', true)
  })

  it('undoes a rotation', () => {
    const { container } = setup()
    enterEdit()
    clickDesk(container)
    const angle = () => within(container.querySelector<HTMLElement>('.sw-edit-inspector')!).getByText(/^\d+°$/).textContent

    fireEvent.keyDown(scene(container), { key: 'r' })
    expect(angle()).toBe('90°')
    undoKey()
    expect(angle()).toBe('0°')
  })

  it('drops the redo branch once a new change is made', () => {
    const { container } = setup()
    enterEdit()
    clickDesk(container)
    fireEvent.keyDown(scene(container), { key: 'ArrowRight' })
    undoKey()
    expect(redoButton()).toHaveProperty('disabled', false)

    fireEvent.keyDown(scene(container), { key: 'ArrowUp' })
    expect(redoButton()).toHaveProperty('disabled', true)
  })

  it('starts each edit session with an empty history', () => {
    const { container } = setup()
    enterEdit()
    clickDesk(container)
    fireEvent.keyDown(scene(container), { key: 'ArrowRight' })
    leaveEdit()
    fireEvent.click(screen.getByRole('button', { name: 'Hủy thay đổi' }))

    enterEdit()
    expect(undoButton()).toHaveProperty('disabled', true)
    expect(redoButton()).toHaveProperty('disabled', true)
  })
})

describe('Milestone 3: Visual Affordances & Dual Conflict Highlighting', () => {
  it('hides door clearances in view mode and displays them as dashed outlines in edit mode', () => {
    const { container } = setup()
    expect(inViewMode()).toBe(true)
    expect(container.querySelector('.sw-edit-clearance')).toBeNull()

    enterEdit(3)
    const clearances = container.querySelectorAll('.sw-edit-clearance')
    expect(clearances.length).toBeGreaterThan(0)
    for (const clr of clearances) {
      expect(clr.getAttribute('points')).toBeTruthy()
    }

    leaveEdit()
    expect(container.querySelector('.sw-edit-clearance')).toBeNull()
  })

  it('highlights both workstation and column obstacle on collision, disables Save, and shows Vietnamese explanation', () => {
    const { container } = setup()
    enterEdit()
    // Select desk ws-16-067 adjacent to column col-16-13
    clickDesk(container, 'ws-16-067')
    // One grid cell right (+X) enters canonical column col-16-13.
    fireEvent.keyDown(scene(container), { key: 'ArrowRight' })

    const status = container.querySelector('.sw-edit-inspector .sw-placement-status')!
    expect(status.getAttribute('data-valid')).toBe('false')
    expect(status.textContent).toMatch(/Va chạm.*cột/i)

    // Dual conflict highlighting: both workstation and column obstacle are highlighted
    expect(container.querySelector('.sw-edit-invalid')).not.toBeNull()
    const conflictObstacle = container.querySelector('.sw-edit-obstacle-conflict[data-obstacle-id="col-16-13"]')
    expect(conflictObstacle).not.toBeNull()
    expect(conflictObstacle?.getAttribute('data-obstacle-kind')).toBe('column')

    // Save button is disabled
    expect(saveButton().disabled).toBe(true)

    // Moving back clears dual highlight and restores the unchanged baseline.
    fireEvent.keyDown(scene(container), { key: 'ArrowLeft' })
    expect(status.getAttribute('data-valid')).toBe('true')
    expect(container.querySelector('.sw-edit-obstacle-conflict')).toBeNull()
    expect(saveButton().disabled).toBe(true)
  })

  it('allows desk placed against northern perimeter wall with chair facing inside, recognized as 100% valid with Save enabled', async () => {
    const written: Array<[string, Record<string, SpatialPlacement>]> = []
    const store: LayoutStore = {
      read: () => null,
      write: async (floorId, placements) => {
        written.push([floorId, placements])
      },
    }
    const { container } = setup(store)
    enterEdit()
    clickDesk(container, 'ws-16-065')
    // Rotate 270° so the chair clears neighbouring extracted desks.
    fireEvent.keyDown(scene(container), { key: 'r' })
    fireEvent.keyDown(scene(container), { key: 'r' })
    fireEvent.keyDown(scene(container), { key: 'r' })
    // One grid cell north remains inside the canonical department polygon.
    fireEvent.keyDown(scene(container), { key: 'ArrowUp' })

    const status = container.querySelector('.sw-edit-inspector .sw-placement-status')!
    expect(status.getAttribute('data-valid')).toBe('true')
    expect(status.textContent).toContain('Vị trí hợp lệ')
    expect(container.querySelector('.sw-edit-invalid')).toBeNull()

    // Save button is enabled
    const save = saveButton()
    expect(save.disabled).toBe(false)

    await act(async () => {
      fireEvent.click(save)
    })
    expect(written).toHaveLength(1)
    expect(written[0][1]['ws-16-065']).toBeDefined()
  })
})
