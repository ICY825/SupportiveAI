import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset, FloorObstacle, Room, Zone } from '../domain/spatial'
import {
  getChairBounds,
  placementBounds,
  translatePlacement,
  validatePlacement,
  type SpatialPlacement,
} from '../domain/placement'
import {
  basePlacements,
  createDraft,
  deriveEditableArea,
  draftIsValid,
  validateDraft,
} from '../workspace/layoutDraft'
import { buildWorkspaceScene } from '../workspace/scene'
import { defaultWorkspaceScope } from '../workspace/scope'

const desk = (over: Partial<SpatialPlacement> = {}): SpatialPlacement => ({
  entityId: 'test-desk',
  x: 100,
  y: 100,
  width: 12,
  depth: 6,
  rotation: 0,
  ...over,
})

describe('Challenger M2-2: Chair Seating Space & Boundary Stress Verification', () => {
  let dataset: FloorDataset

  beforeAll(async () => {
    dataset = await FLOORS[0].load()
  })

  // Fixtures
  const columnObstacle: FloorObstacle = {
    id: 'col-fixture-c1',
    floorId: 'floor-16',
    kind: 'column',
    category: 'solid',
    name: 'Cột bê tông kiểm thử',
    verification: 'EXTRACTED',
    polygon: [
      [100, 100],
      [120, 100],
      [120, 120],
      [100, 120],
    ],
    bbox: [100, 100, 120, 120],
    center: [110, 110],
    gridRef: 'B-A / 6-5',
    notes: [],
  }

  const wallObstacle: FloorObstacle = {
    id: 'wall-fixture-c1',
    floorId: 'floor-16',
    kind: 'wall',
    category: 'solid',
    name: 'Tường lõi kiểm thử',
    verification: 'EXTRACTED',
    polygon: [
      [200, 100],
      [300, 100],
      [300, 140],
      [200, 140],
    ],
    bbox: [200, 100, 300, 140],
    center: [250, 120],
    gridRef: 'C-B / 5-4',
    notes: [],
  }

  const doorClearanceObstacle: FloorObstacle = {
    id: 'door-clearance-c1',
    doorId: 'door-c1',
    floorId: 'floor-16',
    kind: 'door-clearance',
    category: 'clearance',
    name: 'Khoảng quét mở cửa kiểm thử',
    verification: 'EXTRACTED',
    polygon: [
      [400, 100],
      [410, 100],
      [410, 110],
      [400, 110],
    ],
    bbox: [400, 100, 410, 110],
    center: [405, 105],
    gridRef: 'D-C / 5-4',
    notes: [],
  }

  const roomFixture: Room = {
    id: 'room-acoustic-c1',
    floorId: 'floor-16',
    type: 'OTHER',
    name: 'Phòng kiểm thử',
    polygon: [
      [50, 50],
      [90, 50],
      [90, 90],
      [50, 90],
    ],
    bbox: [50, 50, 90, 90],
    gridRef: 'K-J / 7-6',
    areaM2: 25,
    verification: 'EXTRACTED',
    zoneId: 'zone-dept-c1',
    source: { kind: 'pdf-vector' },
    notes: [],
  }

  const zoneFixture: Zone = {
    id: 'zone-dept-c1',
    floorId: 'floor-16',
    type: 'WORKSPACE_ZONE',
    name: 'Phòng ban kiểm thử',
    polygon: [
      [0, 0],
      [1000, 0],
      [1000, 500],
      [0, 500],
    ],
    bbox: [0, 0, 1000, 500],
    gridRef: 'B-A / 6-5',
    areaM2: 500,
    verification: 'SOURCE_VERIFIED',
    labelAnchor: [500, 250],
    labelAnchorSource: 'annotation',
    sourceColor: '#0000FF',
    sourceLabel: 'Phòng ban kiểm thử',
    sourceLabelFigure: null,
    source: { kind: 'pdf-annotation' },
    notes: [],
  }

  describe('Task 1: Chair Seating Space / Occupant Footprint Rules', () => {
    it('Scenario 1.1: Desk table clear, but chair penetrating column -> blocks with obstacle-collision', () => {
      // Column at [100, 100, 120, 120]
      // Desk placed at x=92, y=110, width=12, depth=6 (desk bbox: [86, 107, 98, 113]).
      // Desk is completely outside column (right edge 98 < 100).
      // Chair zone on right ('east') extends from 98 to 104 -> penetrates column [100..120, 100..120].
      const candidate = desk({
        x: 92,
        y: 110,
        width: 12,
        depth: 6,
        seatedSide: 'right',
      })

      const deskBox = placementBounds(candidate)
      expect(deskBox[2]).toBeLessThanOrEqual(columnObstacle.bbox[0])

      const chairBox = getChairBounds(candidate, 6)
      expect(chairBox).not.toBeNull()
      expect(chairBox![2]).toBeGreaterThan(columnObstacle.bbox[0])

      const result = validatePlacement(candidate, {
        others: [],
        obstacles: [columnObstacle],
      })

      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'col-fixture-c1',
        obstacleKind: 'column',
        obstacleName: 'Cột bê tông kiểm thử',
        target: 'chair',
      })
    })

    it('Scenario 1.2: Desk table clear, but chair penetrating core wall -> blocks with obstacle-collision', () => {
      // Wall at [200, 100, 300, 140]
      // Desk placed at x=250, y=95, width=12, depth=6 (desk bbox: [244, 92, 256, 98]).
      // Desk is completely outside wall (bottom edge 98 < 100).
      // Chair zone on bottom ('south') extends from 98 to 104 -> penetrates wall [200..300, 100..140].
      const candidate = desk({
        x: 250,
        y: 95,
        width: 12,
        depth: 6,
        seatedSide: 'bottom',
      })

      const deskBox = placementBounds(candidate)
      expect(deskBox[3]).toBeLessThanOrEqual(wallObstacle.bbox[1])

      const chairBox = getChairBounds(candidate, 6)
      expect(chairBox).not.toBeNull()
      expect(chairBox![3]).toBeGreaterThan(wallObstacle.bbox[1])

      const result = validatePlacement(candidate, {
        others: [],
        obstacles: [wallObstacle],
      })

      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'wall-fixture-c1',
        obstacleKind: 'wall',
        obstacleName: 'Tường lõi kiểm thử',
        target: 'chair',
      })
    })

    it('Scenario 1.3: Desk table clear, but chair penetrating door swing clearance -> blocks with clearance-conflict', () => {
      // Door clearance at [400, 100, 410, 110]
      // Desk placed at x=392, y=105, width=12, depth=6 (desk bbox: [386, 102, 398, 108]).
      // Desk is clear (right edge 398 < 400).
      // Chair zone on right ('east') extends from 398 to 404 -> penetrates clearance [400..410, 100..110].
      const candidate = desk({
        x: 392,
        y: 105,
        width: 12,
        depth: 6,
        seatedSide: 'right',
      })

      const deskBox = placementBounds(candidate)
      expect(deskBox[2]).toBeLessThanOrEqual(doorClearanceObstacle.bbox[0])

      const chairBox = getChairBounds(candidate, 6)
      expect(chairBox).not.toBeNull()
      expect(chairBox![2]).toBeGreaterThan(doorClearanceObstacle.bbox[0])

      const result = validatePlacement(candidate, {
        others: [],
        obstacles: [doorClearanceObstacle],
      })

      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'clearance-conflict',
        obstacleId: 'door-clearance-c1',
        obstacleKind: 'door-clearance',
        obstacleName: 'Khoảng quét mở cửa kiểm thử',
        target: 'chair',
      })
    })

    it('Scenario 1.4: Back-to-back desks with overlapping chair spaces -> blocks with overlap', () => {
      // Desk A at x=100, y=83, width=12, depth=6, seatedSide='bottom' (desk: [94, 80, 106, 86], chair: [94, 86, 106, 92])
      // Desk B at x=100, y=100, width=12, depth=6, seatedSide='top' (desk: [94, 97, 106, 103], chair: [94, 91, 106, 97])
      // Desks themselves do not touch (gap: 97 - 86 = 11 pt).
      // Chair A [86..92] and Chair B [91..97] overlap on [91..92] (1 pt overlap).
      const deskA = desk({
        entityId: 'desk-a',
        x: 100,
        y: 83,
        width: 12,
        depth: 6,
        seatedSide: 'bottom',
      })
      const deskB = desk({
        entityId: 'desk-b',
        x: 100,
        y: 100,
        width: 12,
        depth: 6,
        seatedSide: 'top',
      })

      const boxA = placementBounds(deskA)
      const boxB = placementBounds(deskB)
      expect(boxA[3]).toBeLessThan(boxB[1]) // Desks do not touch

      const result = validatePlacement(deskA, { others: [deskB] })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'overlap',
        entityId: 'desk-b',
        target: 'chair',
      })
    })

    it('Scenario 1.5: Desk table inside room, but chair pushed outside room wall -> blocks with outside-room-boundary', () => {
      // Room at [50, 50, 90, 90]
      // Desk placed at x=65, y=86, width=12, depth=6, seatedSide='bottom'
      // Desk bbox: [59, 83, 71, 89] -> strictly inside room [50..90, 50..90]
      // Chair bbox: [59, 89, 71, 95] -> y2=95 exceeds room south boundary y=90
      const candidate = desk({
        x: 65,
        y: 86,
        width: 12,
        depth: 6,
        seatedSide: 'bottom',
      })

      const deskBox = placementBounds(candidate)
      expect(deskBox[0]).toBeGreaterThanOrEqual(roomFixture.bbox[0])
      expect(deskBox[1]).toBeGreaterThanOrEqual(roomFixture.bbox[1])
      expect(deskBox[2]).toBeLessThanOrEqual(roomFixture.bbox[2])
      expect(deskBox[3]).toBeLessThanOrEqual(roomFixture.bbox[3])

      const chairBox = getChairBounds(candidate, 6)
      expect(chairBox![3]).toBeGreaterThan(roomFixture.bbox[3])

      const result = validatePlacement(candidate, {
        others: [],
        room: roomFixture,
      })

      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'outside-room-boundary',
        roomId: 'room-acoustic-c1',
        roomName: 'Phòng kiểm thử',
        target: 'chair',
      })
    })

    it('Scenario 1.6: Desk table inside department zone, but chair pushed outside zone -> blocks with outside-department-zone', () => {
      // Zone at [0, 0, 1000, 500]
      // Desk placed at x=992, y=100, width=12, depth=6, seatedSide='right'
      // Desk bbox: [986, 97, 998, 103] -> strictly inside zone [0..1000, 0..500]
      // Chair bbox: [998, 97, 1004, 103] -> x2=1004 exceeds zone east boundary x=1000
      const candidate = desk({
        x: 992,
        y: 100,
        width: 12,
        depth: 6,
        seatedSide: 'right',
      })

      const deskBox = placementBounds(candidate)
      expect(deskBox[2]).toBeLessThanOrEqual(zoneFixture.bbox[2])

      const chairBox = getChairBounds(candidate, 6)
      expect(chairBox![2]).toBeGreaterThan(zoneFixture.bbox[2])

      const result = validatePlacement(candidate, {
        others: [],
        zone: zoneFixture,
      })

      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'outside-department-zone',
        zoneId: 'zone-dept-c1',
        zoneName: 'Phòng ban kiểm thử',
        target: 'chair',
      })
    })
  })

  describe('Task 2: Scoped AI department workstation validation', () => {
    const focusedEditorScene = () => {
      const cluster = dataset.clusters.find((item) => item.id === 'cluster-16-13')!
      return buildWorkspaceScene(dataset, { kind: 'bbox', bbox: cluster.bbox })
    }

    it('uses all canonical AI clusters instead of a fixed cluster allowlist', () => {
      const scene = buildWorkspaceScene(dataset, defaultWorkspaceScope(dataset))
      expect(new Set(scene.workstations.map((workstation) => workstation.clusterId)).size).toBe(21)
    })

    it('verifies exactly 116 workstations are extracted in the accepted department scope', () => {
      const scene = buildWorkspaceScene(dataset, defaultWorkspaceScope(dataset))
      expect(scene.workstations).toHaveLength(116)
    })

    it('verifies each workstation in the focused editor scope validates with 0 errors on load', () => {
      const scene = focusedEditorScene()
      const placementsMap = basePlacements(scene.workstations)
      const placements = Object.values(placementsMap)
      const area = deriveEditableArea(dataset, scene)

      expect(placements).toHaveLength(6)

      for (const p of placements) {
        const validation = validatePlacement(p, {
          others: placements,
          boundary: area.boundary,
          roomBoundary: area.roomBoundary,
          departmentZone: area.departmentZone,
          obstacles: area.obstacles,
          tolerance: area.tolerance,
          chairTileSize: area.chairTileSize,
        })
        expect(validation.reasons).toEqual([])
        expect(validation.valid).toBe(true)
      }
    })

    it('verifies validateDraft on the focused editor draft produces valid: true', () => {
      const scene = focusedEditorScene()
      const draft = createDraft(basePlacements(scene.workstations))
      const area = deriveEditableArea(dataset, scene)

      // Test validateDraft with EditableArea
      const validations = validateDraft(draft, area)
      expect(validations.size).toBe(6)
      expect(draftIsValid(validations)).toBe(true)

      for (const [id, val] of validations.entries()) {
        expect(val.valid, `Workstation ${id} should be valid`).toBe(true)
        expect(val.reasons, `Workstation ${id} should have 0 reasons`).toHaveLength(0)
      }
    })

    it('tests validateDraft behavior when passed area.boundary vs area', () => {
      const scene = focusedEditorScene()
      const draft = createDraft(basePlacements(scene.workstations))
      const area = deriveEditableArea(dataset, scene)

      // When passed area.boundary (as useLayoutEditor does)
      const validationsBoundary = validateDraft(draft, area.boundary, area.tolerance)
      expect(validationsBoundary.size).toBe(6)
      expect(draftIsValid(validationsBoundary)).toBe(true)
    })

    it('adversarial check: inspect area.roomBoundary and area.departmentZone', () => {
      const scene = focusedEditorScene()
      const area = deriveEditableArea(dataset, scene)
      // Log / verify what they are
      expect(area.departmentZone).not.toBeNull()
      // Workstations do not carry a room id in the extracted department data.
      const withRoom = scene.workstations.filter((w) => (w as any).roomId)
      expect(withRoom.length).toBe(0)
    })

    it('adversarial check: behavior when chair leaves department zone using area vs area.boundary', () => {
      const scene = focusedEditorScene()
      const area = deriveEditableArea(dataset, scene)
      const baseMap = basePlacements(scene.workstations)
      const firstWs = scene.workstations[0]
      const originalPlacement = baseMap[firstWs.id]

      // Move desk so desk is within boundary, but chair pokes out of department zone
      // Department zone bbox: [900, 234.72, 999.995, 294]
      // Desk 0 original center: [952.13, 246.36], bounds [946.44, 243.48, 957.82, 249.24]
      // Chair bounds: [949.54, 239, 954.72, 245] (seated north at y: 239..245)
      // If we translate northward by -8 pt:
      // Desk y becomes: [235.48, 241.24] (inside dz [234.72, 294])
      // Chair y becomes: [231.00, 237.00] -> y=231 is outside dz (231 < 234.72)
      const dy = 236 - placementBounds(originalPlacement)[1] // moves top of desk to 236 (inside 234.72)
      const testPlacement = translatePlacement(originalPlacement, 0, dy)

      const draft = createDraft({ ...baseMap, [firstWs.id]: testPlacement })

      // With full EditableArea:
      const valArea = validateDraft(draft, area)
      const resArea = valArea.get(firstWs.id)!

      // With area.boundary:
      const valBoundary = validateDraft(draft, area.boundary, area.tolerance)
      const resBoundary = valBoundary.get(firstWs.id)!

      expect(resArea.valid).toBe(false)
      expect(resArea.reasons.some((r) => r.type === 'outside-department-zone' && (r as any).target === 'chair')).toBe(true)

      // Check resBoundary: does it catch it?
      // Notice: when validateDraft is called with area.boundary instead of area,
      // boundaryOrArea does not have 'grid', so isArea is false!
      // In layoutDraft.ts:
      // const departmentZone = isArea ? boundaryOrArea.departmentZone : null
      // So departmentZone is null!
      // And boundary.kind is 'zone-annotation' (which only checks deskBounds, not chairBounds)!
      // So resBoundary.valid is TRUE (chair outside zone is MISSED when passing area.boundary)!
      const chairOutsideCaughtByBoundary = resBoundary.reasons.some((r) => (r as any).target === 'chair')
      expect(chairOutsideCaughtByBoundary).toBe(false)
      expect(resBoundary.valid).toBe(true)
    })
  })

  describe('Task 3: Stress Testing, Corner Cases, and Real Obstacles', () => {
    it('verifies 4-way rotation chair projections (0, 90, 180, 270 deg)', () => {
      const baseDesk = desk({ x: 100, y: 100, width: 12, depth: 6 })

      // 0 deg: default south
      const chair0 = getChairBounds({ ...baseDesk, rotation: 0 }, 6)
      expect(chair0).toEqual([94, 103, 106, 109])

      // 90 deg: default west
      const chair90 = getChairBounds({ ...baseDesk, rotation: 90 }, 6)
      expect(chair90).toEqual([91, 94, 97, 106])

      // 180 deg: default north
      const chair180 = getChairBounds({ ...baseDesk, rotation: 180 }, 6)
      expect(chair180).toEqual([94, 91, 106, 97])

      // 270 deg: default east
      const chair270 = getChairBounds({ ...baseDesk, rotation: 270 }, 6)
      expect(chair270).toEqual([103, 94, 109, 106])
    })

    it('verifies real CAD column col-16-13 blocks chair when desk is placed nearby facing east', () => {
      // col-16-13 bbox is [982.51, 239.68, 993.89, 252.79]
      const col = dataset.obstacles.find((o) => o.id === 'col-16-13')!
      expect(col).toBeDefined()

      // Desk table right edge at 980 (clear of 982.51), chair extends eastward to 986 -> penetrates col
      const candidate: SpatialPlacement = {
        entityId: 'test-chair-into-col13',
        x: 974,
        y: 246,
        width: 12,
        depth: 6,
        rotation: 0,
        seatedSide: 'right', // chair bbox: [980, 243, 986, 249]
      }

      const result = validatePlacement(candidate, {
        others: [],
        obstacles: [col],
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'col-16-13',
        obstacleKind: 'column',
        obstacleName: col.name ?? undefined,
        target: 'chair',
      })
    })

    it('verifies real CAD wall wall-16-02 blocks chair when desk is placed nearby facing west', () => {
      // wall-16-02 bbox: right edge is at 507.17
      const wall = dataset.obstacles.find((o) => o.id === 'wall-16-02')!
      expect(wall).toBeDefined()

      // Desk table placed at x=515, left edge at 509 (> 507.17, clear of wall).
      // Chair on seatedSide 'left' extends west to 509 - 6 = 503 (< 507.17) -> penetrates wall
      const candidate: SpatialPlacement = {
        entityId: 'test-chair-into-wall02',
        x: 515,
        y: 300,
        width: 12,
        depth: 6,
        rotation: 0,
        seatedSide: 'left',
      }

      const result = validatePlacement(candidate, {
        others: [],
        obstacles: [wall],
      })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'wall-16-02',
        obstacleKind: 'wall',
        obstacleName: wall.name ?? undefined,
        target: 'chair',
      })
    })

    it('verifies zero-gap flush chair against obstacle is accepted without false collision', () => {
      // Column at [100, 100, 120, 120]
      // Desk at x=88, width=12, depth=6, seatedSide='right'
      // Desk bbox: [82, 107, 94, 113]
      // Chair bbox: [94, 107, 100, 113]. Chair right edge exactly 100 touches column left edge 100.
      const flushChair = desk({
        x: 88,
        y: 110,
        width: 12,
        depth: 6,
        seatedSide: 'right',
      })
      const chairBox = getChairBounds(flushChair, 6)
      expect(chairBox![2]).toBe(100) // Exactly flush

      const result = validatePlacement(flushChair, {
        others: [],
        obstacles: [columnObstacle],
      })
      expect(result.valid).toBe(true)
      expect(result.reasons).toHaveLength(0)
    })
  })
})
