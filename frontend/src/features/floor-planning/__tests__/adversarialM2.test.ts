/**
 * Challenger M2-1: Geometry & Flush Contact Adversarial Test Suite
 *
 * Empirical verification of:
 * 1. Zero-gap flush contact rule (0.00 mm gap allowed on all 4 faces of columns & core walls,
 *    ws-16-049 vs wall-16-02, penetration vs tolerance threshold).
 * 2. Non-axis-aligned swept sector door clearances (touching vs penetrating curved & slanted boundaries).
 * 3. Concrete pillar col-16-13 beside ws-16-067 / ws-16-070 (gap measurement, eastward shift threshold).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import {
  clipPolygonToBBox,
  polygonArea,
} from '../domain/geometry'
import {
  placementBounds,
  translatePlacement,
  validatePlacement,
  type SpatialPlacement,
} from '../domain/placement'
import { placementFromWorkstation } from '../workspace/layoutDraft'
import type { FloorDataset, FloorObstacle } from '../domain/spatial'

const desk = (over: Partial<SpatialPlacement> = {}): SpatialPlacement => ({
  entityId: 'test-desk',
  x: 100,
  y: 100,
  width: 12,
  depth: 6,
  rotation: 0,
  ...over,
})

describe('Challenger M2-1 Adversarial Verification Suite', () => {
  let dataset: FloorDataset

  beforeAll(async () => {
    dataset = await FLOORS[0].load()
  })

  describe('Task 1: Empirically verify zero-gap flush contact rule', () => {
    const testColumn: FloorObstacle = {
      id: 'test-col-solid',
      floorId: 'floor-16',
      kind: 'column',
      category: 'solid',
      name: 'Test Structural Column',
      verification: 'EXTRACTED',
      polygon: [
        [100, 100],
        [120, 100],
        [120, 120],
        [100, 120],
      ],
      bbox: [100, 100, 120, 120],
      center: [110, 110],
      gridRef: 'TEST / 1-1',
      notes: [],
    }

    const testCoreWall: FloorObstacle = {
      id: 'test-wall-core',
      floorId: 'floor-16',
      kind: 'wall',
      category: 'solid',
      name: 'Test Core Shear Wall',
      verification: 'EXTRACTED',
      polygon: [
        [200, 200],
        [300, 200],
        [300, 250],
        [200, 250],
      ],
      bbox: [200, 200, 300, 250],
      center: [250, 225],
      gridRef: 'TEST / 1-1',
      notes: [],
    }

    it('1.1: Column flush contact on all 4 cardinal faces with exact 0.00 mm gap is valid: true', () => {
      // West face: column left edge is x=100. Desk width=12, right edge at 100 -> center x = 94.
      const westDesk = desk({ x: 94, y: 110, width: 12, depth: 6 })
      expect(placementBounds(westDesk)[2]).toBe(100)
      const resWest = validatePlacement(westDesk, { others: [], obstacles: [testColumn] })
      expect(resWest.valid).toBe(true)
      expect(resWest.reasons).toHaveLength(0)

      // East face: column right edge is x=120. Desk width=12, left edge at 120 -> center x = 126.
      const eastDesk = desk({ x: 126, y: 110, width: 12, depth: 6 })
      expect(placementBounds(eastDesk)[0]).toBe(120)
      const resEast = validatePlacement(eastDesk, { others: [], obstacles: [testColumn] })
      expect(resEast.valid).toBe(true)
      expect(resEast.reasons).toHaveLength(0)

      // North face: column top edge is y=100. Desk depth=6, bottom edge at 100 -> center y = 97.
      const northDesk = desk({ x: 110, y: 97, width: 12, depth: 6 })
      expect(placementBounds(northDesk)[3]).toBe(100)
      const resNorth = validatePlacement(northDesk, { others: [], obstacles: [testColumn] })
      expect(resNorth.valid).toBe(true)
      expect(resNorth.reasons).toHaveLength(0)

      // South face: column bottom edge is y=120. Desk depth=6, top edge at 120 -> center y = 123.
      const southDesk = desk({ x: 110, y: 123, width: 12, depth: 6 })
      expect(placementBounds(southDesk)[1]).toBe(120)
      const resSouth = validatePlacement(southDesk, { others: [], obstacles: [testColumn] })
      expect(resSouth.valid).toBe(true)
      expect(resSouth.reasons).toHaveLength(0)
    })

    it('1.2: Core wall flush contact on all 4 cardinal faces with exact 0.00 mm gap is valid: true', () => {
      // Core wall bbox: [200, 200, 300, 250]
      // West face: right edge at 200 -> center x = 194
      const westDesk = desk({ x: 194, y: 225, width: 12, depth: 6 })
      expect(placementBounds(westDesk)[2]).toBe(200)
      expect(validatePlacement(westDesk, { others: [], obstacles: [testCoreWall] }).valid).toBe(true)

      // East face: left edge at 300 -> center x = 306
      const eastDesk = desk({ x: 306, y: 225, width: 12, depth: 6 })
      expect(placementBounds(eastDesk)[0]).toBe(300)
      expect(validatePlacement(eastDesk, { others: [], obstacles: [testCoreWall] }).valid).toBe(true)

      // North face: bottom edge at 200 -> center y = 197
      const northDesk = desk({ x: 250, y: 197, width: 12, depth: 6 })
      expect(placementBounds(northDesk)[3]).toBe(200)
      expect(validatePlacement(northDesk, { others: [], obstacles: [testCoreWall] }).valid).toBe(true)

      // South face: top edge at 250 -> center y = 253
      const southDesk = desk({ x: 250, y: 253, width: 12, depth: 6 })
      expect(placementBounds(southDesk)[1]).toBe(250)
      expect(validatePlacement(southDesk, { others: [], obstacles: [testCoreWall] }).valid).toBe(true)
    })

    it('1.3: Real Floor 16 workstation ws-16-049 flush against core wall wall-16-02', () => {
      const ws049 = dataset.workstations.find((w) => w.id === 'ws-16-049')
      const wall02 = dataset.obstacles.find((o) => o.id === 'wall-16-02')

      expect(ws049).toBeDefined()
      expect(wall02).toBeDefined()

      // Exact mathematical flush check: ws049.bbox[0] === wall02.bbox[2]
      expect(ws049!.bbox[0]).toBe(507.17)
      expect(wall02!.bbox[2]).toBe(507.17)
      const measuredGap = ws049!.bbox[0] - wall02!.bbox[2]
      expect(measuredGap).toBe(0.0)

      const p049 = placementFromWorkstation(ws049!)
      const result = validatePlacement(p049, { others: [], obstacles: [wall02!] })

      expect(result.valid).toBe(true)
      expect(result.reasons).toHaveLength(0)
    })

    it('1.4: Penetration vs tolerance boundary conditions', () => {
      const tau = 1.98 // Specified tolerance: 25 mm ≈ 1.98 pt
      const col = testColumn // bbox: [100, 100, 120, 120]

      // Baseline flush at x=94 (right edge = 100.00, penetration = 0.00 pt)
      const flush = desk({ x: 94, y: 110, width: 12, depth: 6 })
      expect(validatePlacement(flush, { others: [], obstacles: [col], tolerance: tau }).valid).toBe(true)

      // Partial penetration within tolerance (penetration = 1.00 pt <= tau)
      const subTol = desk({ x: 95, y: 110, width: 12, depth: 6 }) // right edge = 101.00, penetration = 1.00 pt
      const resSubTol = validatePlacement(subTol, { others: [], obstacles: [col], tolerance: tau })
      expect(resSubTol.valid).toBe(true)

      // Penetration exactly at tolerance (penetration = 1.98 pt <= tau)
      const exactTol = desk({ x: 94 + tau, y: 110, width: 12, depth: 6 }) // right edge = 101.98, penetration = 1.98 pt
      const resExactTol = validatePlacement(exactTol, { others: [], obstacles: [col], tolerance: tau })
      expect(resExactTol.valid).toBe(true)

      // Penetration exceeding tolerance by delta (penetration = 1.981 pt > tau)
      const overTol = desk({ x: 94 + tau + 0.01, y: 110, width: 12, depth: 6 }) // penetration = 1.99 pt > tau
      const resOverTol = validatePlacement(overTol, { others: [], obstacles: [col], tolerance: tau })
      expect(resOverTol.valid).toBe(false)
      expect(resOverTol.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'test-col-solid',
        obstacleKind: 'column',
        obstacleName: 'Test Structural Column',
      })

      // Significant penetration (penetration = 3.0 pt > tau)
      const deepPenetration = desk({ x: 97, y: 110, width: 12, depth: 6 })
      const resDeep = validatePlacement(deepPenetration, { others: [], obstacles: [col], tolerance: tau })
      expect(resDeep.valid).toBe(false)
      expect(resDeep.reasons).toContainEqual(
        expect.objectContaining({
          type: 'obstacle-collision',
          obstacleId: 'test-col-solid',
        }),
      )
    })
  })

  describe('Task 2: Empirically verify non-axis-aligned swept sector door clearances', () => {
    // A swept sector door clearance: hinge at [500, 100], radius R = 20, sweeping angle 0° to 90° (quadrant +X, +Y)
    // Vertices approximate arc from [520, 100] to [500, 120]
    // Arc points: [R*cos(theta), R*sin(theta)]
    // 0°: [520, 100]
    // 22.5°: [500 + 20*cos(22.5°), 100 + 20*sin(22.5°)] = [518.48, 107.65]
    // 45°: [500 + 20*cos(45°), 100 + 20*sin(45°)] = [514.14, 114.14]
    // 67.5°: [500 + 20*cos(67.5°), 100 + 20*sin(67.5°)] = [507.65, 118.48]
    // 90°: [500, 120]
    const doorSector: FloorObstacle = {
      id: 'door-clr-sector-1',
      doorId: 'door-sec-1',
      floorId: 'floor-16',
      kind: 'door-clearance',
      category: 'clearance',
      name: 'Khoảng quét mở cửa rẻ quạt 90°',
      verification: 'EXTRACTED',
      polygon: [
        [500, 100],
        [520, 100],
        [518.48, 107.65],
        [514.14, 114.14],
        [507.65, 118.48],
        [500, 120],
      ],
      bbox: [500, 100, 520, 120],
      center: [510, 110],
      radiusMm: 900,
      gridRef: 'TEST / 1-1',
      notes: [],
    }

    it('2.1: Touching the straight radial boundaries (West / North) without penetrating is valid: true', () => {
      // West boundary is along x=500, for y in [100, 120].
      // Desk placed to the west: right edge at x=500 -> center x = 494
      const touchWest = desk({ x: 494, y: 110, width: 12, depth: 6 })
      expect(placementBounds(touchWest)[2]).toBe(500)
      const resWest = validatePlacement(touchWest, { others: [], obstacles: [doorSector] })
      expect(resWest.valid).toBe(true)
      expect(resWest.reasons).toHaveLength(0)

      // North boundary is along y=100, for x in [500, 520].
      // Desk placed to the north: bottom edge at y=100 -> center y = 97
      const touchNorth = desk({ x: 510, y: 97, width: 12, depth: 6 })
      expect(placementBounds(touchNorth)[3]).toBe(100)
      const resNorth = validatePlacement(touchNorth, { others: [], obstacles: [doorSector] })
      expect(resNorth.valid).toBe(true)
      expect(resNorth.reasons).toHaveLength(0)
    })

    it('2.2: Outer bounding box corner (outside swept arc but inside obstacle bbox) is valid: true', () => {
      // Bbox corner [515, 115, 520, 120]:
      // Distance of corner (515, 115) from hinge (500, 100): sqrt(15^2 + 15^2) = sqrt(450) ≈ 21.21 > R (20).
      // A small desk placed in this corner [516, 116, 520, 120] (center x=518, y=118, size 4x4)
      const inBboxCorner = desk({ x: 518, y: 118, width: 4, depth: 4 })
      const bounds = placementBounds(inBboxCorner) // [516, 116, 520, 120]
      expect(bounds[0]).toBeGreaterThanOrEqual(doorSector.bbox[0])
      expect(bounds[2]).toBeLessThanOrEqual(doorSector.bbox[2])
      expect(bounds[1]).toBeGreaterThanOrEqual(doorSector.bbox[1])
      expect(bounds[3]).toBeLessThanOrEqual(doorSector.bbox[3])

      // Confirm desk bounds are geometrically outside the polygon
      const clipped = clipPolygonToBBox(doorSector.polygon, bounds)
      expect(polygonArea(clipped)).toBe(0)

      const result = validatePlacement(inBboxCorner, { others: [], obstacles: [doorSector] })
      expect(result.valid).toBe(true)
      expect(result.reasons).toHaveLength(0)
    })

    it('2.3: Penetrating across the non-axis-aligned curved boundary triggers clearance-conflict', () => {
      // Place a desk that penetrates across the arc at (514.14, 114.14).
      // e.g. center at (512, 112), size 6x6 -> bounds [509, 109, 515, 115].
      // Distance of (512, 112) to hinge (500, 100) is sqrt(12^2 + 12^2) = sqrt(288) ≈ 16.97 < 20 (inside sector).
      const penetratingArc = desk({ x: 512, y: 112, width: 6, depth: 6 })
      const result = validatePlacement(penetratingArc, { others: [], obstacles: [doorSector] })

      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual({
        type: 'clearance-conflict',
        obstacleId: 'door-clr-sector-1',
        obstacleKind: 'door-clearance',
        obstacleName: 'Khoảng quét mở cửa rẻ quạt 90°',
      })
    })

    it('2.4: Penetrating straight radial edge triggers clearance-conflict', () => {
      // Pushing 1 pt past the West straight edge: right edge at 501 > 500
      const penetratingWest = desk({ x: 495, y: 110, width: 12, depth: 6 }) // bounds [489, 107, 501, 113]
      const result = validatePlacement(penetratingWest, { others: [], obstacles: [doorSector] })
      expect(result.valid).toBe(false)
      expect(result.reasons).toContainEqual(
        expect.objectContaining({
          type: 'clearance-conflict',
          obstacleId: 'door-clr-sector-1',
        }),
      )
    })

    it('2.5: Real extracted swept sector door clearance (door-clr-16-52)', () => {
      const realDoor = dataset.obstacles.find((o) => o.id === 'door-clr-16-52')
      expect(realDoor).toBeDefined()
      expect(realDoor!.kind).toBe('door-clearance')
      expect(realDoor!.category).toBe('clearance')
      // Non-axis-aligned polygon vertices:
      expect(realDoor!.polygon.length).toBeGreaterThan(4)

      // Desk touching bbox outside without penetrating polygon
      const outside = desk({ x: 690, y: 350, width: 4, depth: 4 })
      const resOutside = validatePlacement(outside, { others: [], obstacles: [realDoor!] })
      expect(resOutside.valid).toBe(true)

      // Desk penetrating the door polygon center
      const [cx, cy] = realDoor!.center ?? [697.71, 360.53]
      const penetrating = desk({ x: cx, y: cy, width: 2, depth: 2 })
      const resPen = validatePlacement(penetrating, { others: [], obstacles: [realDoor!] })
      expect(resPen.valid).toBe(false)
      expect(resPen.reasons).toContainEqual(
        expect.objectContaining({
          type: 'clearance-conflict',
          obstacleId: 'door-clr-16-52',
        }),
      )
    })
  })

  describe('Task 3: Empirically verify concrete pillar col-16-13 beside ws-16-067/ws-16-070', () => {
    let pillar: FloorObstacle
    let ws067: any
    let ws070: any

    beforeAll(() => {
      pillar = dataset.obstacles.find((o) => o.id === 'col-16-13')!
      ws067 = dataset.workstations.find((w) => w.id === 'ws-16-067')!
      ws070 = dataset.workstations.find((w) => w.id === 'ws-16-070')!
    })

    it('3.1: Confirms exact coordinates and 2.01 pt gap from CAD extraction', () => {
      expect(pillar).toBeDefined()
      expect(pillar.kind).toBe('column')
      expect(pillar.category).toBe('solid')
      expect(pillar.bbox).toEqual([982.51, 239.68, 993.89, 252.79])

      expect(ws067).toBeDefined()
      expect(ws070).toBeDefined()

      // ws-16-067 bbox right edge:
      expect(ws067.bbox[2]).toBe(980.5)
      // ws-16-070 bbox right edge:
      expect(ws070.bbox[2]).toBe(980.5)

      // Exact gap calculation:
      const gap067 = pillar.bbox[0] - ws067.bbox[2]
      const gap070 = pillar.bbox[0] - ws070.bbox[2]

      expect(gap067).toBeCloseTo(2.01, 4)
      expect(gap070).toBeCloseTo(2.01, 4)
    })

    it('3.2: Default position of ws-16-067 and ws-16-070 produces 0 collisions (valid: true)', () => {
      const p067 = placementFromWorkstation(ws067)
      const res067 = validatePlacement(p067, { others: [], obstacles: [pillar] })
      expect(res067.valid).toBe(true)
      expect(res067.reasons).toHaveLength(0)

      const p070 = placementFromWorkstation(ws070)
      const res070 = validatePlacement(p070, { others: [], obstacles: [pillar] })
      expect(res070.valid).toBe(true)
      expect(res070.reasons).toHaveLength(0)
    })

    it('3.3: Moving eastward < 2.01 pt maintains separation (valid: true)', () => {
      const p067 = placementFromWorkstation(ws067)
      // Shift by +2.00 pt -> right edge becomes 982.50 < 982.51 (remaining gap = 0.01 pt)
      const shifted200 = translatePlacement(p067, 2.0, 0)
      const res200 = validatePlacement(shifted200, { others: [], obstacles: [pillar] })
      expect(res200.valid).toBe(true)
      expect(res200.reasons).toHaveLength(0)
    })

    it('3.4: Moving eastward by exact 2.01 pt establishes exact flush contact (gap = 0.00 pt, valid: true)', () => {
      const p067 = placementFromWorkstation(ws067)
      // Exact flush translation: dx = pillar.bbox[0] - ws067.bbox[2] = 2.01 pt
      const flushEast = translatePlacement(p067, 2.01, 0)
      expect(placementBounds(flushEast)[2]).toBeCloseTo(pillar.bbox[0], 4)

      const resFlush = validatePlacement(flushEast, { others: [], obstacles: [pillar] })
      expect(resFlush.valid).toBe(true)
      expect(resFlush.reasons).toHaveLength(0)
    })

    it('3.5: Moving eastward >= +2.011 pt penetrates col-16-13 and triggers obstacle-collision', () => {
      const p067 = placementFromWorkstation(ws067)

      // Shift by +2.02 pt -> right edge 982.52 > 982.51 (penetration = 0.01 pt > float epsilon)
      const penetrating067_small = translatePlacement(p067, 2.02, 0)
      const resSmall = validatePlacement(penetrating067_small, { others: [], obstacles: [pillar] })
      expect(resSmall.valid).toBe(false)
      expect(resSmall.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'col-16-13',
        obstacleKind: 'column',
        obstacleName: 'Cột bê tông (>A / 7-6)',
      })

      // Shift by +3.00 pt -> deep penetration
      const penetrating067_deep = translatePlacement(p067, 3.0, 0)
      const resDeep = validatePlacement(penetrating067_deep, { others: [], obstacles: [pillar] })
      expect(resDeep.valid).toBe(false)
      expect(resDeep.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'col-16-13',
        obstacleKind: 'column',
        obstacleName: 'Cột bê tông (>A / 7-6)',
      })

      // Same verification for ws-16-070
      const p070 = placementFromWorkstation(ws070)
      const penetrating070 = translatePlacement(p070, 3.0, 0)
      const res070 = validatePlacement(penetrating070, { others: [], obstacles: [pillar] })
      expect(res070.valid).toBe(false)
      expect(res070.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'col-16-13',
        obstacleKind: 'column',
        obstacleName: 'Cột bê tông (>A / 7-6)',
      })
    })

    it('3.6: Verifies Y-span overlap of ws-16-067 and ws-16-070 with col-16-13', () => {
      // col-16-13 Y span: [239.68, 252.79]
      expect(pillar.bbox[1]).toBe(239.68)
      expect(pillar.bbox[3]).toBe(252.79)

      // ws-16-067 Y span
      expect(ws067.bbox[1]).toBeLessThan(pillar.bbox[3])
      expect(ws067.bbox[3]).toBeGreaterThan(pillar.bbox[1])

      // When moved eastward into column, both Y spans overlap with pillar
      const p067 = placementFromWorkstation(ws067)
      const p070 = placementFromWorkstation(ws070)
      const b067 = placementBounds(translatePlacement(p067, 3, 0))
      const b070 = placementBounds(translatePlacement(p070, 3, 0))

      // Vertical overlap check
      expect(Math.max(b067[1], pillar.bbox[1])).toBeLessThan(Math.min(b067[3], pillar.bbox[3]))
      expect(Math.max(b070[1], pillar.bbox[1])).toBeLessThan(Math.min(b070[3], pillar.bbox[3]))
    })
  })

  describe('Task 4: Adversarial Edge Cases & Stress Scenarios', () => {
    const col: FloorObstacle = {
      id: 'adv-col',
      floorId: 'floor-16',
      kind: 'column',
      category: 'solid',
      name: 'Adversarial Column',
      verification: 'EXTRACTED',
      polygon: [
        [100, 100],
        [120, 100],
        [120, 120],
        [100, 120],
      ],
      bbox: [100, 100, 120, 120],
      center: [110, 110],
      gridRef: 'TEST / 1-1',
      notes: [],
    }

    it('4.1: Corner-only touching at diagonal vertex (area = 0) is valid: true', () => {
      // Desk bottom-right corner touches column top-left corner at exactly (100, 100)
      const cornerTouch = desk({ x: 94, y: 97, width: 12, depth: 6 })
      const bounds = placementBounds(cornerTouch)
      expect(bounds[2]).toBe(100) // right edge
      expect(bounds[3]).toBe(100) // bottom edge

      const res = validatePlacement(cornerTouch, { others: [], obstacles: [col] })
      expect(res.valid).toBe(true)
      expect(res.reasons).toHaveLength(0)
    })

    it('4.2: Rotated desk (90° and 270°) flush contact is valid: true', () => {
      // Rotation 90°: footprint becomes width=6, depth=12
      // Desk placed flush against West face of column (x=100)
      // right edge at 100 -> center x = 100 - 6/2 = 97
      const rotated90 = desk({ x: 97, y: 110, width: 12, depth: 6, rotation: 90 })
      expect(placementBounds(rotated90)[2]).toBe(100)
      expect(validatePlacement(rotated90, { others: [], obstacles: [col] }).valid).toBe(true)

      // Rotation 270°: footprint becomes width=6, depth=12
      const rotated270 = desk({ x: 97, y: 110, width: 12, depth: 6, rotation: 270 })
      expect(placementBounds(rotated270)[2]).toBe(100)
      expect(validatePlacement(rotated270, { others: [], obstacles: [col] }).valid).toBe(true)
    })

    it('4.3: Desk flush with column, chair facing away is valid: true; chair facing column triggers collision', () => {
      // Desk at x=94, y=110 (right edge touches column left edge x=100).
      // Seated side 'left' (west, facing away from column):
      const chairAway = desk({
        x: 94,
        y: 110,
        width: 12,
        depth: 6,
        seatedSide: 'left', // chair projects to the west (x in [82, 88])
      })
      const resAway = validatePlacement(chairAway, { others: [], obstacles: [col], chairTileSize: 6 })
      expect(resAway.valid).toBe(true)

      // Seated side 'right' (east, facing into the column):
      const chairIntoCol = desk({
        x: 94,
        y: 110,
        width: 12,
        depth: 6,
        seatedSide: 'right', // chair projects east from x=100 to x=106 (into the column!)
      })
      const resInto = validatePlacement(chairIntoCol, { others: [], obstacles: [col], chairTileSize: 6 })
      expect(resInto.valid).toBe(false)
      expect(resInto.reasons).toContainEqual({
        type: 'obstacle-collision',
        obstacleId: 'adv-col',
        obstacleKind: 'column',
        obstacleName: 'Adversarial Column',
        target: 'chair',
      })
    })

    it('4.4: Swept sector door clearances in all 4 quadrant swing directions', () => {
      // Quadrant 1 (+X, +Y): SW hinge [100, 100], arc in [100..110, 100..110]
      const q1Sector: FloorObstacle = {
        id: 'door-q1',
        floorId: 'floor-16',
        kind: 'door-clearance',
        category: 'clearance',
        name: 'Door Q1 (+X, +Y)',
        verification: 'EXTRACTED',
        polygon: [
          [100, 100],
          [110, 100],
          [107.07, 107.07],
          [100, 110],
        ],
        bbox: [100, 100, 110, 110],
        center: [105, 105],
        gridRef: 'TEST / 1-1',
        notes: [],
      }

      // Quadrant 2 (-X, +Y): SE hinge [100, 100], arc in [90..100, 100..110]
      const q2Sector: FloorObstacle = {
        id: 'door-q2',
        floorId: 'floor-16',
        kind: 'door-clearance',
        category: 'clearance',
        name: 'Door Q2 (-X, +Y)',
        verification: 'EXTRACTED',
        polygon: [
          [100, 100],
          [100, 110],
          [92.93, 107.07],
          [90, 100],
        ],
        bbox: [90, 100, 100, 110],
        center: [95, 105],
        gridRef: 'TEST / 1-1',
        notes: [],
      }

      // Quadrant 3 (-X, -Y): NE hinge [100, 100], arc in [90..100, 90..100]
      const q3Sector: FloorObstacle = {
        id: 'door-q3',
        floorId: 'floor-16',
        kind: 'door-clearance',
        category: 'clearance',
        name: 'Door Q3 (-X, -Y)',
        verification: 'EXTRACTED',
        polygon: [
          [100, 100],
          [90, 100],
          [92.93, 92.93],
          [100, 90],
        ],
        bbox: [90, 90, 100, 100],
        center: [95, 95],
        gridRef: 'TEST / 1-1',
        notes: [],
      }

      // Quadrant 4 (+X, -Y): NW hinge [100, 100], arc in [100..110, 90..100]
      const q4Sector: FloorObstacle = {
        id: 'door-q4',
        floorId: 'floor-16',
        kind: 'door-clearance',
        category: 'clearance',
        name: 'Door Q4 (+X, -Y)',
        verification: 'EXTRACTED',
        polygon: [
          [100, 100],
          [100, 90],
          [107.07, 92.93],
          [110, 100],
        ],
        bbox: [100, 90, 110, 100],
        center: [105, 95],
        gridRef: 'TEST / 1-1',
        notes: [],
      }

      for (const [sec, cx, cy] of [
        [q1Sector, 104, 104],
        [q2Sector, 96, 104],
        [q3Sector, 96, 96],
        [q4Sector, 104, 96],
      ] as const) {
        // Penetrating desk inside the sector
        const inside = desk({ x: cx, y: cy, width: 2, depth: 2 })
        const resIn = validatePlacement(inside, { others: [], obstacles: [sec] })
        expect(resIn.valid).toBe(false)
        expect(resIn.reasons).toContainEqual(
          expect.objectContaining({
            type: 'clearance-conflict',
            obstacleId: sec.id,
          }),
        )

        // Touching boundary from outside
        // Move 10 pt outside along X
        const dx = cx > 100 ? 15 : -15
        const outside = desk({ x: 100 + dx, y: cy, width: 2, depth: 2 })
        const resOut = validatePlacement(outside, { others: [], obstacles: [sec] })
        expect(resOut.valid).toBe(true)
      }
    })
  })
})
