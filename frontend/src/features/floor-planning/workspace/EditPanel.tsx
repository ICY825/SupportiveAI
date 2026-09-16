import type { PlacementValidation, SpatialPlacement } from '../domain/placement'
import { placementBounds } from '../domain/placement'
import { LAYOUT_EDIT, LAYOUT_MODES, placementIssueText } from '../labels'
import type { EditableArea } from './layoutDraft'
import type { WorkspaceMode } from './useLayoutEditor'

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
        : (validation?.reasons ?? []).map((issue) => placementIssueText(issue, codeOf)).join(' · ')}
    </p>
  )
}

/** Mode control. Two plain states; nothing about it announces a new product. */
export function LayoutModeSwitch({ mode, onChange }: { mode: WorkspaceMode; onChange: (mode: WorkspaceMode) => void }) {
  return (
    <div className="fp-segmented sw-mode-switch" role="radiogroup" aria-label="Chế độ bố trí">
      {LAYOUT_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          title={m.hint}
          className={mode === m.id ? 'is-active' : ''}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
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
  onCancel,
  onSave,
}: {
  dirty: boolean
  valid: boolean
  saving: boolean
  changedCount: number
  invalidCount: number
  onCancel: () => void
  onSave: () => void
}) {
  const blocked = !dirty || !valid || saving
  return (
    <div className="sw-edit-toolbar">
      <p className="sw-edit-state" data-blocked={!valid ? 'invalid' : undefined}>
        {!valid
          ? LAYOUT_EDIT.invalidSummary(invalidCount)
          : dirty
            ? LAYOUT_EDIT.changed(changedCount)
            : LAYOUT_EDIT.noChange}
      </p>
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
  codeOf,
  onRotate,
}: {
  code: string
  placement: SpatialPlacement
  validation: PlacementValidation | undefined
  area: EditableArea
  mmPerPt: number
  codeOf: (entityId: string) => string
  onRotate: () => void
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
      <button type="button" className="fp-btn is-wide sw-edit-rotate" onClick={onRotate}>
        {LAYOUT_EDIT.rotate}
        <kbd>R</kbd>
      </button>
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
