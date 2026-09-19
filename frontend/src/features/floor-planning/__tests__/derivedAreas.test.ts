import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { buildWorkspaceDisplayAreasForScope, deriveSectionsFromClusters } from '../workspace/displayAreas'

let dataset: FloorDataset

beforeAll(async () => {
  dataset = await FLOORS[0].load()
})

describe('derived workspace sections', () => {
  it('keeps whole clusters, is deterministic, and targets about twenty desks', () => {
    const clusters = dataset.clusters.filter((cluster) => cluster.zoneId === 'zone-16-bds-smart-city')
    const first = deriveSectionsFromClusters(clusters)
    const second = deriveSectionsFromClusters([...clusters].reverse())

    expect(second).toEqual(first)
    expect(new Set(first.flatMap((section) => section.clusterIds))).toEqual(new Set(clusters.map((cluster) => cluster.id)))
    expect(first.every((section) => section.workstationIds.length >= 14 && section.workstationIds.length <= 30)).toBe(true)
    expect(first.every((section) => section.id === `section:${[...section.clusterIds].sort().join(',')}`)).toBe(true)
  })

  it('keeps section ids when a desk count changes inside a cluster', () => {
    const clusters = dataset.clusters.filter((cluster) => cluster.zoneId === 'zone-16-bds-smart-city')
    const changed = clusters.map((cluster, index) => index === 0
      ? { ...cluster, workstationIds: cluster.workstationIds.slice(0, -1) }
      : cluster)
    const before = deriveSectionsFromClusters(clusters)
    const after = deriveSectionsFromClusters(changed)
    const changedId = before.find((section) => section.clusterIds.includes(clusters[0].id))?.id
    expect(after.some((section) => section.id === changedId)).toBe(true)
  })

  it('partitions BDS into multiple generated sections with no desk loss', () => {
    const areas = buildWorkspaceDisplayAreasForScope(dataset, { kind: 'department', departmentId: 'dept-smart-city' })
    const expected = dataset.workstations.filter((workstation) => workstation.zoneId === 'zone-16-bds-smart-city').map((workstation) => workstation.id)
    const actual = areas.flatMap((area) => area.workstationIds)
    expect(areas.length).toBeGreaterThan(1)
    expect(new Set(actual)).toEqual(new Set(expected))
    expect(actual).toHaveLength(expected.length)
  })
})
