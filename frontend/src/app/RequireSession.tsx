/**
 * Chắn đăng nhập cho các màn hình quản trị.
 *
 * Đây chỉ là chắn ở giao diện, cho đỡ hiện màn hình trống. **Chốt chặn thật
 * nằm ở backend** (`requires(PERM_MANAGE)`): mọi endpoint đều tự kiểm quyền,
 * nên bỏ qua được chắn này cũng không đọc được gì.
 *
 * Bản Next diễn đạt việc này bằng route group `(admin)`, nên trang nào nằm
 * trong nhóm là thấy ngay. Ở react-router thì phải tự bọc, và bọc nhầm thì
 * hỏng theo hai chiều: `/mail/*` mở toang, hoặc `/station` đòi đăng nhập
 * trong khi người quét QR tại khu để đơn không có tài khoản. Cả hai ca đều
 * có test riêng trong `__tests__/routing.test.tsx`.
 */

import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useSession } from '../shared/auth'

export function RequireSession() {
  const { employee, ready } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (ready && !employee) navigate('/login', { replace: true })
  }, [ready, employee, navigate])

  if (!ready || !employee) {
    return (
      <p className="muted" style={{ padding: 40 }}>
        Đang kiểm tra phiên đăng nhập…
      </p>
    )
  }
  return <Outlet />
}
