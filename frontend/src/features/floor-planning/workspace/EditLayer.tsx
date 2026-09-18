import { memo, useId, useMemo } from 'react'
import { placementBounds } from '../domain/placement'
import { clipPolygonToBBox } from '../domain/geometry'
import type { PlacementValidation, SpatialGrid, SpatialPlacement } from '../domain/placement'
import type { BBox, FloorObstacle } from '../domain/spatial'
import { LAYOUT_EDIT } from '../labels'
import { buildEditOverlay, placementOutline, rotateHandleAnchor } from './editGeometry'
import type { EditableArea } from './layoutDraft'
import { projectedPoints } from './scene'

/**
 * Editing affordances drawn inside the scene. None of this exists in view
 * mode: the map stays a map until the person asks to change it.
 *
 * Split in two because draw order matters — the grid belongs under the
 * furniture it guides, the selection and the invalid marks belong over it.
 */

/** Subtle planning grid and the outline of the area layout may use. */
export const EditGround = memo(function EditGround({ area, grid }: { area: EditableArea; grid: SpatialGrid }) {
  const overlay = useMemo(() => buildEditOverlay(area, grid), [area, grid])
  return (
    <g className="sw-edit-ground" aria-hidden="true" pointerEvents="none">
      <polygon className="sw-edit-boundary" points={overlay.boundary} />
      {overlay.doorClearances.length > 0 && (
        <g className="sw-edit-clearances">
          {overlay.doorClearances.map((c) => (
            <polygon key={c.id} className="sw-edit-clearance" points={c.points} data-clearance-id={c.id}>
              {c.name ? <title>{c.name}</title> : null}
            </polygon>
          ))}
        </g>
      )}
      <g className="sw-edit-grid">
        {overlay.dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.2} />
        ))}
      </g>
    </g>
  )
})

export interface EditAffordancesProps {
  placements: Record<string, SpatialPlacement>
  selectedId: string | undefined
  validation: ReadonlyMap<string, PlacementValidation>
  preview?: { placement: SpatialPlacement; valid: boolean }
  deskHeight: number
  mmPerPt: number
  dragging: boolean
  onRotate: (entityId: string) => void
  obstacles?: readonly FloorObstacle[]
}

export function EditAffordances({
  placements,
  selectedId,
  validation,
  preview,
  deskHeight,
  mmPerPt,
  dragging,
  onRotate,
  obstacles,
}: EditAffordancesProps) {
  const hatchId = useId()
  const selected = selectedId ? placements[selectedId] : undefined
  const invalid = useMemo(
    () => Object.values(placements).filter((p) => validation.get(p.entityId)?.valid === false),
    [placements, validation],
  )

  const obstacleMap = useMemo(() => {
    if (!obstacles || obstacles.length === 0) return new Map<string, FloorObstacle>()
    return new Map(obstacles.map((o) => [o.id, o]))
  }, [obstacles])

  const collidingObstacles = useMemo(() => {
    if (obstacleMap.size === 0) return []
    const collidingMap = new Map<string, { obstacle: FloorObstacle; clips: BBox[] }>()
    const margin = 1000 / mmPerPt
    for (const [entityId, val] of validation) {
      if (val.valid) continue
      for (const reason of val.reasons) {
        if (
          (reason.type === 'obstacle-collision' || reason.type === 'clearance-conflict') &&
          reason.obstacleId
        ) {
          const obs = obstacleMap.get(reason.obstacleId)
          const placement = placements[entityId]
          if (obs && placement) {
            const [x0, y0, x1, y1] = placementBounds(placement)
            const clippedTo: BBox = [x0 - margin, y0 - margin, x1 + margin, y1 + margin]
            const current = collidingMap.get(obs.id) ?? { obstacle: obs, clips: [] }
            current.clips.push(clippedTo)
            collidingMap.set(obs.id, current)
          }
        }
      }
    }
    return Array.from(collidingMap.values())
  }, [mmPerPt, obstacleMap, placements, validation])

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
        {preview && (
          <polygon
            className={`sw-edit-placement-preview${preview.valid ? '' : ' is-invalid'}`}
            data-pending-workstation-id={preview.placement.entityId}
            points={placementOutline(preview.placement, deskHeight)}
          />
        )}
        {collidingObstacles.map(({ obstacle: obs, clips }) => (
          <g
            key={obs.id}
            className={`sw-edit-invalid sw-edit-obstacle-conflict sw-edit-conflict-obstacle sw-edit-obstacle-${obs.kind}`}
            data-obstacle-id={obs.id}
            data-conflict-obstacle={obs.id}
            data-obstacle-kind={obs.kind}
          >
            {clips.map((clip, index) => {
              const points = clipPolygonToBBox(obs.polygon, clip)
              return points.length >= 3 ? (
                <polygon key={index} className="sw-edit-obstacle-hatch" points={projectedPoints(points, 0)} fill={`url(#${hatchId})`} opacity={0.45} />
              ) : null
            })}
            <polygon
              className="sw-edit-obstacle-outline"
              points={projectedPoints(obs.polygon, 0)}
            />
          </g>
        ))}
        {invalid.map((placement) => (
          <g key={placement.entityId} className="sw-edit-invalid" data-workstation-id={placement.entityId}>
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
