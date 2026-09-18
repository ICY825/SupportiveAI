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

/**
 * Which part of a floor plate the company occupies. The plate is two wings on
 * the source drawings: A is the upper wing, B is the lower one.
 */
export type FloorOccupancy = 'full' | 'zone-a' | 'zone-b'

export interface FloorInventoryEntry {
  id: string
  level: number
  label: string
  occupancy: FloorOccupancy
  /** null while the extractor has not produced a dataset for this floor */
  datasetId: string | null
}

/**
 * Every floor the company occupies, extracted or not.
 *
 * Deliberately separate from FLOORS, which is what the renderer can actually
 * draw: the two lists answer different questions, and keeping them apart is
 * what lets the picker show the real estate while only opening what exists.
 * Extracting a floor means adding it to FLOORS and filling in `datasetId` here.
 *
 * Source: stated by the facilities owner, not derived from a drawing.
 */
export const FLOOR_INVENTORY: FloorInventoryEntry[] = [
  { id: 'floor-5', level: 5, label: 'Tầng 5', occupancy: 'zone-b', datasetId: null },
  { id: 'floor-9', level: 9, label: 'Tầng 9', occupancy: 'full', datasetId: null },
  { id: 'floor-11', level: 11, label: 'Tầng 11', occupancy: 'full', datasetId: null },
  { id: 'floor-16', level: 16, label: 'Tầng 16', occupancy: 'full', datasetId: 'floor-16' },
  { id: 'floor-17', level: 17, label: 'Tầng 17', occupancy: 'full', datasetId: null },
  { id: 'floor-19', level: 19, label: 'Tầng 19', occupancy: 'full', datasetId: null },
  { id: 'floor-33', level: 33, label: 'Tầng 33', occupancy: 'zone-b', datasetId: null },
  { id: 'floor-34', level: 34, label: 'Tầng 34', occupancy: 'full', datasetId: null },
]
