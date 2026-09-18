// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import { placementsEqual, type SpatialPlacement } from '../domain/placement'
import type { FloorDataset, Point } from '../domain/spatial'
import { buildWorkspaceDisplayAreas, type WorkspaceDisplayArea } from '../workspace/displayAreas'
import {
  basePlacements,
  clearSessionLayouts,
  deriveEditableArea,
  placementFromWorkstation,
  sessionLayoutStore,
  type EditableArea,
} from '../workspace/layoutDraft'
import { buildWorkspaceScene } from '../workspace/scene'
import { defaultWorkspaceScope } from '../workspace/scope'
import { useLayoutEditor } from '../workspace/useLayoutEditor'

/**
 * A layout is saved one display area at a time, but it is stored per floor.
 * These cover the seam between those two facts.
 */

let dataset: FloorDataset
let base: Record<string, SpatialPlacement>
let areas: WorkspaceDisplayArea[]

beforeAll(async () => {
  dataset = await FLOORS[0].load()
  const overview = buildWorkspaceScene(dataset, defaultWorkspaceScope(dataset))
  base = basePlacements(overview.workstations)
  areas = buildWorkspaceDisplayAreas(dataset)
})

beforeEach(() => {
  clearSessionLayouts()
})

/** The editable area the workspace hands the editor for one display area. */
function editableArea(area: WorkspaceDisplayArea): EditableArea {
  const scene = buildWorkspaceScene(dataset, area.scope, {
    workstationIds: area.workstationIds,
    contextBounds: area.contextBBox,
    includeContextWorkstations: true,
  })
  return {
    ...deriveEditableArea(dataset, scene),
    editableIds: area.workstationIds,
    contextPlacements: scene.contextWorkstations
      .filter((workstation) => !(workstation.id in base))
      .map(placementFromWorkstation),
  }
}

const NUDGES: Point[] = [[0, -1], [0, 1], [-1, 0], [1, 0], [0, -2], [2, 0]]

/**
 * Moves one desk of `area` somewhere the validator accepts.
 *
 * Which desks have room is a property of the extracted floor, not something
 * this test should assert, so it searches instead of hardcoding a pair that a
 * re-extraction could box in.
 */
function moveSomeDesk(
  result: { current: ReturnType<typeof useLayoutEditor> },
  area: WorkspaceDisplayArea,
): string {
  for (const deskId of area.workstationIds) {
    for (const cells of NUDGES) {
      act(() => {
        result.current.nudge(deskId, cells)
      })
      if (result.current.dirty && result.current.valid) return deskId
      act(() => {
        result.current.resetPlacement(deskId)
      })
    }
  }
  throw new Error(`no valid move found in ${area.id}`)
}

describe('saving one area at a time', () => {
  it('keeps an earlier area committed when a second area is saved', async () => {
    const [areaA, areaB] = areas
    const { result, rerender } = renderHook(
      ({ area }) => useLayoutEditor({ floorId: 'floor-16', basePlacements: base, area, store: sessionLayoutStore }),
      { initialProps: { area: editableArea(areaA) } },
    )

    act(() => {
      result.current.enterEdit()
    })
    const deskA = moveSomeDesk(result, areaA)
    await act(async () => {
      await result.current.save()
    })
    const savedA = result.current.placements[deskA]
    expect(placementsEqual(savedA, base[deskA])).toBe(false)

    rerender({ area: editableArea(areaB) })
    act(() => {
      result.current.enterEdit()
    })
    const deskB = moveSomeDesk(result, areaB)
    await act(async () => {
      await result.current.save()
    })

    expect(placementsEqual(result.current.placements[deskB], base[deskB])).toBe(false)
    // The defect this covers: rebuilding the committed map from the base
    // placements dropped every area saved before the current one.
    expect(result.current.placements[deskA]).toEqual(savedA)
  })

  it('leaves both areas in the store, so a reload restores the whole floor', async () => {
    const [areaA, areaB] = areas
    const { result, rerender } = renderHook(
      ({ area }) => useLayoutEditor({ floorId: 'floor-16', basePlacements: base, area, store: sessionLayoutStore }),
      { initialProps: { area: editableArea(areaA) } },
    )

    act(() => {
      result.current.enterEdit()
    })
    const deskA = moveSomeDesk(result, areaA)
    await act(async () => {
      await result.current.save()
    })

    rerender({ area: editableArea(areaB) })
    act(() => {
      result.current.enterEdit()
    })
    const deskB = moveSomeDesk(result, areaB)
    await act(async () => {
      await result.current.save()
    })

    const stored = sessionLayoutStore.read('floor-16')!
    expect(stored[deskA]).toBeDefined()
    expect(stored[deskB]).toBeDefined()
    expect(placementsEqual(stored[deskA], base[deskA])).toBe(false)
    expect(placementsEqual(stored[deskB], base[deskB])).toBe(false)

    // A fresh mount reads the store the way a reload would.
    const reloaded = renderHook(() =>
      useLayoutEditor({
        floorId: 'floor-16',
        basePlacements: base,
        area: editableArea(areaA),
        store: sessionLayoutStore,
      }),
    )
    expect(reloaded.result.current.placements[deskA]).toEqual(stored[deskA])
    expect(reloaded.result.current.placements[deskB]).toEqual(stored[deskB])
  })

  it('writes only the active area, and never a context desk', async () => {
    const [areaA] = areas
    const { result } = renderHook(() =>
      useLayoutEditor({
        floorId: 'floor-16',
        basePlacements: base,
        area: editableArea(areaA),
        store: sessionLayoutStore,
      }),
    )

    act(() => {
      result.current.enterEdit()
    })
    moveSomeDesk(result, areaA)
    await act(async () => {
      await result.current.save()
    })

    const stored = sessionLayoutStore.read('floor-16')!
    expect(Object.keys(stored).sort()).toEqual([...areaA.workstationIds].sort())
  })
})

describe('sessionLayoutStore', () => {
  it('merges a partial write instead of replacing the floor', async () => {
    const [first, second] = Object.keys(base)
    await sessionLayoutStore.write('floor-16', { [first]: base[first] })
    await sessionLayoutStore.write('floor-16', { [second]: base[second] })

    const stored = sessionLayoutStore.read('floor-16')!
    expect(Object.keys(stored).sort()).toEqual([first, second].sort())
  })
})
