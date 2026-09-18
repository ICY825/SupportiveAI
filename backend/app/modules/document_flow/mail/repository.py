"""Truy vấn dữ liệu của phân hệ chuyển phát nhanh."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.modules.document_flow.mail.models import (
    BatchStatus,
    MailBatch,
    MailItem,
    MailStatus,
    MatchFeedback,
    MatchingAlias,
    MatchMethod,
    MatchTier,
)
from app.shared.employee.models import Employee, EmployeeStatus
from app.shared.employee.normalization import phone_last4


class MailRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Lô ---

    def get_batch(self, batch_id: str) -> MailBatch | None:
        return self.db.execute(
            select(MailBatch)
            .where(MailBatch.id == batch_id)
            .options(selectinload(MailBatch.items))
        ).scalar_one_or_none()

    def list_batches(self, *, limit: int = 50) -> Sequence[MailBatch]:
        return (
            self.db.execute(
                select(MailBatch).order_by(MailBatch.uploaded_at.desc()).limit(limit)
            )
            .scalars()
            .all()
        )

    def batches_on_date(
        self, receipt_date: date | None, *, exclude_batch_id: str | None = None
    ) -> Sequence[MailBatch]:
        """Các lô đã có cho cùng ngày nhận (CR-001 §5.3).

        Không chặn gì — chỉ để màn hình soát cảnh báo "Đã có lô cho ngày
        này, tải lên lúc…". HC quyết định tiếp tục hay hủy.
        """
        if receipt_date is None:
            return []
        stmt = select(MailBatch).where(MailBatch.receipt_date == receipt_date)
        if exclude_batch_id:
            stmt = stmt.where(MailBatch.id != exclude_batch_id)
        return self.db.execute(stmt.order_by(MailBatch.uploaded_at)).scalars().all()

    # --- Kiện ---

    def get_item(self, item_id: str) -> MailItem | None:
        return self.db.get(MailItem, item_id)

    def items_of_batch(self, batch_id: str) -> Sequence[MailItem]:
        return (
            self.db.execute(
                select(MailItem)
                .where(MailItem.batch_id == batch_id)
                .order_by(MailItem.row_index, MailItem.created_at)
            )
            .scalars()
            .all()
        )

    def find_sent_duplicates(self, dedup_keys: Sequence[str]) -> dict[str, MailItem]:
        """Dòng cũ **thuộc lô đã gửi** trùng khóa khử trùng lặp (CR-001 §5.2).

        Chỉ tính lô đã gửi có chủ đích: trùng trong một lô chưa gửi không
        phải dấu hiệu tải lại file, mà chỉ là HC đang soát dở.

        Không đặt `UNIQUE` trên `dedup_key` nên hàm này trả về dòng đầu
        tiên tìm thấy cho mỗi khóa — đủ để làm tham chiếu cho HC.
        """
        wanted = [k for k in dedup_keys if k]
        if not wanted:
            return {}
        rows = (
            self.db.execute(
                select(MailItem)
                .join(MailBatch, MailItem.batch_id == MailBatch.id)
                .where(
                    MailItem.dedup_key.in_(wanted),
                    MailBatch.status == BatchStatus.SENT,
                )
                .order_by(MailItem.created_at)
            )
            .scalars()
            .all()
        )
        found: dict[str, MailItem] = {}
        for item in rows:
            found.setdefault(item.dedup_key, item)
        return found

    def sender_history(self, sender_normalized: str | None) -> dict[str, int]:
        """Ai đã từng nhận hàng từ người gửi này, và bao nhiêu lần.

        Tín hiệu xếp hạng số 1 ở CR-001 §4.3, thay cho tín hiệu "đơn vị"
        đã mất. Chỉ đếm dòng **đã hoàn tất việc khớp** — dòng còn đang chờ
        HC quyết không phải là bằng chứng gì cả.
        """
        if not sender_normalized:
            return {}
        rows = self.db.execute(
            select(MailItem.employee_id, func.count(MailItem.id))
            .where(
                MailItem.sender_normalized == sender_normalized,
                MailItem.employee_id.is_not(None),
                MailItem.status != MailStatus.PENDING_MATCH,
            )
            .group_by(MailItem.employee_id)
        ).all()
        return {employee_id: count for employee_id, count in rows if employee_id}

    def same_name_in_batch(
        self, batch_id: str, name_normalized: str | None, *, exclude_item_id: str
    ) -> Sequence[MailItem]:
        """Các dòng cùng tên thô trong cùng lô, để áp cả lô (CR-001 §4.4).

        Chỉ lấy dòng còn ở `Chờ khớp`: dòng đã gửi rồi thì đổi người nhận
        cũng không rút lại được email.
        """
        if not name_normalized:
            return []
        return (
            self.db.execute(
                select(MailItem).where(
                    MailItem.batch_id == batch_id,
                    MailItem.recipient_name_normalized == name_normalized,
                    MailItem.id != exclude_item_id,
                    MailItem.status == MailStatus.PENDING_MATCH,
                )
            )
            .scalars()
            .all()
        )

    def list_pending_match(self) -> Sequence[MailItem]:
        """Mọi dòng đang ở `Chờ khớp` trên **toàn hệ thống** (CR-001 §6.2).

        Không phân biệt lô: HC vào một màn hình duy nhất xử lý dần các
        trường hợp khó — kiện của khách, thực tập sinh, người không có
        trong danh mục. Chờ lâu nhất lên đầu.
        """
        return (
            self.db.execute(
                select(MailItem)
                .where(MailItem.status == MailStatus.PENDING_MATCH)
                .options(selectinload(MailItem.batch))
                .order_by(MailItem.received_at, MailItem.created_at)
            )
            .scalars()
            .all()
        )

    def items_of_employee(
        self, employee_id: str, *, only_uncollected: bool = False
    ) -> Sequence[MailItem]:
        stmt = select(MailItem).where(MailItem.employee_id == employee_id)
        if only_uncollected:
            stmt = stmt.where(MailItem.status.in_((MailStatus.NOTIFIED, MailStatus.ABANDONED)))
        return self.db.execute(stmt.order_by(MailItem.received_at.desc())).scalars().all()

    def uncollected_by_phone_last4(self, raw_phone: str | None) -> Sequence[MailItem]:
        """Kiện chưa nhận của người có 4 số cuối điện thoại tương ứng.

        Phục vụ màn hình quét QR tại khu để đơn (§7.2): người nhận gõ 4 số
        cuối, hệ thống hiện đúng kiện của họ.

        Bốn số này lấy từ `employee.phone_last4` (nguồn HR), **không** từ
        file lễ tân — nên CR-001 không đụng tới màn hình này (§9).

        Lưu ý: trả về kiện của **mọi** nhân sự trùng 4 số cuối. Màn hình
        phải hiển thị tên để người dùng nhận ra dòng của mình, giống như
        tìm dòng của mình trên tờ giấy ký hiện nay.
        """
        last4 = phone_last4(raw_phone)
        if not last4:
            return []
        return (
            self.db.execute(
                select(MailItem)
                .join(Employee, MailItem.employee_id == Employee.id)
                .where(
                    Employee.phone_last4 == last4,
                    Employee.status == EmployeeStatus.ACTIVE,
                    MailItem.status.in_((MailStatus.NOTIFIED, MailStatus.ABANDONED)),
                )
                .order_by(MailItem.received_at)
            )
            .scalars()
            .all()
        )

    def list_uncollected(
        self, *, department_id: str | None = None, statuses: Sequence[str] | None = None
    ) -> Sequence[MailItem]:
        """Danh sách cho màn hình quá hạn của HC (§9.1)."""
        stmt = select(MailItem).where(
            MailItem.status.in_(statuses or (MailStatus.NOTIFIED, MailStatus.ABANDONED))
        )
        if department_id:
            stmt = stmt.join(Employee, MailItem.employee_id == Employee.id).where(
                Employee.department_id == department_id
            )
        # Chờ lâu nhất lên đầu.
        return self.db.execute(stmt.order_by(MailItem.notified_at)).scalars().all()

    # --- Bảng alias (CR-001 §3.3) ---

    def find_alias(self, raw_name_normalized: str | None) -> MatchingAlias | None:
        if not raw_name_normalized:
            return None
        return self.db.execute(
            select(MatchingAlias).where(
                MatchingAlias.raw_name_normalized == raw_name_normalized
            )
        ).scalar_one_or_none()

    def count_aliases(self) -> int:
        return self.db.execute(select(func.count(MatchingAlias.id))).scalar_one()

    # --- Số liệu báo cáo (§9.2, CR-001 §8.2) ---

    def count_by_status(self, *, since: datetime | None = None) -> dict[str, int]:
        stmt = select(MailItem.status, func.count(MailItem.id)).group_by(MailItem.status)
        if since is not None:
            stmt = stmt.where(MailItem.received_at >= since)
        return dict(self.db.execute(stmt).all())

    def count_by_match_method(self, *, since: datetime | None = None) -> dict[str, int]:
        """Mẫu số của KPI "tỷ lệ khớp tự động" (§9.3)."""
        stmt = select(MailItem.match_method, func.count(MailItem.id)).group_by(
            MailItem.match_method
        )
        if since is not None:
            stmt = stmt.where(MailItem.received_at >= since)
        return dict(self.db.execute(stmt).all())

    def count_by_handover_method(self, *, since: datetime | None = None) -> dict[str, int]:
        """Tỷ lệ `hc_reconciled` cao nghĩa là người nhận không chịu tự bấm (§7.4)."""
        stmt = (
            select(MailItem.handover_method, func.count(MailItem.id))
            .where(MailItem.handover_method.is_not(None))
            .group_by(MailItem.handover_method)
        )
        if since is not None:
            stmt = stmt.where(MailItem.collected_at >= since)
        return dict(self.db.execute(stmt).all())

    def auto_match_rate_by_week(self) -> list[dict]:
        """Tỷ lệ khớp tự động **theo tuần** (CR-001 §8.2).

        Phải báo theo tuần, không phải trung bình cả kỳ: cơ chế alias làm
        tỷ lệ tăng dần theo thời gian, nên một con số trung bình sẽ làm hệ
        thống trông tệ hơn thực lực.

        Tính trong Python chứ không trong SQL vì hàm cắt tuần khác nhau
        giữa Postgres và SQLite — mỗi tuần vài trăm dòng, không đáng để đổi
        lấy một truy vấn không chạy được ở cả hai nơi.
        """
        rows = self.db.execute(
            select(MailItem.received_at, MailItem.match_method, MailItem.id)
        ).all()
        buckets: dict[str, dict[str, int]] = {}
        corrected = self._corrected_item_ids()
        for received_at, method, item_id in rows:
            if received_at is None:
                continue
            year, week, _ = received_at.isocalendar()
            key = f"{year}-W{week:02d}"
            bucket = buckets.setdefault(key, {"total": 0, "auto": 0})
            bucket["total"] += 1
            if method in MatchMethod.AUTOMATIC and item_id not in corrected:
                bucket["auto"] += 1
        return [
            {
                "week": week,
                "total": data["total"],
                "auto": data["auto"],
                "rate": round(data["auto"] / data["total"], 3) if data["total"] else 0.0,
            }
            for week, data in sorted(buckets.items())
        ]

    def _corrected_item_ids(self) -> set[str]:
        """Dòng máy khớp được nhưng HC vẫn phải sửa — không tính là khớp đúng."""
        rows = self.db.execute(
            select(MatchFeedback.mail_item_id).where(
                MatchFeedback.mail_item_id.is_not(None),
                MatchFeedback.suggested_employee_id.is_not(None),
                MatchFeedback.suggested_employee_id != MatchFeedback.chosen_employee_id,
            )
        ).scalars().all()
        return set(rows)

    def count_feedback(self) -> dict[str, int]:
        """Số thao tác HC phải làm — căn cứ để đi đòi thêm cột SĐT (§8.1)."""
        total = self.db.execute(select(func.count(MatchFeedback.id))).scalar_one()
        no_suggestion = self.db.execute(
            select(func.count(MatchFeedback.id)).where(
                MatchFeedback.suggested_employee_id.is_(None)
            )
        ).scalar_one()
        return {
            "total_interventions": total,
            "machine_had_no_suggestion": no_suggestion,
            "alias_learned": self.count_aliases(),
        }

    def employees_without_email(self, batch_id: str) -> set[str]:
        """Các kiện đã khớp người nhận nhưng người đó không có email.

        Khớp được không có nghĩa là gửi được: thiếu email thì thông báo
        không tới ai, mà đồng hồ SLA vẫn chạy — người nhận không bao giờ
        biết mình có kiện hàng. Phải cảnh báo trước khi bấm gửi.
        """
        rows = self.db.execute(
            select(MailItem.id)
            .join(Employee, MailItem.employee_id == Employee.id)
            .where(MailItem.batch_id == batch_id, Employee.email.is_(None))
        ).scalars().all()
        return set(rows)

    def review_summary(self, batch_id: str) -> dict:
        """Phần tổng quan của màn hình soát (CR-001 §7.1).

        Đếm cả **dòng** và **kiện**: lễ tân gộp nhiều kiện cùng nguồn vào
        một dòng rồi ghi `số lượng`, nên hai con số này khác nhau.
        """
        items = self.items_of_batch(batch_id)
        batch = self.db.get(MailBatch, batch_id)
        return {
            "total_rows": len(items),
            "total_parcels": sum(i.quantity for i in items),
            "confirmed": sum(1 for i in items if i.ready_to_send),
            "review": sum(
                1 for i in items if i.match_tier == MatchTier.REVIEW and not i.ready_to_send
            ),
            "choose": sum(1 for i in items if i.match_tier == MatchTier.CHOOSE),
            "duplicate_suspect": sum(1 for i in items if i.duplicate_suspect),
            "pending_match": sum(1 for i in items if i.status == MailStatus.PENDING_MATCH),
            "sent": sum(1 for i in items if i.status != MailStatus.PENDING_MATCH),
            "missing_email": len(self.employees_without_email(batch_id)),
            "ambiguous_date": bool(batch and batch.ambiguous_date),
        }
