import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { generated, objectName } from '../labels'

let ds: FloorDataset

beforeAll(async () => {
  ds = await FLOORS.find((f) => f.id === 'floor-16')!.load()
})

describe('Vietnamese display text', () => {
  it('translates every generated note, rule and geometry text shown for floor-16', () => {
    const entities = [...ds.zones, ...ds.rooms, ...ds.clusters, ...ds.workstations, ...ds.objects]
    const texts = new Set<string>()
    for (const e of entities) {
      e.notes.forEach((n) => texts.add(n))
      const source = 'source' in e ? e.source : undefined
      for (const t of [source?.rule, source?.geometry, source?.annotationType]) if (t) texts.add(t)
    }
    const untranslated = [...texts].filter((t) => generated(t) === t)
    expect(untranslated).toEqual([])
  })

  it('names every floor-16 object kind', () => {
    for (const o of ds.objects) expect(objectName(o)).not.toMatch(/labelled|\(printer\)/)
  })
})
