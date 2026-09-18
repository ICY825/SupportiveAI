'use client';

/**
 * Component thị giác dùng chung cho cả bốn phân hệ.
 *
 * Màu và kiểu chữ lấy từ wireframe artboard 0a (xem `globals.css`). Không
 * đặt màu trực tiếp trong feature — đặt ở đây thì đổi một chỗ là cả hệ
 * thống đổi theo.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Descriptor, Tone } from '@/shared/mail-labels';

// --- Thẻ ---

export function Card({
  title,
  action,
  children,
  padded = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
        </header>
      )}
      <div style={padded ? { padding: 14 } : undefined}>{children}</div>
    </section>
  );
}

// --- Nút ---

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  busy,
  type = 'button',
  title,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  full?: boolean;
}) {
  const base: CSSProperties = {
    height: 32,
    padding: '0 13px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 12.5,
    fontWeight: 500,
    cursor: disabled || busy ? 'not-allowed' : 'pointer',
    opacity: disabled || busy ? 0.55 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: full ? '100%' : undefined,
    whiteSpace: 'nowrap',
  };
  const skin: Record<ButtonVariant, CSSProperties> = {
    primary: { background: 'var(--vsf-red)', color: '#fff', border: '1px solid var(--vsf-red)' },
    secondary: { background: '#fff', color: 'var(--text-muted-strong)', border: '1px solid var(--border-strong)' },
    ghost: { background: 'transparent', color: 'var(--vsf-red-dark)', border: '1px solid transparent' },
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || busy}
      style={{ ...base, ...skin[variant] }}
    >
      {busy ? '…' : children}
    </button>
  );
}

// --- Pill trạng thái ---

/**
 * Bảy tông, ứng với `.status-chip` của wireframe mới (artboard 0a).
 *
 * `critical` là biến thể **đỏ đặc** — dành riêng cho thứ đã vượt hạn và
 * cần người xử lý ngay. Dùng rộng tay thì nó mất hết trọng lượng.
 */
const TONE_STYLE: Record<Tone, CSSProperties> = {
  critical: {
    border: '1px solid var(--vsf-red)',
    background: 'var(--vsf-red)',
    color: '#fff',
  },
  danger: {
    border: '1px solid var(--pill-danger-border)',
    background: 'var(--pill-danger-bg)',
    color: 'var(--vsf-red-dark)',
  },
  warn: {
    border: '1px solid var(--pill-warn-border)',
    background: 'var(--pill-warn-bg)',
    color: 'var(--bronze)',
  },
  info: {
    border: '1px solid var(--pill-info-border)',
    background: 'var(--pill-info-bg)',
    color: 'var(--status-occupied)',
  },
  success: {
    border: '1px solid var(--pill-success-border)',
    background: 'var(--pill-success-bg)',
    color: 'var(--pill-success-text)',
  },
  neutral: {
    border: '1px solid var(--border-strong)',
    background: '#fff',
    color: 'var(--text-muted-strong)',
  },
  done: {
    border: '1px solid var(--border-strong)',
    background: '#fff',
    color: 'var(--text-muted)',
  },
};

/**
 * Pill trạng thái. **Luôn in ký hiệu cạnh nhãn**, không chỉ đổi màu —
 * §5.2 yêu cầu người khó phân biệt màu vẫn dùng được.
 */
export function StatusPill({ descriptor }: { descriptor: Descriptor }) {
  return (
    <span
      title={descriptor.hint}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 9px',
        borderRadius: 20,
        fontSize: 11,
        whiteSpace: 'nowrap',
        ...TONE_STYLE[descriptor.tone],
      }}
    >
      <span aria-hidden style={{ fontWeight: 700 }}>
        {descriptor.symbol}
      </span>
      {descriptor.label}
    </span>
  );
}

// --- Dải cảnh báo ---

export function Banner({
  tone = 'warn',
  children,
  action,
}: {
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 12.5,
        ...TONE_STYLE[tone],
      }}
    >
      <div style={{ flex: 1 }}>{children}</div>
      {action}
    </div>
  );
}

// --- Thẻ số ---

export function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: Tone;
}) {
  const accent =
    tone === 'danger' || tone === 'critical'
      ? 'var(--vsf-red-dark)'
      : tone === 'warn'
        ? 'var(--bronze)'
        : tone === 'info'
          ? 'var(--status-occupied)'
          : tone === 'success'
            ? 'var(--pill-success-text)'
            : 'var(--text)';
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 14,
      }}
    >
      <div className="eyebrow">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <span className="tabular" style={{ font: "600 24px var(--font-sans)", color: accent }}>
          {value}
        </span>
        {unit && <span className="small muted">{unit}</span>}
      </div>
    </div>
  );
}

// --- Trạng thái rỗng / đang tải / lỗi ---

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="muted" style={{ textAlign: 'center', padding: '26px 14px', margin: 0 }}>
      {children}
    </p>
  );
}

export function Loading({ what = 'dữ liệu' }: { what?: string }) {
  return <Empty>Đang tải {what}…</Empty>;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Banner tone="danger" action={onRetry ? <Button onClick={onRetry}>Thử lại</Button> : undefined}>
      {error}
    </Banner>
  );
}

/** Ghi chú giải thích, in nhỏ dưới bảng — tương đương `.note` ở wireframe. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="small muted" style={{ margin: '10px 2px 0' }}>
      {children}
    </p>
  );
}
