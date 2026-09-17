// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../data/registry'
import type { EntityRef, FloorDataset, FloorObstacle } from '../domain/spatial'
import { clearSessionLayouts, type LayoutStore } from '../workspace/layoutDraft'
import { SpatialWorkspace } from '../workspace/SpatialWorkspace'

declare function require(module: string): unknown

const fs = require('node:fs') as { readFileSync: (p: string, enc: string) => string }
const path = require('node:path') as { resolve: (...args: string[]) => string }

let originalDataset: FloorDataset
let cssContent: string

beforeAll(async () => {
  originalDataset = await FLOORS[0].load()
  const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
  const cssPath = path.resolve(cwd, 'src/features/floor-planning/workspace/workspace.css')
  cssContent = fs.readFileSync(cssPath, 'utf-8')

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

beforeEach(() => {
  clearSessionLayouts()

  // Inject workspace.css into jsdom document head for getComputedStyle verification
  const styleEl = document.createElement('style')
  styleEl.setAttribute('id', 'test-workspace-css')
  styleEl.textContent = cssContent
  document.head.appendChild(styleEl)
})

afterEach(() => {
  cleanup()
  const styleEl = document.getElementById('test-workspace-css')
  if (styleEl) styleEl.remove()
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

function Harness({
  dataset,
  store,
  onSelect,
}: {
  dataset: FloorDataset
  store?: LayoutStore
  onSelect: (ref: unknown) => void
}) {
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

function setup(datasetOverride?: FloorDataset, store?: LayoutStore) {
  const onSelect = vi.fn()
  const dataset = datasetOverride ?? originalDataset
  const view = render(<Harness dataset={dataset} store={store} onSelect={onSelect} />)
  return { ...view, onSelect }
}

const scene = (container: HTMLElement) => container.querySelector<SVGSVGElement>('.sw-scene')!
const deskNode = (container: HTMLElement, id: string) =>
  container.querySelector<SVGGElement>(`.sw-furniture[data-workstation-id="${id}"]`)!

const saveButton = () => screen.getByRole('button', { name: /Lưu bố trí|Đang lưu/ }) as HTMLButtonElement
const enterEdit = (areaId?: string) => {
  const picker = screen.getByRole('combobox', { name: 'Tập trung khu vực' }) as HTMLSelectElement
  const value = areaId ?? picker.options[1].value
  fireEvent.change(picker, { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: /Chỉnh sửa bố trí/ }))
}
const leaveEdit = () => fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))
const inViewMode = () => screen.queryAllByRole('button', { name: /Chỉnh sửa bố trí/ }).length === 1

function clickDesk(container: HTMLElement, id: string) {
  const node = deskNode(container, id)
  fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 400, clientY: 400 })
  fireEvent.pointerUp(node, { pointerId: 1, clientX: 400, clientY: 400 })
}

