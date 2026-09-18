/**
 * Màn hình "Chờ khớp" xuyên lô (mail-tracking.md §6.4).
 *
 * Gửi một phần chỉ có nghĩa khi có chỗ xử lý phần còn lại. Đây là chỗ đó:
 * mọi dòng chưa xác định được người nhận trên **toàn hệ thống**, không
 * phân biệt lô — kiện của khách, thực tập sinh, người không có trong danh
 * mục. Chờ lâu nhất lên đầu.
 *
 * Gán được người thì gửi ngay tại chỗ; mốc SLA tính từ lúc đó, không phải
 * từ lúc lô được gửi lần đầu.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '@/api/client';
import { assignRecipient, listPendingMatch, sendItem } from '@/api/mail';
import type { PendingMatchItem } from '@/api/types';
import { EmployeePicker } from '@/components/EmployeePicker';
import { Banner, Button, Card, Empty, ErrorBox, Loading, Note, StatusPill } from '@/components/ui';
import { formatDate, formatWaiting } from '@/shared/format';

export default function PendingMatchPage() {
  const [items, setItems] = useState<PendingMatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    return listPendingMatch()
      .then(setItems)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Không tải được danh sách chờ khớp'),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function mutate(itemId: string, action: () => Promise<unknown>) {
    setBusy(itemId);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác không thành công');
    } finally {
      setBusy(null);
    }
  }

  if (error && !items) return <ErrorBox error={error} onRetry={load} />;
  if (!items) return <Loading what="dòng chờ khớp" />;

  const overdue = items.filter((i) => i.overdue).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1>Chờ khớp</h1>
        <span className="small muted">
          Mọi lô · {items.length} dòng chưa xác định được người nhận
        </span>
      </div>

      {error && <ErrorBox error={error} />}

      {overdue > 0 && (
        <Banner tone="danger">
          <strong>{overdue} dòng đã chờ quá 2 ngày.</strong> Chúng không tự chuyển sang “Tồn đọng”
          — “chưa biết báo cho ai” khác hẳn “đã báo nhưng không ai lấy”, gộp lại là mất dấu những
          kiện thật sự bị bỏ quên. Phải xử lý tay.
        </Banner>
      )}

      <Card padded={false}>
        {items.length === 0 ? (
          <Empty>Không còn dòng nào chờ khớp. </Empty>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Đã chờ</th>
                <th style={{ width: 150 }}>Tên trên file</th>
                <th style={{ width: 130 }}>Người gửi</th>
                <th style={{ width: 44, textAlign: 'right' }}>SL</th>
                <th style={{ width: 96 }}>Ngày nhận</th>
                <th style={{ width: 150 }}>Lô</th>
                <th>Chọn người nhận</th>
                <th style={{ width: 130 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  style={item.overdue ? { background: 'var(--pill-danger-bg)' } : undefined}
                >
                  <td>
                    {item.overdue ? (
                      <StatusPill
                        descriptor={{
                          label: formatWaiting(item.waiting_days),
                          symbol: '!',
                          tone: 'danger',
                          hint: 'Quá ngưỡng cảnh báo',
                        }}
                      />
                    ) : (
                      <span className="muted tabular">{formatWaiting(item.waiting_days)}</span>
                    )}
                  </td>
                  <td>{item.recipient_name_raw ?? <span className="muted">(trống)</span>}</td>
                  <td className="muted">{item.sender_raw ?? '—'}</td>
                  <td className="tabular" style={{ textAlign: 'right' }}>
                    {item.quantity}
                  </td>
                  <td className="tabular muted">{formatDate(item.received_at)}</td>
                  <td className="small">
                    <Link to={`/mail/batches/${item.batch_id}`}>{item.batch_filename}</Link>
                  </td>
                  <td>
                    {item.employee_id ? (
                      <strong>
                        {item.candidates.find((c) => c.employee_id === item.employee_id)?.full_name ??
                          'Đã chọn'}
                      </strong>
                    ) : (
                      <EmployeePicker
                        suggestions={item.candidates}
                        onPick={(choice) =>
                          mutate(item.id, () => assignRecipient(item.id, choice.employeeId))
                        }
                      />
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {item.employee_id && (
                        <>
                          <Button
                            variant="primary"
                            busy={busy === item.id}
                            onClick={() => mutate(item.id, () => sendItem(item.id))}
                          >
                            Gửi ngay
                          </Button>
                          <Button
                            busy={busy === item.id}
                            onClick={() => mutate(item.id, () => assignRecipient(item.id, null))}
                          >
                            Đổi
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Note>
        Chọn người nhận ở đây cũng được ghi nhớ cho lần sau (§4.5), nên những cái tên khó sẽ
        thưa dần theo tuần.
      </Note>
    </div>
  );
}
