import { FLOOR_NO_DATASET, FLOOR_OCCUPANCY } from '../labels'
import type { FloorInventoryEntry } from '../data/registry'

/**
 * Floor picker for the floor-planning top bar.
 *
 * A menu rather than the tab strip FloorSelector draws: the company occupies
 * eight floors, which do not fit across a 48px bar, and all but one have no
 * extracted dataset yet. A native <select> gets keyboard handling, disabled
 * options and narrow-width behaviour without a custom popover.
 *
 * FloorSelector is left alone and still used by the locker module.
 */
export function FloorPicker({
  inventory,
  value,
  onChange,
}: {
  inventory: FloorInventoryEntry[]
  value: string
  onChange: (floorId: string) => void
}) {
  return (
    <div className="fp-floor-picker">
      <select aria-label="Chọn tầng" title="Chọn tầng" value={value} onChange={(e) => onChange(e.target.value)}>
        {inventory.map((floor) => (
          // Floors without a dataset stay listed and stay unselectable: the
          // list is the company's real estate, not the app's coverage.
          <option key={floor.id} value={floor.id} disabled={floor.datasetId === null}>
            {optionLabel(floor)}
          </option>
        ))}
      </select>
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function optionLabel(floor: FloorInventoryEntry): string {
  const scope = floor.occupancy === 'full' ? '' : ` · ${FLOOR_OCCUPANCY[floor.occupancy]}`
  const state = floor.datasetId === null ? ` — ${FLOOR_NO_DATASET}` : ''
  return `${floor.label}${scope}${state}`
}
