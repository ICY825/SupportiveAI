'use client';

/**
 * Chắn đăng nhập cho toàn bộ màn hình quản trị.
 *
 * Đây chỉ là chắn ở giao diện, cho đỡ hiện màn hình trống. **Chốt chặn
 * thật nằm ở backend** (`requires(PERM_MANAGE)`): mọi endpoint đều tự
 * kiểm quyền, nên bỏ qua được chắn này cũng không đọc được gì.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/layouts/AdminShell';
import { useSession } from '@/shared/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { employee, ready } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !employee) router.replace('/login');
  }, [ready, employee, router]);

  if (!ready || !employee) {
    return (
      <p className="muted" style={{ padding: 40 }}>
        Đang kiểm tra phiên đăng nhập…
      </p>
    );
  }
  return <AdminShell>{children}</AdminShell>;
}
