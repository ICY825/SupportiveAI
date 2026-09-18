/**
 * Khung các màn hình Đề 3: topbar 52px + vùng nội dung.
 *
 * Bản Next có `AdminShell` mang **cả** thanh điều hướng phân hệ lẫn topbar,
 * vì lúc đó Đề 3 là một ứng dụng riêng. Giờ bốn đề dùng chung một trang, và
 * thanh điều hướng đã là `app/AppNav.tsx` — nếu giữ cả hai thì người dùng
 * thấy hai rail chồng nhau, mỗi cái nói một chuyện khác về đề nào đã chạy.
 *
 * Nên chỉ phần topbar của wireframe (artboard 1a) ở lại đây: tiêu đề phân hệ,
 * bộ chuyển bốn màn hình, người dùng và nút thoát.
 */

import { Link, Outlet, useLocation } from 'react-router'
import { useSession } from '../../shared/auth'
import './mail.css'

/**
 * Bốn màn hình của Đề 3. Ở wireframe đây là `view-toggle` trên topbar —
 * thanh điều hướng chỉ liệt kê phân hệ, không lồng màn hình con vào.
 */
const MAIL_VIEWS = [
  { to: '/mail/batches', label: 'Lô thư' },
  { to: '/mail/pending-match', label: 'Chờ khớp' },
  { to: '/mail/items', label: 'Kiện hàng' },
  { to: '/mail/reports', label: 'Báo cáo' },
]

export function MailShell() {
  const { pathname } = useLocation()
  const { employee, signOut } = useSession()

  return (
    <div
      className="mail-scope"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0 }}
    >
      <header
        style={{
          height: 'var(--topbar-height)',
          flex: 'none',
          background: '#fff',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 18px',
        }}
      >
        <span style={{ font: '600 14.5px var(--font-sans)' }}>
          Trung tâm Hành chính · Chuyển phát nhanh
        </span>

        <ViewToggle pathname={pathname} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: '#e6e2db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted-strong)',
            }}
          >
            {initials(employee?.full_name)}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted-strong)' }}>
            {employee?.full_name ?? ''}
          </span>
          <button
            onClick={signOut}
            style={{
              border: '1px solid var(--border-strong)',
              background: '#fff',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 10px',
              fontSize: 11.5,
              color: 'var(--text-muted-strong)',
              cursor: 'pointer',
            }}
          >
            Thoát
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: '18px 22px', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  )
}

/** `view-toggle` của wireframe: rãnh chìm, nút đang chọn nổi nền trắng. */
function ViewToggle({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Màn hình Đề 3"
      style={{
        display: 'flex',
        gap: 2,
        background: 'var(--bg-sunken)',
        borderRadius: 'var(--radius-sm)',
        padding: 3,
      }}
    >
      {MAIL_VIEWS.map((view) => {
        const current = pathname === view.to || pathname.startsWith(`${view.to}/`)
        return (
          <Link
            key={view.to}
            to={view.to}
            aria-current={current ? 'page' : undefined}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              font: '500 11.5px var(--font-sans)',
              textDecoration: 'none',
              color: current ? 'var(--text)' : 'var(--text-muted)',
              background: current ? '#fff' : 'transparent',
              fontWeight: current ? 600 : 500,
              boxShadow: current ? '0 1px 2px rgba(0,0,0,.05)' : undefined,
            }}
          >
            {view.label}
          </Link>
        )
      })}
    </nav>
  )
}

function initials(fullName: string | undefined): string {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  const last = parts[parts.length - 1] ?? ''
  const first = parts.length > 1 ? parts[parts.length - 2] : ''
  return (first.charAt(0) + last.charAt(0)).toUpperCase()
}
