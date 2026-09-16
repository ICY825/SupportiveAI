// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlacementValidation, SpatialPlacement } from '../domain/placement'
import { LAYOUT_EDIT } from '../labels'
import { EditInspector, EditToolbar, EnterEditButton, PlacementStatus, UnsavedChangesDialog } from '../workspace/EditPanel'
import type { EditableArea } from '../workspace/layoutDraft'

afterEach(() => {
  cleanup()
})

describe('PlacementStatus component', () => {
  const codeOf = (id: string) => (id === 'ws-16-065' ? '065' : id === 'ws-16-066' ? '066' : id)

  it('renders valid state with checkmark and Vietnamese valid message', () => {
    const { container } = render(<PlacementStatus validation={{ valid: true, reasons: [] }} codeOf={codeOf} />)
    const p = container.querySelector('.sw-placement-status')!
    expect(p.getAttribute('data-valid')).toBe('true')
    expect(p.textContent).toContain('✓')
    expect(p.textContent).toContain(LAYOUT_EDIT.valid)
  })

  it('renders undefined validation as valid', () => {
    const { container } = render(<PlacementStatus validation={undefined} codeOf={codeOf} />)
    const p = container.querySelector('.sw-placement-status')!
    expect(p.getAttribute('data-valid')).toBe('true')
    expect(p.textContent).toContain(LAYOUT_EDIT.valid)
  })

  it('renders obstacle collision with warning glyph and localized message', () => {
    const validation: PlacementValidation = {
      valid: false,
      reasons: [{ type: 'obstacle-collision', obstacleId: 'col-16-13', obstacleKind: 'column', obstacleName: 'Cột bê tông (>A / 7-6)' }],
    }
    const { container } = render(<PlacementStatus validation={validation} codeOf={codeOf} />)
    const p = container.querySelector('.sw-placement-status')!
    expect(p.getAttribute('data-valid')).toBe('false')
    expect(p.textContent).toContain('⚠')
    expect(p.textContent).toContain('Va chạm (Cột bê tông (>A / 7-6))')
  })

  it('renders door clearance conflict with warning glyph and localized message', () => {
    const validation: PlacementValidation = {
      valid: false,
      reasons: [{ type: 'clearance-conflict', obstacleId: 'door-clr-16-54', obstacleKind: 'door-clearance', obstacleName: 'Cửa thoát hiểm D54' }],
    }
    const { container } = render(<PlacementStatus validation={validation} codeOf={codeOf} />)
    const p = container.querySelector('.sw-placement-status')!
    expect(p.getAttribute('data-valid')).toBe('false')
    expect(p.textContent).toContain('Xung đột khoảng mở cửa (Cửa thoát hiểm D54)')
  })

  it('renders multiple reasons joined by middle dot separator', () => {
    const validation: PlacementValidation = {
      valid: false,
      reasons: [
        { type: 'overlap', entityId: 'ws-16-066' },
        { type: 'obstacle-collision', obstacleId: 'col-16-13', obstacleKind: 'column' },
      ],
    }
    const { container } = render(<PlacementStatus validation={validation} codeOf={codeOf} />)
    const p = container.querySelector('.sw-placement-status')!
    expect(p.textContent).toContain('Chồng lấn bàn 066 · Va chạm cột kết cấu')
  })

  it('renders chair-specific obstacle collision and clearance conflict', () => {
    const validation: PlacementValidation = {
      valid: false,
      reasons: [
        { type: 'obstacle-collision', obstacleId: 'col-16-13', obstacleKind: 'column', target: 'chair' },
        { type: 'clearance-conflict', obstacleId: 'door-1', obstacleKind: 'door-clearance', target: 'chair' },
      ],
    }
    const { container } = render(<PlacementStatus validation={validation} codeOf={codeOf} />)
    const p = container.querySelector('.sw-placement-status')!
    expect(p.textContent).toContain('Không gian ghế va chạm cột kết cấu · Không gian ghế xung đột khoảng mở cửa')
  })
})

