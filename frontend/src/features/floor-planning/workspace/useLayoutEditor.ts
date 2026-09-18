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
  validatePlacement,
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
  canRotate: (entityId: string) => boolean
  nearBoundary: (entityId: string) => boolean
  enterEdit: () => void
  /** true when it exited; false when the caller must confirm first */
  tryExitEdit: () => boolean
  startDrag: (entityId: string) => void
  /** Adds a newly authored placement to the active draft. */
  addPlacement: (placement: SpatialPlacement) => void
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

  // Authored entities are persisted separately from layout drafts. In view
  // mode, merge any newly arrived canonical placements for rendering. In edit
  // mode, the caller explicitly adds a new placement to the draft so it stays
  // dirty until Save.
  const viewPlacements = useMemo(() => {
    let changed = false
    const next = { ...committed }
    for (const [id, placement] of Object.entries(basePlacements)) {
      if (next[id]) continue
      next[id] = placement
      changed = true
    }
    return changed ? next : committed
  }, [basePlacements, committed])
  const placements = mode === 'edit' && draft ? draft.placements : viewPlacements

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

  // Rotation is a spatial action, so test each alternate quarter turn against
  // the same desks, boundaries and obstacles that validateDraft uses. A packed
  // row should tell the user that rotating in place cannot work before they
  // cycle through three guaranteed collisions.
  const rotationAlternatives = useMemo(() => {
    const result = new Map<string, PlacementValidation[]>()
    const placementsList = Object.values(placements)
    const others = area.contextPlacements?.length ? [...placementsList, ...area.contextPlacements] : placementsList
    for (const placement of placementsList) {
      if (editableSet && !editableSet.has(placement.entityId)) continue
      const validations: PlacementValidation[] = []
      for (const targetRotation of [0, 90, 180, 270] as const) {
        if (targetRotation === placement.rotation) continue
        const turns = (targetRotation - placement.rotation + 360) % 360
        const candidate = snapPlacementToGrid(
          placementAt(rotatePlacementBy(placement, turns), [placement.x, placement.y]),
          gridFor(placement.entityId),
        )
        validations.push(validatePlacement(candidate, {
          others,
          boundary: area.boundary,
          roomBoundary: area.roomBoundary,
          departmentZone: area.departmentZone,
          obstacles: area.obstacles,
          tolerance: area.tolerance,
          boundaryTolerance: area.boundaryTolerance,
          chairTileSize: area.chairTileSize,
        }))
      }
      result.set(placement.entityId, validations)
    }
    return result
  }, [area, editableSet, gridFor, placements])

  const canRotate = useCallback(
    (entityId: string) => rotationAlternatives.get(entityId)?.some((validation) => validation.valid) ?? true,
    [rotationAlternatives],
  )

  const nearBoundary = useCallback((entityId: string) => {
    const placement = placements[entityId]
    if (!placement || validation.get(entityId)?.valid === false) return false
    const others = area.contextPlacements?.length ? [...Object.values(placements), ...area.contextPlacements] : Object.values(placements)
    return ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([x, y]) => {
      const candidate = snapPlacementToGrid(
        translatePlacement(placement, x * gridFor(entityId).cellSize, y * gridFor(entityId).cellSize),
        gridFor(entityId),
      )
      return validatePlacement(candidate, {
        others,
        boundary: area.boundary,
        roomBoundary: area.roomBoundary,
        departmentZone: area.departmentZone,
        obstacles: area.obstacles,
        tolerance: area.tolerance,
        boundaryTolerance: area.boundaryTolerance,
        chairTileSize: area.chairTileSize,
      }).reasons.some((reason) => reason.type === 'outside-department-zone')
    })
  }, [area, gridFor, placements, validation])

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
    if (!draftRef.current) setDraft(createDraft(viewPlacements))
    resetHistory()
    setMode('edit')
  }, [editableSet, resetHistory, setDraft, viewPlacements])

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

  const addPlacement = useCallback((placement: SpatialPlacement) => {
    if (mode !== 'edit' || !draftRef.current) return
    setDraft(setDraftPlacement(draftRef.current, placement))
  }, [mode, setDraft])

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
    canRotate,
    nearBoundary,
    enterEdit,
    tryExitEdit,
    startDrag,
    addPlacement,
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
