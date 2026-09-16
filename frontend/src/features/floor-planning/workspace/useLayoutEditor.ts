/**
 * Edit-session state for the spatial workspace.
 *
 *   view ──enter──▶ edit ──┬── move / rotate / nudge ──▶ draft
 *      ◀───────────────────┴── Lưu bố trí  → commit + persist
 *      ◀───────────────────┴── Hủy          → discard draft
 *
 * Every layout change goes through here, so the authoritative dataset and the
 * committed placements are only ever replaced wholesale at a Save. Geometry,
 * snapping and validation live in ../domain; this file only sequences them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  placementAt,
  placementBounds,
  rotatePlacementBy,
  snapPlacementToGrid,
  translatePlacement,
  type PlacementValidation,
  type SpatialPlacement,
} from '../domain/placement'
import type { Point } from '../domain/spatial'
import {
  changedIds,
  createDraft,
  draftIsValid,
  isDraftDirty,
  mergeStoredPlacements,
  setDraftPlacement,
  validateDraft,
  type EditableArea,
  type LayoutDraft,
  type LayoutStore,
} from './layoutDraft'

export type WorkspaceMode = 'view' | 'edit'

/** Larger keyboard step, for crossing a cluster without holding the key. */
export const NUDGE_COARSE_CELLS = 4

export interface DragState {
  entityId: string
  /** placement when the drag started, so Escape restores it exactly */
  from: SpatialPlacement
  moved: boolean
}

export interface LayoutEditor {
  mode: WorkspaceMode
  /** placements the renderer should draw: the draft while editing, else committed */
  placements: Record<string, SpatialPlacement>
  base: Record<string, SpatialPlacement>
  validation: ReadonlyMap<string, PlacementValidation>
  dirty: boolean
  valid: boolean
  saving: boolean
  changedCount: number
  drag: DragState | null
  enterEdit: () => void
  /** true when it exited; false when the caller must confirm first */
  tryExitEdit: () => boolean
  startDrag: (entityId: string) => void
  /** `delta` is a displacement in FLOOR coordinates measured from the drag start */
  dragTo: (delta: Point) => void
  endDrag: () => void
  cancelDrag: () => void
  nudge: (entityId: string, cells: Point) => void
  rotate: (entityId: string) => void
  save: () => Promise<void>
  cancel: () => void
}

export function useLayoutEditor({
  floorId,
  basePlacements,
  area,
  store,
}: {
  floorId: string
  basePlacements: Record<string, SpatialPlacement>
  area: EditableArea
  store: LayoutStore
}): LayoutEditor {
  const [committed, setCommitted] = useState<Record<string, SpatialPlacement>>(() =>
    mergeStoredPlacements(basePlacements, store.read(floorId)),
  )
  const [mode, setMode] = useState<WorkspaceMode>('view')
  const [draft, setDraft] = useState<LayoutDraft | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [saving, setSaving] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  /** Read by pointer handlers, which run after the commit that set it. */
  const draftRef = useRef<LayoutDraft | null>(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const placements = mode === 'edit' && draft ? draft.placements : committed

  const validation = useMemo(
    () => validateDraft({ placements }, area.boundary, area.tolerance),
    [placements, area.boundary, area.tolerance],
  )
  const dirty = useMemo(
    () => (mode === 'edit' && draft ? isDraftDirty(draft, committed) : false),
    [mode, draft, committed],
  )
  const changedCount = useMemo(
    () => (mode === 'edit' && draft ? changedIds(draft, committed).length : 0),
    [mode, draft, committed],
  )
  const valid = useMemo(() => draftIsValid(validation), [validation])

  const update = useCallback((placement: SpatialPlacement) => {
    setDraft((current) => (current ? setDraftPlacement(current, placement) : current))
  }, [])

  const enterEdit = useCallback(() => {
    setDraft((current) => current ?? createDraft(committed))
    setMode('edit')
  }, [committed])

  const clearDrag = useCallback(() => {
    dragRef.current = null
    setDrag(null)
  }, [])

  const tryExitEdit = useCallback(() => {
    if (dirty) return false
    clearDrag()
    setDraft(null)
    setMode('view')
    return true
  }, [dirty, clearDrag])

  const startDrag = useCallback((entityId: string) => {
    const from = draftRef.current?.placements[entityId]
    if (!from) return
    const state: DragState = { entityId, from, moved: false }
    dragRef.current = state
    setDrag(state)
  }, [])

  const dragTo = useCallback(
    ([dx, dy]: Point) => {
      const state = dragRef.current
      if (!state) return
      if (!state.moved) {
        state.moved = true
        setDrag({ ...state })
      }
      update(snapPlacementToGrid(translatePlacement(state.from, dx, dy), area.grid))
    },
    [area.grid, update],
  )

  const endDrag = useCallback(() => clearDrag(), [clearDrag])

  const cancelDrag = useCallback(() => {
    const state = dragRef.current
    if (!state) return
    update(state.from)
    clearDrag()
  }, [update, clearDrag])

  const nudge = useCallback(
    (entityId: string, [cx, cy]: Point) => {
      setDraft((current) => {
        if (!current) return current
        const placement = current.placements[entityId]
        if (!placement) return current
        const moved = translatePlacement(placement, cx * area.grid.cellSize, cy * area.grid.cellSize)
        return setDraftPlacement(current, snapPlacementToGrid(moved, area.grid))
      })
    },
    [area.grid],
  )

  /**
   * Quarter turn about the footprint's own centre, then re-snapped: a turned
   * desk keeps the spot it was on rather than drifting by half the difference
   * between its width and its depth.
   */
  const rotate = useCallback(
    (entityId: string) => {
      setDraft((current) => {
        if (!current) return current
        const placement = current.placements[entityId]
        if (!placement) return current
        const [x0, y0, x1, y1] = placementBounds(placement)
        const centred = placementAt(rotatePlacementBy(placement, 90), [(x0 + x1) / 2, (y0 + y1) / 2])
        return setDraftPlacement(current, snapPlacementToGrid(centred, area.grid))
      })
    },
    [area.grid],
  )

  const save = useCallback(async () => {
    if (!draft || !valid || saving) return
    const next = { ...draft.placements }
    setSaving(true)
    try {
      await store.write(floorId, next)
      setCommitted(next)
      setDraft(null)
      clearDrag()
      setMode('view')
    } finally {
      setSaving(false)
    }
  }, [draft, valid, saving, store, floorId, clearDrag])

  const cancel = useCallback(() => {
    clearDrag()
    setDraft(null)
    setMode('view')
  }, [clearDrag])

  return {
    mode,
    placements,
    base: basePlacements,
    validation,
    dirty,
    valid,
    saving,
    changedCount,
    drag,
    enterEdit,
    tryExitEdit,
    startDrag,
    dragTo,
    endDrag,
    cancelDrag,
    nudge,
    rotate,
    save,
    cancel,
  }
}
