import type { VerificationState } from '../domain/spatial'

const STATES: { state: VerificationState; label: string }[] = [
  { state: 'SOURCE_VERIFIED', label: 'Source verified' },
  { state: 'EXTRACTED', label: 'Extracted (rule-based)' },
  { state: 'UNVERIFIED', label: 'Unverified' },
  { state: 'UNKNOWN', label: 'Unknown' },
]

/** Verification-state legend. Deliberately no occupancy colours. */
export function MapLegend() {
  return (
    <div className="fp-legend" aria-label="Legend">
      {STATES.map((s) => (
        <span key={s.state} className="fp-legend-item">
          <svg width="18" height="12" aria-hidden="true">
            <rect
              x="1"
              y="1"
              width="16"
              height="10"
              className="fp-legend-swatch"
              data-verification={s.state}
              fill={s.state === 'UNKNOWN' ? 'url(#fp-legend-hatch)' : undefined}
            />
          </svg>
          {s.label}
        </span>
      ))}
      <span className="fp-legend-note">No occupancy data · no seat or employee records</span>
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <pattern id="fp-legend-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="3" fill="var(--fp-unknown-bg)" />
          <line x1="0" y1="0" x2="0" y2="3" stroke="var(--fp-unknown)" strokeWidth="1" />
        </pattern>
      </svg>
    </div>
  )
}
