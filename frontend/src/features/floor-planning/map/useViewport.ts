import { useCallback, useEffect, useRef, useState } from 'react'
import { fitViewport, focusBBox, recenterOnResize, zoomAt, type Size, type Viewport } from './viewport'

type BBox = [number, number, number, number]

/**
 * Viewport state for a floor of `content` size (floor points).
 * `homeBBox` is what "fit to screen" frames (the building plate);
 * "reset" frames the whole source sheet.
 *
 * When the container resizes (sidebar hidden/shown, window resized) the view
 * re-fits if the user has not moved it since the last fit/reset, otherwise it
 * keeps the same floor point in the centre at the same zoom.
 */
export function useViewport(content: Size, homeBBox: BBox) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, x: 0, y: 0 })
  const initialised = useRef(false)
  const sizeRef = useRef<Size>({ width: 0, height: 0 })
  /** the last view produced by a fit/reset, and which one (compared by identity) */
  const lastFit = useRef<{ kind: 'plate' | 'sheet'; vp: Viewport } | null>(null)
  /** current viewport for the resize observer, which must not read state inside an updater */
  const viewportRef = useRef(viewport)

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const sheetFit = useCallback((view: Size) => fitViewport(content, view), [content])

  const plateFit = useCallback(
    (view: Size) => {
      const [x0, y0, x1, y1] = homeBBox
      const vp = fitViewport({ width: x1 - x0, height: y1 - y0 }, view)
      return { scale: vp.scale, x: vp.x - x0 * vp.scale, y: vp.y - y0 * vp.scale }
    },
    [homeBBox],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height }
      const prev = sizeRef.current
      sizeRef.current = next
      setSize(next)
      if (next.width <= 0 || next.height <= 0) return
      if (!initialised.current) {
        initialised.current = true
        const vp = plateFit(next)
        lastFit.current = { kind: 'plate', vp }
        setViewport(vp)
        return
      }
      if (prev.width === next.width && prev.height === next.height) return
      const current = viewportRef.current
      const fit = lastFit.current
      let vp: Viewport
      if (fit && fit.vp === current) {
        // untouched since the last fit/reset: fit again for the new size
        vp = fit.kind === 'plate' ? plateFit(next) : sheetFit(next)
        lastFit.current = { kind: fit.kind, vp }
      } else {
        vp = prev.width > 0 ? recenterOnResize(current, prev, next) : current
      }
      viewportRef.current = vp
      setViewport(vp)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [plateFit, sheetFit])

  // Allow zooming out to half of whole-sheet fit.
  const minFitScale = size.width > 0 ? sheetFit(size).scale : 1

  const zoomBy = useCallback(
    (factor: number, sx?: number, sy?: number) =>
      setViewport((vp) => zoomAt(vp, factor, sx ?? size.width / 2, sy ?? size.height / 2, minFitScale)),
    [size, minFitScale],
  )

  return {
    containerRef,
    size,
    viewport,
    setViewport,
    minFitScale,
    zoomBy,
    fit: () => {
      const vp = plateFit(size)
      lastFit.current = { kind: 'plate', vp }
      setViewport(vp)
    },
    reset: () => {
      const vp = sheetFit(size)
      lastFit.current = { kind: 'sheet', vp }
      setViewport(vp)
    },
    focus: (bbox: BBox) => setViewport(focusBBox(bbox, size, minFitScale)),
  }
}
