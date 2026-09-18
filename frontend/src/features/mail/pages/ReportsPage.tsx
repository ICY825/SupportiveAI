/**
 * Báo cáo (mail-tracking.md §9.2, §9.3).
 *
 * ⚠️ **Tỷ lệ khớp tự động vẽ theo TUẦN, không phải một con số trung bình.**
 * Cơ chế alias (§4.5) làm tỷ lệ tăng dần: tuần đầu HC phải chọn gần hết,
 * tới tuần thứ ba thì phần lớn khớp thẳng. Gộp lại thành một con số sẽ làm
 * hệ thống trông tệ hơn hẳn thực lực, và che mất chính cái đường đi lên —
 * thứ là bằng chứng rằng thiết kế này hoạt động.
 *
 * Nếu ai đó muốn thêm ô "tỷ lệ khớp tự động: 62%" cho gọn, đọc lại §9.3.
 */

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { getReports } from '@/api/mail';
import type {
  HandoverMethod,
  MailReports,
  MailStatus,
  MatchMethod,
  WeeklyMatchRate,
} from '@/api/types';
import { Card, Empty, ErrorBox, Loading, Note, Stat } from '@/components/ui';
import { formatPercent } from '@/shared/format';
import { HANDOVER, MATCH_METHOD, STATUS } from '@/shared/mail-labels';

export default function ReportsPage() {
  const [reports, setReports] = useState<MailReports | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    return getReports()
      .then(setReports)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được báo cáo'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !reports) return <ErrorBox error={error} onRetry={load} />;
  if (!reports) return <Loading what="báo cáo" />;

  const status = reports.by_status;
  const total = Object.values(status).reduce((sum, n) => sum + (n ?? 0), 0);
  const hc = reports.hc_interventions;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h1>Báo cáo</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Stat label="Tổng số dòng" value={total} />
        <Stat
          label="Chưa rõ người nhận"
          value={status.pending_match ?? 0}
          tone={(status.pending_match ?? 0) > 0 ? 'danger' : undefined}
        />
        <Stat
          label="Tồn đọng"
          value={status.abandoned ?? 0}
          tone={(status.abandoned ?? 0) > 0 ? 'danger' : undefined}
        />
        <Stat label="Tên đã ghi nhớ" value={hc.alias_learned} unit="tên" />
      </div>

      <Card title="Tỷ lệ hệ thống tự nhận ra người nhận, theo tuần">
        <WeeklyChart rows={reports.auto_match_rate_by_week} />
        <Note>
          Đường này <strong>phải đi lên</strong>: mỗi lần HC chọn tay là một tên được ghi nhớ, nên
          tuần sau hệ thống tự nhận ra nhiều hơn tuần trước. Một con số trung bình cả kỳ sẽ che mất
          điều đó.
        </Note>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Cách xác định người nhận">
          <Distribution
            rows={Object.entries(reports.by_match_method).map(([key, count]) => ({
              label: MATCH_METHOD[key as MatchMethod] ?? key,
              count: count ?? 0,
            }))}
          />
        </Card>

        <Card title="Theo trạng thái">
          <Distribution
            rows={Object.entries(status).map(([key, count]) => ({
              label: STATUS[key as MailStatus]?.label ?? key,
              count: count ?? 0,
            }))}
          />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Cách xác nhận đã lấy hàng">
          <Distribution
            rows={Object.entries(reports.by_handover_method).map(([key, count]) => ({
              label: HANDOVER[key as HandoverMethod] ?? key,
              count: count ?? 0,
            }))}
          />
          <Note>
            Tỷ lệ “HC xác nhận” cao nghĩa là người nhận không chịu tự bấm xác nhận — khi đó
            nên xem lại vị trí dán mã QR.
          </Note>
        </Card>

        <Card title="Công sức HC phải bỏ ra">
          <Distribution
            rows={[
              { label: 'Số lần HC chọn hoặc sửa', count: hc.total_interventions },
              { label: 'Hệ thống không gợi ý được ai', count: hc.machine_had_no_suggestion },
              { label: 'Tên đã ghi nhớ', count: hc.alias_learned },
            ]}
          />
          <Note>
            Đây là <strong>căn cứ bằng số để đề nghị lễ tân thêm cột số điện thoại</strong> sau
            1–2 tuần chạy thật. “HC phải chọn tay X% số dòng, mất Y phút mỗi ngày” thuyết phục hơn
            nhiều so với đề nghị trước khi chạy.
          </Note>
        </Card>
      </div>
    </div>
  );
}

function WeeklyChart({ rows }: { rows: WeeklyMatchRate[] }) {
  if (rows.length === 0) {
    return <Empty>Chưa có dữ liệu. Biểu đồ xuất hiện sau lô đầu tiên.</Empty>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, minHeight: 150, padding: '6px 2px' }}>
      {rows.map((row) => (
        <div key={row.week} style={{ flex: 1, textAlign: 'center', minWidth: 46 }}>
          <div className="small tabular" style={{ marginBottom: 4, color: 'var(--text-muted-strong)' }}>
            {formatPercent(row.rate)}
          </div>
          <div
            title={`${row.auto}/${row.total} dòng hệ thống tự nhận ra`}
            style={{
              height: Math.max(4, Math.round(row.rate * 110)),
              background: 'var(--vsf-red)',
              borderRadius: '4px 4px 0 0',
            }}
          />
          <div className="small muted" style={{ marginTop: 5 }}>
            {row.week}
          </div>
          <div className="small muted tabular" style={{ fontSize: 10.5 }}>
            {row.auto}/{row.total}
          </div>
        </div>
      ))}
    </div>
  );
}

function Distribution({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <Empty>Chưa có dữ liệu.</Empty>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div style={{ display: 'flex', fontSize: 12, marginBottom: 4 }}>
            <span>{row.label}</span>
            <span className="tabular" style={{ marginLeft: 'auto', color: 'var(--text-muted-strong)' }}>
              {row.count}
            </span>
          </div>
          <div style={{ height: 5, background: 'var(--rail)', borderRadius: 3 }}>
            <div
              style={{
                width: `${(row.count / max) * 100}%`,
                height: '100%',
                background: 'var(--charcoal)',
                borderRadius: 3,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
