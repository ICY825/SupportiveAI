// @vitest-environment jsdom
import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDemoAllocation } from '../allocation/demoAllocation'
import { DeskInspector } from '../components/desk-inspector/DeskInspector'
import { materializeWorkstationCluster, type WorkstationClusterPattern } from '../data/authoring/materializeWorkstationCluster'
import { FLOORS } from '../data/registry'
import { buildDeskIndex } from '../domain/desk'
import { translatePlacement } from '../domain/placement'
import type { FloorDataset } from '../domain/spatial'
import { applyPlacements, basePlacements } from '../workspace/layoutDraft'
import { buildSpikeScene, memoizeSceneGeometry } from '../workspace/scene'
import { WorkspaceScene } from '../workspace/WorkspaceScene'

let source: FloorDataset
beforeAll(async () => { source = await FLOORS[0].load() })
afterEach(cleanup)

const PATTERN: WorkstationClusterPattern = {
  clusterId: 'cluster-16-authoring-spike',
  floorId: 'floor-16',
  zoneId: 'zone-16-ai-platform',
  gridRef: 'B-A / 6-5',
  workstationIdPrefix: 'ws-16-',
  workstationIdStart: 901,
  origin: [920, 248],
  rows: 3,
  columns: 6,
  rowPitch: 11.4,
  columnPitch: 11.4,
  rowRotations: [0, 180, 0],
  template: {
    id: 'desk-1200x600-with-chair',
    width: 11.4,
    depth: 5.7,
    chair: { width: 5.8, depth: 5.2, gap: 0.9 },
    nominalSizeMm: [1200, 600],
  },
}

function spikeDataset(): FloorDataset {
  const generated = materializeWorkstationCluster(PATTERN)
  return {
    ...source,
    clusters: [...source.clusters, generated.cluster],
    workstations: [...source.workstations, ...generated.workstations],
  }
}

describe('authoring-time workstation cluster materialization', () => {
  it('creates a deterministic set of stable individual workstation ids and geometry', () => {
    const first = materializeWorkstationCluster(PATTERN)
    const second = materializeWorkstationCluster(PATTERN)

    expect(first.workstations).toHaveLength(18)
    expect(first.cluster.workstationIds).toEqual(first.workstations.map((workstation) => workstation.id))
    expect(first.workstations.map(({ id, center, rotationDeg }) => `${id}@${center.join(',')}/${rotationDeg}`)).toMatchInlineSnapshot(`
      [
        "ws-16-901@920,248/0",
        "ws-16-902@931.4,248/0",
        "ws-16-903@942.8,248/0",
        "ws-16-904@954.2,248/0",
        "ws-16-905@965.6,248/0",
        "ws-16-906@977,248/0",
        "ws-16-907@920,259.4/180",
        "ws-16-908@931.4,259.4/180",
        "ws-16-909@942.8,259.4/180",
        "ws-16-910@954.2,259.4/180",
        "ws-16-911@965.6,259.4/180",
        "ws-16-912@977,259.4/180",
        "ws-16-913@920,270.8/0",
        "ws-16-914@931.4,270.8/0",
        "ws-16-915@942.8,270.8/0",
        "ws-16-916@954.2,270.8/0",
        "ws-16-917@965.6,270.8/0",
        "ws-16-918@977,270.8/0",
      ]
    `)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.workstations[0].bbox).toEqual([914.3, 245.15, 925.7, 250.85])
    expect(first.workstations[6].chair!.center[1]).toBeLessThan(first.workstations[6].center[1])
    expect(first.workstations.every((workstation) => workstation.source.kind === 'authoring-rule')).toBe(true)
  })

  it('attaches allocation state and renders/selects all generated desks with the existing scene', () => {
    const dataset = spikeDataset()
    const generated = dataset.workstations.slice(-18)
    const baseScene = buildSpikeScene(dataset)
    const scene = { ...baseScene, workstations: generated }
    const now = new Date('2026-09-16T02:00:00Z')
    const desks = buildDeskIndex(dataset, createDemoAllocation(dataset, now), now)
    const generatedDesks = new Map(generated.map((workstation) => [workstation.id, desks.get(workstation.id)!]))
    const onSelect = vi.fn()

    expect(generatedDesks.size).toBe(18)
    expect([...generatedDesks.values()].every(Boolean)).toBe(true)
    expect(memoizeSceneGeometry(scene).markers).toHaveLength(18)

    const { container } = render(
      <WorkspaceScene
        scene={scene}
        desks={generatedDesks}
        onSelect={onSelect}
        svgRef={createRef<SVGSVGElement>()}
        viewBox="-39 -7 138 95"
        origin={[31, 40]}
        zoom={1}
        pan={[0, 0]}
        ariaLabel="Generated workstation cluster"
        onKeyDown={() => {}}
        onPointerDown={() => {}}
        onPointerMove={() => {}}
        onPointerUp={() => {}}
        onPointerCancel={() => {}}
      />,
    )
    expect(container.querySelectorAll('.sw-desktop')).toHaveLength(18)
    expect(container.querySelectorAll('.sw-marker')).toHaveLength(18)
    fireEvent.click(container.querySelector('[data-workstation-id="ws-16-901"].sw-marker')!, { detail: 0 })
    expect(onSelect).toHaveBeenCalledWith('ws-16-901')
  })

  it('keeps a materialized desk independently editable and compatible with Desk Inspector', () => {
    const dataset = spikeDataset()
    const generated = materializeWorkstationCluster(PATTERN)
    const scene = { ...buildSpikeScene(dataset), workstations: generated.workstations }
    const base = basePlacements(scene.workstations)
    const placements = { ...base, 'ws-16-901': translatePlacement(base['ws-16-901'], 0, 11.4) }
    const edited = applyPlacements(scene, base, placements)

    expect(edited.workstations[0].center).not.toEqual(scene.workstations[0].center)
    expect(edited.workstations[1]).toBe(scene.workstations[1])
    expect(PATTERN.origin).toEqual([920, 248])

    const now = new Date('2026-09-16T02:00:00Z')
    const allocation = createDemoAllocation(dataset, now)
    const desk = buildDeskIndex(dataset, allocation, now).get('ws-16-901')!
    render(<DeskInspector desk={desk} source={allocation.source} now={now} onClose={() => {}} />)
    expect(screen.getByRole('complementary', { name: desk.seat.code })).toBeTruthy()
    expect(screen.getAllByText(desk.seat.code)).toHaveLength(2)
  })
})
