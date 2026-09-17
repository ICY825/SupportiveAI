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
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  placementAt,
  placementBounds,
  rotatePlacementBy,
  snapPlacementToGrid,
  translatePlacement,
  type PlacementValidation,
  type SpatialGrid,
  type SpatialPlacement,
} from '../domain/placement'
import type { Point } from '../domain/spatial'
import {
  changedIds,
  createDraft,
  draftIsValid,
  gridForEntity,
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

/**
 * Steps kept per edit session. A step is a completed gesture — a whole drag,
 * one nudge, one rotation, one reset — never an intermediate drag frame, so
 * undoing once undoes something the person would recognise as an action.
 */
export const HISTORY_LIMIT = 50

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
  canUndo: boolean
  canRedo: boolean
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
  undo: () => void
  redo: () => void
  /** put one entity back exactly where the authoritative layout has it */
  resetPlacement: (entityId: string) => void
  /** the lattice this entity snaps to; the renderer draws the selected one */
  gridFor: (entityId: string | undefined) => SpatialGrid
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
  const [draft, setDraftState] = useState<LayoutDraft | null>(null)
  const [past, setPast] = useState<LayoutDraft[]>([])
  const [future, setFuture] = useState<LayoutDraft[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [saving, setSaving] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const editableSet = useMemo(
    () => (area.editableIds ? new Set(area.editableIds) : null),
    [area.editableIds],
  )
  const isEditable = useCallback((entityId: string) => !editableSet || editableSet.has(entityId), [editableSet])

  /**
   * The draft is mirrored in a ref and written synchronously, because pointer
   * and key handlers have to read the value the previous event produced — a
   * ref synced in an effect lags a frame behind a drag.
   */
  const draftRef = useRef<LayoutDraft | null>(null)
  const setDraft = useCallback((next: LayoutDraft | null) => {
    draftRef.current = next
    setDraftState(next)
  }, [])

  const resetHistory = useCallback(() => {
    setPast([])
    setFuture([])
  }, [])

  /** Records the state a gesture started from, and forks the redo branch. */
  const pushHistory = useCallback((before: LayoutDraft) => {
    setPast((p) => (p.length >= HISTORY_LIMIT ? [...p.slice(p.length - HISTORY_LIMIT + 1), before] : [...p, before]))
    setFuture([])
  }, [])

  /** One undoable change. A no-op change records nothing. */
  const applyStep = useCallback(
    (next: (current: LayoutDraft) => LayoutDraft) => {
      const current = draftRef.current
      if (!current) return
      const updated = next(current)
      if (updated === current) return
      pushHistory(current)
      setDraft(updated)
    },
    [pushHistory, setDraft],
  )

  const placements = mode === 'edit' && draft ? draft.placements : committed

  const validation = useMemo(
    () => validateDraft({ placements }, area),
    [placements, area],
  )
  const dirty = useMemo(
    () => mode === 'edit' && draft
      ? changedIds(draft, committed).some((id) => isEditable(id))
      : false,
    [mode, draft, committed, isEditable],
  )
  const changedCount = useMemo(
    () => mode === 'edit' && draft
      ? changedIds(draft, committed).filter((id) => isEditable(id)).length
      : 0,
    [mode, draft, committed, isEditable],
  )
  const valid = useMemo(() => draftIsValid(validation), [validation])

  const gridFor = useCallback(
    (entityId: string | undefined) => (entityId ? gridForEntity(area.grid, basePlacements[entityId]) : area.grid),
    [area.grid, basePlacements],
  )

  /** Live preview during a drag; the whole drag is one history step, not each frame. */
  const update = useCallback(
    (placement: SpatialPlacement) => {
      const current = draftRef.current
      if (current) setDraft(setDraftPlacement(current, placement))
    },
    [setDraft],
  )

  const enterEdit = useCallback(() => {
    if (editableSet?.size === 0) return
    if (!draftRef.current) setDraft(createDraft(committed))
    resetHistory()
    setMode('edit')
  }, [committed, editableSet, setDraft, resetHistory])

  const clearDrag = useCallback(() => {
    dragRef.current = null
    setDrag(null)
  }, [])

  const tryExitEdit = useCallback(() => {
    if (dirty) return false
    clearDrag()
    setDraft(null)
    resetHistory()
    setMode('view')
    return true
  }, [dirty, clearDrag, setDraft, resetHistory])

  const startDrag = useCallback((entityId: string) => {
    if (!isEditable(entityId)) return
    const from = draftRef.current?.placements[entityId]
    if (!from) return
    const state: DragState = { entityId, from, moved: false }
    dragRef.current = state
    setDrag(state)
  }, [isEditable])

  const dragTo = useCallback(
    ([dx, dy]: Point) => {
      const state = dragRef.current
      if (!state || !isEditable(state.entityId)) return
      if (!state.moved) {
        state.moved = true
        setDrag({ ...state })
      }
      update(snapPlacementToGrid(translatePlacement(state.from, dx, dy), gridFor(state.entityId)))
    },
    [gridFor, isEditable, update],
  )

  /**
   * A drag becomes one history step here, reconstructed from where the dragged
   * object started rather than from a snapshot taken on pointerdown — a press
   * that never moved leaves no step at all.
   */
  const endDrag = useCallback(() => {
    const state = dragRef.current
    const current = draftRef.current
    if (state?.moved && current) {
      const before = setDraftPlacement(current, state.from)
      if (before !== current) pushHistory(before)
    }
    clearDrag()
  }, [clearDrag, pushHistory])

  const cancelDrag = useCallback(() => {
    const state = dragRef.current
    if (!state) return
    update(state.from)
    clearDrag()
  }, [update, clearDrag])

  const nudge = useCallback(
    (entityId: string, [cx, cy]: Point) => {
      if (!isEditable(entityId)) return
      applyStep((current) => {
        const placement = current.placements[entityId]
        if (!placement) return current
        const grid = gridFor(entityId)
        const moved = translatePlacement(placement, cx * grid.cellSize, cy * grid.cellSize)
        return setDraftPlacement(current, snapPlacementToGrid(moved, grid))
      })
    },
    [gridFor, isEditable, applyStep],
  )

  /**
   * Quarter turn about the footprint's own centre, then re-snapped: a turned
   * desk keeps the spot it was on rather than drifting by half the difference
   * between its width and its depth.
   */
  const rotate = useCallback(
    (entityId: string) => {
      if (!isEditable(entityId)) return
      applyStep((current) => {
        const placement = current.placements[entityId]
        if (!placement) return current
        const [x0, y0, x1, y1] = placementBounds(placement)
        const centred = placementAt(rotatePlacementBy(placement, 90), [(x0 + x1) / 2, (y0 + y1) / 2])
        return setDraftPlacement(current, snapPlacementToGrid(centred, gridFor(entityId)))
      })
    },
    [gridFor, isEditable, applyStep],
  )

  const resetPlacement = useCallback(
    (entityId: string) => {
      if (!isEditable(entityId)) return
      const original = basePlacements[entityId]
      if (!original) return
      applyStep((current) => setDraftPlacement(current, original))
    },
    [basePlacements, isEditable, applyStep],
  )

  /**
   * Undo abandons any gesture in progress: stepping back while a pointer is
   * still down would leave the drag anchored to a placement that no longer
   * exists, and the next move would jump.
   */
  const undo = useCallback(() => {
    const current = draftRef.current
    if (!current || past.length === 0) return
    clearDrag()
    setPast((p) => p.slice(0, -1))
    setFuture((f) => [current, ...f].slice(0, HISTORY_LIMIT))
    setDraft(past[past.length - 1])
  }, [past, clearDrag, setDraft])

  const redo = useCallback(() => {
    const current = draftRef.current
    if (!current || future.length === 0) return
    clearDrag()
    setFuture((f) => f.slice(1))
    setPast((p) => [...p, current].slice(-HISTORY_LIMIT))
    setDraft(future[0])
  }, [future, clearDrag, setDraft])

  /**
   * Commits the editable membership, not the whole floor.
   *
   * Every placement in the area goes out, not only the changed ones: the store
   * merges what it is given, so omitting a desk that was moved in an earlier
   * session and has since been put back would leave the old position standing.
   *
   * The committed map is then extended, never rebuilt from `basePlacements` —
   * rebuilding discards every area saved before this one.
   */
  const save = useCallback(async () => {
    if (!draft || !valid || saving) return
    const next = editableSet
      ? Object.fromEntries(Object.entries(draft.placements).filter(([id]) => editableSet.has(id)))
      : { ...draft.placements }
    setSaving(true)
    try {
      await store.write(floorId, next)
      setCommitted((current) => mergeStoredPlacements(current, next))
      setDraft(null)
      resetHistory()
      clearDrag()
      setMode('view')
    } finally {
      setSaving(false)
    }
  }, [draft, editableSet, valid, saving, store, floorId, clearDrag, setDraft, resetHistory])

  const cancel = useCallback(() => {
    clearDrag()
    setDraft(null)
    resetHistory()
    setMode('view')
  }, [clearDrag, setDraft, resetHistory])

  return {
    mode,
    placements,
    base: basePlacements,
    validation,
    dirty,
    valid,
    saving,
    changedCount,
    canUndo: mode === 'edit' && past.length > 0,
    canRedo: mode === 'edit' && future.length > 0,
    drag,
    enterEdit,
    tryExitEdit,
    startDrag,
    dragTo,
    endDrag,
    cancelDrag,
    nudge,
    rotate,
    undo,
    redo,
    resetPlacement,
    gridFor,
    save,
    cancel,
  }
}
