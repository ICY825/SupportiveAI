import { bboxOfPoints } from './geometry'
import type { FloorDataset, Point, VerificationState, Zone } from './spatial'

export interface ZoneCustomization {
  name?: string | null
  labelAnchor?: Point
  sourceColor?: string | null
  verification?: VerificationState
  type?: 'WORKSPACE_ZONE' | 'UNKNOWN'
}

export type FloorZoneCustomizations = Record<string, ZoneCustomization>

const STORAGE_PREFIX = 'vsf.zones.'

export function getZoneStorageKey(floorId: string): string {
  return `${STORAGE_PREFIX}${floorId}`
}

export function loadZoneCustomizations(floorId: string): FloorZoneCustomizations {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {}
    const raw = window.localStorage.getItem(getZoneStorageKey(floorId))
    if (!raw) return {}
    return JSON.parse(raw) as FloorZoneCustomizations
  } catch {
    return {}
  }
}

export function saveZoneCustomizations(floorId: string, data: FloorZoneCustomizations): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    if (Object.keys(data).length === 0) {
      window.localStorage.removeItem(getZoneStorageKey(floorId))
    } else {
      window.localStorage.setItem(getZoneStorageKey(floorId), JSON.stringify(data))
    }
  } catch {
    // Ignore storage quota or access errors
  }
}

export function clearAllZoneCustomizations(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key)
    }
  } catch {}
}

export function applyZoneCustomizations(zones: Zone[], customizations: FloorZoneCustomizations): Zone[] {
  if (!customizations || Object.keys(customizations).length === 0) return zones
  return zones.map((z) => {
    const custom = customizations[z.id]
    if (!custom) return z
    return {
      ...z,
      name: custom.name !== undefined ? custom.name : z.name,
      labelAnchor: custom.labelAnchor ? [...custom.labelAnchor] : z.labelAnchor,
      sourceColor: custom.sourceColor !== undefined ? custom.sourceColor : z.sourceColor,
      verification: custom.verification ?? z.verification,
      type: custom.type ?? z.type,
    }
  })
}

export function applyDatasetZoneCustomizations(
  dataset: FloorDataset | undefined,
  customizations: FloorZoneCustomizations,
): FloorDataset | undefined {
  if (!dataset) return undefined
  if (!customizations || Object.keys(customizations).length === 0) return dataset
  return {
    ...dataset,
    zones: applyZoneCustomizations(dataset.zones, customizations),
  }
}

/**
 * Calculates the polygon centroid for centering a zone's title/label.
 */
export function polygonCentroid(polygon: readonly Point[]): Point {
  if (polygon.length === 0) return [0, 0]
  let signedArea = 0
  let cx = 0
  let cy = 0
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const [x0, y0] = polygon[i]
    const [x1, y1] = polygon[(i + 1) % n]
    const a = x0 * y1 - x1 * y0
    signedArea += a
    cx += (x0 + x1) * a
    cy += (y0 + y1) * a
  }
  signedArea *= 0.5
  if (Math.abs(signedArea) < 1e-6) {
    const [minX, minY, maxX, maxY] = bboxOfPoints(polygon)
    return [Math.round(((minX + maxX) / 2) * 10) / 10, Math.round(((minY + maxY) / 2) * 10) / 10]
  }
  cx /= 6 * signedArea
  cy /= 6 * signedArea
  return [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10]
}
