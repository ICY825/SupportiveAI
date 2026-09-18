import { DESK_STATUSES, type DeskStatus } from '../../domain/desk'
import { DEMO_DATA_HINT, DEMO_DATA_LABEL, DESK_STATUS } from '../../labels'

/** Desk status legend for the workspace view. Swatches reuse the map's desk shapes and fill patterns. */
export function DeskStatusLegend({ counts, demo }: { counts: Record<DeskStatus, number>; demo: boolean }) {
  return (
    <div className="fp-legend fp-desk-legend" role="group" aria-label="Chú giải trạng thái chỗ ngồi">
      <span className="fp-legend-title">Chỗ ngồi</span>
      {DESK_STATUSES.map((s) => (
        <span key={s} className="fp-legend-item" title={DESK_STATUS[s].hint}>
          <svg width="20" height="12" aria-hidden="true">
            <g data-desk-status={s}>
              <rect x="1" y="1" width="18" height="10" rx="1" className="fp-desk-shape" />
            </g>
          </svg>
          {DESK_STATUS[s].label}
          <span className="fp-count">{counts[s]}</span>
        </span>
      ))}
      {demo && (
        <span className="fp-legend-demo" title={DEMO_DATA_HINT}>
          {DEMO_DATA_LABEL}
        </span>
      )}
    </div>
  )
}
