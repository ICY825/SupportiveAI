'use client';

/**
 * Khung màn hình quản trị: AppNav bên trái + topbar.
 *
 * Bám theo wireframe **mới** (artboard 0a và 1a) để bốn phân hệ trông như
 * một hệ thống khi người dùng đi qua lại:
 *
 * - AppNav rộng **204px**, nền than `#1C1B1A`, có nhãn chữ chứ không chỉ
 *   icon. Chia hai nhóm "Đang sử dụng" / "Sắp triển khai".
 * - Mục đang xem: nền `rgba(255,255,255,.1)` **và** vạch đỏ VSF 3px ở mép
 *   trái — hai tín hiệu, không chỉ một.
 * - Mục chưa làm: chữ mờ, gắn thẻ "Khóa", không bấm được.
 * - Topbar cao **52px**: tiêu đề phân hệ · bộ chuyển màn hình · người dùng.
 *
 * ⚠️ **Đảo nhóm so với wireframe.** Wireframe dựng từ góc nhìn của nhóm
 * Đề 1/2, nên xếp Chuyển phát nhanh vào "Sắp triển khai". Ở ứng dụng này
 * thì ngược lại: Đề 3 là phân hệ **đã chạy**, ba đề kia chưa có màn hình
 * nào. Giữ nguyên cấu trúc và cách trình bày của wireframe, chỉ xếp lại
 * cho đúng sự thật — rail nói dối thì người dùng bấm vào chỗ trống.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSession } from '@/shared/auth';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  ready: boolean;
}

/** Icon theo đúng bộ ở wireframe: nét 1.6, viewBox 20, không tô nền. */
function Icon({ d }: { d: string }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      style={{ flex: 'none' }}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const MAIL_ICON = 'M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z M3 6.5 10 10l7-3.5 M10 10v7 M6.5 4.75l7 3.5';
const SEAT_ICON = 'M3 3.5h14v13H3z M3 10h5.5 M8.5 3.5V7 M12.5 10v6.5 M8.5 13h8.5';
const LOCKER_ICON = 'M4 2.5h12v15H4z M10 2.5v15 M7.5 8.5v2 M12.5 8.5v2';
const DOC_ICON = 'M5 2.5h7l3.5 3.5v11.5H5z M12 2.5V6h3.5 M7.5 10h5 M7.5 13h5';

const IN_USE: NavItem[] = [
  { href: '/mail/batches', label: 'Chuyển phát nhanh', icon: <Icon d={MAIL_ICON} />, ready: true },
];

const COMING: NavItem[] = [
  { href: '#seat', label: 'Mặt bằng văn phòng', icon: <Icon d={SEAT_ICON} />, ready: false },
  { href: '#locker', label: 'Tủ locker', icon: <Icon d={LOCKER_ICON} />, ready: false },
  { href: '#document', label: 'Công văn đến/đi', icon: <Icon d={DOC_ICON} />, ready: false },
];

/**
 * Bốn màn hình của Đề 3. Ở wireframe đây là `view-toggle` trên topbar —
 * AppNav chỉ liệt kê phân hệ, không lồng màn hình con vào.
 */
const MAIL_VIEWS = [
  { href: '/mail/batches', label: 'Lô thư' },
  { href: '/mail/pending-match', label: 'Chờ khớp' },
  { href: '/mail/items', label: 'Kiện hàng' },
  { href: '/mail/reports', label: 'Báo cáo' },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { employee, signOut } = useSession();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <AppNav pathname={pathname} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
        }}
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
          <span style={{ font: "600 14.5px var(--font-sans)" }}>
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

        <main style={{ flex: 1, padding: '18px 22px', minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}

function AppNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Phân hệ"
      style={{
        width: 'var(--nav-width)',
        flex: 'none',
        background: 'var(--charcoal)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <div
        style={{
          padding: '16px 14px 12px',
          borderBottom: '1px solid rgba(255,255,255,.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vsf-logo.png"
          alt="VinSmart Future"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
        <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,.5)', letterSpacing: '.02em' }}>
          Trung tâm Hành chính
        </span>
      </div>

      <NavGroup title="Đang sử dụng" items={IN_USE} pathname={pathname} />
      <NavGroup title="Sắp triển khai" items={COMING} pathname={pathname} />

      <div
        style={{
          marginTop: 'auto',
          padding: '10px 12px',
          borderTop: '1px solid rgba(255,255,255,.08)',
          fontSize: 11,
          color: 'rgba(255,255,255,.55)',
        }}
      >
        Pilot 6 tuần · Đề 3
      </div>
    </nav>
  );
}

function NavGroup({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <>
      <p
        style={{
          margin: '14px 0 4px',
          padding: '0 14px',
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,.38)',
        }}
      >
        {title}
      </p>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '0 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {items.map((item) => (
          <li key={item.href}>
            <NavLink item={item} pathname={pathname} />
          </li>
        ))}
      </ul>
    </>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const current = item.ready && pathname.startsWith('/mail');
  const base = {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    minHeight: 35,
    padding: '0 10px',
    borderRadius: 6,
    fontSize: 12,
    textDecoration: 'none',
  };

  if (!item.ready) {
    return (
      <span
        aria-disabled
        title={`${item.label} — chưa có màn hình`}
        style={{
          ...base,
          color: 'rgba(255,255,255,.35)',
          fontWeight: 500,
          cursor: 'not-allowed',
        }}
      >
        {item.icon}
        <span>{item.label}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 3,
            background: 'rgba(255,255,255,.08)',
            color: 'rgba(255,255,255,.5)',
            fontWeight: 500,
          }}
        >
          Khóa
        </span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      style={{
        ...base,
        background: current ? 'rgba(255,255,255,.1)' : 'transparent',
        color: current ? '#fff' : 'rgba(255,255,255,.68)',
        fontWeight: current ? 600 : 500,
      }}
    >
      {/* Vạch đỏ VSF ở mép trái — tín hiệu thứ hai cạnh nền sáng. */}
      {current && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: -8,
            top: 7,
            bottom: 7,
            width: 3,
            borderRadius: '0 3px 3px 0',
            background: 'var(--vsf-red)',
          }}
        />
      )}
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
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
        const current = pathname === view.href || pathname.startsWith(`${view.href}/`);
        return (
          <Link
            key={view.href}
            href={view.href}
            aria-current={current ? 'page' : undefined}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              font: "500 11.5px var(--font-sans)",
              textDecoration: 'none',
              color: current ? 'var(--text)' : 'var(--text-muted)',
              background: current ? '#fff' : 'transparent',
              fontWeight: current ? 600 : 500,
              boxShadow: current ? '0 1px 2px rgba(0,0,0,.05)' : undefined,
            }}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}

function initials(fullName: string | undefined): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  const first = parts.length > 1 ? parts[parts.length - 2] : '';
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}
