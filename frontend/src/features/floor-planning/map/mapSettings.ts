import type { BaseLayerId } from '../domain/spatial'

export type SourceMode = 'digital' | 'overlay' | 'source'

export interface DebugOptions {
  enabled: boolean
  ids: boolean
  bboxes: boolean
  classification: boolean
  coords: boolean
}

export interface MapSettings {
  sourceMode: SourceMode
  /** 0..1, used in overlay mode */
  sourceOpacity: number
  layers: Record<BaseLayerId, boolean>
  zoneFills: boolean
  labels: boolean
  debug: DebugOptions
}

export const DEFAULT_SETTINGS: MapSettings = {
  sourceMode: 'digital',
  sourceOpacity: 0.5,
  layers: {
    facade: true,
    structure: true,
    core: true,
    walls: true,
    partitions: true,
    doors: true,
    fixtures: true,
    furniture: true,
    grid: true,
    dimensions: false,
  },
  zoneFills: true,
  labels: true,
  debug: { enabled: false, ids: true, bboxes: true, classification: true, coords: true },
}
