// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../data/registry'
import {
  obstacleIntersects,
  placementBounds,
  validatePlacement,
  type SpatialPlacement,
} from '../domain/placement'
import type { EntityRef, FloorDataset } from '../domain/spatial'
import { LAYOUT_EDIT } from '../labels'
import {
  basePlacements,
  clearSessionLayouts,
  deriveEditableArea,
  type LayoutStore,
} from '../workspace/layoutDraft'
import { buildWorkspaceScene } from '../workspace/scene'
import { SpatialWorkspace } from '../workspace/SpatialWorkspace'
import { useLayoutEditor } from '../workspace/useLayoutEditor'

let dataset: FloorDataset
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

function Harness({ store, onSelect }: { store?: LayoutStore; onSelect: (ref: unknown) => void }) {
  const [selected, setSelected] = useStateSelection(onSelect)
  return (
    <SpatialWorkspace
      dataset={dataset}
      selected={selected}
      onSelect={setSelected}
      onVerify={vi.fn()}
      searchSlot={null}
      layoutStore={store}
    />
  )
}

function setup(store?: LayoutStore) {
  const onSelect = vi.fn()
  const view = render(<Harness store={store} onSelect={onSelect} />)
  return { ...view, onSelect }
}

const scene = (container: HTMLElement) => container.querySelector<SVGSVGElement>('.sw-scene')!
const deskNode = (container: HTMLElement, id = DESK) =>
  container.querySelector<SVGGElement>(`.sw-furniture[data-workstation-id="${id}"]`)!

const saveButton = () => screen.getByRole('button', { name: /Lưu bố trí|Đang lưu/ }) as HTMLButtonElement
const enterEdit = () => {
  const picker = screen.getByRole('combobox', { name: 'Tập trung khu vực' }) as HTMLSelectElement
  fireEvent.change(picker, { target: { value: picker.options[1].value } })
  fireEvent.click(screen.getByRole('button', { name: /Chỉnh sửa bố trí/ }))
}
const inViewMode = () => screen.queryAllByRole('button', { name: /Chỉnh sửa bố trí/ }).length === 1

function clickDesk(container: HTMLElement, id = DESK) {
  const node = deskNode(container, id)
  fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 400, clientY: 400 })
  fireEvent.pointerUp(node, { pointerId: 1, clientX: 400, clientY: 400 })
}

