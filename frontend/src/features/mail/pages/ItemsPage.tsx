/**
 * Màn hình kiện hàng (mail-tracking.md §9.1).
 *
 * Bản đầu chỉ hiện `Đã thông báo` + `Tồn đọng` và đặt tên là "quá hạn". Sai
 * hai chỗ:
 *
 * 1. **"Quá hạn" không phải một trạng thái** mà là thuộc tính suy ra từ
 *    `notified_at` (§8.2) — lấy nó đặt tên cho màn hình là lẫn cách hiển
 *    thị với cách lưu trữ.
 * 2. Kiện `Đã nhận` **biến mất khỏi giao diện**, nên HC không có chỗ nào
 *    trả lời câu hỏi thường gặp nhất: "kiện của anh A đã lấy chưa?".
 *
 * Nên đây là màn hình của **mọi kiện**, lọc theo trạng thái. Mặc định vẫn
 * mở ở "Chưa nhận" — đó là việc hằng ngày của HC.
 *
 * **Tự làm mới.** Khác mọi màn hình còn lại: ở đây dữ liệu đổi do **người
 * ngoài** — ai đó vừa ra hành lang lấy kiện rồi quét QR.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { hcCollect, listItems } from '@/api/mail';
import type { MailItem, MailStatus } from '@/api/types';
import { Button, Card, Empty, ErrorBox, Loading, Note, StatusPill } from '@/components/ui';
import { formatDate, formatDateTime } from '@/shared/format';
import { HANDOVER, STATUS } from '@/shared/mail-labels';

/** Mốc ở §8.3. Chỉ dùng để tô màu, không phải logic nghiệp vụ. */
const ABANDON_AFTER_DAYS = 5;
const REMIND_AFTER_DAYS = 2;

/** Người ta lấy hàng rải rác cả ngày, không cần nhanh hơn thế này. */
const REFRESH_MS = 45_000;

interface View {
  key: string;
  label: string;
  statuses: MailStatus[];
  hint: string;
}

/**
 * `Chưa nhận` đứng đầu và là mặc định: đó là việc HC làm hằng ngày. Các
 * mục còn lại để tra cứu.
 */
