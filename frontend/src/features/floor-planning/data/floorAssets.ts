/**
 * Floor artifacts are fetched at runtime, not imported as modules.
 *
 * `import('…/floor16.layout.json')` makes the bundler rewrite 2.9 MB of
 * geometry into a JavaScript module — a 2.9 MB object literal with one live
 * binding per top-level key, parsed by the JS parser on every load. Asking for
 * the file's URL instead leaves it a static `.json` asset: the browser fetches
 * it on demand and `JSON.parse` reads it, and no bundler chunking rule has to
 * keep it out of the entry graph in the first place.
 *
 * The URLs come from one glob, so adding a floor means adding its folder under
 * `data/floors/` — no import statement anywhere changes.
 */

/** `?url` keeps the file out of the JS module graph and yields its address. */
const ASSET_URLS = import.meta.glob('@data/floors/*/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Artifacts `tools/floorplan_extract/extract_floor.py` writes per floor.
 * A file is named `<prefix>.<name>.json`; the prefix is the extractor's own
 * and is deliberately not derived from the floor id.
 */
export type FloorAssetName =
  | 'layout'
  | 'zones'
  | 'workstations'
  | 'objects'
  | 'obstacles'
  | 'extraction'
  | 'overview'

/** Vite serves repository-root files under this prefix; Node reads the path. */
const FS_PREFIX = '/@fs'

interface AssetKey {
  floorId: string
  name: string
}

function parseAssetPath(path: string): AssetKey | null {
  const match = /\/floors\/([^/]+)\/[^/]*?\.([^./]+)\.json$/.exec(path)
  return match ? { floorId: match[1], name: match[2] } : null
}

const BY_FLOOR = ((): Map<string, Map<string, string>> => {
  const index = new Map<string, Map<string, string>>()
  for (const [path, url] of Object.entries(ASSET_URLS)) {
    const key = parseAssetPath(path)
    if (!key) continue
    const floor = index.get(key.floorId) ?? new Map<string, string>()
    floor.set(key.name, url)
    index.set(key.floorId, floor)
  }
  return index
})()

/** Floor ids that have extracted artifacts on disk. */
export const floorIdsWithAssets = (): string[] => [...BY_FLOOR.keys()].sort()

export function hasFloorAsset(floorId: string, name: FloorAssetName): boolean {
  return BY_FLOOR.get(floorId)?.has(name) ?? false
}

export function floorAssetUrl(floorId: string, name: FloorAssetName): string {
  const url = BY_FLOOR.get(floorId)?.get(name)
  if (!url) throw new Error(`Floor data: ${floorId} has no ${name} artifact`)
  return url
}

/**
 * Running under Node rather than in a browser.
 *
 * Deliberately not `typeof window === 'undefined'`: the component tests run in
 * jsdom, which defines `window` but has no server behind its origin, so a
 * fetch of the dev-time `/@fs` path fails there. What actually decides the
 * branch is whether a filesystem is reachable.
 */
const IN_NODE = typeof process !== 'undefined' && process.versions?.node != null

/**
 * Read a JSON asset by URL.
 *
 * Under Node — vitest, or any server-side render — the URL is a `/@fs` path
 * pointing at the repository, so the file is read from disk. In a browser it
 * is an ordinary HTTP asset. Both paths end in `JSON.parse`, so both produce
 * the same plain object.
 */
export async function readJsonAsset(url: string): Promise<unknown> {
  if (IN_NODE) {
    const { readFile } = await import('node:fs/promises')
    const file = url.startsWith(FS_PREFIX) ? url.slice(FS_PREFIX.length) : url
    return JSON.parse(await readFile(file, 'utf8')) as unknown
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Floor data: ${url} failed with ${response.status}`)
  return (await response.json()) as unknown
}

/** Read one named artifact of a floor. */
export const readFloorAsset = (floorId: string, name: FloorAssetName): Promise<unknown> =>
  readJsonAsset(floorAssetUrl(floorId, name))

/** Read one named artifact, or null when the extractor did not write it. */
export const readOptionalFloorAsset = (floorId: string, name: FloorAssetName): Promise<unknown> =>
  hasFloorAsset(floorId, name) ? readFloorAsset(floorId, name) : Promise.resolve(null)
