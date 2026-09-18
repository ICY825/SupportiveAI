/**
 * Khung các màn hình Đề 3: topbar 52px + vùng nội dung.
 *
 * Bản Next có `AdminShell` mang **cả** thanh điều hướng phân hệ lẫn topbar,
 * vì lúc đó Đề 3 là một ứng dụng riêng. Giờ bốn đề dùng chung một trang, và
 * thanh điều hướng đã là `app/AppNav.tsx` — nếu giữ cả hai thì người dùng
 * thấy hai rail chồng nhau, mỗi cái nói một chuyện khác về đề nào đã chạy.
 *
 * Nên chỉ phần topbar ở lại đây, dựng bằng `.fp-topbar` dùng chung để khớp
 * với Mặt bằng văn phòng và Tủ locker: tên phân hệ, tab màn hình, người dùng
 * và nút thoát.
 */

import { Link, Outlet, useLocation } from 'react-router'
import { useSession } from '../../shared/auth'
import markUrl from '../../assets/brand/vsf-mark.png'
import '../floor-planning/floorPlanning.css'
import './mail.css'

/**
 * Các màn hình của Đề 3, hiện thành tab trên topbar — thanh điều hướng chỉ
 * liệt kê phân hệ, không lồng màn hình con vào.
 */
const MAIL_VIEWS = [
  { to: '/mail/batches', label: 'Danh sách thư đến' },
  { to: '/mail/pending-match', label: 'Chưa rõ người nhận' },
  { to: '/mail/items', label: 'Theo dõi lấy hàng' },
  { to: '/mail/reports', label: 'Báo cáo' },
  { to: '/mail/station-sign', label: 'In mã QR' },
]

export function MailShell() {
  const { pathname } = useLocation()
  const { employee, signOut } = useSession()

  return (
    <div className="fp-page mail-scope">
      {/* Cùng topbar với Mặt bằng văn phòng và Tủ locker: logo khi rail thu gọn, tên phân hệ, tab chế độ xem. */}
      <header className="fp-topbar">
        <a className="fp-brand-collapsed" href="#/floor-planning" aria-label="Vin Smart Future · Trung tâm Hành chính">
          <img src={markUrl} alt="Vin Smart Future" width="26" height="26" />
        </a>
        <h1>Chuyển phát nhanh</h1>

        <ViewTabs pathname={pathname} />

        <div className="fp-topbar-actions mail-user">
          <span className="mail-user-avatar" aria-hidden>
            {initials(employee?.full_name)}
          </span>
          <span className="mail-user-name">{employee?.full_name ?? ''}</span>
          <button type="button" className="mail-signout" onClick={signOut}>
            Thoát
          </button>
        </div>
      </header>

      <main className="mail-main">
        <Outlet />
      </main>
    </div>
  )
}

/** Tab gạch chân giống bộ chuyển "Xác minh / Bố trí" của mặt bằng văn phòng. */
function ViewTabs({ pathname }: { pathname: string }) {
  return (
    <nav className="fp-view-mode mail-view-tabs" aria-label="Màn hình Chuyển phát nhanh">
      {MAIL_VIEWS.map((view) => {
        const current = pathname === view.to || pathname.startsWith(`${view.to}/`)
        return (
          <Link
            key={view.to}
            to={view.to}
            aria-current={current ? 'page' : undefined}
            className={current ? 'is-active' : undefined}
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
