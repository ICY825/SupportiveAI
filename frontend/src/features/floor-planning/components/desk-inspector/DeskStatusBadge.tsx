import type { DeskStatus } from '../../domain/desk'
import { DESK_STATUS } from '../../labels'

/** Shape per status so the state reads without colour (same shapes as the map legend). */
export function DeskStatusIcon({ status, size = 12 }: { status: DeskStatus; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 12 12', 'aria-hidden': true, focusable: false } as const
  switch (status) {
    case 'occupied':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.5" fill="currentColor" />
        </svg>
      )
    case 'available':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
    case 'reserved':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 2a4 4 0 0 1 0 8z" fill="currentColor" />
        </svg>
      )
    case 'conflict':
      return (
        <svg {...common}>
          <path d="M6 1.2 11.2 10.5H.8z" fill="currentColor" />
          <path d="M6 4.3v3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="6" cy="8.9" r=".75" fill="#fff" />
        </svg>
      )
    case 'unavailable':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.2 8.8 8.8 3.2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
  }
}

export function DeskStatusBadge({ status, size = 'md' }: { status: DeskStatus; size?: 'sm' | 'md' }) {
  return (
    <span className={`fp-desk-badge is-${size}`} data-desk-status={status} title={DESK_STATUS[status].hint}>
      <DeskStatusIcon status={status} />
      {DESK_STATUS[status].label}
    </span>
  )
}
