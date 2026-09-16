/**
 * Bounds of the spatial content actually drawn on a floor, in floor points.
 *
 * "Fit to view" frames this, not the source sheet and not the structural grid:
 * the sheet carries a title block and wide margins, and the grid's axis bubbles
 * and extension lines reach well past the building. Framing either of those
 * wastes a fifth of the canvas on empty paper.
 */
import { UNLABELED_ZONE } from '../labels'
import type { BaseLayerId, BBox, FloorDataset } from '../domain/spatial'

/**
 * Layers that describe the building itself. `furniture`, `fixtures`, `grid` and
 * `dimensions` are deliberately excluded: they carry sheet-corner artefacts and
 * drawing annotations whose bounds are the whole page, not the floor.
 */
const PLATE_LAYERS: BaseLayerId[] = ['facade', 'structure', 'core', 'walls', 'partitions', 'doors']

/**
 * Zone names are drawn centred on the zone's label anchor and can reach past the
 * zone itself, so they are measured too — otherwise the tightest fit clips the
 * name of the zone nearest the building edge.
 *
 * Both numbers are floor points and must track `.fp-zone-label` in
 * floorPlanning.css (font-size 11). The ratio is the measured average advance
 * of bold uppercase Inter, rounded up, so the label can only ever gain room.
 */
const ZONE_LABEL_SIZE_PT = 11
const ZONE_LABEL_WIDTH_RATIO = 0.66

function zoneLabelBounds(zone: FloorDataset['zones'][number]): BBox {
  const text = (zone.name ?? UNLABELED_ZONE) + (zone.sourceLabelFigure !== null ? ` (${zone.sourceLabelFigure})` : '')
  const halfWidth = (text.length * ZONE_LABEL_SIZE_PT * ZONE_LABEL_WIDTH_RATIO) / 2
  const halfHeight = ZONE_LABEL_SIZE_PT / 2
  const [x, y] = zone.labelAnchor
  return [x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight]
}

const union = (a: BBox, b: BBox): BBox => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
]

/**
 * Bounds of an absolute M/L/C/Z path. Cubic control points are included, so the
 * result is conservative but never too small. Any other command means the path
 * is not a plain coordinate list and `null` is returned rather than a guess.
 */
export function pathBounds(d: string): BBox | null {
  if (/[A-Za-z]/.test(d.replace(/[MLCZ]/g, ''))) return null
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length < 2) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const x = Number(numbers[i])
    const y = Number(numbers[i + 1])
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

/**
 * The building plate plus every extracted entity, clamped to the sheet.
 * Falls back to the whole sheet when a floor has neither geometry nor entities.
 *
 * No margin is added here: breathing room belongs to the fit, which measures it
 * in screen pixels and so keeps it constant at every zoom level and window size.
 */
export function contentBounds(dataset: FloorDataset): BBox {
  const { width, height } = dataset.layout.floor
  let bounds: BBox | null = null
  const add = (b: BBox | null) => {
    if (b) bounds = bounds ? union(bounds, b) : b
  }

  for (const layer of dataset.layout.layers) {
    if (PLATE_LAYERS.includes(layer.id)) add(pathBounds(layer.d))
  }
  for (const entity of [...dataset.zones, ...dataset.rooms, ...dataset.workstations, ...dataset.objects]) {
    add(entity.bbox)
  }
  for (const zone of dataset.zones) add(zoneLabelBounds(zone))

  if (!bounds) return [0, 0, width, height]
  const [x0, y0, x1, y1] = bounds as BBox
  return [Math.max(0, x0), Math.max(0, y0), Math.min(width, x1), Math.min(height, y1)]
}
