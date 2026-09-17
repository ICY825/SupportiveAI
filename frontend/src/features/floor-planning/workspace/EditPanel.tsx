import type { PlacementValidation, SpatialPlacement } from '../domain/placement'
import { placementBounds } from '../domain/placement'
import { LAYOUT_EDIT, placementIssueText, placementIssueTitle, SEAT_ASSIGNMENT } from '../labels'
import type { EditableArea } from './layoutDraft'

/** Vietnamese decimal separator; these are readings, not inputs. */
const metres = (points: number, mmPerPt: number) => (Math.abs((points * mmPerPt) / 1000) + 0.0001).toFixed(1).replace('.', ',')

export function PlacementStatus({
  validation,
  codeOf,
  className,
}: {
  validation: PlacementValidation | undefined
  codeOf: (entityId: string) => string
  className?: string
}) {
  const ok = validation?.valid !== false
  return (
    <p className={`sw-placement-status${className ? ` ${className}` : ''}`} data-valid={ok ? 'true' : 'false'}>
      <span aria-hidden="true">{ok ? '✓' : '⚠'}</span>
      {ok
        ? LAYOUT_EDIT.valid
        : (validation?.reasons ?? []).map((issue, index) => (
          <span key={`${issue.type}-${index}`} title={placementIssueTitle(issue, codeOf)}>
            {index > 0 ? ' · ' : null}{placementIssueText(issue, codeOf)}
          </span>
        ))}
    </p>
  )
}

/**
 * Entry point to editing. A single action, not a second segmented control: the
 * page already has one of those in the top bar for choosing a view, and two
 * lookalike switches a few rows apart read as four peer modes rather than as a
 * view and a task. In edit mode this button is replaced by EditToolbar.
 */
export function EnterEditButton({ onClick, disabled = false, title }: { onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className="fp-btn sw-enter-edit" onClick={onClick} disabled={disabled} title={title ?? LAYOUT_EDIT.enterHint}>
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M10.6 2.4l3 3L6 13H3v-3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {LAYOUT_EDIT.enter}
    </button>
  )
}

/**
 * Save / Cancel, docked with the mode control above the map. Save refuses a
 * draft that is unchanged or that still contains an invalid placement: an
 * invalid layout must never reach the commit boundary.
 */
