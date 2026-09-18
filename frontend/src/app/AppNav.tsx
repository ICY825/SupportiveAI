import { useEffect, useRef, useState, type ReactNode } from 'react'
import logoUrl from '../assets/brand/vsf-logo.png'

interface Module {
  id: string
  label: string
  href?: string
  icon: ReactNode
}

const icon = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const chevron = (d: string) => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** The four pilot modules (README §4). Those with an `href` have a screen; the rest are shown as not yet available. */
const MODULES: Module[] = [
  {
    id: 'floor-planning',
    label: 'Mặt bằng văn phòng',
    href: '#/floor-planning',
    icon: icon('M3 3.5h14v13H3z M3 10h5.5 M8.5 3.5V7 M12.5 10v6.5 M8.5 13h8.5'),
  },
  {
    id: 'lockers',
    label: 'Tủ locker',
    href: '#/lockers',
    icon: icon('M4 2.5h12v15H4z M10 2.5v15 M7.5 8.5v2 M12.5 8.5v2'),
  },
  {
    id: 'parcels',
    label: 'Chuyển phát nhanh',
    href: '#/mail/batches',
    icon: icon('M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z M3 6.5 10 10l7-3.5 M10 10v7 M6.5 4.75l7 3.5'),
  },
  {
    id: 'documents',
    label: 'Công văn đến/đi',
    icon: icon('M5 2.5h7l3.5 3.5v11.5H5z M12 2.5V6h3.5 M7.5 10h5 M7.5 13h5'),
  },
]

const GROUPS = [
  { heading: 'Đang sử dụng', modules: MODULES.filter((m) => m.href) },
  { heading: 'Sắp triển khai', modules: MODULES.filter((m) => !m.href) },
]

const STORAGE_KEY = 'vsf.nav.collapsed'

function initialCollapsed(): boolean {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved !== null) return saved === '1'
  } catch {
    // storage unavailable: fall back to screen width
  }
  /*
   * Below this the floor map, not the module list, is what the width is for:
   * laptops start collapsed. An explicit choice is remembered and always wins.
   */
  return window.innerWidth < 1440
}

interface AppNavProps {
  activeId: string
  /** the active module's settings panel (floor planning: map display settings) */
  settingsOpen: boolean
  /** false when the current view has no settings, so the control is not offered */
  settingsAvailable?: boolean
  onToggleSettings: () => void
}

/**
 * Module sidebar. Collapsing hides it completely; a small tab on the left
 * edge brings it back. Sets `data-nav-collapsed` on the shell so page chrome
 * can leave room for that tab.
 */
export function AppNav({ activeId, settingsOpen, settingsAvailable = true, onToggleSettings }: AppNavProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const toggledByUser = useRef(false)
  const collapseRef = useRef<HTMLButtonElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    document.documentElement.toggleAttribute('data-nav-collapsed', collapsed)
    // keep keyboard focus on the control that replaced the one just pressed
    if (toggledByUser.current) (collapsed ? expandRef : collapseRef).current?.focus()
  }, [collapsed])

  const setAndRemember = (next: boolean) => {
    toggledByUser.current = true
    setCollapsed(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // preference just isn't remembered
    }
  }

  if (collapsed) {
    return (
      <button
        ref={expandRef}
        type="button"
        className="app-nav-expand"
        aria-label="Mở thanh điều hướng"
        title="Mở thanh điều hướng"
        aria-expanded="false"
        onClick={() => setAndRemember(false)}
      >
        {chevron('M6 3.5 10.5 8 6 12.5')}
      </button>
    )
  }

  return (
    <nav className="app-nav" aria-label="Phân hệ">
      <a className="app-brand" href="#/floor-planning" aria-label="Vin Smart Future · Trung tâm Hành chính">
        <img src={logoUrl} alt="Vin Smart Future" width="104" height="76" />
      </a>

      {GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="app-nav-heading">{group.heading}</p>
          <ul className="app-nav-list" aria-label={group.heading}>
            {group.modules.map((m) => {
              const content = (
                <>
                  {m.icon}
                  <span className="app-nav-label">{m.label}</span>
                </>
              )
              return (
                <li key={m.id}>
                  {m.href ? (
                    <a
                      className={`app-nav-item${m.id === activeId ? ' is-active' : ''}`}
                      href={m.href}
                      aria-current={m.id === activeId ? 'page' : undefined}
                    >
                      {content}
                    </a>
                  ) : (
                    <span className="app-nav-item is-disabled" aria-disabled="true" title={`${m.label} · chưa triển khai`}>
                      {content}
                      <span className="app-sr-only">, chưa triển khai</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="app-nav-foot">
        {settingsAvailable && (
          <button
            type="button"
            className={`app-nav-settings${settingsOpen ? ' is-open' : ''}`}
            aria-pressed={settingsOpen}
            aria-controls="fp-map-settings"
            onClick={onToggleSettings}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path
                d="M8.6 2.5h2.8l.4 2.1 1.6.9 2-.8 1.4 2.4-1.6 1.4v1.9l1.6 1.4-1.4 2.4-2-.8-1.6.9-.4 2.1H8.6l-.4-2.1-1.6-.9-2 .8-1.4-2.4 1.6-1.4V8.5L3.2 7.1l1.4-2.4 2 .8 1.6-.9z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span>Cài đặt bản đồ</span>
          </button>
        )}
        <button
          ref={collapseRef}
          type="button"
          className="app-nav-toggle"
          aria-expanded="true"
          aria-label="Ẩn thanh điều hướng"
          title="Ẩn thanh điều hướng"
          onClick={() => setAndRemember(true)}
        >
          {chevron('M10 3.5 5.5 8l4.5 4.5')}
        </button>
      </div>
    </nav>
  )
}
