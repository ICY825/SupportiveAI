/**
 * Màn hình soát trước khi gửi (mail-tracking.md §5).
 *
 * Tài liệu gọi đây là **chốt chặn quan trọng nhất của phân hệ**: một file
 * lệch cột mà gửi thẳng sẽ thành hàng chục thông báo sai người, không thu
 * hồi được.
 *
 * Bốn ràng buộc lấy thẳng từ §5.2 và §6.4, đừng sửa nếu chưa đọc lại tài liệu:
 *
 * 1. Hiện **toàn bộ** dòng, không chỉ dòng có vấn đề.
 * 2. Phân ba mức bằng **ký hiệu và màu**, không chỉ bằng màu.
 * 3. Phần tổng quan hiện luôn, đếm **cả dòng và kiện**.
 * 4. Nút gửi **luôn bật** khi có ít nhất một dòng sẵn sàng; nhãn nói đúng
 *    sẽ gửi bao nhiêu và còn lại bao nhiêu.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '@/api/client';
import {
  assignRecipient,
  confirmReview,
  deleteBatch,
  getBatch,
  keepDuplicate,
  sendBatch,
} from '@/api/mail';
import type { MailBatchDetail, MailItemReview, SendResult } from '@/api/types';
import { EmployeePicker } from '@/components/EmployeePicker';
import { Banner, Button, Card, ErrorBox, Loading, Note, StatusPill } from '@/components/ui';
import { formatDate, formatDateTime, rowsAndParcels } from '@/shared/format';
import { DUPLICATE, MATCH_METHOD, STATUS, TIER } from '@/shared/mail-labels';

export default function ReviewPage() {
  // Next truyền `params` vào trang; react-router lấy qua hook, khớp với
  // `path="batches/:id"` trong bảng route.
  const batchId = useParams().id ?? '';
  const navigate = useNavigate();
  const [batch, setBatch] = useState<MailBatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SendResult | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return getBatch(batchId)
      .then(setBatch)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được lô'));
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Mọi thao tác đều tải lại cả lô. Cố tình: gán một người nhận có thể áp
   * sang các dòng cùng tên khác (§4.4), nên cập nhật tại chỗ một dòng sẽ
   * làm màn hình nói dối về những dòng còn lại.
   */
  async function mutate(itemId: string, action: () => Promise<unknown>) {
    setBusyItem(itemId);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác không thành công');
    } finally {
      setBusyItem(null);
    }
  }

  async function onSend() {
    setSending(true);
    setError(null);
    try {
      setSent(await sendBatch(batchId));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không gửi được');
    } finally {
      setSending(false);
    }
  }

  /**
   * Xóa lô tải nhầm file. Chỉ hiện khi chưa dòng nào được gửi: email đã đi
   * thì không thu hồi được, xóa lô chỉ làm mất dấu kiện thật.
   */
  async function onDelete() {
    if (!batch) return;
    const ok = window.confirm(
      `Xóa lô “${batch.source_filename}” (${batch.row_count} dòng)?

` +
        'Dùng khi tải nhầm file. Thao tác không hoàn tác được.',
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteBatch(batchId);
      navigate('/mail/batches');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không xóa được lô');
      setDeleting(false);
    }
  }

  if (error && !batch) return <ErrorBox error={error} onRetry={load} />;
  if (!batch) return <Loading what="lô thư" />;

  const { summary } = batch;
  const ready = summary.confirmed;
  const waiting = summary.pending_match - ready;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1>{batch.source_filename}</h1>
        <span className="small muted">
          Ngày về {formatDate(batch.receipt_date)} · tải lên {formatDateTime(batch.uploaded_at)}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {summary.sent === 0 && (
            <Button variant="ghost" busy={deleting} onClick={onDelete} title="Dùng khi tải nhầm file">
              Xóa file
            </Button>
          )}
          <Link to="/mail/batches" className="small">
            ← Danh sách thư
          </Link>
        </div>
      </div>

      {error && <ErrorBox error={error} />}

      {sent && (
        <Banner tone={sent.pending_match > 0 ? 'warn' : 'neutral'}>
          Đã gửi {sent.notified_items} dòng qua {sent.notifications_sent} thông báo
          {sent.notifications_sent < sent.notified_items && ' (đã gộp theo người)'}.
          {sent.pending_match > 0
            ? ` Còn ${sent.pending_match} dòng chưa rõ người nhận — xử lý ở tab “Chưa rõ người nhận”.`
            : ' Không còn dòng nào chưa rõ người nhận.'}
          {sent.failed > 0 && ` ⚠ ${sent.failed} thông báo gửi không thành công.`}
        </Banner>
      )}

      <Overview batch={batch} />

      <Warnings batch={batch} />

      <Card padded={false}>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 42 }}>STT</th>
              <th style={{ width: 150 }}>Tên lễ tân ghi</th>
              <th style={{ width: 130 }}>Người gửi</th>
              <th style={{ width: 48, textAlign: 'right' }}>Số kiện</th>
              <th style={{ width: 90 }}>Nội dung</th>
              <th>Nhân viên nhận</th>
              <th style={{ width: 128 }}>Tình trạng</th>
              <th style={{ width: 210 }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {batch.items.map((item) => (
              <Row
                key={item.id}
                item={item}
                busy={busyItem === item.id}
                onAssign={(employeeId) =>
                  mutate(item.id, () => assignRecipient(item.id, employeeId))
                }
                onConfirm={() => mutate(item.id, () => confirmReview(item.id))}
                onKeepDuplicate={() => mutate(item.id, () => keepDuplicate(item.id, true))}
              />
            ))}
          </tbody>
        </table>
      </Card>

      <SendBar
        ready={ready}
        waiting={waiting}
        alreadySent={summary.sent}
        sending={sending}
        onSend={onSend}
      />

      <Note>
        Chọn người nhận cho một dòng thì mọi dòng khác trong lô có cùng tên lễ tân ghi cũng được
        áp theo, và hệ thống ghi nhớ tên đó để lần sau tự nhận ra.
      </Note>
    </div>
  );
}

