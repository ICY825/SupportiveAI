import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ApiError } from '@/api/client'
import type { ReconcileReport } from '@/api/seats'
import type { Department, Employee, FloorAllocationData, Seat } from '../domain/allocation'
import { createDemoAllocation } from '../allocation/demoAllocation'
import {
  applyAllocationMutations,
  type AllocationStore,
  inverseAllocationMutations,
  planAssignment,
  planRelease,
  sessionAllocationStore,
  type AllocationMutation,
} from '../allocation/allocationStore'
import { FloorSearch } from '../components/FloorSearch'
import { isMac, isTypingTarget } from '../components/keyboard'
import { formatDate, initials } from '../components/desk-inspector/format'
import { EmployeePicker } from '../components/desk-inspector/EmployeePicker'
import { OverflowMenu } from '../components/desk-inspector/OverflowMenu'
import {
  authoredDeskId,
  authoredWorkstationFromPlacement,
  nextAuthoredDeskNumber,
  type AuthoredEntities,
  type AuthoredEntityChanges,
} from '../domain/authoredEntities'
import { buildDeskIndex, DESK_STATUSES, type DeskRecord, type DeskStatus } from '../domain/desk'
import { placementsEqual, snapPlacementToGrid, validatePlacement, type SpatialPlacement } from '../domain/placement'
import type { BBox, EntityRef, FloorDataset, Point } from '../domain/spatial'
import {
  DESK_STATUS,
  LAYOUT_EDIT,
  SEAT_ASSIGNMENT,
  assignmentIssueText,
  SEAT_TYPE,
  SPATIAL_OUT_OF_SCOPE,
  SPATIAL_OUT_OF_SCOPE_HINT,
  SPATIAL_NO_EDIT_AREAS,
  SPATIAL_UNAVAILABLE,
} from '../labels'
import { ARROW_DIRECTION, DIRECTION_VECTOR, nearestInDirection } from '../map/deskNavigation'
import { normalizeWheelZoom } from '../map/viewport'
import { buildSearchIndex } from '../search/searchIndex'
import { EditAffordances, EditGround } from './EditLayer'
import { EditInspector, EditToolbar, EnterEditButton, UnsavedChangesDialog } from './EditPanel'
import {
  applyPlacements,
  basePlacements as deriveBasePlacements,
  deriveEditableArea,
  GRID_CELL_MM,
  placementFromWorkstation,
  sessionLayoutStore,
  type LayoutStore,
} from './layoutDraft'
import { buildWorkspaceDisplayAreasForScope } from './displayAreas'
import { buildWorkspaceScene, detailTierForZoom, effectiveZoom, fitViewBox, project, sceneBounds, unproject, unprojectDelta } from './scene'
import { defaultWorkspaceScope, resolveDepartmentWingZone } from './scope'
import { useLayoutEditor, NUDGE_COARSE_CELLS, type WorkspaceMode } from './useLayoutEditor'
import { SeatSymbol, WorkspaceScene } from './WorkspaceScene'
import './workspace.css'

/** Screen-pixel margin left around the fitted scene. Matches the verification map. */
const SCENE_PADDING = 20
const DEFAULT_STAGE = { width: 1200, height: 800 }
const MIN_ZOOM = 0.85
const MAX_ZOOM = 3.5
/**
 * Slack for panning a scene that already fits, as a share of the framed scene,
 * so it scales with the stage. Beyond 1x the limit has to grow with the zoom
 * instead — see panLimit.
 */
const PAN_LIMIT = 0.3
/** Pointer travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4
/** Spelled for this platform, for the toolbar tooltips. */
const UNDO_HINT = isMac() ? '⌘Z' : 'Ctrl+Z'
const REDO_HINT = isMac() ? '⌘⇧Z' : 'Ctrl+Y'

function Status({ desk }: { desk: DeskRecord }) {
  return <span className="fp-chip sw-status" data-status={desk.status}><svg viewBox="-2 -2 4 4" aria-hidden="true"><SeatSymbol status={desk.status} /></svg>{DESK_STATUS[desk.status].label}</span>
}

function allocationWriteError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Không thể lưu thay đổi. Dữ liệu chỗ ngồi đã được làm mới.'
}

/** The map's own marker, at legend size, so the key teaches the map literally. */
function LegendMark({ status }: { status: DeskStatus }) {
  return (
    <svg className="sw-key-mark" viewBox="-2.4 -2.4 4.8 4.8" aria-hidden="true">
      <circle className="sw-marker-disc" r={1.85} />
      {status === 'occupied' ? <text textAnchor="middle" y={0.48} className="sw-avatar-text">NM</text> : <SeatSymbol status={status} />}
    </svg>
  )
}

/**
 * Seat counts and the map key for the current scope. Stays in the panel whether
 * or not a desk is selected: it describes the scope, not the selection.
 */
function ScopeSummary({ dataset, areaLabel, departmentZone, count, counts, capacityAnswer, children }: {
  dataset: FloorDataset
  areaLabel: string
  departmentZone: string
  count: number
  counts: (status: DeskStatus) => number
  capacityAnswer?: ReactNode
  /** empty-state prompt, shown between the counts and the key when nothing is selected */
  children?: ReactNode
}) {
  const { floor } = dataset.layout
  const wingLabel = departmentZone.replace(/^Zone\s+/, 'Khu ')
  return (
    <section className="sw-summary" aria-labelledby="sw-summary-title">
      <header className="fp-panel-head">
        <h2 id="sw-summary-title">{floor.name}</h2>
        <p className="fp-head-meta">{areaLabel} · {wingLabel} · cánh toà nhà</p>
      </header>
      <dl className="fp-stats">
        <div>
          <dt><span aria-hidden="true">Chỗ ngồi</span><span className="fp-sr-only"> chỗ ngồi</span></dt>
          <dd>{count}</dd>
        </div>
        {DESK_STATUSES.map((s) => (
          <div key={s} title={DESK_STATUS[s].hint}>
            <dt>{DESK_STATUS[s].short}</dt>
            <dd>{counts(s)}</dd>
          </div>
        ))}
      </dl>
      {capacityAnswer}
      {children}
      <details className="fp-section sw-key-block" open>
        <summary>
          <h3>Chú giải</h3>
        </summary>
        <ul className="sw-key">
        {DESK_STATUSES.map((s) => (
          <li key={s} data-status={s}>
            <LegendMark status={s} />
            {DESK_STATUS[s].short}
          </li>
        ))}
          <li className="sw-key-boundary">
            <span className="sw-key-rule" aria-hidden="true" />
            Ranh giới khu vực
          </li>
          <li className="sw-key-context">
            <span className="sw-key-context-mark" aria-hidden="true" />
            Bàn lân cận · không chỉnh sửa
          </li>
        </ul>
      </details>
    </section>
  )
}

