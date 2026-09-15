import { useState, type ReactNode } from 'react'
import logoUrl from '../assets/brand/vsf-logo.png'
import markUrl from '../assets/brand/vsf-mark.png'

interface Module {
  id: string
  label: string
  shortLabel: string
  href?: string
  icon: ReactNode
}

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** The four pilot modules (README §4). Only floor planning is built; the rest are shown as not yet available. */
const MODULES: Module[] = [
  {
    id: 'floor-planning',
    label: 'Mặt bằng văn phòng',
    shortLabel: 'Mặt bằng',
    href: '#/floor-planning',
    icon: icon('M3 3.5h14v13H3z M3 10h5.5 M8.5 3.5V7 M12.5 10v6.5 M8.5 13h8.5'),
  },
  {
    id: 'lockers',
    label: 'Tủ locker',
    shortLabel: 'Tủ locker',
    icon: icon('M4 2.5h12v15H4z M10 2.5v15 M7.5 8.5v2 M12.5 8.5v2'),
  },
  {
    id: 'parcels',
    label: 'Chuyển phát nhanh',
    shortLabel: 'Chuyển phát',
    icon: icon('M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z M3 6.5 10 10l7-3.5 M10 10v7 M6.5 4.75l7 3.5'),
  },
  {
    id: 'documents',
    label: 'Công văn đến/đi',
    shortLabel: 'Công văn',
    icon: icon('M5 2.5h7l3.5 3.5v11.5H5z M12 2.5V6h3.5 M7.5 10h5 M7.5 13h5'),
  },
]

const STORAGE_KEY = 'vsf.nav.compact'

function initialCompact(): boolean {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved !== null) return saved === '1'
  } catch {
    // storage unavailable: fall back to screen width
  }
  return window.innerWidth < 1440
}

export function AppNav({ activeId }: { activeId: string }) {
  const [compact, setCompact] = useState(initialCompact)

  const toggle = () => {
    setCompact((c) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, c ? '0' : '1')
      } catch {
        // preference just isn't remembered
      }
      return !c
    })
  }

  return (
    <nav className={`app-nav${compact ? ' is-compact' : ''}`} aria-label="Phân hệ">
      <a className="app-brand" href="#/floor-planning" aria-label="Vin Smart Future · Trung tâm Hành chính">
        {compact ? (
          <img className="app-brand-mark" src={markUrl} alt="" width="40" height="40" />
        ) : (
          <img className="app-brand-logo" src={logoUrl} alt="" width="132" height="96" />
        )}
      </a>

      {[
        { heading: 'Đang sử dụng', modules: MODULES.filter((m) => m.href) },
        { heading: 'Sắp triển khai', modules: MODULES.filter((m) => !m.href) },
      ].map((group, gi) => (
        <div key={group.heading} className="app-nav-group">
          {compact ? (
            gi > 0 && <div className="app-nav-divider" role="separator" />
          ) : (
            <p className="app-nav-heading">{group.heading}</p>
          )}
          <ul className="app-nav-list" aria-label={group.heading}>
            {group.modules.map((m) => {
              const active = m.id === activeId
              const content = (
                <>
                  {m.icon}
                  <span className="app-nav-label">{compact ? m.shortLabel : m.label}</span>
                </>
              )
              return (
                <li key={m.id}>
                  {m.href ? (
                    <a
                      className={`app-nav-item${active ? ' is-active' : ''}`}
                      href={m.href}
                      title={compact ? m.label : undefined}
                      aria-current={active ? 'page' : undefined}
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
        <span className="app-nav-stage" title="SupportiveAI đang trong giai đoạn thử nghiệm">
          Pilot
        </span>
        <button
          type="button"
          className="app-nav-toggle"
          aria-expanded={!compact}
          aria-label={compact ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          title={compact ? 'Mở rộng' : 'Thu gọn'}
          onClick={toggle}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              d={compact ? 'M6 3.5 10.5 8 6 12.5' : 'M10 3.5 5.5 8l4.5 4.5'}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </nav>
  )
}
