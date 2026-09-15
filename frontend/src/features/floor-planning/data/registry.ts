import type { FloorDataset } from '../domain/spatial'

export interface FloorEntry {
  id: string
  level: number
  label: string
  load: () => Promise<FloorDataset>
}

/**
 * Floors with an extracted dataset. Adding a floor = run the extractor with a
 * new config in tools/floorplan_extract/floors/, add a loader folder under
 * ./floors/, and register it here. The renderer needs no changes.
 */
export const FLOORS: FloorEntry[] = [
  {
    id: 'floor-16',
    level: 16,
    label: 'Tầng 16',
    load: () => import('./floors/floor-16').then((m) => m.default()),
  },
]

export function findFloor(id: string | null | undefined): FloorEntry | undefined {
  return FLOORS.find((f) => f.id === id)
}
