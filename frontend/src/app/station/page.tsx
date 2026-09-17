'use client';

/**
 * Trang quét QR tại khu để đơn (mail-tracking.md §7.2) — đường xác nhận chính.
 *
 * Khác hẳn mọi màn hình còn lại, nên đứng ngoài `(admin)`:
 *
 * - **Không đăng nhập.** Phần lớn CBNV không có tài khoản, mà phải xác
 *   nhận được ngay tại chỗ.
 * - **Thiết kế cho điện thoại**, không phải màn hình bàn làm việc. Chữ to,
 *   vùng bấm lớn, một cột.
 * - **Mã trạm nằm trong URL của QR** (`/station?t=...`), không phải thứ
 *   người dùng gõ. Nó không định danh ai, chỉ chứng minh "người gọi đã
 *   nhìn thấy tấm biển".
 *
 * ⚠️ Trang này chỉ chạy được nếu điện thoại cá nhân vào được hệ thống —
 * câu hỏi A3 trong `docs/checklist-truoc-khi-chay.md` vẫn chưa có lời đáp.
 */

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError } from '@/api/client';
import { stationCollect, stationLookup } from '@/api/mail';
import type { StationItem } from '@/api/types';
import { formatDate } from '@/shared/format';

export default function StationPage() {
  return (
    <Suspense fallback={<Frame>Đang tải…</Frame>}>
      <Station />
    </Suspense>
  );
}

function Station() {
  const stationToken = useSearchParams().get('t');
  const [digits, setDigits] = useState('');
  const [items, setItems] = useState<StationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collecting, setCollecting] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone([]);
    try {
      setItems(await stationLookup(digits, stationToken));
    } catch (err) {
      setItems(null);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Không kết nối được. Kiểm tra xem điện thoại đã vào mạng công ty chưa.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function collect(item: StationItem) {
    setCollecting(item.item_id);
    setError(null);
    try {
      await stationCollect(item.item_id, stationToken);
      setDone((previous) => [...previous, item.item_id]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không ghi nhận được, thử lại giúp');
    } finally {
      setCollecting(null);
    }
  }

  const remaining = items?.filter((i) => !done.includes(i.item_id)) ?? [];

  return (
    <Frame>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vsf-mark.png"
        alt="VinSmart Future"
        style={{ height: 32, width: 'auto', marginBottom: 10 }}
      />
      <h1 style={{ fontSize: 21, marginBottom: 6 }}>Xác nhận đã nhận hàng</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Nhập <strong>4 số cuối</strong> điện thoại của bạn để tìm kiện của mình.
      </p>

      <form onSubmit={search} style={{ display: 'flex', gap: 10, margin: '18px 0' }}>
        <label className="sr-only" htmlFor="last4">
          Bốn số cuối điện thoại
        </label>
        <input
          id="last4"
          className="field"
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4}"
          placeholder="0000"
          required
          style={{
            flex: 1,
            height: 52,
            fontSize: 26,
            letterSpacing: '0.35em',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <button
          type="submit"
          disabled={digits.length !== 4 || busy}
          style={{
            height: 52,
            padding: '0 22px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--vsf-red)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            opacity: digits.length !== 4 || busy ? 0.5 : 1,
          }}
        >
          {busy ? '…' : 'Tìm'}
        </button>
      </form>

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

      {items !== null && remaining.length === 0 && done.length === 0 && !error && (
        <p className="muted" style={{ fontSize: 14 }}>
          Không tìm thấy kiện nào đang chờ với 4 số này. Nếu chắc là có hàng, nhờ Phòng Hành chính
          kiểm tra giúp.
        </p>
      )}

      {done.length > 0 && (
        <p
          style={{
            background: '#fff',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            fontSize: 14,
          }}
        >
          ✓ Đã ghi nhận {done.length} kiện. Cảm ơn bạn.
        </p>
      )}

      {remaining.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 13.5 }}>
            Có {remaining.length} kiện đang chờ. Bấm đúng dòng của bạn sau khi đã lấy hàng.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {remaining.map((item) => (
              <li
                key={item.item_id}
                style={{
                  background: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 600 }}>{item.recipient_name}</div>
                <div className="muted" style={{ fontSize: 13.5, margin: '4px 0 12px' }}>
                  Từ {item.sender ?? 'không rõ người gửi'}
                  {item.content_type && ` · ${item.content_type}`}
                  {item.quantity > 1 && ` · ${item.quantity} kiện`}
                  {' · về ngày '}
                  {formatDate(item.received_at)}
                </div>
                <button
                  onClick={() => collect(item)}
                  disabled={collecting === item.item_id}
                  style={{
                    width: '100%',
                    height: 46,
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--vsf-red)',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    opacity: collecting === item.item_id ? 0.6 : 1,
                  }}
                >
                  {collecting === item.item_id ? 'Đang ghi nhận…' : 'Tôi đã nhận kiện này'}
                </button>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
            Danh sách hiện mọi người trùng 4 số cuối — nhìn tên để chọn đúng dòng của mình, giống
            như tìm dòng của mình trên tờ giấy ký.
          </p>
        </>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        maxWidth: 460,
        margin: '0 auto',
        padding: '28px 18px 48px',
        minHeight: '100vh',
      }}
    >
      {children}
    </main>
  );
}
