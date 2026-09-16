import { VERIFICATION, VERIFICATION_ORDER } from '../labels'

/**
 * Extraction-state key for the verification map. Deliberately no occupancy
 * colours — this map answers "how do we know this?", not "who sits here?".
 *
 * Lives in the details panel rather than over the canvas: the drawing is the
 * priority surface and a floating bar covers part of the floor.
 */
export function MapLegend() {
  return (
    <details className="fp-section" open>
      <summary>
        <h3>Chú giải</h3>
      </summary>
      <ul className="fp-key">
        {VERIFICATION_ORDER.map((state) => (
          <li key={state} title={VERIFICATION[state].hint}>
            <svg className="fp-key-swatch" width="22" height="14" aria-hidden="true">
              <rect
                x="1"
                y="1"
                width="20"
                height="12"
                className="fp-legend-swatch"
                data-verification={state}
                fill={state === 'UNKNOWN' ? 'url(#fp-legend-hatch)' : undefined}
              />
            </svg>
            {VERIFICATION[state].label}
          </li>
        ))}
      </ul>
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <pattern id="fp-legend-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="3" fill="var(--fp-unknown-bg)" />
          <line x1="0" y1="0" x2="0" y2="3" stroke="var(--fp-unknown)" strokeWidth="1" />
        </pattern>
      </svg>
    </details>
  )
}
