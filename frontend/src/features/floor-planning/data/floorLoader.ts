import { buildDataset, type FloorMeta } from './buildDataset'
import { readFloorAsset, readJsonAsset, readOptionalFloorAsset, floorAssetUrl } from './floorAssets'
import type { FloorDataset, FloorOverview } from '../domain/spatial'

/**
 * One loader per floor, built from the floor's id and the two facts the
 * drawing cannot state: which building it belongs to, and the source PDF it
 * was extracted from.
 *
 * Every floor loads the same six artifacts under the same names, so there is
 * nothing per-floor left to write by hand. A floor that needs a different
 * assembly has a different extractor, not a different loader.
 */
export interface FloorLoader {
  /** Bounds and reduced desks: enough for a first interactive paint. */
  loadOverview: () => Promise<FloorOverview>
  /** Everything, including the layer geometry. */
  load: () => Promise<FloorDataset>
}

export function createFloorLoader(floorId: string, meta: FloorMeta): FloorLoader {
  const loadOverview = async (): Promise<FloorOverview> =>
    (await readJsonAsset(floorAssetUrl(floorId, 'overview'))) as FloorOverview

  const load = async (): Promise<FloorDataset> => {
    const [overview, layout, zones, workstations, objects, obstacles, extraction] =
      await Promise.all([
        // Optional here, required by loadOverview(): a floor extracted before
        // the overview artifact existed still assembles, it just cannot paint
        // early. Re-running the extractor is what fixes that, not this loader.
        readOptionalFloorAsset(floorId, 'overview'),
        readFloorAsset(floorId, 'layout'),
        readFloorAsset(floorId, 'zones'),
        readFloorAsset(floorId, 'workstations'),
        readFloorAsset(floorId, 'objects'),
        readOptionalFloorAsset(floorId, 'obstacles'),
        readFloorAsset(floorId, 'extraction'),
      ])
    return buildDataset(
      { layout, zones, workstations, objects, obstacles, extraction, overview },
      meta,
    )
  }

  return { loadOverview, load }
}
