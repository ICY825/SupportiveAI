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
        setError(err instanceof ApiError ? err.message : 'Không tải được danh sách chưa rõ người nhận'),
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
  if (!items) return <Loading what="dòng chưa rõ người nhận" />;

  const overdue = items.filter((i) => i.overdue).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1>Chưa rõ người nhận</h1>
        <span className="small muted">
          Tất cả thư trong ngày · {items.length} dòng cần chọn người nhận
        </span>
      </div>

      {error && <ErrorBox error={error} />}

      {overdue > 0 && (
        <Banner tone="danger">
          <strong>{overdue} dòng đã chờ quá 2 ngày.</strong> Hệ thống không tự chuyển các dòng này
          sang “Tồn đọng” vì người nhận chưa hề được báo. Cần chọn người nhận và gửi thông báo.
        </Banner>
      )}

      <Card padded={false}>
        {items.length === 0 ? (
          <Empty>Không còn dòng nào chưa rõ người nhận.</Empty>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Đã chờ</th>
                <th style={{ width: 150 }}>Tên lễ tân ghi</th>
                <th style={{ width: 130 }}>Người gửi</th>
                <th style={{ width: 44, textAlign: 'right' }}>Số kiện</th>
                <th style={{ width: 96 }}>Ngày về</th>
                <th style={{ width: 150 }}>File</th>
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
                            Chọn lại
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
        Người nhận chọn ở đây được hệ thống ghi nhớ cho lần sau, nên các tên khó nhận ra sẽ ít
        dần theo tuần.
      </Note>
    </div>
  );
}
