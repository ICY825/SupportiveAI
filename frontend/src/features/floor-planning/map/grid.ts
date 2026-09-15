import type { FloorLayout } from '../domain/spatial'

function bay(axes: { name: string; v: number }[], v: number): string {
  const sorted = [...axes].sort((a, b) => a.v - b.v)
  if (sorted.length === 0) return '?'
  if (v <= sorted[0].v) return `<${sorted[0].name}`
  for (let i = 0; i < sorted.length - 1; i++) {
    if (v >= sorted[i].v && v <= sorted[i + 1].v) return `${sorted[i].name}-${sorted[i + 1].name}`
  }
  return `>${sorted[sorted.length - 1].name}`
}

/** Structural grid bay for a floor point, e.g. "K-J / 6-5". Same format as the extractor. */
export function gridRefAt(layout: FloorLayout, x: number, y: number): string {
  const cols = layout.grid.columns.map((c) => ({ name: c.name, v: c.x ?? 0 }))
  const rows = layout.grid.rows.map((r) => ({ name: r.name, v: r.y ?? 0 }))
  return `${bay(cols, x)} / ${bay(rows, y)}`
}

/** Bounding box of the structural grid, i.e. the building plate area. */
export function gridBounds(layout: FloorLayout, pad = 30): [number, number, number, number] {
  const xs = layout.grid.columns.map((c) => c.x ?? 0)
  const ys = layout.grid.rows.map((r) => r.y ?? 0)
  if (xs.length === 0 || ys.length === 0) return [0, 0, layout.floor.width, layout.floor.height]
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]
}
