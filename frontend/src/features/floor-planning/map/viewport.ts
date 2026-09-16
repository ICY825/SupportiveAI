/** Pure pan/zoom math. Screen = floor * scale + translate. */

export interface Viewport {
  scale: number
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export const MIN_ZOOM_FACTOR = 0.5 // relative to fit scale
export const MAX_SCALE = 60 // screen px per floor pt

/**
 * Breathing room left around a fitted map, in screen pixels. Small because the
 * map's own controls float over the canvas edges rather than sitting beside it.
 */
export const FIT_PADDING = 28

export function fitViewport(content: Size, view: Size, padding = FIT_PADDING): Viewport {
  const w = Math.max(1, view.width - padding * 2)
  const h = Math.max(1, view.height - padding * 2)
  const scale = Math.min(w / content.width, h / content.height)
  return {
    scale,
    x: (view.width - content.width * scale) / 2,
    y: (view.height - content.height * scale) / 2,
  }
}

export function clampScale(scale: number, fitScale: number): number {
  return Math.min(MAX_SCALE, Math.max(fitScale * MIN_ZOOM_FACTOR, scale))
}

/** Zoom by `factor`, keeping the screen point (sx, sy) fixed. */
export function zoomAt(vp: Viewport, factor: number, sx: number, sy: number, fitScale: number): Viewport {
  const scale = clampScale(vp.scale * factor, fitScale)
  const k = scale / vp.scale
  return { scale, x: sx - (sx - vp.x) * k, y: sy - (sy - vp.y) * k }
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}

export function screenToFloor(vp: Viewport, sx: number, sy: number): [number, number] {
  return [(sx - vp.x) / vp.scale, (sy - vp.y) / vp.scale]
}

/** Centre a floor-space bbox in view at a comfortable scale. */
export function focusBBox(
  bbox: [number, number, number, number],
  view: Size,
  fitScale: number,
  padding = 80,
): Viewport {
  const [x0, y0, x1, y1] = bbox
  const w = Math.max(x1 - x0, 1)
  const h = Math.max(y1 - y0, 1)
  const scale = clampScale(
    Math.min((view.width - padding * 2) / w, (view.height - padding * 2) / h, fitScale * 12),
    fitScale,
  )
  return {
    scale,
    x: view.width / 2 - ((x0 + x1) / 2) * scale,
    y: view.height / 2 - ((y0 + y1) / 2) * scale,
  }
}

/** Keep the floor point that was at the centre of the old view at the centre of the new one. */
export function recenterOnResize(vp: Viewport, prev: Size, next: Size): Viewport {
  const [cx, cy] = screenToFloor(vp, prev.width / 2, prev.height / 2)
  return { scale: vp.scale, x: next.width / 2 - cx * vp.scale, y: next.height / 2 - cy * vp.scale }
}
