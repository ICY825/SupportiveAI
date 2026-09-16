import { memo, useId, useMemo } from 'react'
import type { PlacementValidation, SpatialPlacement } from '../domain/placement'
import { LAYOUT_EDIT } from '../labels'
import { buildEditOverlay, placementOutline, rotateHandleAnchor } from './editGeometry'
import type { EditableArea } from './layoutDraft'

/**
 * Editing affordances drawn inside the scene. None of this exists in view
 * mode: the map stays a map until the person asks to change it.
 *
 * Split in two because draw order matters — the grid belongs under the
 * furniture it guides, the selection and the invalid marks belong over it.
 */

/** Subtle planning grid and the outline of the area layout may use. */
export const EditGround = memo(function EditGround({ area }: { area: EditableArea }) {
  const overlay = useMemo(() => buildEditOverlay(area), [area])
  return (
    <g className="sw-edit-ground" aria-hidden="true" pointerEvents="none">
      <polygon className="sw-edit-boundary" points={overlay.boundary} />
      <g className="sw-edit-grid">
        {overlay.dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.2} />
        ))}
      </g>
    </g>
  )
})

export function EditAffordances({
  placements,
  selectedId,
  validation,
  deskHeight,
  dragging,
  onRotate,
}: {
  placements: Record<string, SpatialPlacement>
  selectedId: string | undefined
  validation: ReadonlyMap<string, PlacementValidation>
  deskHeight: number
  dragging: boolean
  onRotate: (entityId: string) => void
}) {
  const hatchId = useId()
  const selected = selectedId ? placements[selectedId] : undefined
  const invalid = useMemo(
    () => Object.values(placements).filter((p) => validation.get(p.entityId)?.valid === false),
    [placements, validation],
  )
  const handle = selected && !dragging ? rotateHandleAnchor(selected, deskHeight) : null

  return (
    <g className="sw-edit-layer">
      <defs>
        {/* Hatch, not a colour wash: invalid must read without relying on hue. */}
        <pattern id={hatchId} width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.6" stroke="#b6443d" strokeWidth="0.45" />
        </pattern>
      </defs>
      <g pointerEvents="none" aria-hidden="true">
        {invalid.map((placement) => (
          <g key={placement.entityId} className="sw-edit-invalid">
            <polygon points={placementOutline(placement, deskHeight)} fill={`url(#${hatchId})`} opacity={0.4} />
            <polygon points={placementOutline(placement, deskHeight)} />
          </g>
        ))}
        {selected && (
          <g className="sw-edit-selected">
            {/* footprint on the floor, so the target cell is readable while dragging */}
            <polygon className="sw-edit-footprint" points={placementOutline(selected, 0)} />
            <polygon className="sw-edit-box" points={placementOutline(selected, deskHeight)} />
          </g>
        )}
      </g>
      {handle && selectedId && (
        <g
          className="sw-edit-handle"
          transform={`translate(${handle[0] + 3.2} ${handle[1] - 2.4})`}
          role="button"
          tabIndex={-1}
          aria-label={LAYOUT_EDIT.rotate}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onRotate(selectedId)
          }}
        >
          <title>{LAYOUT_EDIT.rotate}</title>
          <circle r={2.3} />
          <path d="M-1.05 0.35a1.2 1.2 0 1 0 .38-1.15" />
          <path d="M-1.35-1.15 -.6-.72 -1.1 0Z" className="sw-edit-handle-tip" />
        </g>
      )}
    </g>
  )
}