describe('Challenger M3-2-2: Perimeter Wall & Live Validation Adversarial Suite', () => {
  describe('Task 1: Northern Perimeter Wall Edge Case', () => {
    it('moves a rotated desk toward the canonical northern boundary while remaining valid and saves', async () => {
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

      // Rotate 270° so the chair clears the neighbouring extracted desks.
      fireEvent.keyDown(scene(container), { key: 'r' })
      fireEvent.keyDown(scene(container), { key: 'r' })
      fireEvent.keyDown(scene(container), { key: 'r' })

      // One grid step remains inside the extracted polygon. A second step is
      // outside the canonical annotation and is no longer admitted by a
      // crop-specific boundary correction.
      fireEvent.keyDown(scene(container), { key: 'ArrowUp' })

      const status = container.querySelector('.sw-edit-inspector .sw-placement-status')!
      expect(status.getAttribute('data-valid')).toBe('true')
      expect(status.textContent).toContain('Vị trí hợp lệ')
      expect(container.querySelector('.sw-edit-invalid')).toBeNull()

      // Save button is enabled
      const saveBtn = saveButton()
      expect(saveBtn.disabled).toBe(false)
      expect(saveBtn.title).toBe('')

      // Click save and verify persistence
      await act(async () => {
        fireEvent.click(saveBtn)
      })

      expect(written).toHaveLength(1)
      expect(written[0][0]).toBe('floor-16')
      const savedPlacement = written[0][1]['ws-16-065']
      expect(savedPlacement).toBeDefined()
      // Bounds check: one canonical 600 mm grid step north.
      const [minX, minY, maxX, maxY] = placementBounds(savedPlacement)
      expect(minY).toBeCloseTo(240.05, 1)
      expect(maxY).toBeGreaterThan(minY)
      expect(maxX).toBeGreaterThan(minX)

      // Successfully returned to view mode
      expect(inViewMode()).toBe(true)
    })

    it('adversarially rejects desk when chair faces outward into the northern wall', () => {
      const { container } = setup()
      enterEdit()
      clickDesk(container, 'ws-16-065')

      // Do NOT rotate: chair faces NORTH towards perimeter wall
      // Nudge 2 grid steps north
      fireEvent.keyDown(scene(container), { key: 'ArrowUp' })
      fireEvent.keyDown(scene(container), { key: 'ArrowUp' })

      const status = container.querySelector('.sw-edit-inspector .sw-placement-status')!
      // Outward facing chair penetrates northern wall boundary
      expect(status.getAttribute('data-valid')).toBe('false')
      expect(status.textContent).toMatch(/Ngoài phạm vi|ghế/i)
      expect(saveButton().disabled).toBe(true)
    })

    it('adversarially rejects desk pushed past CAD wall (4 grid steps north, y < 232.0)', () => {
      const { container } = setup()
      enterEdit()
      clickDesk(container, 'ws-16-065')

      // Rotate 180°
      fireEvent.keyDown(scene(container), { key: 'r' })
      fireEvent.keyDown(scene(container), { key: 'r' })

      // Nudge 4 grid steps north into the CAD wall exterior
      for (let i = 0; i < 4; i++) {
        fireEvent.keyDown(scene(container), { key: 'ArrowUp' })
      }

      const status = container.querySelector('.sw-edit-inspector .sw-placement-status')!
      expect(status.getAttribute('data-valid')).toBe('false')
      expect(status.textContent).toMatch(/Ngoài phạm vi/i)
      expect(saveButton().disabled).toBe(true)
    })
  })

  describe('Task 2: Live Validation in useLayoutEditor & Zero-Gap Flush Obstacle', () => {
    it('live validation immediately reports valid: false and disables Save when desk moves outside zone', () => {
      const focus = dataset.clusters.find((cluster) => cluster.id === 'cluster-16-13')!
      const baseScene = buildWorkspaceScene(dataset, { kind: 'bbox', bbox: focus.bbox })
      const base = basePlacements(baseScene.workstations)
      const area = deriveEditableArea(dataset, baseScene)
      const dummyStore: LayoutStore = { read: () => null, write: async () => {} }

      const { result } = renderHook(() =>
        useLayoutEditor({
          floorId: 'floor-16',
          basePlacements: base,
          area,
          store: dummyStore,
        }),
      )

      act(() => {
        result.current.enterEdit()
      })

      expect(result.current.mode).toBe('edit')
      expect(result.current.valid).toBe(true)
      expect(result.current.dirty).toBe(false)

      // Nudge 6 grid steps north outside the editable area boundary
      act(() => {
        result.current.nudge(DESK, [0, -6])
      })

      expect(result.current.dirty).toBe(true)
      expect(result.current.valid).toBe(false)
      const val = result.current.validation.get(DESK)
      expect(val).toBeDefined()
      expect(val?.valid).toBe(false)
      expect(val?.reasons.some((r) => r.type.startsWith('outside-'))).toBe(true)

      // Moving back 6 steps immediately restores valid: true
      act(() => {
        result.current.nudge(DESK, [0, 6])
      })

      expect(result.current.valid).toBe(true)
      expect(result.current.validation.get(DESK)?.valid).toBe(true)
    })

    it('evaluates flush contact with column (0 mm gap) as valid: true', () => {
      // Find a real column obstacle in dataset
      const col = dataset.obstacles.find((o) => o.kind === 'column')!
      expect(col).toBeDefined()
      const [, colY0, colX1, colY1] = col.bbox

      // Construct a test desk placement sitting exactly flush against the east face of the column (0 mm gap)
      const deskWidth = 11.2 // standard ~1200 mm desk in pt
      const deskDepth = 5.6  // standard ~600 mm desk in pt
      const flushPlacement: SpatialPlacement = {
        entityId: 'ws-test-flush',
        x: colX1 + deskWidth / 2, // Left edge of desk is exactly at colX1 (0 mm gap)
        y: (colY0 + colY1) / 2,
        width: deskWidth,
        depth: deskDepth,
        rotation: 0,
        chair: null,
      }

      const flushBounds = placementBounds(flushPlacement)
      // Confirm mathematical edge equality: desk left edge == column right edge
      expect(flushBounds[0]).toBeCloseTo(colX1, 8)

      // 1. Domain obstacle collision check: obstacleIntersects must return false for flush contact
      const touches = obstacleIntersects(flushBounds, col, 0.001)
      expect(touches).toBe(false)

      // 2. Multi-layer placement validator: validatePlacement must return valid: true
      const validation = validatePlacement(flushPlacement, {
        others: [],
        obstacles: [col],
      })
      expect(validation.valid).toBe(true)
      expect(validation.reasons).toHaveLength(0)

      // 3. Adversarial counter-check: penetrating column by 0.1 pt must fail with obstacle-collision
      const penetratingPlacement: SpatialPlacement = {
        ...flushPlacement,
        x: flushPlacement.x - 0.1, // shifts left, penetrating column by 0.1 pt
      }
      const penBounds = placementBounds(penetratingPlacement)
      expect(obstacleIntersects(penBounds, col, 0.001)).toBe(true)

      const penValidation = validatePlacement(penetratingPlacement, {
        others: [],
        obstacles: [col],
      })
      expect(penValidation.valid).toBe(false)
      expect(penValidation.reasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'obstacle-collision',
            obstacleId: col.id,
            obstacleKind: 'column',
          }),
        ]),
      )
    })
  })

  describe('Task 3: Save Button Enforcement & Tooltip Summary', () => {
    it('enforces Save button disabled when unchanged (!dirty)', () => {
      const { container } = setup()
      enterEdit()
      const saveBtn = saveButton()
      expect(saveBtn.disabled).toBe(true)

      // Toolbar state displays no change
      const stateEl = container.querySelector('.sw-edit-state')!
      expect(stateEl.textContent).toBe(LAYOUT_EDIT.noChange)
    })

    it('enforces Save button disabled with tooltip summary when invalid (!valid)', () => {
      const { container } = setup()
      enterEdit()
      clickDesk(container)

      // A. Overlap neighbouring desk: BOTH desks become invalid (count = 2)
      fireEvent.keyDown(scene(container), { key: 'ArrowRight' })
      let saveBtn = saveButton()
      expect(saveBtn.disabled).toBe(true)
      expect(saveBtn.title).toBe(LAYOUT_EDIT.invalidSummary(2))
      expect(saveBtn.title).toBe('2 bàn chưa hợp lệ')

      let stateEl = container.querySelector('.sw-edit-state')!
      expect(stateEl.getAttribute('data-blocked')).toBe('invalid')
      expect(stateEl.textContent).toBe(LAYOUT_EDIT.invalidSummary(2))

      // Move back to valid position
      fireEvent.keyDown(scene(container), { key: 'ArrowLeft' })
      expect(saveBtn.disabled).toBe(true) // unchanged from baseline

      // B. Push outside boundary (4 steps up): only THIS desk is outside (count = 1)
      for (let i = 0; i < 4; i++) {
        fireEvent.keyDown(scene(container), { key: 'ArrowUp' })
      }
      saveBtn = saveButton()
      expect(saveBtn.disabled).toBe(true)
      expect(saveBtn.title).toBe(LAYOUT_EDIT.invalidSummary(1))
      expect(saveBtn.title).toBe('1 bàn chưa hợp lệ')

      stateEl = container.querySelector('.sw-edit-state')!
      expect(stateEl.getAttribute('data-blocked')).toBe('invalid')
      expect(stateEl.textContent).toBe(LAYOUT_EDIT.invalidSummary(1))
    })

    it('enforces Save button enabled when changed and valid (dirty && valid)', () => {
      const { container } = setup()
      enterEdit()
      clickDesk(container)

      // Move 1 step left into open space: valid and dirty
      fireEvent.keyDown(scene(container), { key: 'ArrowLeft' })

      const saveBtn = saveButton()
      expect(saveBtn.disabled).toBe(false)
      expect(saveBtn.title).toBe('')

      const stateEl = container.querySelector('.sw-edit-state')!
      expect(stateEl.getAttribute('data-blocked')).toBeNull()
      expect(stateEl.textContent).toBe(LAYOUT_EDIT.changed(1))
    })

    it('enforces Save button disabled during active saving state', async () => {
      let resolveSave!: () => void
      const slowSavePromise = new Promise<void>((resolve) => {
        resolveSave = resolve
      })

      const slowStore: LayoutStore = {
        read: () => null,
        write: () => slowSavePromise,
      }

      const { container } = setup(slowStore)
      enterEdit()
      clickDesk(container)
      fireEvent.keyDown(scene(container), { key: 'ArrowLeft' })

      const saveBtn = saveButton()
      expect(saveBtn.disabled).toBe(false)

      // Trigger Save click (which initiates async write)
      let saveTask: Promise<void>
      act(() => {
        saveTask = (async () => {
          fireEvent.click(saveBtn)
        })()
      })

      // While saving is pending: button shows 'Đang lưu...' and is disabled
      expect(saveBtn.textContent).toBe(LAYOUT_EDIT.saving)
      expect(saveBtn.disabled).toBe(true)

      // Resolve async write and await completion
      await act(async () => {
        resolveSave()
        await saveTask
      })

      // Exited to view mode
      expect(inViewMode()).toBe(true)
    })
  })

  describe('Critical Directive: Forbidden Vietnamese strings check', () => {
    it('verifies 0 occurrences of forbidden strings in rendered workspace in view and edit modes', () => {
      const { container } = setup()
      const viewText = container.textContent ?? ''
      expect(viewText).not.toContain('Dữ liệu bố trí minh họa')
      expect(viewText).not.toContain('Thông tin bố trí minh họa')

      enterEdit()
      const editText = container.textContent ?? ''
      expect(editText).not.toContain('Dữ liệu bố trí minh họa')
      expect(editText).not.toContain('Thông tin bố trí minh họa')
    })
  })
})