/** §5.2 — hiện luôn, kể cả khi khớp chắc 100%. */
function Overview({ batch }: { batch: MailBatchDetail }) {
  const { summary } = batch;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong className="tabular" style={{ fontSize: 15 }}>
          {rowsAndParcels(summary.total_rows, summary.total_parcels)}
        </strong>
        <span className="small muted">
          (một dòng có thể gộp nhiều kiện cùng nguồn trong cùng ngày)
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <StatusPill descriptor={{ ...TIER.confirmed, label: `${TIER.confirmed.label} ${summary.confirmed}` }} />
        <StatusPill descriptor={{ ...TIER.review, label: `${TIER.review.label} ${summary.review}` }} />
        <StatusPill descriptor={{ ...TIER.choose, label: `${TIER.choose.label} ${summary.choose}` }} />
        <StatusPill
          descriptor={{ ...DUPLICATE, label: `${DUPLICATE.label} ${summary.duplicate_suspect}` }}
        />
        {summary.sent > 0 && (
          <StatusPill descriptor={{ label: `Đã báo ${summary.sent}`, symbol: '→', tone: 'neutral' }} />
        )}
      </div>
    </Card>
  );
}

function Warnings({ batch }: { batch: MailBatchDetail }) {
  const { summary, same_date_batches: sameDate } = batch;
  if (!summary.ambiguous_date && sameDate.length === 0 && summary.missing_email === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {summary.ambiguous_date && (
        <Banner tone="warn">
          <strong>Ngày trong file mơ hồ.</strong> Đọc được cả hai cách (ngày/tháng và tháng/ngày) nên hệ
          thống không đoán. Đối chiếu với lễ tân trước khi gửi — ngày sai thì hạn lấy hàng sai theo.
        </Banner>
      )}
      {sameDate.length > 0 && (
        <Banner tone="warn">
          <strong>Đã có lô khác cho ngày về này.</strong>{' '}
          {sameDate.map((b, index) => (
            <span key={b.batch_id}>
              {index > 0 && '; '}
              <Link to={`/mail/batches/${b.batch_id}`}>{b.source_filename}</Link> —{' '}
              {formatDateTime(b.uploaded_at)}, {b.row_count} dòng
            </span>
          ))}
          . Kiểm tra xem đây có phải bản tải lại không.
        </Banner>
      )}
      {summary.missing_email > 0 && (
        <Banner tone="danger">
          <strong>{summary.missing_email} dòng có người nhận nhưng người đó không có email.</strong>{' '}
          Thông báo sẽ không tới nơi, trong khi hạn lấy hàng vẫn tính và kiện vẫn chuyển tồn đọng — người
          nhận không bao giờ biết mình có hàng. Bổ sung email vào danh mục nhân sự trước khi gửi.
        </Banner>
      )}
    </div>
  );
}