function DepartmentDashboard({ dataset, departments, seats, onChoose }: {
  dataset: FloorDataset
  departments: readonly Department[]
  seats: readonly Seat[]
  onChoose: (departmentId: string) => void
}) {
  const zoneLabel = (zoneId: string) =>
    dataset.zones.find((zone) => zone.id === zoneId)?.name ?? 'Khu vực chưa đặt tên'

  return (
    <main className="sw-workspace sw-department-dashboard">
      <section className="sw-department-dashboard-inner" aria-labelledby="sw-department-dashboard-title">
        <header className="sw-department-dashboard-heading">
          <p className="fp-eyebrow">Bố trí chỗ ngồi · {dataset.layout.floor.name}</p>
          <h2 id="sw-department-dashboard-title">Chọn bộ phận</h2>
          <p>Chọn bộ phận để mở sơ đồ chỗ ngồi và xem tình trạng phân bổ.</p>
        </header>
        {departments.length > 0 ? (
          <div className="sw-department-grid" aria-label="Danh sách bộ phận">
            {departments.map((department, index) => {
              const seatCount = seats.filter((seat) => seat.departmentId === department.id).length
              const zones = department.zonePreferences.map(zoneLabel)
              return (
                <button
                  key={department.id}
                  type="button"
                  className="sw-department-card"
                  onClick={() => onChoose(department.id)}
                >
                  <span className="sw-department-card-index">{String(index + 1).padStart(2, '0')}</span>
                  <strong>{department.name}</strong>
                  <span className="sw-department-card-count">{seatCount} chỗ ngồi</span>
                  <span className="sw-department-card-zones">
                    {zones.length ? zones.join(' · ') : 'Chưa gắn khu vực'}
                  </span>
                  <span className="sw-department-card-action">
                    Mở bố trí <span aria-hidden="true">→</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="sw-department-empty" role="status">
            Chưa có danh sách bộ phận cho tầng này.
          </p>
        )}
      </section>
    </main>
  )
}

function CompactInspector({
  desk,
  allocation,
  now,
  canUndo,
  onApplyMutations,
  onUndo,
  onDelete,
  canDelete = false,
  onClose,
  onVerify,
  showHeader = true,
  onSearchEmployees,
  onRegisterEmployee,
}: {
  desk: DeskRecord
  allocation: FloorAllocationData
  now: Date
  canUndo: boolean
  onSearchEmployees?: (query: string) => Promise<Employee[]>
  onRegisterEmployee?: (employee: Employee) => void
  onApplyMutations: (mutations: readonly AllocationMutation[]) => Promise<void>
  onUndo: () => Promise<void>
  onDelete: (workstationId: string) => void
  canDelete?: boolean
  onClose: () => void
  onVerify: () => void
  showHeader?: boolean
}) {
  const [assignmentState, setAssignmentState] = useState({
    seatId: desk.seat.id,
    editorOpen: false,
    notice: null as string | null,
  })
  const currentAssignmentState = assignmentState.seatId === desk.seat.id
    ? assignmentState
    : { seatId: desk.seat.id, editorOpen: false, notice: null }
  const assignmentEditorOpen = currentAssignmentState.editorOpen
  const assignmentNotice = currentAssignmentState.notice
  const people = desk.status === 'reserved' && desk.reservation ? [desk.reservation] : desk.occupants
  const canAssign = desk.status === 'available' || desk.status === 'occupied'
  const releaseItems: Array<{ id: 'release-seat' | 'delete-desk'; label: string; danger?: boolean; separated?: boolean }> = desk.status === 'occupied' || desk.status === 'conflict'
    ? [{ id: 'release-seat' as const, label: SEAT_ASSIGNMENT.release }]
    : []
  if (canDelete) {
    releaseItems.push({ id: 'delete-desk' as const, label: SEAT_ASSIGNMENT.delete, danger: true, separated: true })
  }

  const updateAssignmentState = (update: Partial<typeof currentAssignmentState>) => {
    setAssignmentState((current) => ({ ...current, ...update, seatId: desk.seat.id }))
  }

  const selectEmployee = (employee: FloorAllocationData['employees'][number]) => {
    // Người tìm được từ danh mục nhân sự chưa có trong dữ liệu của tầng — họ
    // chưa ngồi đâu cả. Cho vào trước khi kiểm, nếu không `validateAssignment`
    // trả `unknown-employee` cho đúng người mà ta vừa chọn.
    const known = allocation.employees.some((existing) => existing.id === employee.id)
    if (!known) onRegisterEmployee?.(employee)
    const base = known
      ? allocation
      : { ...allocation, employees: [...allocation.employees, employee] }
    const plan = planAssignment(
      base,
      { seatId: desk.seat.id, employeeId: employee.id },
      { now, actor: 'demo-admin', move: desk.status === 'occupied' },
    )
    if (!plan.valid) {
      updateAssignmentState({ notice: plan.reasons.map(assignmentIssueText).join(' · ') })
      return
    }
    void onApplyMutations(plan.mutations).catch((error) => {
      updateAssignmentState({ notice: allocationWriteError(error) })
    })
    updateAssignmentState({ editorOpen: false, notice: SEAT_ASSIGNMENT.assigned(employee.name) })
  }

  const releaseSeat = () => {
    const plan = planRelease(allocation, desk.seat.id, { now, actor: 'demo-admin' })
    if (plan.mutations.length === 0) {
      updateAssignmentState({ notice: 'Không có phân công đang hiệu lực' })
      return
    }
    void onApplyMutations(plan.mutations).catch((error) => {
      updateAssignmentState({ notice: allocationWriteError(error) })
    })
    updateAssignmentState({ notice: SEAT_ASSIGNMENT.released })
  }

  return <aside className={`sw-inspector${showHeader ? '' : ' is-secondary'}`} aria-labelledby={showHeader ? 'sw-desk-title' : undefined} aria-label={showHeader ? undefined : `Thông tin nhân sự bàn ${desk.seat.code}`}>
    {showHeader && <header className="fp-card-head"><div><p className="fp-eyebrow">Bàn đang chọn</p><h2 id="sw-desk-title" className="fp-card-title">{desk.seat.code}</h2></div><div className="sw-inspector-actions">{releaseItems.length > 0 && <OverflowMenu
      label="Thao tác khác"
      items={releaseItems}
      onSelect={(action) => action === 'delete-desk' ? onDelete(desk.workstation.id) : releaseSeat()}
    />}<button type="button" className="fp-icon-btn" onClick={onClose} aria-label="Đóng bảng thông tin bàn" title="Đóng (Esc)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button></div></header>}
    <Status desk={desk} />
    <section className="sw-person-section">
      <h3 className="fp-section-title">{desk.status === 'reserved' ? 'Nhân sự đặt chỗ' : 'Nhân sự sử dụng'}</h3>
      {people.map(({ employee }) => <div className="sw-person" key={employee.id}><span className="sw-avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><span>{employee.employeeCode} · {employee.jobTitle}</span></div></div>)}
      {desk.status === 'available' && <div className="sw-vacant"><strong>Chỗ ngồi còn trống</strong><p>Chưa có nhân sự được gán</p></div>}
      {desk.status === 'unavailable' && <div className="sw-unavailable"><strong>Tạm ngưng sử dụng</strong><p>{desk.seat.statusReason ?? 'Chỗ ngồi hiện không khả dụng.'}</p></div>}
      {desk.status === 'reserved' && desk.reservation && <p className="sw-detail-note">Từ {formatDate(desk.reservation.assignment.validFrom)}</p>}
      {desk.status === 'conflict' && <p className="sw-conflict-note">Có {desk.occupants.length} phân công cùng hiệu lực tại bàn này.</p>}
    </section>
    <details key={desk.workstation.id} className="fp-section" open>
      <summary>
        <h3>Thông tin chỗ ngồi</h3>
      </summary>
      <dl className="fp-facts"><div><dt>Khu vực</dt><dd>{desk.zone?.name ?? 'Chưa có nhãn'}</dd></div><div><dt>Bộ phận</dt><dd>{desk.department?.name ?? 'Chưa có dữ liệu'}</dd></div>{desk.seat.seatType && <div><dt>Loại chỗ ngồi</dt><dd>{SEAT_TYPE[desk.seat.seatType]}</dd></div>}</dl>
    </details>
    {canAssign && (
      <section className="sw-assignment-editor" aria-label="Chỉnh sửa phân công">
        {!assignmentEditorOpen ? (
          <button type="button" className="fp-btn is-primary is-wide sw-assignment-edit" onClick={() => updateAssignmentState({ editorOpen: true })}>
            {SEAT_ASSIGNMENT.edit}
          </button>
        ) : (
          <>
            <EmployeePicker
              onSearch={onSearchEmployees}
              employees={allocation.employees}
              departments={allocation.departments}
              seats={allocation.seats}
              assignments={allocation.assignments}
              now={now}
              onSelect={selectEmployee}
            />
            <button type="button" className="fp-btn is-wide sw-assignment-cancel" onClick={() => updateAssignmentState({ editorOpen: false })}>
              Hủy
            </button>
          </>
        )}
        {assignmentNotice && (
          <p className="sw-assignment-notice" role="status" aria-live="polite">
            <span>{assignmentNotice}</span>
            {canUndo && <button type="button" className="fp-link" onClick={() => {
              void onUndo()
                .then(() => updateAssignmentState({ notice: 'Đã hoàn tác' }))
                .catch((error) => updateAssignmentState({ notice: allocationWriteError(error) }))
            }}>{SEAT_ASSIGNMENT.undo}</button>}
          </p>
        )}
      </section>
    )}
    <button type="button" className="fp-btn is-wide sw-verify" onClick={onVerify}>Đối chiếu trên bản vẽ <span aria-hidden="true">↗</span></button>
  </aside>
}

/** What a pointer press is doing. Panning and moving an object never mix. */
interface DragSession {
  id: number
  kind: 'pan' | 'object' | 'place'
  entityId?: string
  start: Point
  last: Point
  moved: boolean
}

interface PendingDesk {
  workstationId: string
  number: number
  zoneId: string | null
  clusterId: string
  width: number
  depth: number
  rotation: SpatialPlacement['rotation']
  placement: SpatialPlacement | null
}

export function SpatialWorkspace({ dataset, selected, onSelect, onVerify, searchSlot, onDirtyChange, authoredEntities, onAuthoredEntityChange, layoutStore = sessionLayoutStore, allocationSource, allocationStore = sessionAllocationStore, onAllocationCommitted, onSearchEmployees, reconcile, startWithDepartmentPicker = false, departmentId: departmentIdProp, onDepartmentChange }: {
  dataset: FloorDataset
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
  onVerify: () => void
  searchSlot: HTMLElement | null
  /** lets the page guard floor and view changes while a layout draft is open */
  onDirtyChange?: (dirty: boolean) => void
  authoredEntities?: AuthoredEntities
  onAuthoredEntityChange?: (changes: AuthoredEntityChanges) => void
  /** swap for an API-backed store once a layout endpoint exists */
  layoutStore?: LayoutStore
  /**
   * Seats and people from the backend. Left out, the workspace generates the
   * demo fixtures as before, so a test can mount it without a session.
   */
  allocationSource?: FloorAllocationData
  /** where committed assignments go; the API-backed store talks to /api/seats */
  allocationStore?: AllocationStore
  /** the API store has no local history, so the page refetches after a write */
  onAllocationCommitted?: () => void
  /** server-side check for assignments that no longer match the drawing */
  reconcile?: ReconcileReport | null
  /**
   * Look an employee up in the staff directory instead of filtering the seated
   * people already on screen. Without it an empty desk can never be filled
   * from live data, because a list of assignments only names its occupants.
   */
  onSearchEmployees?: (query: string) => Promise<Employee[]>
  /** Show the department chooser before entering the seating map. */
  startWithDepartmentPicker?: boolean
  /**
   * The chosen department, owned by the page.
   *
   * It has to outlive this component: switching to the verification view and
   * back unmounts the workspace, and a choice kept here would be forgotten
   * along with the user's selection. The page already owns floor, view and
   * selection for the same reason.
   */
  departmentId?: string | null
  onDepartmentChange?: (departmentId: string | null) => void
}) {
  const [now] = useState(() => new Date())
  const [allocation, setAllocation] = useState<FloorAllocationData>(() => {
    if (allocationSource) return allocationSource
    const baseAllocation = createDemoAllocation(dataset, now)
    return applyAllocationMutations(baseAllocation, sessionAllocationStore.read(dataset.layout.floor.id) ?? [])
  })
  const allocationRef = useRef(allocation)
  const undoMutationsRef = useRef<readonly AllocationMutation[] | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  // Real data arrives after the first render, and again after every write.
  // Adopt it wholesale: the server is the truth about who sits where, so a
  // local optimistic state that disagrees with it is the bug, not the fix.
  useEffect(() => {
    if (!allocationSource) return
    allocationRef.current = allocationSource
    setAllocation(allocationSource)
    if (allocationSource.source.kind === 'api') {
      undoMutationsRef.current = null
      setCanUndo(false)
    }
  }, [allocationSource])

  // Authored desks arrive through the spatial dataset after the demo
  // allocation was initially generated. Add their seats without resetting
  // existing assignments or in-session allocation mutations.
  useEffect(() => {
    const zoneLetters = new Map(dataset.zones.map((zone, index) => [zone.id, String.fromCharCode(65 + index)]))
    const missing: Seat[] = dataset.workstations
      .filter((workstation) => workstation.classification === 'WORKSTATION')
      .filter((workstation) => !allocationRef.current.seats.some((seat) => seat.workstationId === workstation.id))
      .map((workstation) => ({
        id: `seat-${workstation.id}`,
        code: workstation.source.deskCode ?? `F${dataset.layout.floor.level}-${workstation.zoneId ? zoneLetters.get(workstation.zoneId) : 'X'}-${workstation.id.split('-').at(-1)}`,
        workstationId: workstation.id,
        status: 'ACTIVE',
        seatType: 'FIXED',
        departmentId: null,
        capabilities: { power: true, monitor: false, dockingStation: false },
        verifiedBy: null,
        verifiedAt: null,
        layoutVersion: `${dataset.layout.floor.id}@demo`,
      }))
    if (!missing.length) return
    setAllocation((current) => {
      const next = { ...current, seats: [...current.seats, ...missing] }
      allocationRef.current = next
      return next
    })
  }, [dataset.layout.floor.id, dataset.layout.floor.level, dataset.workstations, dataset.zones])

  /**
   * Someone found in the directory is not part of this floor's data yet — they
   * sit nowhere. Add them before anything validates or renders the assignment,
   * and update the ref synchronously, because `applyAllocationChange` reads the
   * ref in the same tick and drops mutations for people it does not know.
   */
  const registerEmployee = useCallback((employee: Employee) => {
    const current = allocationRef.current
    if (current.employees.some((existing) => existing.id === employee.id)) return
    const next = { ...current, employees: [...current.employees, employee] }
    allocationRef.current = next
    setAllocation(next)
  }, [])

  const applyAllocationChange = useCallback(async (mutations: readonly AllocationMutation[]) => {
    if (mutations.length === 0) return
    const before = allocationRef.current
    const next = applyAllocationMutations(before, mutations)
    if (next === before) return
    allocationRef.current = next
    setAllocation(next)
    undoMutationsRef.current = inverseAllocationMutations(before, mutations, { at: new Date().toISOString(), actor: 'demo-admin' })
    setCanUndo(true)
    try {
      await allocationStore.append(dataset.layout.floor.id, mutations)
      onAllocationCommitted?.()
    } catch (error) {
      // The optimistic state must never survive a rejected live write. Restore
      // the snapshot immediately, then ask the server for the newest truth.
      if (allocationRef.current === next) {
        allocationRef.current = before
        setAllocation(before)
      }
      undoMutationsRef.current = null
      setCanUndo(false)
      onAllocationCommitted?.()
      throw error
    }
  }, [allocationStore, dataset.layout.floor.id, onAllocationCommitted])

  const undoAllocationChange = useCallback(async () => {
    const mutations = undoMutationsRef.current
    if (!mutations || mutations.length === 0) return
    const before = allocationRef.current
    const next = applyAllocationMutations(before, mutations)
    allocationRef.current = next
    setAllocation(next)
    undoMutationsRef.current = null
    setCanUndo(false)
    try {
      await allocationStore.append(dataset.layout.floor.id, mutations)
      onAllocationCommitted?.()
    } catch (error) {
      if (allocationRef.current === next) {
        allocationRef.current = before
        setAllocation(before)
      }
      throw error
    }
  }, [allocationStore, dataset.layout.floor.id, onAllocationCommitted])

  const overviewScope = useMemo(() => defaultWorkspaceScope(dataset), [dataset])
  const [ownDepartmentId, setOwnDepartmentId] = useState<string | null>(null)
  const departmentId = departmentIdProp !== undefined ? departmentIdProp : ownDepartmentId
  const setDepartmentId = onDepartmentChange ?? setOwnDepartmentId
  const selectedDepartmentScope = useMemo(
    () => (departmentId ? { kind: 'department' as const, departmentId } : null),
    [departmentId],
  )
  const activeOverviewScope = selectedDepartmentScope ?? overviewScope
  const overviewScene = useMemo(() => buildWorkspaceScene(dataset, activeOverviewScope), [dataset, activeOverviewScope])
  const displayAreas = useMemo(
    () => buildWorkspaceDisplayAreasForScope(dataset, activeOverviewScope),
    [dataset, activeOverviewScope],
  )
  const [areaId, setAreaId] = useState<string | null>(null)
  const activeArea = areaId ? displayAreas.find((area) => area.id === areaId) ?? null : null
  const scope = activeArea?.scope ?? activeOverviewScope
  const departmentZone = useMemo(
    () => resolveDepartmentWingZone(scope, overviewScene.resolvedScope.zoneIds),
    [scope, overviewScene.resolvedScope.zoneIds],
  )
  const scopedBaseScene = useMemo(() => activeArea
    ? buildWorkspaceScene(dataset, activeArea.scope, {
        workstationIds: activeArea.workstationIds,
        contextBounds: activeArea.contextBBox,
        includeContextWorkstations: true,
      })
    : overviewScene, [activeArea, dataset, overviewScene])
  const editorBaseScene = overviewScene
  const base = useMemo(() => deriveBasePlacements(editorBaseScene.workstations), [editorBaseScene])
  const contextPlacements = useMemo(
    () => scopedBaseScene.contextWorkstations
      .filter((workstation) => !Object.prototype.hasOwnProperty.call(base, workstation.id))
      .map(placementFromWorkstation),
    [base, scopedBaseScene],
  )
  const baseArea = useMemo(() => deriveEditableArea(dataset, scopedBaseScene), [dataset, scopedBaseScene])
  const area = useMemo(
    () => ({
      ...baseArea,
      editableIds: activeArea?.workstationIds ?? [],
      contextPlacements,
    }),
    [activeArea, baseArea, contextPlacements],
  )
  const displayArea = baseArea
  const editor = useLayoutEditor({ floorId: dataset.layout.floor.id, basePlacements: base, area, store: layoutStore })
  const editing = editor.mode === 'edit'
  const [areaPrompt, setAreaPrompt] = useState(false)
  const [pendingDesk, setPendingDeskState] = useState<PendingDesk | null>(null)
  const pendingDeskRef = useRef<PendingDesk | null>(null)
  const setPendingDesk = useCallback((next: PendingDesk | null) => {
    pendingDeskRef.current = next
    setPendingDeskState(next)
  }, [])

  const addAuthoredDesk = useCallback(() => {
    if (!onAuthoredEntityChange || !editing || !activeArea) return
    const targetArea = activeArea
    const template = dataset.workstations.find((workstation) => workstation.id === targetArea.workstationIds[0]) ?? dataset.workstations[0]
    if (!template) return
    const templatePlacement = placementFromWorkstation(template)
    const issuedNumber = nextAuthoredDeskNumber(authoredEntities ?? { workstations: [], issuedDeskNumbers: [] })
    setPendingDesk({
      workstationId: authoredDeskId(dataset.layout.floor.level, issuedNumber),
      number: issuedNumber,
      zoneId: template.zoneId,
      clusterId: template.clusterId,
      width: templatePlacement.width,
      depth: templatePlacement.depth,
      rotation: templatePlacement.rotation,
      placement: null,
    })
  }, [activeArea, authoredEntities, dataset, editing, onAuthoredEntityChange, setPendingDesk])

  const deleteDesk = useCallback((workstationId: string) => {
    const workstation = dataset.workstations.find((item) => item.id === workstationId)
    if (!workstation || !onAuthoredEntityChange) return
    onAuthoredEntityChange({ removeWorkstationIds: [workstationId] })
    if (selected?.kind === 'workstation' && selected.id === workstationId) onSelect(null)
  }, [dataset.workstations, onAuthoredEntityChange, onSelect, selected])

  // What is drawn: the authoritative geometry moved to its current placements.
  const scene = useMemo(() => applyPlacements(scopedBaseScene, base, editor.placements), [scopedBaseScene, base, editor.placements])
  const departmentScene = useMemo(() => applyPlacements(overviewScene, base, editor.placements), [overviewScene, base, editor.placements])

  const allDesks = useMemo(() => buildDeskIndex(dataset, allocation, now), [dataset, allocation, now])
  const departmentDesks = useMemo(() => {
    const entries: Array<readonly [string, DeskRecord]> = []
    for (const ws of departmentScene.workstations) {
      const record = allDesks.get(ws.id)
      // the record keeps its own identity while nothing has moved, so the
      // inspector and the map always describe the same geometry
      if (record) entries.push([ws.id, record.workstation === ws ? record : { ...record, workstation: ws }] as const)
    }
    return new Map(entries)
  }, [allDesks, departmentScene])
  const desks = useMemo(() => {
    const entries: Array<readonly [string, DeskRecord]> = []
    for (const workstation of scene.workstations) {
      const record = departmentDesks.get(workstation.id)
      if (record) entries.push([
        workstation.id,
        record.workstation === workstation ? record : { ...record, workstation },
      ] as const)
    }
    return new Map(entries)
  }, [departmentDesks, scene])
  const contextDesks = useMemo(() => {
    const entries: Array<readonly [string, DeskRecord]> = []
    for (const workstation of scene.contextWorkstations) {
      const record = allDesks.get(workstation.id)
      if (record) entries.push([workstation.id, record] as const)
    }
    return new Map(entries)
  }, [allDesks, scene.contextWorkstations])
  const search = useMemo(
    () => buildSearchIndex(dataset, departmentDesks).filter((item) => item.target.kind === 'workstation' && departmentDesks.has(item.target.id)),
    [dataset, departmentDesks],
  )
  const scopeLabel = activeArea?.label ?? overviewScene.resolvedScope.label
  const svgRef = useRef<SVGSVGElement>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>([0, 0])
  const [exitPrompt, setExitPrompt] = useState(false)
  const drag = useRef<DragSession | null>(null)
  const pendingPan = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const pendingZoomFactor = useRef(1)
  const pendingDrag = useRef<Point | null>(null)
  const rafId = useRef<number | null>(null)
  const desk = selected?.kind === 'workstation' ? departmentDesks.get(selected.id) : undefined
  const visibleDesk = selected?.kind === 'workstation' ? desks.get(selected.id) : undefined
  const outsideScope = selected !== null && !visibleDesk

  // Pointer handlers and rAF callbacks reach the editor through a ref so they
  // never capture a stale closure and never need re-binding mid-gesture.
  const editorRef = useRef(editor)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])
  const pendingEditAreaRef = useRef<string | null>(null)
  useEffect(() => {
    const areaToOpen = pendingEditAreaRef.current
    if (!areaToOpen || activeArea?.id !== areaToOpen || editorRef.current.mode !== 'view') return
    pendingEditAreaRef.current = null
    editorRef.current.enterEdit()
  }, [activeArea])

  const codeOf = useCallback(
    (entityId: string) => (departmentDesks.get(entityId) ?? allDesks.get(entityId))?.seat.code.split('-').at(-1) ?? entityId,
    [allDesks, departmentDesks],
  )
  /** Rotating from the map keeps the keyboard on the map, where R and the arrows live. */
  const rotateSelected = useCallback((entityId: string) => {
    if (!editorRef.current.canRotate(entityId)) return
    editorRef.current.rotate(entityId)
    svgRef.current?.focus()
  }, [])
  const undoStep = useCallback(() => {
    editorRef.current.undo()
    svgRef.current?.focus()
  }, [])
  const redoStep = useCallback(() => {
    editorRef.current.redo()
    svgRef.current?.focus()
  }, [])
  const selectedId = visibleDesk?.workstation.id
  const movedFromOriginal = (() => {
    if (!selectedId) return false
    const original = base[selectedId]
    const current = editor.placements[selectedId]
    return !!original && !!current && !placementsEqual(original, current)
  })()
  const selectedValidation = desk ? editor.validation.get(desk.workstation.id) : undefined
  const invalidCount = useMemo(() => [...editor.validation.values()].filter((v) => !v.valid).length, [editor.validation])

  useEffect(() => {
    onDirtyChange?.(editor.dirty)
  }, [onDirtyChange, editor.dirty])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  useEffect(() => {
    if (!editing && pendingDeskRef.current) setPendingDesk(null)
  }, [editing, setPendingDesk])

  // The scene is framed from its own geometry, so it fills whatever stage it gets.
  const bounds = useMemo<BBox>(() => sceneBounds(scopedBaseScene), [scopedBaseScene])
  const stageSize = stage ?? DEFAULT_STAGE
  const frame = useMemo(() => fitViewBox(bounds, stageSize, SCENE_PADDING), [bounds, stageSize])
  const overviewFrame = useMemo(
    () => fitViewBox(sceneBounds(overviewScene), stageSize, SCENE_PADDING),
    [overviewScene, stageSize],
  )
  const viewBox = frame.join(' ')
  const origin: Point = useMemo(() => [frame[0] + frame[2] / 2, frame[1] + frame[3] / 2], [frame])
  /**
   * How far the scene may be dragged off centre.
   *
   * The content is scaled about the frame's centre, so at zoom z its edge sits
   * (z - 1) / 2 of a frame beyond the viewport. A fixed share of the frame was
   * therefore reachable only near 1x: at 3.5x the outer third of a focused area
   * could not be brought into view at all. Taking the larger of the two keeps
   * the gentle slack for a scene that already fits.
   */
  const panLimit: Point = useMemo(() => {
    const share = Math.max(PAN_LIMIT, (zoom - 1) / 2)
    return [frame[2] * share, frame[3] * share]
  }, [frame, zoom])
  const detailTier = detailTierForZoom(effectiveZoom(zoom, overviewFrame[2], frame[2]))
  const panLimitRef = useRef(panLimit)
  useEffect(() => {
    panLimitRef.current = panLimit
  }, [panLimit])

  // Cached CTM scale outside gesture hot path to prevent layout queries
  const scaleRef = useRef(1)
  useEffect(() => {
    if (stage && frame && frame[2] > 0) {
      scaleRef.current = stage.width / frame[2]
    }
  }, [stage, frame])
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const pointerFloorPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    const width = rect?.width || stage?.width || 0
    const height = rect?.height || stage?.height || 0
    if (!(width > 0) || !(height > 0)) return null
    const projected: Point = [
      frame[0] + ((clientX - (rect?.left ?? 0)) / width) * frame[2],
      frame[1] + ((clientY - (rect?.top ?? 0)) / height) * frame[3],
    ]
    const safeZoom = zoom > 0 ? zoom : 1
    return unproject([
      origin[0] + (projected[0] - pan[0] - origin[0]) / safeZoom,
      origin[1] + (projected[1] - pan[1] - origin[1]) / safeZoom,
    ])
  }, [frame, origin, pan, stage, svgRef, zoom])

  const placementForPointer = useCallback((pending: PendingDesk, clientX: number, clientY: number) => {
    const point = pointerFloorPoint(clientX, clientY)
    if (!point) return null
    return snapPlacementToGrid({
      entityId: pending.workstationId,
      x: point[0],
      y: point[1],
      width: pending.width,
      depth: pending.depth,
      rotation: pending.rotation,
    }, area.grid)
  }, [area.grid, pointerFloorPoint])

  const validateNewPlacement = useCallback((placement: SpatialPlacement) => {
    const others = area.contextPlacements?.length
      ? [...Object.values(editor.placements), ...area.contextPlacements]
      : Object.values(editor.placements)
    return validatePlacement(placement, {
      others,
      boundary: area.boundary,
      roomBoundary: area.roomBoundary,
      departmentZone: area.departmentZone,
      obstacles: area.obstacles,
      tolerance: area.tolerance,
      boundaryTolerance: area.boundaryTolerance,
      chairTileSize: area.chairTileSize,
    })
  }, [area, editor.placements])

  const pendingValidation = useMemo(() => {
    if (!pendingDesk?.placement) return undefined
    return validateNewPlacement(pendingDesk.placement)
  }, [pendingDesk, validateNewPlacement])

  const commitPendingDesk = useCallback((pending: PendingDesk, placement: SpatialPlacement) => {
    if (!onAuthoredEntityChange || !validateNewPlacement(placement).valid) return false
    const workstation = authoredWorkstationFromPlacement({
      dataset,
      placement,
      number: pending.number,
      zoneId: pending.zoneId,
      clusterId: pending.clusterId,
      authoredBy: 'demo-admin',
      authoredAt: new Date().toISOString(),
    })
    onAuthoredEntityChange({
      workstations: [workstation],
      issuedDeskNumbers: [pending.number],
      sourcePdfSha256: dataset.layout.sourcePdfSha256,
    })
    editorRef.current.addPlacement(placement)
    setPendingDesk(null)
    onSelect({ kind: 'workstation', id: workstation.id })
    return true
  }, [dataset, onAuthoredEntityChange, onSelect, setPendingDesk, validateNewPlacement])

  const flushFrame = useCallback(() => {
    rafId.current = null
    const { dx, dy } = pendingPan.current
    const factor = pendingZoomFactor.current
    const objectDelta = pendingDrag.current
    pendingPan.current = { dx: 0, dy: 0 }
    pendingZoomFactor.current = 1
    pendingDrag.current = null

    const limit = panLimitRef.current
    if (dx !== 0 || dy !== 0) {
      setPan(([x, y]) => [
        Math.max(-limit[0], Math.min(limit[0], x + dx)),
        Math.max(-limit[1], Math.min(limit[1], y + dy)),
      ])
    }
    if (factor !== 1) {
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)))
    }
    if (objectDelta) editorRef.current.dragTo(objectDelta)
  }, [])

  const scheduleFrame = useCallback(() => {
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(flushFrame)
    }
  }, [flushFrame])

  useEffect(() => {
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
    }
  }, [])

  const reset = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
    pendingPan.current = { dx: 0, dy: 0 }
    pendingZoomFactor.current = 1
    setZoom(1)
    setPan([0, 0])
  }, [])

  const changeScope = useCallback((nextAreaId: string | null) => {
    setAreaId(nextAreaId)
    setAreaPrompt(false)
    reset()
  }, [reset])

  const chooseDepartment = useCallback((nextDepartmentId: string) => {
    if (!allocation.departments.some((department) => department.id === nextDepartmentId)) return
    setDepartmentId(nextDepartmentId)
    setAreaId(null)
    setAreaPrompt(false)
    reset()
    onSelect(null)
    // `setDepartmentId` is the page's callback when the page owns the choice,
    // so it belongs in the deps — it is not a stable state setter any more.
  }, [allocation.departments, onSelect, reset, setDepartmentId])

  const returnToDepartmentDashboard = useCallback(() => {
    setDepartmentId(null)
    setAreaId(null)
    setAreaPrompt(false)
    reset()
    onSelect(null)
  }, [onSelect, reset, setDepartmentId])

  const zoomBy = useCallback((factor: number) => {
    if (!Number.isFinite(factor) || factor <= 0) return
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      flushFrame()
    }
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)))
  }, [flushFrame])

  const selectDesk = useCallback((id: string) => {
    onSelect({ kind: 'workstation', id })
    svgRef.current?.focus()
  }, [onSelect])

  /**
   * Measure the stage whenever the node attaches, not once on mount.
   *
   * A mount effect was enough while the map was the first thing rendered. It
   * stopped being enough the moment a department chooser could render first:
   * the effect then ran with no stage in the tree, attached no observer, and
   * never ran again once the map appeared. `stage` stayed null, so
   * `pointerFloorPoint` could not turn a pointer into a floor coordinate and
   * every pointer-driven action — placing an added desk above all — silently
   * did nothing.
   *
   * A callback ref cannot miss it: React calls it with the node on attach and
   * with null on detach, however many times the map comes and goes.
   */
  const stageObserver = useRef<ResizeObserver | null>(null)
  const attachStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el
    stageObserver.current?.disconnect()
    stageObserver.current = null
    if (!el) return
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setStage({ width: el.clientWidth, height: el.clientHeight })
    }
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setStage({ width, height })
    })
    ro.observe(el)
    stageObserver.current = ro
  }, [])

  const releaseDrag = useCallback((cancelObjectMove: boolean) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    pendingDrag.current = null
    try {
      if (svgRef.current?.hasPointerCapture?.(d.id)) svgRef.current.releasePointerCapture(d.id)
    } catch {}
    if (d.kind === 'object') {
      if (cancelObjectMove) editorRef.current.cancelDrag()
      else editorRef.current.endDrag()
    }
  }, [])

  /**
   * Escape is layered: it abandons the gesture in progress first, then the
   * selection. It never discards the edit session — leaving edit mode is an
   * explicit Hủy, so a stray key cannot lose a layout.
   */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return
      // Undo is bound at the window because the inspector and the toolbar can
      // hold focus; the map's own handler only sees keys while the map is focused.
      if (editing && (e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        const redoing = e.key === 'y' || e.key === 'Y' || e.shiftKey
        if (redoing) editorRef.current.redo()
        else editorRef.current.undo()
        return
      }
      if (e.key !== 'Escape') return
      if (pendingDeskRef.current) {
        setPendingDesk(null)
        return
      }
      if (drag.current?.kind === 'object') {
        releaseDrag(true)
        return
      }
      onSelect(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect, releaseDrag, editing, setPendingDesk])

  // Window blur cleans up any active drag to prevent stuck pointer lockouts
  useEffect(() => {
    const onBlur = () => {
      if (!drag.current) return
      releaseDrag(false)
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        flushFrame()
      }
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [flushFrame, releaseDrag])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = normalizeWheelZoom(e.deltaY, e.deltaMode, 0.7)
      if (Number.isFinite(factor) && factor > 0) {
        pendingZoomFactor.current = Math.max(0.01, Math.min(100, pendingZoomFactor.current * factor))
        scheduleFrame()
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      svg.removeEventListener('wheel', onWheel)
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
    }
  }, [scheduleFrame])

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const direction = ARROW_DIRECTION[e.key]
    // Edit mode rebinds the arrows to nudging the selected object; view-mode
    // desk-to-desk navigation is untouched.
    if (editing && visibleDesk) {
      if (direction) {
        e.preventDefault()
        // Nudging runs along the floor's own axes, which is what the grid and
        // the desk rows are aligned to — not along the screen's axes.
        const step = e.shiftKey ? NUDGE_COARSE_CELLS : 1
        const [ux, uy] = DIRECTION_VECTOR[direction]
        editor.nudge(visibleDesk.workstation.id, [ux * step, uy * step])
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        editor.rotate(visibleDesk.workstation.id)
        return
      }
    }
    if (!direction) return
    e.preventDefault()
    const candidates = scene.workstations.map((w) => ({ id: w.id, center: project(w.center) }))
    const from = visibleDesk ? project(visibleDesk.workstation.center) : null
    const next = from ? nearestInDirection(from, direction, candidates, visibleDesk?.workstation.id) : candidates[0]
    if (next) { selectDesk(next.id); reset() }
  }

  const pointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return
    if (drag.current !== null) {
      if (e.pointerType === 'mouse') {
        drag.current = null
      } else {
        return
      }
    }
    const pending = pendingDeskRef.current
    if (editing && pending) {
      const placement = placementForPointer(pending, e.clientX, e.clientY)
      if (placement) setPendingDesk({ ...pending, placement })
      drag.current = { id: e.pointerId, kind: 'place', start: [e.clientX, e.clientY], last: [e.clientX, e.clientY], moved: false }
      return
    }
    const targetEl = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement
    const hit = targetEl?.closest?.('[data-workstation-id]')?.getAttribute('data-workstation-id') ?? undefined
    // In edit mode a press that lands on an object moves that object; a press
    // on the floor still pans. The two gestures never overlap.
    const kind: DragSession['kind'] = editing && hit ? 'object' : 'pan'
    drag.current = { id: e.pointerId, kind, entityId: hit, start: [e.clientX, e.clientY], last: [e.clientX, e.clientY], moved: false }
    if (kind === 'object' && hit) {
      if (selected?.id !== hit) selectDesk(hit)
      editor.startDrag(hit)
    }
  }

  const pointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) {
      const pending = pendingDeskRef.current
      if (editing && pending) {
        const placement = placementForPointer(pending, e.clientX, e.clientY)
        if (placement) setPendingDesk({ ...pending, placement })
      }
      return
    }
    if (d.id !== e.pointerId) return
    if (!d.moved && Math.hypot(e.clientX - d.start[0], e.clientY - d.start[1]) > DRAG_THRESHOLD_PX) {
      d.moved = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
    }
    if (d.kind === 'place') {
      const pending = pendingDeskRef.current
      if (pending) {
        const placement = placementForPointer(pending, e.clientX, e.clientY)
        if (placement) setPendingDesk({ ...pending, placement })
      }
      return
    }
    if (!d.moved) return
    // Read cached scale without forcing layout query (getScreenCTM)
    const rawScale = stage && frame && frame[2] > 0 ? stage.width / frame[2] : scaleRef.current
    const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1

    if (d.kind === 'object') {
      // Measured from the press, not frame to frame, so a snapped placement
      // cannot accumulate drift over a long drag.
      const zoomed = scale * (zoomRef.current > 0 ? zoomRef.current : 1)
      const delta = unprojectDelta([(e.clientX - d.start[0]) / zoomed, (e.clientY - d.start[1]) / zoomed])
      if (Number.isFinite(delta[0]) && Number.isFinite(delta[1])) {
        pendingDrag.current = delta
        scheduleFrame()
      }
      return
    }

    const dx = (e.clientX - d.last[0]) / scale
    const dy = (e.clientY - d.last[1]) / scale
    if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
      d.last = [e.clientX, e.clientY]
    }
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      pendingPan.current.dx += dx
      pendingPan.current.dy += dy
      scheduleFrame()
    }
  }

  const pointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (d.kind === 'place') {
      const pending = pendingDeskRef.current
      const placement = pending ? placementForPointer(pending, e.clientX, e.clientY) ?? pending.placement : null
      drag.current = null
      if (placement && pending) commitPendingDesk(pending, placement)
      return
    }
    const moved = d.moved
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      flushFrame()
    }
    releaseDrag(false)
    if (moved) return
    const targetEl = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement
    const id = targetEl?.closest?.('[data-workstation-id]')?.getAttribute('data-workstation-id')
    if (id) selectDesk(id)
    else onSelect(null)
  }

  const pointerCancel = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (d.kind === 'place') {
      drag.current = null
      return
    }
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      flushFrame()
    }
    releaseDrag(true)
  }

  const changeMode = useCallback((next: WorkspaceMode) => {
    if (next === editorRef.current.mode) return
    if (next === 'edit') {
      if (!activeArea) {
        const selectedArea = selected?.kind === 'workstation'
          ? displayAreas.find((candidate) => candidate.workstationIds.includes(selected.id))
          : undefined
        if (selectedArea) {
          pendingEditAreaRef.current = selectedArea.id
          setAreaId(selectedArea.id)
          setAreaPrompt(false)
          reset()
          return
        }
        setAreaPrompt(true)
        return
      }
      editorRef.current.enterEdit()
      return
    }
    if (!editorRef.current.tryExitEdit()) setExitPrompt(true)
  }, [activeArea, displayAreas, reset, selected])

  const startEditing = useCallback(() => {
    changeMode('edit')
  }, [changeMode])

  const visiblePlacements = useMemo(() => {
    const result: Record<string, SpatialPlacement> = {}
    for (const workstation of scene.workstations) {
      const placement = editor.placements[workstation.id]
      if (placement) result[workstation.id] = placement
    }
    return result
  }, [editor.placements, scene.workstations])

  const statusCounts = useMemo(() => {
    const map = Object.fromEntries(DESK_STATUSES.map((s) => [s, 0])) as Record<DeskStatus, number>
    for (const d of desks.values()) map[d.status]++
    return map
  }, [desks])
  const counts = useCallback((status: DeskStatus) => statusCounts[status] ?? 0, [statusCounts])
  const capacityAnswer = useMemo(() => {
    if (!activeArea) return null
    const freeSeats = activeArea.workstationIds.filter((id) => departmentDesks.get(id)?.status === 'available').length
    if (freeSeats > 0) {
      return <p className="sw-capacity-answer" role="status"><strong>{activeArea.label} còn {freeSeats} chỗ trống.</strong></p>
    }
    const nearest = displayAreas
      .filter((area) => area.id !== activeArea.id)
      .map((area) => ({ area, free: area.workstationIds.filter((id) => departmentDesks.get(id)?.status === 'available').length }))
      .filter(({ free }) => free > 0)
      .sort((a, b) => b.free - a.free || a.area.label.localeCompare(b.area.label, 'vi'))[0]
    return (
      <div className="sw-capacity-answer" role="status">
        <strong>{activeArea.label} đã kín. Không còn chỗ trống.</strong>
        {nearest && <span>Gần nhất: {nearest.area.label} · {nearest.free} chỗ trống</span>}
      </div>
    )
  }, [activeArea, departmentDesks, displayAreas])

  if (startWithDepartmentPicker && !departmentId) {
    return (
      <DepartmentDashboard
        dataset={dataset}
        departments={allocation.departments}
        seats={allocation.seats}
        onChoose={chooseDepartment}
      />
    )
  }

  if (!scene.workstations.length) return <div className="fp-state">{SPATIAL_UNAVAILABLE}</div>

  return <main className={`sw-workspace${editing ? ' is-editing' : ''}`}>
    {searchSlot && createPortal(<FloorSearch index={search} includesPeople onPick={(item) => {
      if (!editing && activeArea && !activeArea.workstationIds.includes(item.target.id)) changeScope(null)
      selectDesk(item.target.id)
    }} />, searchSlot)}
    <div className="sw-main">
      <header className="sw-heading">
        <div>
          <p className="fp-eyebrow sw-breadcrumb">{dataset.building.name} <span>/</span> {dataset.layout.floor.name} <span>/</span> {overviewScene.resolvedScope.label}{scope.kind === 'bbox' ? <><span>/</span> {scopeLabel}</> : null}</p>
          {/* Seat count and scope live in the side panel's summary, not here. */}
          <h2 className="fp-page-title">{scopeLabel}</h2>
          {reconcile && reconcile.stale.length > 0 && (
            <p className="sw-reconcile-notice" role="status">
              <strong>{reconcile.stale.length} phân công không khớp mặt bằng.</strong>{' '}
              <a
                href="#stale-seat-assignments"
                onClick={(event) => {
                  event.preventDefault()
                  document.getElementById('stale-seat-assignments')?.scrollIntoView({ block: 'nearest' })
                }}
              >Xem danh sách đối chiếu</a>
            </p>
          )}
        </div>
        <div className="sw-heading-actions">
            {editing ? (
            <>
              {onAuthoredEntityChange && (
                <button type="button" className="fp-btn" onClick={addAuthoredDesk}>
                  + Thêm bàn
                </button>
              )}
              <EditToolbar
                dirty={editor.dirty && !pendingDesk}
                valid={editor.valid && !pendingDesk}
                saving={editor.saving}
                changedCount={editor.changedCount}
                invalidCount={invalidCount}
                canUndo={editor.canUndo}
                canRedo={editor.canRedo}
                undoHint={UNDO_HINT}
                redoHint={REDO_HINT}
                onUndo={undoStep}
                onRedo={redoStep}
                /* Hủy throws away a session's work, so it asks first when there
                   is work to lose — the same confirmation the page uses. */
                onCancel={() => changeMode('view')}
                onSave={() => { void editor.save() }}
              />
            </>
          ) : (
            <>
              {startWithDepartmentPicker && departmentId && (
                <button type="button" className="fp-btn sw-department-back" onClick={returnToDepartmentDashboard}>
                  ← Chọn bộ phận
                </button>
              )}
              <EnterEditButton
                onClick={startEditing}
                title={activeArea ? undefined : (displayAreas.length ? LAYOUT_EDIT.chooseArea : SPATIAL_NO_EDIT_AREAS)}
              />
            </>
          )}
        </div>
      </header>
      <section className="sw-map-panel" aria-label="Không gian bố trí chỗ ngồi">
        <div className="sw-map-top">
          <nav className="sw-scope-nav" aria-label="Phạm vi không gian">
            <button
              type="button"
              className="fp-btn"
              aria-pressed={scope.kind !== 'bbox'}
              disabled={editing}
              onClick={() => changeScope(null)}
            >Tổng quan</button>
            <label>
              <span className="fp-sr-only">Tập trung khu vực</span>
            <select
              aria-label="Tập trung khu vực"
              value={activeArea?.id ?? ''}
              disabled={editing}
                onChange={(event) => {
                  const focus = displayAreas.find((area) => area.id === event.target.value)
                  if (focus) changeScope(focus.id)
                }}
              >
                <option value="">Khu vực…</option>
                {displayAreas.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
              </select>
            </label>
          </nav>
          {editing
            ? <span className="sw-edit-caption">{pendingDesk ? 'Di chuyển chuột trên bản đồ, nhấp để đặt bàn · Esc để hủy' : <span title={LAYOUT_EDIT.gridNote}>{LAYOUT_EDIT.gridLabel(GRID_CELL_MM)}</span>}</span>
            : desk ? <span className="sw-selected-caption">{`Đang chọn ${desk.seat.code}${outsideScope ? ' · ngoài khu vực đang xem' : ''}`}</span> : null}
        </div>
        <div className="sw-map-stage" ref={attachStage}>
          <WorkspaceScene
            scene={scene}
            desks={desks}
            contextDesks={contextDesks}
            selectedId={visibleDesk?.workstation.id}
            onSelect={selectDesk}
            svgRef={svgRef}
            viewBox={viewBox}
            origin={origin}
            zoom={zoom}
            pan={pan}
            detailTier={detailTier}
            ariaLabel={editing ? `Chỉnh sửa bố trí · ${scopeLabel}` : undefined}
            ground={editing ? <EditGround area={displayArea} grid={editor.gridFor(selectedId)} /> : undefined}
            overlay={editing ? (
              <EditAffordances
                placements={visiblePlacements}
                selectedId={visibleDesk?.workstation.id}
                validation={editor.validation}
                preview={pendingDesk?.placement ? { placement: pendingDesk.placement, valid: pendingValidation?.valid === true } : undefined}
                deskHeight={scene.deskHeight}
                mmPerPt={dataset.layout.floor.mmPerPt}
                dragging={editor.drag?.moved === true}
                onRotate={rotateSelected}
                obstacles={area.displayObstacles ?? area.obstacles}
              />
            ) : undefined}
            onKeyDown={onKeyDown}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerCancel}
          />
          <div className="fp-toolbar sw-map-controls" role="toolbar" aria-label="Điều khiển khung nhìn">
            <div className="fp-btn-group">
              <button type="button" aria-label="Thu nhỏ" title="Thu nhỏ" onClick={() => zoomBy(1 / 1.2)} disabled={zoom <= MIN_ZOOM}>−</button>
              <output aria-label="Mức thu phóng">{Math.round(zoom * 100)}%</output>
              <button type="button" aria-label="Phóng to" title="Phóng to" onClick={() => zoomBy(1.2)} disabled={zoom >= MAX_ZOOM}>+</button>
            </div>
            <button type="button" title="Đưa toàn bộ khu vực vào khung nhìn" onClick={reset}>Vừa khung</button>
          </div>
        </div>
      </section>
    </div>
    <div className="sw-context">
      {editing && !editor.valid && (
        <div className="sw-edit-sidebar-alert" role="alert">
          <span aria-hidden="true">⚠</span> {LAYOUT_EDIT.invalidSummary(invalidCount)}
        </div>
      )}
      {editing && visibleDesk && (
        <EditInspector
          code={visibleDesk.seat.code}
          placement={editor.placements[visibleDesk.workstation.id]}
          validation={selectedValidation}
          area={displayArea}
          mmPerPt={dataset.layout.floor.mmPerPt}
          codeOf={codeOf}
          moved={movedFromOriginal}
          onRotate={() => rotateSelected(visibleDesk.workstation.id)}
          rotateDisabled={!editor.canRotate(visibleDesk.workstation.id)}
          rotateHint={LAYOUT_EDIT.rotateBlocked}
          boundaryWarning={editor.nearBoundary(visibleDesk.workstation.id) ? LAYOUT_EDIT.boundaryWarning : undefined}
          onReset={() => { editor.resetPlacement(visibleDesk.workstation.id); svgRef.current?.focus() }}
          canDelete={Boolean(onAuthoredEntityChange)}
          onDelete={() => deleteDesk(visibleDesk.workstation.id)}
        />
      )}
      {editing && !visibleDesk && (
        <section className="sw-edit-empty">
          <p className="fp-eyebrow">{LAYOUT_EDIT.selectedTitle}</p>
          <p className="sw-edit-empty-body">{LAYOUT_EDIT.noSelection}</p>
          <p className="sw-edit-hint">{LAYOUT_EDIT.hint}</p>
        </section>
      )}
      {desk && <CompactInspector
        desk={desk}
        allocation={allocation}
        now={now}
        canUndo={canUndo && allocation.source.kind === 'demo'}
        onApplyMutations={applyAllocationChange}
        onSearchEmployees={onSearchEmployees}
        onRegisterEmployee={registerEmployee}
        onUndo={undoAllocationChange}
        onDelete={deleteDesk}
        canDelete={Boolean(onAuthoredEntityChange)}
        showHeader={!editing}
        onClose={() => { onSelect(null); svgRef.current?.focus() }}
        onVerify={onVerify}
      />}
      {editing && (
        <p className="sw-edit-note">
          {LAYOUT_EDIT.boundaryNote}
        </p>
      )}
      <ScopeSummary dataset={dataset} areaLabel={scopeLabel} departmentZone={departmentZone} count={desks.size} counts={counts} capacityAnswer={capacityAnswer}>
        {/*
          * No "pick a desk" prompt: the map already reads as clickable. This
          * only speaks up when a deep link points at a desk outside the scope,
          * where the panel would otherwise look empty for no stated reason.
          */}
        {outsideScope && (
          <div className="sw-overview">
            <h3 className="sw-empty-title">{SPATIAL_OUT_OF_SCOPE}</h3>
            <p>{SPATIAL_OUT_OF_SCOPE_HINT}</p>
            <button type="button" className="fp-btn is-wide sw-verify" onClick={onVerify}>Đối chiếu trên bản vẽ <span aria-hidden="true">↗</span></button>
          </div>
        )}
      </ScopeSummary>
      {reconcile && reconcile.stale.length > 0 && (
        <details id="stale-seat-assignments" className="sw-reconcile-list" open>
          <summary>Danh sách phân công cần đối chiếu ({reconcile.stale.length})</summary>
          <ul>
            {reconcile.stale.map((item) => (
              <li key={item.assignment_id}>
                <span className="fp-mono">{item.workstation_id}</span> · {item.employee_code} · {item.reason === 'missing-seat' ? 'không có trên mặt bằng' : 'khác phiên bản mặt bằng'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
    {exitPrompt && (
      <UnsavedChangesDialog
        onStay={() => setExitPrompt(false)}
        onDiscard={() => { setExitPrompt(false); editor.cancel() }}
      />
    )}
    <p className="fp-sr-only" aria-live="polite">{areaPrompt ? (displayAreas.length ? LAYOUT_EDIT.chooseArea : SPATIAL_NO_EDIT_AREAS) : desk ? `Đã chọn bàn ${desk.seat.code} · ${DESK_STATUS[desk.status].label}` : 'Chưa chọn bàn'}</p>
  </main>
}
