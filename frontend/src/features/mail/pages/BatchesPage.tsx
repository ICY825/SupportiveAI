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
import { deleteBatch, listBatches, uploadBatch } from '@/api/mail';
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
  const [deleting, setDeleting] = useState(false);

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

  /** Tải nhầm file thì bỏ ngay tại đây, khỏi phải mở màn hình soát. */
  async function onDeleteImported() {
    if (!result) return;
    if (!window.confirm('Xóa lô vừa tải lên? Dùng khi tải nhầm file. Thao tác không hoàn tác được.')) {
      return;
    }
    setDeleting(true);
    setUploadError(null);
    try {
      await deleteBatch(result.batch_id);
      setResult(null);
      load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Không xóa được lô');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1>Thư đến</h1>
        <span className="small muted">Lễ tân gửi file danh sách, HC tải lên, kiểm tra rồi gửi thông báo</span>
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
            Tải file lên
          </Button>
        </div>
      </div>

      {uploadError && <ErrorBox error={uploadError} />}

      {result && (
        <ImportSummary
          result={result}
          onOpen={() => navigate(`/mail/batches/${result.batch_id}`)}
          onDelete={onDeleteImported}
          deleting={deleting}
        />
      )}

      <Card title="Các file đã tải" padded={false}>
        {error ? (
          <div style={{ padding: 14 }}>
            <ErrorBox error={error} onRetry={load} />
          </div>
        ) : batches === null ? (
          <Loading what="danh sách lô" />
        ) : batches.length === 0 ? (
          <Empty>Chưa có lô nào. Bấm “Tải file lên” để bắt đầu.</Empty>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>File</th>
                <th>Ngày về</th>
                <th>Thời điểm tải</th>
                <th style={{ textAlign: 'right' }}>Số dòng</th>
                <th style={{ textAlign: 'right' }}>Đã báo</th>
                <th style={{ textAlign: 'right' }}>Chưa rõ người nhận</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr
                  key={batch.id}
                  // Cả dòng bấm được để mở lô. Bàn phím vẫn đi qua liên kết tên
                  // file; bấm trúng liên kết thì để nó tự điều hướng, tránh đẩy
                  // hai mục vào lịch sử.
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('a')) return;
                    navigate(`/mail/batches/${batch.id}`);
                  }}
                  style={{ cursor: 'pointer' }}
                >
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
                          label: batch.pending_match_count > 0 ? 'Đã báo một phần' : 'Đã báo hết',
                          symbol: batch.pending_match_count > 0 ? '◐' : '✓',
                          tone: batch.pending_match_count > 0 ? 'warn' : 'done',
                        }}
                      />
                    ) : (
                      <StatusPill
                        descriptor={{ label: 'Chưa gửi thông báo', symbol: '!', tone: 'warn' }}
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
        Nhận file Excel (.xlsx) và .csv. Nên xin lễ tân gửi file Excel: file .csv không giữ được
        kiểu ngày, nên 09/17/26 và 17/09/26 dễ bị đọc lẫn nhau.
      </Note>
    </div>
  );
}

/** Kết quả đọc file — hiện tại chỗ để HC đọc cảnh báo trước khi sang soát. */
function ImportSummary({
  result,
  onOpen,
  onDelete,
  deleting,
}: {
  result: ImportResult;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { summary } = result;
  return (
    <Card
      title={`Đã đọc ${rowsAndParcels(summary.total_rows, summary.total_parcels)}`}
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" busy={deleting} onClick={onDelete} title="Dùng khi tải nhầm file">
            Tải nhầm — xóa file
          </Button>
          <Button variant="primary" onClick={onOpen}>
            Kiểm tra và gửi thông báo →
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <StatusPill descriptor={{ ...TIER.confirmed, label: `${TIER.confirmed.label} ${summary.confirmed}` }} />
        <StatusPill descriptor={{ ...TIER.review, label: `${TIER.review.label} ${summary.review}` }} />
        <StatusPill descriptor={{ ...TIER.choose, label: `${TIER.choose.label} ${summary.choose}` }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {summary.ambiguous_date && (
          <Banner tone="warn">
            Ngày trong file đọc được theo hai cách khác nhau. Hệ thống <strong>không đoán</strong> —
            hãy mở màn hình kiểm tra và xác nhận ngày trước khi gửi.
          </Banner>
        )}
        {summary.duplicate_suspect > 0 && (
          <Banner tone="warn">
            {summary.duplicate_suspect} dòng nghi trùng với lô đã gửi. Mặc định không gửi lại, nhưng
            xem kỹ ở màn hình kiểm tra — có thể là kiện thật.
          </Banner>
        )}
        {result.same_date_batches.length > 0 && (
          <Banner tone="warn">
            Đã có {result.same_date_batches.length} lô khác cho cùng ngày về này:{' '}
            {result.same_date_batches
              .map((b) => `${b.source_filename} (${formatDateTime(b.uploaded_at)}, ${b.row_count} dòng)`)
              .join('; ')}
            .
          </Banner>
        )}
        {summary.missing_email > 0 && (
          <Banner tone="danger">
            {summary.missing_email} dòng đã rõ người nhận nhưng người đó{' '}
            <strong>không có email</strong>. Thông báo sẽ không tới nơi, trong khi hạn lấy hàng vẫn tính.
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
