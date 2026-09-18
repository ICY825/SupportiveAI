import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import {
  basePlacements,
  createDraft,
  deriveEditableArea,
  placementFromWorkstation,
  validateDraft,
} from '../workspace/layoutDraft'
import {
  buildWorkspaceScene,
  cameraCenter,
  cameraFootprint,
  clipSourcePathToBBox,
  CLOSE_DETAIL_ZOOM,
  detailTierForZoom,
  effectiveZoom,
  fitViewBox,
  MEDIUM_DETAIL_ZOOM,
  memoizeSceneGeometry,
  planeTransform,
  project,
  sceneBounds,
} from '../workspace/scene'
import { buildWorkspaceDisplayAreas, buildWorkspaceDisplayAreasForScope, DISPLAY_CONTEXT_PADDING_PT } from '../workspace/displayAreas'
import { defaultWorkspaceScope, resolveWorkspaceScope, type WorkspaceScope } from '../workspace/scope'

let dataset: FloorDataset
let departmentScope: WorkspaceScope
beforeAll(async () => {
  dataset = await FLOORS[0].load()
  departmentScope = defaultWorkspaceScope(dataset)
})

describe('workspace scope selection', () => {
  it('selects the complete accepted AI annotation from canonical workstation membership', () => {
    const before = JSON.stringify(dataset)
    const scene = buildWorkspaceScene(dataset, departmentScope)
    expect(scene.workstations).toHaveLength(154)
    expect(new Set(scene.workstations.map((workstation) => workstation.clusterId)).size).toBe(26)
    expect(scene.workstations.every((workstation) =>
      workstation.zoneId === 'zone-16-ai-platform' || workstation.zoneId === 'zone-16-ai-platform-02')).toBe(true)
    expect(scene.resolvedScope.sourceLabel).toBe('MÔ HÌNH & NỀN TẢNG AI (145)')
    expect(scene.resolvedScope.sourceLabelFigure).toBe(145)
    expect(JSON.stringify(dataset)).toBe(before)
  })

  it('supports a physical zone scope and a strict focused bbox subset with the same renderer', () => {
    const department = buildWorkspaceScene(dataset, departmentScope)
    const zone = buildWorkspaceScene(dataset, { kind: 'zone', zoneId: 'zone-16-ai-platform' })
    const cluster = dataset.clusters.find((item) => item.id === 'cluster-16-13')!
    const focused = buildWorkspaceScene(dataset, { kind: 'bbox', bbox: cluster.bbox })

    // A zone is now a strict subset of its department: AI Platform spans two.
    expect(zone.workstations.length).toBe(116)
    expect(department.workstations.length).toBe(154)
    expect(department.workstations.map((w) => w.id)).toEqual(
      expect.arrayContaining(zone.workstations.map((w) => w.id)),
    )
    expect(focused.workstations.length).toBeGreaterThan(0)
    expect(focused.workstations.length).toBeLessThan(department.workstations.length)
    expect(focused.workstations.every((workstation) => department.workstations.includes(workstation))).toBe(true)
  })

  it('is deterministic for the same dataset and scope', () => {
    expect(buildWorkspaceScene(dataset, departmentScope)).toEqual(buildWorkspaceScene(dataset, departmentScope))
  })

  it('resolves department geometry independently of source label capacity', () => {
    const resolved = resolveWorkspaceScope(dataset, departmentScope)
    // One department, two zones — the lift cores split AI Platform in half.
    expect(resolved.zoneIds).toEqual(['zone-16-ai-platform', 'zone-16-ai-platform-02'])
    // Reaches west to 701 now, because the second block sits the far side of
    // the lift cores.
    expect(resolved.bbox).toEqual([701.19, 234.72, 1009.27, 665.58])
  })

  it('supports another department through the same zone-backed display-area builder', () => {
    const areas = buildWorkspaceDisplayAreasForScope(dataset, { kind: 'department', departmentId: 'dept-smart-city' })
    expect(areas).toHaveLength(1)
    expect(areas[0].workstationIds.length).toBeGreaterThan(0)
    expect(areas[0].scope).toEqual({ kind: 'zone', zoneId: 'zone-16-bds-smart-city' })
  })

  /**
   * A–F were drawn around the block east of the lift cores. G is the western
   * block, collected automatically: every cluster a curated area does not claim
   * still has to be reachable, or its desks are visible on the overview and
   * impossible to focus or edit.
   */
  it('partitions the whole department into seven disjoint display areas', () => {
    const areas = buildWorkspaceDisplayAreas(dataset)
    expect(areas).toHaveLength(7)
    expect(areas.map((area) => area.workstationIds.length)).toEqual([28, 21, 15, 14, 22, 16, 38])
    expect(areas.flatMap((area) => area.clusterIds)).toHaveLength(26)
    const workstationIds = areas.flatMap((area) => area.workstationIds)
    expect(new Set(workstationIds).size).toBe(154)
    expect(workstationIds).toEqual(expect.arrayContaining(dataset.workstations.filter((workstation) => workstation.zoneId === 'zone-16-ai-platform').map((workstation) => workstation.id)))
  })

  it('keeps expanded context separate from active desk membership', () => {
    const area = buildWorkspaceDisplayAreas(dataset)[0]
    const scene = buildWorkspaceScene(dataset, area.scope, {
      workstationIds: area.workstationIds,
      contextBounds: area.contextBBox,
      includeContextWorkstations: true,
    })
    expect(scene.workstations).toHaveLength(28)
    expect(scene.contextWorkstations.length).toBeGreaterThan(0)
    expect(scene.contextBounds[0]).toBeLessThan(area.targetBBox[0])
    expect(scene.contextBounds[2]).toBeGreaterThan(area.targetBBox[2])
    expect(scene.contextBounds[1]).toBeLessThan(area.targetBBox[1])
    expect(scene.contextBounds[3]).toBeGreaterThan(area.targetBBox[3])
    expect(scene.contextBounds[0]).toBeGreaterThanOrEqual(0)
    expect(scene.contextBounds[2]).toBeLessThanOrEqual(dataset.layout.floor.width)
    expect(scene.contextBounds[1]).toBeGreaterThanOrEqual(0)
    expect(scene.contextBounds[3]).toBeLessThanOrEqual(dataset.layout.floor.height)
    expect(area.targetBBox[0] - scene.contextBounds[0]).toBeCloseTo(DISPLAY_CONTEXT_PADDING_PT, 6)
    expect(scene.workstations.every((workstation) => area.workstationIds.includes(workstation.id))).toBe(true)
    expect(scene.contextWorkstations.every((workstation) => !area.workstationIds.includes(workstation.id))).toBe(true)
    expect(scene.obstacles.some((obstacle) => obstacle.id === 'col-16-13')).toBe(true)
  })

  it('validates immutable context placements without making them editable', () => {
    const area = buildWorkspaceDisplayAreas(dataset).find((candidate) => candidate.id === 'ai-area-d')!
    const scene = buildWorkspaceScene(dataset, area.scope, {
      workstationIds: area.workstationIds,
      // The verified extracted unlabeled region is outside the deliberately
      // small production context window for this area. Expand the test-only
      // window to exercise the validator contract without changing display
      // padding or silently widening the product scope.
      contextBounds: [700, 400, 840, 600],
      includeContextWorkstations: true,
    })
    const neighbour = scene.contextWorkstations.find((workstation) => workstation.zoneId === 'zone-16-ai-platform-02')
    expect(neighbour).toBeDefined()
    const placements = basePlacements(dataset.workstations.filter((workstation) => workstation.zoneId === 'zone-16-ai-platform'))
    const targetId = area.workstationIds[0]
    const target = placements[targetId]
    const neighbourPlacement = placementFromWorkstation(neighbour!)
    const moved = { ...target, x: neighbourPlacement.x, y: neighbourPlacement.y }
    const editableArea = deriveEditableArea(dataset, scene)
    const validation = validateDraft(createDraft({ ...placements, [targetId]: moved }), {
      ...editableArea,
      editableIds: area.workstationIds,
      contextPlacements: [neighbourPlacement],
    })
    const overlap = validation.get(targetId)?.reasons.find((reason) => reason.type === 'overlap')
    expect(overlap?.entityId).toBe(neighbour!.id)
    expect(validation.has(neighbour!.id)).toBe(false)
  })
})