function Row({
  item,
  busy,
  onAssign,
  onConfirm,
  onKeepDuplicate,
}: {
  item: MailItemReview;
  busy: boolean;
  onAssign: (employeeId: string | null) => void;
  onConfirm: () => void;
  onKeepDuplicate: () => void;
}) {
  const alreadySent = item.status !== 'pending_match';
  const tier = TIER[item.match_tier];

  return (
    <tr style={item.duplicate_suspect ? { background: 'var(--pill-danger-bg)' } : undefined}>
      <td className="tabular muted">{item.row_index ?? '—'}</td>
      <td>
        <div>{item.recipient_name_raw ?? <span className="muted">(trống)</span>}</div>
        {item.missing_email && (
          <div className="small" style={{ color: 'var(--vsf-red-dark)' }}>
            ⚠ không có email
          </div>
        )}
      </td>
      <td className="muted">{item.sender_raw ?? '—'}</td>
      <td className="tabular" style={{ textAlign: 'right', fontWeight: item.quantity > 1 ? 600 : 400 }}>
        {item.quantity}
      </td>
      <td className="muted small">{item.content_type ?? '—'}</td>

      <td>
        {alreadySent ? (
          <span className="muted">Đã báo {formatDateTime(item.notified_at)}</span>
        ) : item.employee_id ? (
          <div>
            <ChosenName item={item} />
            <div className="small muted">{MATCH_METHOD[item.match_method]}</div>
          </div>
        ) : (
          <EmployeePicker
            suggestions={item.candidates}
            onPick={(choice) => onAssign(choice.employeeId)}
          />
        )}
        {item.duplicate_of && (
          <div className="small" style={{ color: 'var(--vsf-red-dark)', marginTop: 4 }}>
            Trùng dòng đã gửi ở{' '}
            <Link to={`/mail/batches/${item.duplicate_of.batch_id}`}>lô trước</Link> — ngày{' '}
            {formatDate(item.duplicate_of.receipt_date)}, số lượng {item.duplicate_of.quantity}
            {item.duplicate_of.quantity !== item.quantity && (
              <> · lần này ghi {item.quantity}</>
            )}
          </div>
        )}
      </td>

      <td>
        {alreadySent ? (
          <StatusPill descriptor={STATUS[item.status]} />
        ) : item.duplicate_suspect ? (
          <StatusPill descriptor={DUPLICATE} />
        ) : (
          <StatusPill
            descriptor={item.ready_to_send ? { ...TIER.confirmed, label: 'Sẵn sàng' } : tier}
          />
        )}
      </td>

      <td>
        {alreadySent ? null : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {item.duplicate_suspect && (
              <Button busy={busy} onClick={onKeepDuplicate} title="Đây là kiện thật, không phải bản trùng">
                Vẫn gửi
              </Button>
            )}
            {!item.duplicate_suspect && item.employee_id && !item.ready_to_send && (
              <Button variant="primary" busy={busy} onClick={onConfirm}>
                Xác nhận
              </Button>
            )}
            {item.employee_id && (
              <Button busy={busy} onClick={() => onAssign(null)} title="Chọn lại người nhận">
                Chọn lại
              </Button>
            )}
            {!item.employee_id && (
              <Button busy={busy} onClick={() => onAssign(null)} title="Kiện không cần thông báo">
                Bỏ qua
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * Tên người nhận đã chọn. Backend trả `employee_id` chứ không trả tên, và
 * ứng viên đã xếp hạng thường chứa sẵn tên đó — dùng lại để khỏi gọi thêm
 * một vòng API cho mỗi dòng.
 */
function ChosenName({ item }: { item: MailItemReview }) {
  const known = item.candidates.find((c) => c.employee_id === item.employee_id);
  if (known) return <strong>{known.full_name}</strong>;
  return (
    <strong title={item.employee_id ?? undefined}>
      {item.recipient_name_raw ?? 'Đã chọn'} <span className="small muted">(đã gán)</span>
    </strong>
  );
}

/**
 * §5.2 — nút gửi **luôn bật** khi có ít nhất một dòng sẵn sàng, và nhãn
 * phản ánh đúng thực tế. Không chặn cả lô vì một dòng chưa rõ.
 */
function SendBar({
  ready,
  waiting,
  alreadySent,
  sending,
  onSend,
}: {
  ready: number;
  waiting: number;
  alreadySent: number;
  sending: boolean;
  onSend: () => void;
}) {
  const label =
    waiting > 0 ? `Gửi ${ready} dòng · ${waiting} dòng chưa rõ người nhận` : `Gửi ${ready} dòng`;

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 -4px 16px rgba(28,27,26,.06)',
      }}
    >
      <div className="small muted" style={{ flex: 1 }}>
        {ready > 0 ? (
          <>
            Thông báo gộp theo người: một người nhiều kiện chỉ nhận một email.
            {alreadySent > 0 && ` ${alreadySent} dòng đã gửi ở đợt trước sẽ không gửi lại.`}
          </>
        ) : waiting > 0 ? (
          <>
            Chưa có dòng nào sẵn sàng. Chọn người nhận hoặc xác nhận các dòng “{TIER.review.label}” ở trên.
          </>
        ) : (
          <>Cả lô đã gửi xong.</>
        )}
      </div>
      <Button variant="primary" busy={sending} disabled={ready === 0} onClick={onSend}>
        {label}
      </Button>
    </div>
  );
}
