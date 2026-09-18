/**
 * Trang mở từ link trong email (mail-tracking.md §7.2) — đường xác nhận phụ.
 *
 * Giống `/station`: **không đăng nhập**, thiết kế cho điện thoại. Khác ở
 * chỗ không phải gõ 4 số cuối — token trong link đã nói người này là ai và
 * email đó gồm những kiện nào.
 *
 * Người nhận tick những kiện đã lấy: một email có thể gộp nhiều kiện, và
 * lấy làm hai lần là chuyện thường. Link vì vậy dùng lại được (chốt
 * 18/09/2026) — kiện đã xác nhận hiện "Đã nhận" thay vì biến mất.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { confirmLinkCollect, confirmLinkLookup } from '@/api/mail';
import type { ConfirmLinkView } from '@/api/types';
import { formatDate } from '@/shared/format';
import '../mail.css';

export default function ConfirmPage() {
  return (
    <Suspense fallback={<Frame>Đang tải…</Frame>}>
      <Confirm />
    </Suspense>
  );
}

function Confirm() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [view, setView] = useState<ConfirmLinkView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [justDone, setJustDone] = useState(0);

  useEffect(() => {
    if (!token) {
      setError('Link thiếu mã xác nhận. Mở lại đúng link trong email giúp.');
      return;
    }
    confirmLinkLookup(token)
      .then((result) => {
        setView(result);
        // Chọn sẵn mọi kiện chưa nhận: phần lớn người ta lấy hết một lần.
        setSelected(result.items.filter((i) => i.status !== 'collected').map((i) => i.item_id));
      })
      .catch((err) => setError(describe(err)));
  }, [token]);

  async function submit() {
    if (!token || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmLinkCollect(token, selected);
      setJustDone(selected.length);
      setView(result);
      setSelected([]);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  function toggle(itemId: string) {
    setSelected((previous) =>
      previous.includes(itemId) ? previous.filter((id) => id !== itemId) : [...previous, itemId],
    );
  }

  const pending = view?.items.filter((i) => i.status !== 'collected') ?? [];
  const collected = view?.items.filter((i) => i.status === 'collected') ?? [];

  return (
    <Frame>
      <img src="/vsf-mark.png" alt="VinSmart Future" style={{ height: 32, width: 'auto', marginBottom: 10 }} />
      <h1 style={{ fontSize: 21, marginBottom: 6 }}>Xác nhận đã nhận hàng</h1>
      {view && (
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          Kiện hàng của <strong>{view.recipient_name}</strong>
        </p>
      )}

      {error && (
        <p
          role="alert"
          style={{
            background: 'var(--pill-danger-bg)',
            border: '1px solid var(--pill-danger-border)',
            color: 'var(--vsf-red-dark)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            fontSize: 14,
          }}
        >
          {error}
        </p>
      )}

      {!view && !error && <p className="muted">Đang tải…</p>}

      {justDone > 0 && (
        <p
          style={{
            background: '#fff',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            fontSize: 14,
          }}
        >
          ✓ Đã ghi nhận {justDone} kiện. Cảm ơn bạn.
        </p>
      )}

      {view && view.items.length === 0 && (
        <p className="muted" style={{ fontSize: 14 }}>
          Không còn kiện nào trong thông báo này. Nếu chắc là có hàng, nhờ Phòng Hành chính kiểm
          tra giúp.
        </p>
      )}

      {pending.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 13.5 }}>
            Chọn những kiện <strong>bạn đã lấy</strong>, rồi bấm xác nhận.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'grid', gap: 10 }}>
            {pending.map((item) => {
              const checked = selected.includes(item.item_id);
              return (
                <li key={item.item_id}>
                  <label
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      background: '#fff',
                      border: `1px solid ${checked ? 'var(--vsf-red)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius)',
                      padding: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item.item_id)}
                      style={{ width: 22, height: 22, marginTop: 1, accentColor: 'var(--vsf-red)' }}
                    />
                    <span>
                      <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600 }}>
                        Từ {item.sender ?? 'không rõ người gửi'}
                      </span>
                      <span className="muted" style={{ fontSize: 13.5 }}>
                        {item.content_type && `${item.content_type} · `}
                        {item.quantity > 1 && `${item.quantity} kiện · `}
                        về ngày {formatDate(item.received_at)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            onClick={submit}
            disabled={busy || selected.length === 0}
            style={{
              width: '100%',
              height: 50,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--vsf-red)',
              color: '#fff',
              fontSize: 16,
              fontWeight: 600,
              opacity: busy || selected.length === 0 ? 0.5 : 1,
            }}
          >
            {busy
              ? 'Đang ghi nhận…'
              : selected.length === 0
                ? 'Chọn ít nhất một kiện'
                : `Tôi đã nhận ${selected.length} kiện`}
          </button>
        </>
      )}

      {collected.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
            Đã nhận
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {collected.map((item) => (
              <li key={item.item_id} className="muted" style={{ fontSize: 13.5 }}>
                ✓ Từ {item.sender ?? 'không rõ người gửi'} — về ngày {formatDate(item.received_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Frame>
  );
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return 'Link đã hết hạn hoặc không hợp lệ. Hãy quét mã QR tại khu để đơn để xác nhận.';
    }
    return err.message;
  }
  return 'Không kết nối được. Kiểm tra kết nối mạng rồi thử lại.';
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="mail-scope"
      style={{ maxWidth: 460, margin: '0 auto', padding: '28px 18px 48px', minHeight: '100vh' }}
    >
      {children}
    </main>
  );
}
