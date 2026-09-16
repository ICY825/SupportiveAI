import type { LockerStatus } from '../types'
import { STATUS_META } from '../lockersData'

interface LockerIconProps {
  size?: number
  status?: LockerStatus
  className?: string
}

/**
 * Bold black locker cabinet icon, faithful to the icon used in
 * `260626_VSF_Layout Tầng 19_locker-icons.pdf`.
 */
export function LockerIcon({ size = 18, status, className = '' }: LockerIconProps) {
  const meta = status ? STATUS_META[status] : null
  const strokeColor = meta ? meta.color : '#1c1b1a'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer cabinet frame */}
      <rect
        x="3"
        y="2"
        width="18"
        height="20"
        rx="2"
        fill="#1c1b1a"
        stroke={strokeColor}
        strokeWidth={status ? '1.5' : '1'}
      />
      {/* Vertical door divider */}
      <line x1="12" y1="3" x2="12" y2="21" stroke="#ffffff" strokeWidth="1" />
      {/* Upper vents / louvers */}
      <line x1="5.5" y1="5.5" x2="9.5" y2="5.5" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="14.5" y1="5.5" x2="18.5" y2="5.5" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="5.5" y1="7.5" x2="9.5" y2="7.5" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="14.5" y1="7.5" x2="18.5" y2="7.5" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" />
      {/* Lower vents / louvers */}
      <line x1="5.5" y1="17.5" x2="9.5" y2="17.5" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="14.5" y1="17.5" x2="18.5" y2="17.5" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" />
      {/* Door handles / keyholes */}
      <rect x="10" y="11" width="1.2" height="3" rx="0.5" fill="#ffffff" />
      <rect x="12.8" y="11" width="1.2" height="3" rx="0.5" fill="#ffffff" />
    </svg>
  )
}