const VIEWS: View[] = [
  {
    key: 'unreceived',
    label: 'Chưa lấy',
    statuses: ['notified', 'abandoned'],
    hint: 'Đã báo cho người nhận nhưng chưa ai xác nhận lấy — chờ lâu nhất lên đầu',
  },
  {
    key: 'notified',
    label: 'Đang chờ lấy',
    statuses: ['notified'],
    hint: `Đã báo, chưa quá ${ABANDON_AFTER_DAYS} ngày`,
  },
  {
    key: 'abandoned',
    label: `Tồn đọng (quá ${ABANDON_AFTER_DAYS} ngày)`,
    statuses: ['abandoned'],
    hint: `Quá ${ABANDON_AFTER_DAYS} ngày không ai lấy. Vẫn ghi nhận được nếu người ta xuống lấy muộn`,
  },
  {
    key: 'collected',
    label: 'Đã lấy',
    statuses: ['collected'],
    hint: 'Đã xác nhận lấy hàng — mới nhất lên đầu',
  },
  {
    key: 'all',
    label: 'Tất cả',
    statuses: ['notified', 'abandoned', 'collected'],
    hint: 'Mọi kiện đã gửi thông báo. Dòng chưa rõ người nhận nằm ở tab “Chưa rõ người nhận”',
  },
];

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export default function ItemsPage() {
  const [view, setView] = useState<View>(VIEWS[0]);
  const [items, setItems] = useState<MailItem[] | null>(null);
  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const busyRef = useRef<string | null>(null);
  busyRef.current = busy;

  const statuses = view.statuses;
  const load = useCallback(() => {
    setError(null);
    return listItems({ status: statuses })
      .then((rows) => {
        setItems(rows);
        setRefreshedAt(new Date());
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được danh sách'));
  }, [statuses]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      // Tab đang ẩn thì thôi — không gọi API cho màn hình không ai nhìn.
      if (document.visibilityState !== 'visible') return;
      // Đang ghi nhận dở một dòng thì để yên, tránh danh sách nhảy dưới tay HC.
      if (busyRef.current) return;
      load();
    }, REFRESH_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !busyRef.current) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  async function collect(itemId: string) {
    setBusy(itemId);
    setError(null);
    try {
      await hcCollect(itemId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không ghi nhận được');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Lọc theo tên ngay trên máy: danh sách đã tải về rồi, và HC gõ để tìm
   * một dòng cụ thể chứ không phải để phân trang. Bỏ dấu cả hai vế vì
   * không ai gõ đủ dấu khi đang tìm nhanh.
   */
  const shown = useMemo(() => {
    if (!items) return null;
    const needle = stripAccents(term.trim());
    const filtered = needle
      ? items.filter(
          (i) =>
            stripAccents(i.recipient_name_raw ?? '').includes(needle) ||
            stripAccents(i.sender_raw ?? '').includes(needle),
        )
      : items;
    // Đã nhận thì mới nhất lên đầu; còn lại giữ thứ tự backend trả về
    // (chờ lâu nhất lên đầu).
    if (view.key !== 'collected') return filtered;
    return [...filtered].sort(
      (a, b) => Date.parse(b.collected_at ?? '') - Date.parse(a.collected_at ?? ''),
    );
  }, [items, term, view.key]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1>Theo dõi lấy hàng</h1>
        <span className="small muted">{view.hint}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="small muted tabular">
            {refreshedAt &&
              `Cập nhật ${refreshedAt.toLocaleTimeString('vi-VN')} · tự làm mới mỗi ${REFRESH_MS / 1000}s`}
          </span>
          <Button onClick={load}>Làm mới</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Lọc theo trạng thái" style={{ display: 'flex', gap: 4 }}>
          {VIEWS.map((option) => {
            const current = option.key === view.key;
            return (
              <button
                key={option.key}
                role="tab"
                aria-selected={current}
                onClick={() => setView(option)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  cursor: 'pointer',
                  border: `1px solid ${current ? 'var(--vsf-red)' : 'var(--border-strong)'}`,
                  background: current ? 'var(--pill-danger-bg)' : '#fff',
                  color: current ? 'var(--vsf-red-dark)' : 'var(--text-muted-strong)',
                  fontWeight: current ? 600 : 400,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <input
          className="field"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Tìm theo tên người nhận hoặc người gửi…"
          style={{ width: 280, height: 30, fontSize: 12.5, marginLeft: 'auto' }}
        />
      </div>

      {error && <ErrorBox error={error} />}

      <Card padded={false}>
        {shown === null ? (
          <Loading what="kiện hàng" />
        ) : shown.length === 0 ? (
          <Empty>
            {term ? `Không có kiện nào khớp “${term}”.` : `Không có kiện nào ở mục “${view.label}”.`}
          </Empty>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 90 }}>
                  {view.key === 'collected' ? 'Lấy lúc' : 'Đã chờ'}
                </th>
                <th style={{ width: 150 }}>Tên lễ tân ghi</th>
                <th style={{ width: 130 }}>Người gửi</th>
                <th style={{ width: 44, textAlign: 'right' }}>Số kiện</th>
                <th style={{ width: 92 }}>Ngày về</th>
                <th style={{ width: 130 }}>Đã báo lúc</th>
                <th style={{ width: 118 }}>Trạng thái</th>
                <th style={{ width: 190 }}>Xác nhận đã lấy</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <Row key={item.id} item={item} busy={busy === item.id} onCollect={() => collect(item.id)} />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Note>
        Hệ thống tự gửi nhắc sau {REMIND_AFTER_DAYS} ngày và chuyển sang tồn đọng sau{' '}
        {ABANDON_AFTER_DAYS} ngày kể từ lúc báo. Kiện đã tồn đọng vẫn ghi nhận được nếu người nhận
        xuống lấy muộn.
      </Note>
    </div>
  );
}

function Row({
  item,
  busy,
  onCollect,
}: {
  item: MailItem;
  busy: boolean;
  onCollect: () => void;
}) {
  const collected = item.status === 'collected';
  const waited = daysSince(item.notified_at);
  const late = !collected && waited !== null && waited >= REMIND_AFTER_DAYS;
  const veryLate = !collected && waited !== null && waited >= ABANDON_AFTER_DAYS;

  return (
    <tr style={veryLate ? { background: 'var(--pill-danger-bg)' } : undefined}>
      <td>
        {collected ? (
          <span className="small muted tabular">{formatDateTime(item.collected_at)}</span>
        ) : (
          <span
            className="tabular"
            style={{
              color: late ? 'var(--vsf-red-dark)' : 'var(--text-muted)',
              fontWeight: late ? 600 : 400,
            }}
          >
            {waited === null ? '—' : `${waited} ngày`}
          </span>
        )}
      </td>
      <td>{item.recipient_name_raw ?? <span className="muted">(trống)</span>}</td>
      <td className="muted">{item.sender_raw ?? '—'}</td>
      <td className="tabular" style={{ textAlign: 'right' }}>
        {item.quantity}
      </td>
      <td className="tabular muted">{formatDate(item.received_at)}</td>
      <td className="tabular muted small">{formatDateTime(item.notified_at)}</td>
      <td>
        <StatusPill descriptor={STATUS[item.status]} />
      </td>
      <td>
        {collected ? (
          /*
           * Đã có người quét mã rồi thì **không hiện nút nữa** — hiện ai đã
           * ghi nhận và bằng đường nào. `confirm_collect` vốn bỏ qua lần bấm
           * thứ hai nên bấm lại không hỏng dữ liệu, nhưng để nút ở đây thì
           * HC tưởng còn việc phải làm.
           */
          <span className="small muted">{HANDOVER[item.handover_method ?? 'hc_reconciled']}</span>
        ) : (
          <Button
            busy={busy}
            onClick={onCollect}
            title="Dùng khi HC tự tay trao kiện, hoặc đối chiếu tờ ký giấy"
          >
            Đã trao
          </Button>
        )}
      </td>
    </tr>
  );
}

function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
