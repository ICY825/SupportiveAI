// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { DEFAULT_SETTINGS } from '../map/mapSettings'
import { FloorMap } from '../components/FloorMap'
import { FloorDetailsPanel } from '../components/FloorDetailsPanel'

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
  localStorage.clear()
})

describe('Department Management and PDF-style Label Repositioning', () => {
  describe('FloorMap PDF-style label drag and drop', () => {
    it('renders zone labels with interactive affordances and triggers onZoneUpdate on drag', () => {
      const onZoneUpdate = vi.fn()
      const onSelect = vi.fn()
      const vp = { scale: 1, x: 0, y: 0 }

      const { container } = render(
        <FloorMap
          dataset={dataset}
          settings={DEFAULT_SETTINGS}
          viewport={vp}
          minFitScale={0.5}
          onViewportChange={vi.fn()}
          containerRef={{ current: document.createElement('div') }}
          selected={{ kind: 'zone', id: 'zone-16-vinfast-kdo2o' }}
          onSelect={onSelect}
          onHover={vi.fn()}
          assetBase=""
          onZoneUpdate={onZoneUpdate}
        />
      )

      const svg = container.querySelector<SVGSVGElement>('.fp-svg')!
      expect(svg).toBeTruthy()
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 1000,
        height: 800,
        right: 1000,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      // Find the label group for VINFAST-KDO2O
      const labelGroup = container.querySelector<SVGGElement>('[data-entity-id="zone-16-vinfast-kdo2o"][data-zone-label="true"]')
      expect(labelGroup).toBeTruthy()

      // When selected, selection handle dot is rendered
      const handle = labelGroup?.querySelector('.fp-zone-label-handle')
      expect(handle).toBeTruthy()

      // Pointer down on the label to start dragging
      fireEvent.pointerDown(labelGroup!, { pointerId: 1, clientX: 174, clientY: 210, button: 0 })

      // Drag by +50px X, +30px Y
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 224, clientY: 240 })

      // Release pointer
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 224, clientY: 240 })

      expect(onZoneUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          zoneId: 'zone-16-vinfast-kdo2o',
          labelAnchor: [224.1, 240.4],
        })
      )
    })

    it('clicking on a zone label selects the zone without dragging', () => {
      const onSelect = vi.fn()
      const onZoneUpdate = vi.fn()
      const vp = { scale: 1, x: 0, y: 0 }

      const { container } = render(
        <FloorMap
          dataset={dataset}
          settings={DEFAULT_SETTINGS}
          viewport={vp}
          minFitScale={0.5}
          onViewportChange={vi.fn()}
          containerRef={{ current: document.createElement('div') }}
          selected={null}
          onSelect={onSelect}
          onHover={vi.fn()}
          assetBase=""
          onZoneUpdate={onZoneUpdate}
        />
      )

      const svg = container.querySelector<SVGSVGElement>('.fp-svg')!
      const labelGroup = container.querySelector<SVGGElement>('[data-entity-id="zone-16-kd-vh-gsm"][data-zone-label="true"]')
      expect(labelGroup).toBeTruthy()

      // Pointer down and up at same spot (no drag movement)
      fireEvent.pointerDown(labelGroup!, { pointerId: 2, clientX: 683, clientY: 184, button: 0 })
      fireEvent.pointerUp(svg, { pointerId: 2, clientX: 683, clientY: 184 })

      expect(onSelect).toHaveBeenCalledWith({ kind: 'zone', id: 'zone-16-kd-vh-gsm' })
      expect(onZoneUpdate).not.toHaveBeenCalled()
    })
  })

  describe('FloorDetailsPanel department editing & assignment', () => {
    it('allows renaming a department and saving the updated name', () => {
      const onZoneUpdate = vi.fn()
      const zoneId = 'zone-16-vinfast-kdo2o'

      render(
        <FloorDetailsPanel
          dataset={dataset}
          baseDataset={dataset}
          selected={{ kind: 'zone', id: zoneId }}
          onSelect={vi.fn()}
          debug={false}
          issues={[]}
          onZoneUpdate={onZoneUpdate}
        />
      )

      expect(screen.getByText('Đã gán phòng ban')).toBeTruthy()
      const renameBtn = screen.getByRole('button', { name: /Đổi tên phòng ban/i })
      fireEvent.click(renameBtn)

      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('VINFAST-KDO2O')

      fireEvent.change(input, { target: { value: 'VINFAST GLOBAL R&D' } })
      const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i })
      fireEvent.click(saveBtn)

      expect(onZoneUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          zoneId,
          name: 'VINFAST GLOBAL R&D',
          verification: 'SOURCE_VERIFIED',
          type: 'WORKSPACE_ZONE',
        })
      )
    })

    it('allows assigning a department name to an unlabeled zone', () => {
      const onZoneUpdate = vi.fn()
      const zoneId = 'zone-16-unlabeled-01'

      render(
        <FloorDetailsPanel
          dataset={dataset}
          baseDataset={dataset}
          selected={{ kind: 'zone', id: zoneId }}
          onSelect={vi.fn()}
          debug={false}
          issues={[]}
          onZoneUpdate={onZoneUpdate}
        />
      )

      expect(screen.getByText('Chưa có phòng ban')).toBeTruthy()
      const assignBtn = screen.getByRole('button', { name: /Gán tên phòng ban/i })
      fireEvent.click(assignBtn)

      // Enter department name into input
      const input = screen.getByRole('textbox') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Phòng Tài chính Kế toán' } })

      const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i })
      fireEvent.click(saveBtn)

      expect(onZoneUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          zoneId,
          name: 'Phòng Tài chính Kế toán',
          verification: 'SOURCE_VERIFIED',
          type: 'WORKSPACE_ZONE',
        })
      )
    })

    it('allows unassigning / removing a department name', () => {
      const onZoneUpdate = vi.fn()
      const zoneId = 'zone-16-vinfast-kdo2o'

      render(
        <FloorDetailsPanel
          dataset={dataset}
          baseDataset={dataset}
          selected={{ kind: 'zone', id: zoneId }}
          onSelect={vi.fn()}
          debug={false}
          issues={[]}
          onZoneUpdate={onZoneUpdate}
        />
      )

      const removeBtn = screen.getByRole('button', { name: /Xóa phòng ban/i })
      fireEvent.click(removeBtn)

      expect(onZoneUpdate).toHaveBeenCalledWith({
        zoneId,
        name: null,
        verification: 'UNKNOWN',
        type: 'UNKNOWN',
        sourceColor: null,
      })
    })

    it('allows centering label and nudging label coordinates from inspector', () => {
      const onZoneUpdate = vi.fn()
      const zoneId = 'zone-16-vinfast-kdo2o'

      render(
        <FloorDetailsPanel
          dataset={dataset}
          baseDataset={dataset}
          selected={{ kind: 'zone', id: zoneId }}
          onSelect={vi.fn()}
          debug={false}
          issues={[]}
          onZoneUpdate={onZoneUpdate}
        />
      )

      // Click Right nudge button
      const rightBtn = screen.getByRole('button', { name: /Phải →/i })
      fireEvent.click(rightBtn)

      expect(onZoneUpdate).toHaveBeenCalledWith({
        zoneId,
        labelAnchor: [184.1, 210.4],
      })

      // Click Center button
      const centerBtn = screen.getByRole('button', { name: /Căn giữa khu vực/i })
      fireEvent.click(centerBtn)

      expect(onZoneUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          zoneId,
          labelAnchor: expect.any(Array),
        })
      )
    })
  })
})
