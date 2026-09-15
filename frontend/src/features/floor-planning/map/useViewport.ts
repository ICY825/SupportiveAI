import { useCallback, useEffect, useRef, useState } from 'react'
import { fitViewport, focusBBox, zoomAt, type Size, type Viewport } from './viewport'

type BBox = [number, number, number, number]

/**
 * Viewport state for a floor of `content` size (floor points).
 * `homeBBox` is what "fit to screen" frames (the building plate);
 * "reset" frames the whole source sheet.
 */
export function useViewport(content: Size, homeBBox: BBox) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, x: 0, y: 0 })
  const initialised = useRef(false)

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
      setSize(next)
      if (!initialised.current && next.width > 0 && next.height > 0) {
        initialised.current = true
        setViewport(plateFit(next))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [plateFit])

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
    fit: () => setViewport(plateFit(size)),
    reset: () => setViewport(sheetFit(size)),
    focus: (bbox: BBox) => setViewport(focusBBox(bbox, size, minFitScale)),
  }
}
