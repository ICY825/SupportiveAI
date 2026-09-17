import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { buildWorkspaceDisplayAreas, type WorkspaceDisplayArea } from '../workspace/displayAreas'
import {
  buildWorkspaceScene,
  fitViewBox,
  labelAnchorInView,
  project,
  sceneBounds,
} from '../workspace/scene'
import { defaultWorkspaceScope } from '../workspace/scope'

/**
 * Area F sits 270 pt south of where the AI department's name is anchored. The
 * caption is drawn outside the clipped architecture, so framing the area used
 * to reserve room for it and opened Area F at half the scale its desks deserve.
 */

const STAGE = { width: 1200, height: 800 }
const PADDING = 20

let dataset: FloorDataset
let areas: WorkspaceDisplayArea[]

beforeAll(async () => {
  dataset = await FLOORS[0].load()
  areas = buildWorkspaceDisplayAreas(dataset)
})

const sceneFor = (area: WorkspaceDisplayArea) =>
  buildWorkspaceScene(dataset, area.scope, {
    workstationIds: area.workstationIds,
    contextBounds: area.contextBBox,
    includeContextWorkstations: true,
  })

const aiZone = () => dataset.zones.find((z) => z.id === 'zone-16-ai-platform')!

describe('framing a focused area', () => {
  it('leaves out a department caption anchored outside the area', () => {
    const areaF = areas.find((a) => a.id === 'ai-area-f')!
    const scene = sceneFor(areaF)

    // The zone is in the scene — its polygon reaches in — but its name is not.
    expect(scene.zones.map((z) => z.id)).toContain('zone-16-ai-platform')
    expect(labelAnchorInView(aiZone().labelAnchor, scene.contextBounds)).toBe(false)

    const [x0, y0, x1, y1] = sceneBounds(scene)
    const [lx, ly] = project(aiZone().labelAnchor)
    expect(lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1).toBe(false)
  })

  it('keeps the caption when the area does contain its anchor', () => {
    const areaA = areas.find((a) => a.id === 'ai-area-a')!
    const scene = sceneFor(areaA)

    expect(labelAnchorInView(aiZone().labelAnchor, scene.contextBounds)).toBe(true)
    const [x0, y0, x1, y1] = sceneBounds(scene)
    const [lx, ly] = project(aiZone().labelAnchor)
    expect(lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1).toBe(true)
  })

  it('fills the stage with the area, not with empty floor around it', () => {
    for (const area of areas) {
      const frame = fitViewBox(sceneBounds(sceneFor(area)), STAGE, PADDING)
      const desks = dataset.workstations.filter((w) => area.workstationIds.includes(w.id))
      const spread = Math.max(
        ...desks.map((w) => Math.abs(project(w.center)[0])),
      ) - Math.min(...desks.map((w) => Math.abs(project(w.center)[0])))

      // The framed width should be the area's own extent plus its context, not
      // several times it. Before the caption fix Area F came out at 2x this.
      expect(frame[2]).toBeLessThan(spread * 4 + 200)
    }
  })

  it('frames every area at a comparable scale, none of them a tiny island', () => {
    const scales = areas.map((area) => {
      const frame = fitViewBox(sceneBounds(sceneFor(area)), STAGE, PADDING)
      return STAGE.width / frame[2]
    })
    const smallest = Math.min(...scales)
    const largest = Math.max(...scales)
    // Areas differ in size, so their scales differ — but not by the 2x that the
    // stray caption used to cost Area F on its own.
    expect(largest / smallest).toBeLessThan(1.8)
  })
})

describe('the department overview is unaffected', () => {
  it('still shows the department caption', () => {
    const scene = buildWorkspaceScene(dataset, defaultWorkspaceScope(dataset))
    expect(labelAnchorInView(aiZone().labelAnchor, scene.contextBounds)).toBe(true)
  })
})
