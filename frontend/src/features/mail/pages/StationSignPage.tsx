/**
 * In biển QR dán tại khu để đơn (mail-tracking.md §7.2) — đường xác nhận chính.
 *
 * Biển thay đúng chỗ tờ giấy ký hiện nay. URL trong QR cố định và kèm mã
 * trạm, nên chỉ in một lần; đổi `MAIL_STATION_TOKEN` hoặc
 * `PUBLIC_BASE_URL` thì phải in lại, biển cũ sẽ không dùng được nữa.
 *
 * Chỉ HC mở được: ai cầm URL này là gọi được API xác nhận của khu để đơn.
 */

import { useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { getStationSign } from '@/api/mail';
import type { StationSign } from '@/api/types';
import { Banner, Button, Card, ErrorBox, Loading, Note } from '@/components/ui';

export default function StationSignPage() {
  const [sign, setSign] = useState<StationSign | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStationSign()
      .then(setSign)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được mã QR'));
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!sign) return <Loading what="mã QR" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      {/* Khi in chỉ giữ lại tấm biển, bỏ khung quản trị và mọi cảnh báo. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          body * { visibility: hidden !important; }
          .station-sign, .station-sign * { visibility: visible !important; }
          .station-sign { position: fixed; inset: 0; border: none !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1>Biển QR tại khu để đơn</h1>
        <span className="small muted">In ra, dán đúng chỗ tờ giấy ký hiện nay</span>
        <div style={{ marginLeft: 'auto' }}>
          <Button variant="primary" onClick={() => window.print()}>
            In biển
          </Button>
        </div>
      </div>

      {!sign.station_token_configured && (
        <Banner tone="danger">
          <strong>Chưa đặt mã trạm (`MAIL_STATION_TOKEN`).</strong> Không có mã thì ai trong mạng
          cũng gọi được API xác nhận hộ người khác. Đặt một chuỗi ngẫu nhiên dài trong `.env`,
          khởi động lại backend rồi mới in biển.
        </Banner>
      )}
      {!sign.https && (
        <Banner tone="warn">
          Địa chỉ trong QR đang là <code>http://</code>. Điện thoại sẽ cảnh báo “không an toàn” và
          nhiều người sẽ không dám mở. Môi trường thật phải đặt `PUBLIC_BASE_URL` là{' '}
          <code>https://…</code>.
        </Banner>
      )}

      <Card>
        <div
          className="station-sign"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '28px 16px',
            background: '#fff',
          }}
        >
          <img src="/vsf-logo.png" alt="VinSmart Future" style={{ height: 44, width: 'auto' }} />
          <div style={{ fontSize: 30, fontWeight: 700, margin: '26px 0 6px', lineHeight: 1.25 }}>
            Lấy hàng xong, quét mã để xác nhận
          </div>
          <div style={{ fontSize: 17, color: '#555', marginBottom: 22 }}>
            Mở camera điện thoại, quét mã, nhập 4 số cuối điện thoại của bạn
          </div>
          <div
            style={{ width: 'min(100%, 380px)', aspectRatio: '1 / 1' }}
            // SVG do backend sinh từ URL cấu hình (segno), không chứa dữ liệu người dùng.
            dangerouslySetInnerHTML={{ __html: sign.svg.replace('<svg', '<svg width="100%" height="100%"') }}
          />
          <div style={{ fontSize: 15, color: '#555', marginTop: 22 }}>
            Không quét được? Báo Phòng Hành chính để được xác nhận giúp.
          </div>
        </div>
      </Card>

      <Note>
        Mã QR trỏ tới <code style={{ wordBreak: 'break-all' }}>{sign.url}</code>. Quét thử bằng
        điện thoại trước khi dán. Đổi mã trạm hoặc địa chỉ hệ thống thì biển cũ không dùng được nữa
        và phải in lại.
      </Note>
    </div>
  );
}