describe('EditToolbar component', () => {
  const defaultToolbarProps = {
    canUndo: false,
    canRedo: false,
    undoHint: 'Ctrl+Z',
    redoHint: 'Ctrl+Y',
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  }

  it('disables Save when unchanged (!dirty)', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(
      <EditToolbar
        dirty={false}
        valid={true}
        saving={false}
        changedCount={0}
        invalidCount={0}
        onCancel={onCancel}
        onSave={onSave}
        {...defaultToolbarProps}
      />,
    )
    const saveBtn = screen.getByRole('button', { name: LAYOUT_EDIT.save }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
    expect(screen.getByText(LAYOUT_EDIT.noChange)).toBeTruthy()
  })

  it('disables Save and displays warning summary when invalid (!valid)', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    const { container } = render(
      <EditToolbar
        dirty={true}
        valid={false}
        saving={false}
        changedCount={1}
        invalidCount={2}
        onCancel={onCancel}
        onSave={onSave}
        {...defaultToolbarProps}
      />,
    )
    const saveBtn = screen.getByRole('button', { name: LAYOUT_EDIT.save }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
    expect(saveBtn.getAttribute('title')).toBe(LAYOUT_EDIT.invalidSummary(2))
    const state = container.querySelector('.sw-edit-state')!
    expect(state.getAttribute('data-blocked')).toBe('invalid')
    expect(state.textContent).toBe(LAYOUT_EDIT.invalidSummary(2))
  })

  it('disables Save and shows saving text while saving', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(
      <EditToolbar
        dirty={true}
        valid={true}
        saving={true}
        changedCount={1}
        invalidCount={0}
        onCancel={onCancel}
        onSave={onSave}
        {...defaultToolbarProps}
      />,
    )
    const saveBtn = screen.getByRole('button', { name: LAYOUT_EDIT.saving }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
  })

  it('enables Save when dirty, valid, and not saving, calling onSave on click', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(
      <EditToolbar
        dirty={true}
        valid={true}
        saving={false}
        changedCount={3}
        invalidCount={0}
        onCancel={onCancel}
        onSave={onSave}
        {...defaultToolbarProps}
      />,
    )
    const saveBtn = screen.getByRole('button', { name: LAYOUT_EDIT.save }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(false)
    expect(screen.getByText(LAYOUT_EDIT.changed(3))).toBeTruthy()
    fireEvent.click(saveBtn)
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('calls onCancel on Cancel button click', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(
      <EditToolbar
        dirty={true}
        valid={true}
        saving={false}
        changedCount={1}
        invalidCount={0}
        onCancel={onCancel}
        onSave={onSave}
        {...defaultToolbarProps}
      />,
    )
    const cancelBtn = screen.getByRole('button', { name: LAYOUT_EDIT.cancel })
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('EditInspector component', () => {
  const dummyPlacement: SpatialPlacement = {
    entityId: 'ws-16-065',
    x: 950,
    y: 250,
    width: 11.3,
    depth: 5.7,
    rotation: 90,
  }
  const dummyArea: EditableArea = {
    boundary: {
      polygon: [
        [900, 225],
        [1000, 225],
        [1000, 300],
        [900, 300],
      ],
      bbox: [900, 225, 1000, 300],
      kind: 'zone-annotation',
      sourceId: null,
      name: null,
    },
    obstacles: [],
    grid: { origin: [900, 225], cellSize: 5.67 },
    tolerance: 0.25,
  }

  it('renders desk code, rotation, coordinates in metres, and placement status', () => {
    const onRotate = vi.fn()
    const onReset = vi.fn()
    render(
      <EditInspector
        code="065"
        placement={dummyPlacement}
        validation={{ valid: true, reasons: [] }}
        area={dummyArea}
        mmPerPt={100}
        moved={false}
        codeOf={(id) => id}
        onRotate={onRotate}
        onReset={onReset}
      />,
    )
    expect(screen.getByText('065')).toBeTruthy()
    expect(screen.getByText('90°')).toBeTruthy()
    expect(screen.getByText(LAYOUT_EDIT.valid)).toBeTruthy()
    expect(screen.queryByRole('button', { name: new RegExp(LAYOUT_EDIT.reset) })).toBeNull()
  })

  it('renders Reset button when moved is true and handles click', () => {
    const onRotate = vi.fn()
    const onReset = vi.fn()
    render(
      <EditInspector
        code="065"
        placement={dummyPlacement}
        validation={{ valid: true, reasons: [] }}
        area={dummyArea}
        mmPerPt={100}
        moved={true}
        codeOf={(id) => id}
        onRotate={onRotate}
        onReset={onReset}
      />,
    )
    const resetBtn = screen.getByRole('button', { name: new RegExp(LAYOUT_EDIT.reset) })
    expect(resetBtn).toBeTruthy()
    fireEvent.click(resetBtn)
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('calls onRotate when rotate button is clicked', () => {
    const onRotate = vi.fn()
    const onReset = vi.fn()
    render(
      <EditInspector
        code="065"
        placement={dummyPlacement}
        validation={{ valid: true, reasons: [] }}
        area={dummyArea}
        mmPerPt={100}
        moved={false}
        codeOf={(id) => id}
        onRotate={onRotate}
        onReset={onReset}
      />,
    )
    const rotateBtn = screen.getByRole('button', { name: new RegExp(LAYOUT_EDIT.rotate) })
    fireEvent.click(rotateBtn)
    expect(onRotate).toHaveBeenCalledOnce()
  })
})

describe('UnsavedChangesDialog component', () => {
  it('renders confirmation dialog with discard and stay options', () => {
    const onStay = vi.fn()
    const onDiscard = vi.fn()
    render(<UnsavedChangesDialog onStay={onStay} onDiscard={onDiscard} />)

    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText(LAYOUT_EDIT.dirtyTitle)).toBeTruthy()
    expect(screen.getByText(LAYOUT_EDIT.dirtyBody)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: LAYOUT_EDIT.dirtyStay }))
    expect(onStay).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: LAYOUT_EDIT.dirtyDiscard }))
    expect(onDiscard).toHaveBeenCalledOnce()
  })
})

describe('EnterEditButton component', () => {
  it('renders edit button with icon and handles click', () => {
    const onClick = vi.fn()
    render(<EnterEditButton onClick={onClick} />)
    const btn = screen.getByRole('button', { name: LAYOUT_EDIT.enter })
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