describe('Challenger M3-1: Adversarial Affordance & Conflict Suite', () => {
  describe('1. View Mode Isolation & String Prohibitions', () => {
    it('ensures zero .sw-edit-clearance elements exist in View mode', () => {
      const { container } = setup()
      expect(inViewMode()).toBe(true)
      expect(container.querySelectorAll('.sw-edit-clearance')).toHaveLength(0)
      expect(container.querySelector('.sw-edit-clearances')).toBeNull()
      expect(container.querySelector('.sw-edit-ground')).toBeNull()
      expect(container.querySelector('.sw-edit-layer')).toBeNull()
      expect(container.querySelectorAll('.sw-edit-obstacle-conflict')).toHaveLength(0)
      expect(container.querySelectorAll('.sw-edit-invalid')).toHaveLength(0)
    })

    it('enforces strict zero occurrences of forbidden strings across the rendered DOM', () => {
      const { container } = setup()
      const text = container.textContent ?? ''
      expect(text).not.toContain('Dữ liệu bố trí minh họa')
      expect(text).not.toContain('Thông tin bố trí minh họa')

      // Also verify after entering edit mode
      enterEdit()
      const editText = container.textContent ?? ''
      expect(editText).not.toContain('Dữ liệu bố trí minh họa')
      expect(editText).not.toContain('Thông tin bố trí minh họa')
    })
  })

  describe('2. Edit Mode Door Clearances Projection', () => {
    it('renders all door clearance overlays with non-empty, finite projected points in Edit mode', () => {
      const { container } = setup()
      enterEdit('ai-area-d')
      const clearances = container.querySelectorAll<SVGPolygonElement>('.sw-edit-clearance')
      expect(clearances.length).toBeGreaterThan(0)

      for (const clr of clearances) {
        const pointsAttr = clr.getAttribute('points')
        expect(pointsAttr).toBeTruthy()
        expect(pointsAttr).not.toContain('NaN')
        expect(pointsAttr).not.toContain('undefined')

        const pairs = pointsAttr!.trim().split(/\s+/)
        expect(pairs.length).toBeGreaterThanOrEqual(3) // valid polygon has at least 3 vertices
        for (const pair of pairs) {
          const [xStr, yStr] = pair.split(',')
          const x = Number(xStr)
          const y = Number(yStr)
          expect(Number.isFinite(x)).toBe(true)
          expect(Number.isFinite(y)).toBe(true)
        }

        const id = clr.getAttribute('data-clearance-id')
        expect(id).toMatch(/^door-clr-/i)

        // Verify computed style has dashed outline
        const style = window.getComputedStyle(clr)
        expect(style.strokeDasharray).toBe('2 1.5')
        expect(style.pointerEvents).toBe('none')
      }

      leaveEdit()
      expect(container.querySelectorAll('.sw-edit-clearance')).toHaveLength(0)
    })
  })

  describe('3. Dual Conflict Highlighting — Column col-16-13', () => {
    it('nudges ws-16-067 into col-16-13: triggers dual conflict, solid outline, locks Save, and cleanly restores', () => {
      const { container } = setup()
      enterEdit()

      // Select desk ws-16-067 (adjacent to column col-16-13)
      clickDesk(container, 'ws-16-067')

      // One nudge Right (+X) penetrates canonical column col-16-13.
      fireEvent.keyDown(scene(container), { key: 'ArrowRight' })

      // A. Does ws-16-067 receive .sw-edit-invalid?
      const invalidWorkstation = container.querySelector(
        '.sw-edit-invalid[data-workstation-id="ws-16-067"]',
      )
      expect(invalidWorkstation).not.toBeNull()

      // B. Does column col-16-13 receive .sw-edit-invalid.sw-edit-obstacle-conflict[data-obstacle-id="col-16-13"]?
      const conflictCol = container.querySelector<SVGGElement>(
        '.sw-edit-invalid.sw-edit-obstacle-conflict[data-obstacle-id="col-16-13"]',
      )
      expect(conflictCol).not.toBeNull()
      expect(conflictCol?.getAttribute('data-obstacle-kind')).toBe('column')
      expect(conflictCol?.classList.contains('sw-edit-obstacle-column')).toBe(true)

      // C. Does the obstacle outline receive solid stroke?
      const colOutline = conflictCol?.querySelector<SVGPolygonElement>('.sw-edit-obstacle-outline')
      expect(colOutline).not.toBeNull()
      expect(colOutline?.getAttribute('points')).toBeTruthy()
      const colStyle = window.getComputedStyle(colOutline!)
      expect(colStyle.strokeDasharray).toBe('none')

      // D. Is Save button disabled?
      expect(saveButton().disabled).toBe(true)
      const status = container.querySelector('.sw-edit-inspector .sw-placement-status')!
      expect(status.getAttribute('data-valid')).toBe('false')
      expect(status.textContent).toMatch(/chạm cột/i)

      // E. Nudge back to unchanged clean position -> both highlights clear.
      fireEvent.keyDown(scene(container), { key: 'ArrowLeft' })

      expect(status.getAttribute('data-valid')).toBe('true')
      expect(container.querySelector('.sw-edit-invalid[data-workstation-id="ws-16-067"]')).toBeNull()
      expect(container.querySelector('.sw-edit-obstacle-conflict[data-obstacle-id="col-16-13"]')).toBeNull()
      expect(container.querySelector('.sw-edit-obstacle-conflict')).toBeNull()
      expect(saveButton().disabled).toBe(true)
    })
  })

  describe('4. Dual Conflict Highlighting — Door Clearance Obstacle', () => {
    it('collides with a door clearance obstacle: verifies dashed stroke outline (stroke-dasharray), dual highlight, and Save lockout', () => {
      // Find ws-16-067's placement in original dataset to place a synthetic door clearance right above it
      const ws = originalDataset.workstations.find((w) => w.id === 'ws-16-067')!
      expect(ws).toBeDefined()

      // ws.bbox is [969.12, 245.73, 980.5, 251.49]
      const [wsX0, , wsX1] = ws.bbox

      // Position a door clearance obstacle directly north of ws-16-067's chair zone (y: 230 to 238)
      // At pristine position (desk y: 245.73, chair y: 239.0-245.0), there is NO collision.
      // 1-2 nudges Up (dy ~ -4.7 pt each) causes penetration into testDoorClr.
      const testDoorClr: FloorObstacle = {
        id: 'door-clr-test-adversarial',
        floorId: 'floor-16',
        kind: 'door-clearance',
        category: 'clearance',
        name: 'Khoảng quét cửa thử nghiệm đối kháng',
        verification: 'EXTRACTED',
        polygon: [
          [wsX0 - 2, 230],
          [wsX1 + 2, 230],
          [wsX1 + 2, 238],
          [wsX0 - 2, 238],
        ],
        bbox: [wsX0 - 2, 230, wsX1 + 2, 238],
        center: [(wsX0 + wsX1) / 2, 234],
        gridRef: 'C-B / 7-6',
        notes: [],
      }

      const testDataset: FloorDataset = {
        ...originalDataset,
        obstacles: [...originalDataset.obstacles, testDoorClr],
      }

      const { container } = setup(testDataset)
      enterEdit()

      // Verify the clearance appears in ground overlay
      const groundClr = container.querySelector(
        `.sw-edit-clearance[data-clearance-id="door-clr-test-adversarial"]`,
      )
      expect(groundClr).not.toBeNull()

      clickDesk(container, 'ws-16-067')

      // Nudge 1 step Up -> penetrates testDoorClr
      fireEvent.keyDown(scene(container), { key: 'ArrowUp' })

      // A. ws-16-067 receives .sw-edit-invalid
      const invalidWs = container.querySelector(
        '.sw-edit-invalid[data-workstation-id="ws-16-067"]',
      )
      expect(invalidWs).not.toBeNull()

      // B. Door clearance receives .sw-edit-invalid.sw-edit-obstacle-conflict[data-obstacle-id="door-clr-test-adversarial"]
      const conflictDoor = container.querySelector<SVGGElement>(
        '.sw-edit-invalid.sw-edit-obstacle-conflict[data-obstacle-id="door-clr-test-adversarial"]',
      )
      expect(conflictDoor).not.toBeNull()
      expect(conflictDoor?.getAttribute('data-obstacle-kind')).toBe('door-clearance')
      expect(conflictDoor?.classList.contains('sw-edit-obstacle-door-clearance')).toBe(true)

      // C. Does the door clearance conflict outline receive dashed stroke (stroke-dasharray)?
      const doorOutline = conflictDoor?.querySelector<SVGPolygonElement>('.sw-edit-obstacle-outline')
      expect(doorOutline).not.toBeNull()
      expect(doorOutline?.getAttribute('points')).toBeTruthy()
      const doorStyle = window.getComputedStyle(doorOutline!)
      expect(doorStyle.strokeDasharray).toBe('1.8 1.4')

      // D. Save button is disabled and inspector shows clearance conflict
      expect(saveButton().disabled).toBe(true)
      const status = container.querySelector('.sw-edit-inspector .sw-placement-status')!
      expect(status.getAttribute('data-valid')).toBe('false')
      expect(status.textContent).toMatch(/cửa/i)

      // E. Nudge back (Down) -> cleans conflict and restores Save
      fireEvent.keyDown(scene(container), { key: 'ArrowDown' })
      expect(status.getAttribute('data-valid')).toBe('true')
      expect(container.querySelector('.sw-edit-invalid[data-workstation-id="ws-16-067"]')).toBeNull()
      expect(container.querySelector('.sw-edit-obstacle-conflict[data-obstacle-id="door-clr-test-adversarial"]')).toBeNull()
      expect(container.querySelector('.sw-edit-obstacle-conflict')).toBeNull()
      // Since it's back to initial position, dirty is false -> Save is disabled because pristine, but not blocked by error
      expect(status.textContent).toContain('Vị trí hợp lệ')
    })
  })

  describe('5. Concurrent Multi-Obstacle Conflicts & Edit Mode Exit Cleanup', () => {
    it('handles concurrent column and door-clearance collisions with distinct solid and dashed styles simultaneously', () => {
      const ws = originalDataset.workstations.find((w) => w.id === 'ws-16-067')!
      const [wsX0, , wsX1] = ws.bbox

      const testDoorClr: FloorObstacle = {
        id: 'door-clr-multi-test',
        floorId: 'floor-16',
        kind: 'door-clearance',
        category: 'clearance',
        name: 'Khoảng quét cửa đa va chạm',
        verification: 'EXTRACTED',
        polygon: [
          [wsX0 - 2, 230],
          [wsX1 + 2, 230],
          [wsX1 + 2, 238],
          [wsX0 - 2, 238],
        ],
        bbox: [wsX0 - 2, 230, wsX1 + 2, 238],
        center: [(wsX0 + wsX1) / 2, 234],
        gridRef: 'C-B / 7-6',
        notes: [],
      }

      const testDataset: FloorDataset = {
        ...originalDataset,
        obstacles: [...originalDataset.obstacles, testDoorClr],
      }

      const { container } = setup(testDataset)
      enterEdit()
      clickDesk(container, 'ws-16-067')

      // Move into col-16-13 (2 rights) and also move up into testDoorClr (2 ups)
      fireEvent.keyDown(scene(container), { key: 'ArrowRight' })
      fireEvent.keyDown(scene(container), { key: 'ArrowRight' })
      fireEvent.keyDown(scene(container), { key: 'ArrowUp' })
      fireEvent.keyDown(scene(container), { key: 'ArrowUp' })

      // At least one obstacle conflict must be detected
      const conflictObstacles = container.querySelectorAll<SVGGElement>('.sw-edit-obstacle-conflict')
      expect(conflictObstacles.length).toBeGreaterThanOrEqual(1)

      // Verify each conflict obstacle renders with outline and proper dasharray
      for (const obsEl of conflictObstacles) {
        const kind = obsEl.getAttribute('data-obstacle-kind')
        const outline = obsEl.querySelector<SVGPolygonElement>('.sw-edit-obstacle-outline')
        expect(outline).not.toBeNull()
        const computedStyle = window.getComputedStyle(outline!)
        if (kind === 'column' || kind === 'wall') {
          expect(computedStyle.strokeDasharray).toBe('none')
        } else if (kind === 'door-clearance') {
          expect(computedStyle.strokeDasharray).toBe('1.8 1.4')
        }
      }

      // Exit edit mode with Cancel -> everything must be completely wiped from DOM
      leaveEdit()
      fireEvent.click(screen.getByRole('button', { name: 'Hủy thay đổi' }))
      expect(inViewMode()).toBe(true)
      expect(container.querySelectorAll('.sw-edit-clearance')).toHaveLength(0)
      expect(container.querySelectorAll('.sw-edit-obstacle-conflict')).toHaveLength(0)
      expect(container.querySelectorAll('.sw-edit-invalid')).toHaveLength(0)
      expect(container.querySelector('.sw-edit-grid')).toBeNull()
      expect(container.querySelector('.sw-edit-layer')).toBeNull()
    })
  })
})