describe('scope-independent projection and framing', () => {
  it('projects source paths and furniture through the same affine transform', () => {
    const scene = buildWorkspaceScene(dataset, departmentScope)
    for (const height of [0, 4.25, 7.1]) {
      const [a, b, c, d, e, f] = planeTransform(height).slice(7, -1).split(' ').map(Number)
      for (const workstation of scene.workstations.slice(0, 12)) {
        for (const [x, y] of [...workstation.polygon, workstation.chair!.center]) {
          const [px, py] = project([x, y], height)
          expect(px).toBeCloseTo(a * x + c * y + e, 8)
          expect(py).toBeCloseTo(b * x + d * y + f, 8)
        }
      }
    }
  })

  it('clips source subpaths to an arbitrary bbox without changing retained geometry', () => {
    const crossing = 'M0 5L30 5'
    const curve = 'M0 0C12 10 15 15 30 0'
    expect(clipSourcePathToBBox(`${crossing}M40 40L50 50${curve}`, [10, 4, 20, 8])).toBe(`${crossing}${curve}`)
    expect(clipSourcePathToBBox('M0 0h30v10z', [10, 4, 20, 8])).toBe('M0 0h30v10z')
  })

  it('derives different finite scene bounds from department and focused geometry', () => {
    const department = buildWorkspaceScene(dataset, departmentScope)
    const cluster = dataset.clusters.find((item) => item.id === 'cluster-16-13')!
    const focused = buildWorkspaceScene(dataset, { kind: 'bbox', bbox: cluster.bbox })
    const departmentBounds = sceneBounds(department)
    const focusedBounds = sceneBounds(focused)
    expect(departmentBounds.every(Number.isFinite)).toBe(true)
    expect(focusedBounds.every(Number.isFinite)).toBe(true)
    expect(focusedBounds[2] - focusedBounds[0]).toBeLessThan(departmentBounds[2] - departmentBounds[0])
    expect(focusedBounds[3] - focusedBounds[1]).toBeLessThan(departmentBounds[3] - departmentBounds[1])
  })

  it('fits each scope to the stage after a scope change', () => {
    const view = { width: 900, height: 560 }
    const departmentFrame = fitViewBox(sceneBounds(buildWorkspaceScene(dataset, departmentScope)), view, 20)
    const focus = dataset.clusters.find((item) => item.id === 'cluster-16-61')!
    const focusFrame = fitViewBox(sceneBounds(buildWorkspaceScene(dataset, { kind: 'bbox', bbox: focus.bbox })), view, 20)
    expect(departmentFrame[2] / departmentFrame[3]).toBeCloseTo(view.width / view.height, 6)
    expect(focusFrame[2] / focusFrame[3]).toBeCloseTo(view.width / view.height, 6)
    expect(focusFrame).not.toEqual(departmentFrame)
  })

  it('computes an inverted camera footprint and normalizes detail zoom by scope', () => {
    const frame = [10, 20, 100, 80] as [number, number, number, number]
    const origin: [number, number] = [60, 60]
    const footprint = cameraFootprint(frame, origin, [0, 0], 1)
    expect(footprint).toHaveLength(4)
    expect(footprint[0]).toEqual(expect.arrayContaining([expect.any(Number), expect.any(Number)]))
    const zoomed = cameraFootprint(frame, origin, [0, 0], 2)
    const width = (points: [number, number][]) => Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1])
    expect(width(zoomed)).toBeLessThan(width(footprint))
    expect(cameraCenter(frame, origin, [0, 0], 1)).toEqual(expect.any(Array))
    expect(cameraCenter(frame, origin, [12, -8], 1)).not.toEqual(cameraCenter(frame, origin, [0, 0], 1))
    expect(effectiveZoom(1, 400, 400)).toBe(1)
    expect(effectiveZoom(1, 800, 400)).toBe(2)
  })
})

describe('semantic detail and memoized geometry', () => {
  it('uses explicit far, medium, and close zoom thresholds', () => {
    expect(detailTierForZoom(1)).toBe('far')
    expect(detailTierForZoom(MEDIUM_DETAIL_ZOOM)).toBe('medium')
    expect(detailTierForZoom(CLOSE_DETAIL_ZOOM)).toBe('close')
  })

  it('memoizes and depth-sorts complete department geometry', () => {
    const scene = buildWorkspaceScene(dataset, departmentScope)
    const first = memoizeSceneGeometry(scene)
    expect(memoizeSceneGeometry(scene)).toBe(first)
    expect(first.markers).toHaveLength(154)
    expect(first.selectionPolygons.size).toBe(154)
    expect(first.items.filter((item) => item.kind === 'desk')).toHaveLength(154)
    for (let index = 1; index < first.items.length; index++) {
      expect(first.items[index].depth).toBeGreaterThanOrEqual(first.items[index - 1].depth)
    }
  })
})
