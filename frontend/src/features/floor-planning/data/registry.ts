import { createFloorLoader } from './floorLoader'
import { hasFloorAsset } from './floorAssets'
import type { Building, FloorDataset, FloorOverview } from '../domain/spatial'

/**
 * Which part of a floor plate the company occupies. The plate is two wings on
 * the source drawings: A is the upper wing, B is the lower one.
 */
export type FloorOccupancy = 'full' | 'zone-a' | 'zone-b'

/**
 * One floor of the building, extracted or not.
 *
 * This list is the only place a floor is declared. `FLOOR_INVENTORY` and
 * `FLOORS` are both derived from it, so a floor's level and label cannot drift
 * between what the picker shows and what the renderer opens.
 *
 * `extraction` is null while `tools/floorplan_extract/` has not produced a
 * dataset for the floor. Filling it in is the whole of "adding a floor" on the
 * web side — see docs/floor-planning/adding-a-floor.md.
 *
 * Occupancy is stated by the facilities owner, not derived from a drawing.
 */
interface FloorDeclaration {
  id: string
  level: number
  label: string
  occupancy: FloorOccupancy
  extraction: { building: Building; sourceName: string } | null
}

const TECHNOPARK: Building = { id: 'building-technopark', name: 'Technopark' }

const FLOOR_DECLARATIONS: FloorDeclaration[] = [
  { id: 'floor-5', level: 5, label: 'Tầng 5', occupancy: 'zone-b', extraction: null },
  { id: 'floor-9', level: 9, label: 'Tầng 9', occupancy: 'full', extraction: null },
  { id: 'floor-11', level: 11, label: 'Tầng 11', occupancy: 'full', extraction: null },
  {
    id: 'floor-16',
    level: 16,
    label: 'Tầng 16',
    occupancy: 'full',
    extraction: {
      // Not stated on the PDF; confirmed by the team (CAD xref layers are prefixed "TNP").
      building: TECHNOPARK,
      sourceName: '260710_VSF_Layout tang 16.pdf',
    },
  },
  { id: 'floor-17', level: 17, label: 'Tầng 17', occupancy: 'full', extraction: null },
  { id: 'floor-19', level: 19, label: 'Tầng 19', occupancy: 'full', extraction: null },
  { id: 'floor-33', level: 33, label: 'Tầng 33', occupancy: 'zone-b', extraction: null },
  { id: 'floor-34', level: 34, label: 'Tầng 34', occupancy: 'full', extraction: null },
]

export interface FloorEntry {
  id: string
  level: number
  label: string
  load: () => Promise<FloorDataset>
  loadOverview?: () => Promise<FloorOverview>
}

export interface FloorInventoryEntry {
  id: string
  level: number
  label: string
  occupancy: FloorOccupancy
  /** null while the extractor has not produced a dataset for this floor */
  datasetId: string | null
}

/**
 * Every floor the company occupies, extracted or not. This is what the floor
 * picker shows: the real estate, with the un-extracted floors visible rather
 * than hidden.
 */
export const FLOOR_INVENTORY: FloorInventoryEntry[] = FLOOR_DECLARATIONS.map((floor) => ({
  id: floor.id,
  level: floor.level,
  label: floor.label,
  occupancy: floor.occupancy,
  datasetId: floor.extraction ? floor.id : null,
}))

/**
 * Floors the renderer can actually draw.
 *
 * Deliberately a subset of the inventory, not a second list: the two answer
 * different questions, and keeping them derived from one declaration is what
 * lets the picker show the real estate while only opening what exists. The
 * renderer needs no change when a floor is added.
 */
export const FLOORS: FloorEntry[] = FLOOR_DECLARATIONS.flatMap((floor) => {
  if (!floor.extraction) return []
  const loader = createFloorLoader(floor.id, floor.extraction)
  return [
    {
      id: floor.id,
      level: floor.level,
      label: floor.label,
      load: loader.load,
      loadOverview: hasFloorAsset(floor.id, 'overview') ? loader.loadOverview : undefined,
    },
  ]
})

export function findFloor(id: string | null | undefined): FloorEntry | undefined {
  return FLOORS.find((f) => f.id === id)
}
