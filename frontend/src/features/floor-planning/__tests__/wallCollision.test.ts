import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import {
  basePlacements,
  deriveEditableArea,
} from '../workspace/layoutDraft'
import {
  validatePlacement,
  wallSegmentIntersectsPolygon,
} from '../domain/placement'
import type { FloorDataset, Point, Segment } from '../domain/spatial'
import {
  buildWorkspaceScene,
  sceneCollisionWallSegments,
} from '../workspace/scene'
import { buildWorkspaceDisplayAreas } from '../workspace/displayAreas'
import { defaultWorkspaceScope } from '../workspace/scope'

let dataset: FloorDataset

beforeAll(async () => {
  dataset = await FLOORS.find((floor) => floor.id === 'floor-16')!.load()
})

const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0], [x1, y0], [x1, y1], [x0, y1],
]

const desk = (x: number, y: number, width = 2, depth = 2) => ({
  entityId: 'desk-test', x, y, width, depth, rotation: 0,
})

describe('wall and department placement policy', () => {
  it('reports an extracted wall crossing as an overridable conflict', () => {
    const wall: Segment = [[0, 5], [10, 5]]
    const result = validatePlacement(desk(5, 5), { others: [], wallSegments: [wall] })

    expect(result.valid).toBe(true)
    expect(result.requiresOverride).toBe(true)
    expect(result.reasons).toContainEqual(expect.objectContaining({
      type: 'obstacle-collision',
      obstacleKind: 'wall',
      severity: 'overridable',
    }))
  })

  it('accepts flush contact with a wall without a conflict', () => {
    const wall: Segment = [[0, 0], [10, 0]]
    expect(wallSegmentIntersectsPolygon(wall, rectangle(4, 0, 6, 2))).toBe(false)
    expect(validatePlacement(desk(5, 1), { others: [], wallSegments: [wall] }).reasons).toEqual([])
  })

  it('treats a department zone as a label rather than a constraint', () => {
    const zone = {
      polygon: rectangle(0, 0, 10, 10),
      bbox: [0, 0, 10, 10] as [number, number, number, number],
      kind: 'department-zone' as const,
      sourceId: 'zone-test',
      verification: 'SOURCE_VERIFIED' as const,
    }
    const result = validatePlacement(desk(20, 20), { others: [], departmentZone: zone })

    expect(result).toEqual({ valid: true, reasons: [] })
  })

  it('leaves a doorway gap open', () => {
    const wallWithDoor: Segment[] = [[[0, 5], [4, 5]], [[6, 5], [10, 5]]]
    const result = validatePlacement(desk(5, 5), { others: [], wallSegments: wallWithDoor })

    expect(result).toEqual({ valid: true, reasons: [] })
  })
})

describe('Floor 16 wall extraction coverage', () => {
  it('records collision segment counts for every generated section', () => {
    const areas = buildWorkspaceDisplayAreas(dataset)
    const counts = areas.map((area) => {
      const scene = buildWorkspaceScene(dataset, area.scope, {
        workstationIds: area.workstationIds,
        contextBounds: area.contextBBox,
        includeContextWorkstations: true,
      })
      return [area.label, deriveEditableArea(dataset, scene).collisionWallSegments?.length ?? 0]
    })

    expect(counts).toMatchInlineSnapshot(`
      [
        [
          "Khu vực A",
          123,
        ],
        [
          "Khu vực B",
          82,
        ],
        [
          "Khu vực C",
          130,
        ],
        [
          "Khu vực D",
          78,
        ],
        [
          "Khu vực E",
          64,
        ],
        [
          "Khu vực F",
          75,
        ],
        [
          "Khu vực G",
          130,
        ],
      ]
    `)
  })

  it('keeps all orthogonal canonical desks valid against extracted wall runs', () => {
    const scene = buildWorkspaceScene(dataset, {
      kind: 'bbox',
      bbox: [0, 0, dataset.layout.floor.width, dataset.layout.floor.height],
    })
    const placements = basePlacements(dataset.workstations)
    const orthogonal = dataset.workstations.filter((workstation) => workstation.rotationDeg % 90 === 0)
    const wallSegments = sceneCollisionWallSegments(scene.layers)

    expect(orthogonal).toHaveLength(364)
    for (const workstation of orthogonal) {
      const validation = validatePlacement(placements[workstation.id], {
        others: Object.values(placements),
        wallSegments,
      })
      expect(validation.valid, workstation.id).toBe(true)
    }
  })

  it('keeps the real facade desks valid when no wall is crossed', () => {
    const facadeIds = ['ws-16-367', 'ws-16-369']
    const placements = basePlacements(dataset.workstations)
    const scene = buildWorkspaceScene(dataset, defaultWorkspaceScope(dataset))
    const zone = dataset.zones.find((candidate) => candidate.id === 'zone-16-ai-platform')!
    const wallSegments = sceneCollisionWallSegments(scene.layers)

    for (const id of facadeIds) {
      const workstation = dataset.workstations.find((candidate) => candidate.id === id)!
      const validation = validatePlacement(placements[id], {
        others: [],
        departmentZone: {
          polygon: zone.polygon,
          bbox: zone.bbox,
          kind: 'department-zone',
          sourceId: zone.id,
          verification: zone.verification,
        },
        wallSegments,
        tolerance: 40 / dataset.layout.floor.mmPerPt,
      })
      expect(validation.reasons, id).toEqual([])
      expect(workstation.zoneId).toBe(zone.id)
    }
  })
})
