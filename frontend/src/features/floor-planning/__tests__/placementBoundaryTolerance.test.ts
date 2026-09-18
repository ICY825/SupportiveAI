import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import { polygonContainsBBox } from '../domain/geometry'
import { translatePlacement, validatePlacement } from '../domain/placement'
import type { FloorDataset } from '../domain/spatial'
import { buildWorkspaceDisplayAreas } from '../workspace/displayAreas'
import {
  ANNOTATION_TOLERANCE_MM,
  basePlacements,
  deriveEditableArea,
  validateDraft,
} from '../workspace/layoutDraft'
import { buildWorkspaceScene } from '../workspace/scene'

/**
 * `ws-16-367` and `ws-16-369`, both in Area F, have chairs that sit 79 mm and
 * 44 mm outside the AI zone annotation. Nothing is physically wrong with them —
 * the zone outline is a hand-drawn PDF annotation — but judged at furniture
 * tolerance the editor opened Area F with two desks already invalid and Save
 * disabled, before anyone had moved anything.
 */

const OUTSIDE = ['ws-16-367', 'ws-16-369']

let dataset: FloorDataset

beforeAll(async () => {
  dataset = await FLOORS[0].load()
})

const areaF = () => buildWorkspaceDisplayAreas(dataset).find((area) => area.id === 'ai-area-f')!

function editableAreaF() {
  const area = areaF()
  const scene = buildWorkspaceScene(dataset, area.scope, {
    workstationIds: area.workstationIds,
    contextBounds: area.contextBBox,
    includeContextWorkstations: true,
  })
  return { area, scene, editable: deriveEditableArea(dataset, scene) }
}

describe('zone outlines are annotations, not walls', () => {
  it('records the two chairs that overhang the AI zone line', () => {
    const zone = dataset.zones.find((z) => z.id === 'zone-16-ai-platform')!
    for (const id of OUTSIDE) {
      const workstation = dataset.workstations.find((w) => w.id === id)!
      expect(areaF().workstationIds).toContain(id)
      expect(polygonContainsBBox(zone.polygon, workstation.bbox, 0)).toBe(true)
      expect(polygonContainsBBox(zone.polygon, workstation.chair!.bbox, 0)).toBe(false)
    }
  })

  it('accepts them once containment is judged at annotation tolerance', () => {
    const { editable } = editableAreaF()
    const base = basePlacements(dataset.workstations.filter((w) => areaF().workstationIds.includes(w.id)))

    for (const id of OUTSIDE) {
      const strict = validatePlacement(base[id], {
        others: Object.values(base),
        boundary: editable.boundary,
        roomBoundary: editable.roomBoundary,
        departmentZone: editable.departmentZone,
        obstacles: editable.obstacles,
        tolerance: editable.tolerance,
        chairTileSize: editable.chairTileSize,
      })
      expect(strict.valid).toBe(false)
      expect(strict.reasons.some((r) => r.type === 'outside-department-zone')).toBe(true)

      const lenient = validatePlacement(base[id], {
        others: Object.values(base),
        boundary: editable.boundary,
        roomBoundary: editable.roomBoundary,
        departmentZone: editable.departmentZone,
        obstacles: editable.obstacles,
        tolerance: editable.tolerance,
        boundaryTolerance: editable.boundaryTolerance,
        chairTileSize: editable.chairTileSize,
      })
      expect(lenient.valid).toBe(true)
    }
  })

  it('still rejects a desk pushed genuinely outside the zone', () => {
    const { editable } = editableAreaF()
    const base = basePlacements(dataset.workstations.filter((w) => areaF().workstationIds.includes(w.id)))
    // Far beyond any drafting error: 100 mm of tolerance is a sixth of a desk.
    const pushed = translatePlacement(base['ws-16-367'], 0, 40)

    const result = validatePlacement(pushed, {
      others: Object.values(base),
      boundary: editable.boundary,
      roomBoundary: editable.roomBoundary,
      departmentZone: editable.departmentZone,
      obstacles: editable.obstacles,
      tolerance: editable.tolerance,
      boundaryTolerance: editable.boundaryTolerance,
      chairTileSize: editable.chairTileSize,
    })
    expect(result.valid).toBe(false)
  })

  it('is a real tolerance, stated in millimetres', () => {
    const { editable } = editableAreaF()
    expect(ANNOTATION_TOLERANCE_MM).toBe(100)
    expect(editable.boundaryTolerance).toBeCloseTo(ANNOTATION_TOLERANCE_MM / dataset.layout.floor.mmPerPt, 6)
  })
})

describe('Area F as the editor opens it', () => {
  it('reports no invalid desk, so Save is not blocked before anyone edits', () => {
    const { editable, scene } = editableAreaF()
    const draft = { placements: basePlacements(scene.workstations) }

    const validation = validateDraft(draft, editable)
    expect(validation.size).toBe(scene.workstations.length)
    expect([...validation.values()].filter((v) => !v.valid)).toHaveLength(0)
    for (const id of OUTSIDE) expect(validation.get(id)?.valid).toBe(true)
  })

  it('reports a desk once it is actually moved outside', () => {
    const { editable, scene } = editableAreaF()
    const base = basePlacements(scene.workstations)
    const draft = { placements: { ...base, 'ws-16-367': translatePlacement(base['ws-16-367'], 0, 40) } }

    const validation = validateDraft(draft, editable)
    expect(validation.get('ws-16-367')?.valid).toBe(false)
  })
})
