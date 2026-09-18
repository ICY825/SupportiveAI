/**
 * Danh sách lô + tải file lễ tân (mail-tracking.md §3.1).
 *
 * Tải xong thì **không nhảy thẳng sang màn hình soát**: cảnh báo về lô
 * cùng ngày và ngày mơ hồ phải được đọc trước, còn nếu tự chuyển trang
 * thì HC lướt qua mất.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useNavigate } from 'react-router';
import { ApiError } from '@/api/client';
import { listBatches, uploadBatch } from '@/api/mail';
import type { ImportResult, MailBatch } from '@/api/types';
import { Banner, Button, Card, Empty, ErrorBox, Loading, Note, StatusPill } from '@/components/ui';
import { formatDate, formatDateTime, rowsAndParcels } from '@/shared/format';
import { TIER } from '@/shared/mail-labels';

export default function BatchesPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [batches, setBatches] = useState<MailBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const load = useCallback(() => {
    setError(null);
    listBatches()
      .then(setBatches)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được danh sách lô'));
  }, []);

  useEffect(load, [load]);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setResult(null);
    try {
      const imported = await uploadBatch(file);
      setResult(imported);
      load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Không đọc được file');
    } finally {
      setUploading(false);
      // Xoá giá trị để chọn lại đúng file đó vẫn kích hoạt onChange.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1>Lô thư đến</h1>
        <span className="small muted">Lễ tân gửi file danh sách, HC tải lên rồi soát</span>
        <div style={{ marginLeft: 'auto' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.csv"
            onChange={onFile}
            style={{ display: 'none' }}
            id="batch-file"
          />
          <Button variant="primary" busy={uploading} onClick={() => fileRef.current?.click()}>
            + Tải file lễ tân
          </Button>
        </div>
      </div>

      {uploadError && <ErrorBox error={uploadError} />}

      {result && <ImportSummary result={result} onOpen={() => navigate(`/mail/batches/${result.batch_id}`)} />}

      <Card title="Các lô đã tải" padded={false}>
        {error ? (
          <div style={{ padding: 14 }}>
            <ErrorBox error={error} onRetry={load} />
          </div>
        ) : batches === null ? (
          <Loading what="danh sách lô" />
        ) : batches.length === 0 ? (
          <Empty>Chưa có lô nào. Bấm “Tải file lễ tân” để bắt đầu.</Empty>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>File</th>
                <th>Ngày nhận</th>
                <th>Tải lên</th>
                <th style={{ textAlign: 'right' }}>Dòng</th>
                <th style={{ textAlign: 'right' }}>Đã gửi</th>
                <th style={{ textAlign: 'right' }}>Chờ khớp</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <Link to={`/mail/batches/${batch.id}`}>{batch.source_filename}</Link>
                    {batch.ambiguous_date && (
                      <div className="small" style={{ color: 'var(--bronze)' }}>
                        ⚠ Ngày trong file mơ hồ — cần xác nhận
                      </div>
                    )}
                  </td>
                  <td className="tabular">{formatDate(batch.receipt_date)}</td>
                  <td className="tabular muted small">{formatDateTime(batch.uploaded_at)}</td>
                  <td className="tabular" style={{ textAlign: 'right' }}>
                    {batch.row_count}
                  </td>
                  <td className="tabular" style={{ textAlign: 'right' }}>
                    {batch.sent_count}
                  </td>
                  <td
                    className="tabular"
                    style={{
                      textAlign: 'right',
                      color: batch.pending_match_count > 0 ? 'var(--vsf-red-dark)' : undefined,
                      fontWeight: batch.pending_match_count > 0 ? 600 : undefined,
                    }}
                  >
                    {batch.pending_match_count}
                  </td>
                  <td>
                    {batch.status === 'sent' ? (
                      <StatusPill
                        descriptor={{
                          label: batch.pending_match_count > 0 ? 'Đã gửi một phần' : 'Đã gửi',
                          symbol: batch.pending_match_count > 0 ? '◐' : '✓',
                          tone: batch.pending_match_count > 0 ? 'warn' : 'done',
                        }}
                      />
                    ) : (
                      <StatusPill
                        descriptor={{ label: 'Chờ soát', symbol: '!', tone: 'warn' }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Note>
        Nhận `.xlsx` và `.csv`. Nên xin lễ tân gửi `.xlsx`: trong `.csv` ô ngày mất kiểu dữ
        liệu, mà định dạng hiện tại là `mm-dd-yy` nên `09/17/26` và `17/09/26` lẫn vào nhau.
      </Note>
    </div>
  );
}

/** Kết quả đọc file — hiện tại chỗ để HC đọc cảnh báo trước khi sang soát. */
function ImportSummary({ result, onOpen }: { result: ImportResult; onOpen: () => void }) {
  const { summary } = result;
  return (
    <Card
      title={`Đã đọc ${rowsAndParcels(summary.total_rows, summary.total_parcels)}`}
      action={
        <Button variant="primary" onClick={onOpen}>
          Mở màn hình soát →
        </Button>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <StatusPill descriptor={{ ...TIER.confirmed, label: `Khớp chắc ${summary.confirmed}` }} />
        <StatusPill descriptor={{ ...TIER.review, label: `Cần soát ${summary.review}` }} />
        <StatusPill descriptor={{ ...TIER.choose, label: `Phải chọn ${summary.choose}` }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {summary.ambiguous_date && (
          <Banner tone="warn">
            Ngày trong file đọc được theo hai cách khác nhau. Hệ thống <strong>không đoán</strong> —
            hãy mở màn hình soát và xác nhận ngày trước khi gửi.
          </Banner>
        )}
        {summary.duplicate_suspect > 0 && (
          <Banner tone="warn">
            {summary.duplicate_suspect} dòng nghi trùng với lô đã gửi. Mặc định không gửi lại, nhưng
            xem kỹ ở màn hình soát — có thể là kiện thật.
          </Banner>
        )}
        {result.same_date_batches.length > 0 && (
          <Banner tone="warn">
            Đã có {result.same_date_batches.length} lô khác cho cùng ngày nhận này:{' '}
            {result.same_date_batches
              .map((b) => `${b.source_filename} (${formatDateTime(b.uploaded_at)}, ${b.row_count} dòng)`)
              .join('; ')}
            .
          </Banner>
        )}
        {summary.missing_email > 0 && (
          <Banner tone="danger">
            {summary.missing_email} dòng khớp được người nhận nhưng người đó{' '}
            <strong>không có email</strong>. Thông báo sẽ không tới nơi, mà đồng hồ SLA vẫn chạy.
          </Banner>
        )}
        {result.warnings.map((warning) => (
          <Banner key={warning} tone="warn">
            {warning}
          </Banner>
        ))}
      </div>
    </Card>
  );
}
