import { memo } from 'react'
import type { LockerItem } from '../types'
import { STATUS_META } from '../lockersData'

interface LockerMarkerProps {
  locker: LockerItem
  isSelected: boolean
  isHovered: boolean
  onSelect: (locker: LockerItem) => void
  onHover: (locker: LockerItem | null) => void
}

export const LockerMarker = memo(function LockerMarker({
  locker,
  isSelected,
  isHovered: _isHovered,
  onSelect,
  onHover,
}: LockerMarkerProps) {
  const [cx, cy] = locker.center
  const [w, h] = locker.size
  const meta = STATUS_META[locker.status]

  const pad = 2
  const bgW = w + pad * 2
  const bgH = h + pad * 2

  const isCombined = Boolean(locker.isCombined && locker.compartments?.length)
  const isVertical = locker.orientation === 'vertical'

  return (
    <g
      className={`locker-marker-group${isSelected ? ' is-selected' : ''}`}
      transform={`translate(${cx}, ${cy})`}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(locker)
      }}
      onMouseEnter={() => onHover(locker)}
      onMouseLeave={() => onHover(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onSelect(locker)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${locker.code} - ${meta.label} - ${locker.employeeName || 'Trống'}`}
      data-locker-id={locker.id}
    >
      {/* Background card: base dimensions are 100% constant, zero jumping or flying */}
      <rect
        x={-bgW / 2}
        y={-bgH / 2}
        width={bgW}
        height={bgH}
        rx={3}
        fill="#ffffff"
        stroke={isSelected ? '#d2181f' : meta.color}
        strokeWidth={isSelected ? '2' : '1'}
        className="locker-marker-bg"
      />

      {/* Static Selection Ring (Clean border surrounding the chosen locker, NO floating animation) */}
      {isSelected && (
        isCombined ? (
          <rect
            x={-bgW / 2 - 3.5}
            y={-bgH / 2 - 3.5}
            width={bgW + 7}
            height={bgH + 7}
            rx={5}
            fill="none"
            stroke="#d2181f"
            strokeWidth="2"
            className="locker-selection-ring"
          />
        ) : (
          <circle
            cx={0}
            cy={0}
            r={Math.max(w, h) * 0.85 + 4}
            fill="none"
            stroke="#d2181f"
            strokeWidth="2"
            className="locker-selection-ring"
          />
        )
      )}

      {isCombined && locker.compartments ? (
        /* Render combined 3 compartments */
        <g style={{ pointerEvents: 'none' }}>
          {locker.compartments.map((comp, idx) => {
            const compMeta = STATUS_META[comp.status]
            if (isVertical) {
              const slotH = h / 3
              const slotY = -h / 2 + idx * slotH
              return (
                <g key={comp.id} transform={`translate(0, ${slotY + slotH / 2})`}>
                  {idx > 0 && (
                    <line
                      x1={-w / 2 + 1}
                      y1={-slotH / 2}
                      x2={w / 2 - 1}
                      y2={-slotH / 2}
                      stroke="#d9d4cd"
                      strokeWidth="0.6"
                      strokeDasharray="1.5 1"
                    />
                  )}
                  <rect
                    x={-w / 2 + 1.5}
                    y={-slotH / 2 + 1}
                    width={w - 3}
                    height={slotH - 2}
                    rx={1.5}
                    fill={compMeta.bg === '#ffffff' ? '#faf8f5' : compMeta.bg}
                    opacity={comp.status === 'in_use' ? 0.9 : 0.8}
                  />
                  <circle
                    cx={w / 2 - 4}
                    cy={0}
                    r={2}
                    fill={compMeta.bg}
                    stroke={compMeta.color}
                    strokeWidth="0.6"
                  />
                  <text
                    x={-w / 2 + 4}
                    y={0}
                    dominantBaseline="central"
                    style={{
                      fontFamily: 'var(--font)',
                      fontSize: '3.6px',
                      fontWeight: 600,
                      fill: comp.status === 'in_use' ? '#ffffff' : '#1c1b1a',
                    }}
                  >
                    {comp.code}
                  </text>
                </g>
              )
            } else {
              const slotW = w / 3
              const slotX = -w / 2 + idx * slotW
              return (
                <g key={comp.id} transform={`translate(${slotX + slotW / 2}, 0)`}>
                  {idx > 0 && (
                    <line
                      x1={-slotW / 2}
                      y1={-h / 2 + 1}
                      x2={-slotW / 2}
                      y2={h / 2 - 1}
                      stroke="#d9d4cd"
                      strokeWidth="0.6"
                      strokeDasharray="1.5 1"
                    />
                  )}
                  <rect
                    x={-slotW / 2 + 1}
                    y={-h / 2 + 1.5}
                    width={slotW - 2}
                    height={h - 3}
                    rx={1.5}
                    fill={compMeta.bg === '#ffffff' ? '#faf8f5' : compMeta.bg}
                    opacity={comp.status === 'in_use' ? 0.9 : 0.8}
                  />
                  <circle
                    cx={slotW / 2 - 3.5}
                    cy={-h / 2 + 4}
                    r={1.8}
                    fill={compMeta.bg}
                    stroke={compMeta.color}
                    strokeWidth="0.6"
                  />
                  <text
                    x={0}
                    y={2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fontFamily: 'var(--font)',
                      fontSize: '3.4px',
                      fontWeight: 600,
                      fill: comp.status === 'in_use' ? '#ffffff' : '#1c1b1a',
                    }}
                  >
                    {comp.code}
                  </text>
                </g>
              )
            }
          })}
        </g>
      ) : (
        /* Single locker */
        <>
          <image
            href="/floor-sources/locker-icon.png"
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            preserveAspectRatio="xMidYMid meet"
            style={{ pointerEvents: 'none' }}
          />

          {/* Status indicator dot */}
          <circle
            cx={bgW / 2 - 2}
            cy={-bgH / 2 + 2}
            r={3}
            fill={meta.bg}
            stroke={meta.color}
            strokeWidth="1"
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}

      {/* Locker code tag */}
      <g transform={`translate(0, ${bgH / 2 + 5.5})`} style={{ pointerEvents: 'none' }}>
        <rect
          x={isCombined ? -18 : -12}
          y={-4.5}
          width={isCombined ? 36 : 24}
          height={7}
          rx={2}
          fill={isSelected ? '#d2181f' : '#ffffff'}
          stroke={isSelected ? '#b3161d' : '#d9d4cd'}
          strokeWidth="0.5"
        />
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontFamily: 'var(--font)',
            fontSize: '4.6px',
            fontWeight: 700,
            fill: isSelected ? '#ffffff' : '#1c1b1a',
          }}
        >
          {isCombined ? `${locker.code} (3 ngăn)` : locker.code}
        </text>
      </g>
    </g>
  )
})
