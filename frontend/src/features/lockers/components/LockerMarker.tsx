import { memo } from 'react'
import type { LockerItem } from '../types'
import { STATUS_META } from '../lockersData'
import lockerSvg from '../../../../../locker.svg'

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
  const rotation = typeof locker.rotation === 'number' && Number.isFinite(locker.rotation) ? locker.rotation : 0
  const meta = STATUS_META[locker.status]

  return (
    <g
      className={`locker-marker-group${isSelected ? ' is-selected' : ''}`}
      transform={`translate(${cx}, ${cy}) rotate(${rotation})`}
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
      id={locker.id}
      role="button"
      tabIndex={0}
      aria-label={`${locker.code} - ${meta.label} - ${locker.employeeName || 'Trống'}`}
      data-id={locker.id}
      data-locker-id={locker.id}
    >
      {/* Static Selection Ring */}
      {isSelected && (
        <circle
          cx={0}
          cy={0}
          r={18}
          fill="none"
          stroke="#d2181f"
          strokeWidth="2"
          className="locker-selection-ring"
        />
      )}

      {/* Hit-test area */}
      <rect
        x={-14}
        y={-14}
        width={28}
        height={28}
        fill="transparent"
        style={{ pointerEvents: 'all' }}
      />

      <image
        href={lockerSvg}
        xlinkHref={lockerSvg}
        x={-14}
        y={-14}
        width={28}
        height={28}
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: 'none' }}
      />
    </g>
  )
})