export function EditToolbar({
  dirty,
  valid,
  saving,
  changedCount,
  invalidCount,
  canUndo = false,
  canRedo = false,
  undoHint = '',
  redoHint = '',
  onUndo,
  onRedo,
  onCancel,
  onSave,
}: {
  dirty: boolean
  valid: boolean
  saving: boolean
  changedCount: number
  invalidCount: number
  canUndo?: boolean
  canRedo?: boolean
  /** shortcut spelled for this platform, e.g. "⌘Z" */
  undoHint?: string
  redoHint?: string
  /** the history group is drawn only when both handlers are supplied */
  onUndo?: () => void
  onRedo?: () => void
  onCancel: () => void
  onSave: () => void
}) {
  const blocked = !dirty || !valid || saving
  return (
    <div className="sw-edit-toolbar">
      {onUndo && onRedo && (
        <div className="fp-toolbar sw-history" role="group" aria-label="Lịch sử chỉnh sửa">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={LAYOUT_EDIT.undo}
            title={`${LAYOUT_EDIT.undo} (${undoHint})`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M3 7h6.2a3.4 3.4 0 0 1 0 6.8H6M3 7l2.6-2.6M3 7l2.6 2.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label={LAYOUT_EDIT.redo}
            title={`${LAYOUT_EDIT.redo} (${redoHint})`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M13 7H6.8a3.4 3.4 0 0 0 0 6.8H10M13 7l-2.6-2.6M13 7l-2.6 2.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
      <button type="button" className="fp-btn" onClick={onCancel}>
        {LAYOUT_EDIT.cancel}
      </button>
      <button
        type="button"
        className="fp-btn is-primary"
        onClick={onSave}
        disabled={blocked}
        title={!valid ? LAYOUT_EDIT.invalidSummary(invalidCount) : undefined}
      >
        {saving ? LAYOUT_EDIT.saving : LAYOUT_EDIT.save}
      </button>
      <p className="sw-edit-state" data-blocked={!valid ? 'invalid' : undefined}>
        {!valid
          ? LAYOUT_EDIT.invalidSummary(invalidCount)
          : dirty
            ? LAYOUT_EDIT.changed(changedCount)
            : LAYOUT_EDIT.noChange}
      </p>
    </div>
  )
}

/**
 * The selected object's placement. Layout is the dominant task here, so this
 * heads the panel; the desk's people and seat facts stay below it, unchanged.
 */
export function EditInspector({
  code,
  placement,
  validation,
  area,
  mmPerPt,
  moved,
  codeOf,
  onRotate,
  rotateDisabled = false,
  rotateHint,
  boundaryWarning,
  onReset,
  canDelete = false,
  onDelete,
}: {
  code: string
  placement: SpatialPlacement
  validation: PlacementValidation | undefined
  area: EditableArea
  mmPerPt: number
  /** differs from the authoritative placement, so "back to original" is offered */
  moved: boolean
  codeOf: (entityId: string) => string
  onRotate: () => void
  rotateDisabled?: boolean
  rotateHint?: string
  boundaryWarning?: string
  onReset: () => void
  canDelete?: boolean
  onDelete?: () => void
}) {
  const [x0, y0] = placementBounds(placement)
  return (
    <section className="sw-edit-inspector" aria-labelledby="sw-edit-title">
      <p className="fp-eyebrow">{LAYOUT_EDIT.selectedTitle}</p>
      <h2 id="sw-edit-title" className="fp-card-title">
        {code}
      </h2>
      <dl className="fp-facts sw-edit-facts">
        <div>
          <dt>{LAYOUT_EDIT.rotation}</dt>
          <dd>{placement.rotation}°</dd>
        </div>
        <div>
          <dt>{LAYOUT_EDIT.position}</dt>
          {/* Distance from the layout area's corner, not a drawing coordinate. */}
          <dd className="sw-edit-coords">
            X {metres(x0 - area.boundary.bbox[0], mmPerPt)} m · Y {metres(y0 - area.boundary.bbox[1], mmPerPt)} m
          </dd>
        </div>
      </dl>
      <p className="fp-eyebrow sw-edit-status-label">{LAYOUT_EDIT.placementStatus}</p>
      <PlacementStatus validation={validation} codeOf={codeOf} />
      {boundaryWarning && <p className="sw-edit-boundary-warning" role="status">{boundaryWarning}</p>}
      {rotateDisabled && rotateHint && <p className="sw-edit-rotate-hint" role="status">{rotateHint}</p>}
      <button type="button" className="fp-btn is-wide sw-edit-rotate" onClick={onRotate} disabled={rotateDisabled} title={rotateDisabled ? rotateHint : undefined}>
        {LAYOUT_EDIT.rotate}
        <kbd>R</kbd>
      </button>
      {/* The snap lattice is anchored on this desk's own original corner, so
          the original position is always one of the cells it can land on. This
          is the direct way back when it is several cells away. */}
      {moved && (
        <button type="button" className="fp-btn is-wide sw-edit-reset" onClick={onReset}>
          {LAYOUT_EDIT.reset}
          <span aria-hidden="true">↺</span>
        </button>
      )}
      {canDelete && onDelete && (
        <button type="button" className="fp-btn is-wide is-danger sw-edit-delete" onClick={onDelete}>
          {SEAT_ASSIGNMENT.delete}
        </button>
      )}
      <p className="sw-edit-hint">{LAYOUT_EDIT.hint}</p>
    </section>
  )
}

export function UnsavedChangesDialog({ onStay, onDiscard }: { onStay: () => void; onDiscard: () => void }) {
  return (
    <div className="sw-dirty-backdrop" role="presentation" onClick={onStay}>
      <div
        className="fp-card sw-dirty-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sw-dirty-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sw-dirty-title">{LAYOUT_EDIT.dirtyTitle}</h2>
        <p>{LAYOUT_EDIT.dirtyBody}</p>
        <div className="sw-dirty-actions">
          <button type="button" className="fp-btn" onClick={onDiscard}>
            {LAYOUT_EDIT.dirtyDiscard}
          </button>
          <button type="button" className="fp-btn is-primary" onClick={onStay} autoFocus>
            {LAYOUT_EDIT.dirtyStay}
          </button>
        </div>
      </div>
    </div>
  )
}
