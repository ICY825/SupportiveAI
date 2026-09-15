import { VERIFICATION, VERIFICATION_ORDER } from '../labels'

/** Verification-state legend. Deliberately no occupancy colours. */
export function MapLegend() {
  return (
    <div className="fp-legend" role="group" aria-label="Chú giải trạng thái xác minh">
      <span className="fp-legend-title">Trạng thái xác minh</span>
      {VERIFICATION_ORDER.map((state) => (
        <span key={state} className="fp-legend-item" title={VERIFICATION[state].hint}>
          <svg width="18" height="12" aria-hidden="true">
            <rect
              x="1"
              y="1"
              width="16"
              height="10"
              className="fp-legend-swatch"
              data-verification={state}
              fill={state === 'UNKNOWN' ? 'url(#fp-legend-hatch)' : undefined}
            />
          </svg>
          {VERIFICATION[state].label}
        </span>
      ))}
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <pattern id="fp-legend-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="3" fill="var(--fp-unknown-bg)" />
          <line x1="0" y1="0" x2="0" y2="3" stroke="var(--fp-unknown)" strokeWidth="1" />
        </pattern>
      </svg>
    </div>
  )
}
