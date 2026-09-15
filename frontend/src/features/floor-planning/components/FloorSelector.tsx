import type { FloorEntry } from '../data/registry'

interface FloorSelectorProps {
  floors: FloorEntry[]
  value: string
  onChange: (floorId: string) => void
}

export function FloorSelector({ floors, value, onChange }: FloorSelectorProps) {
  return (
    <div className="fp-floor-selector" role="tablist" aria-label="Floor">
      {floors.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={f.id === value}
          className={f.id === value ? 'is-active' : ''}
          onClick={() => onChange(f.id)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
