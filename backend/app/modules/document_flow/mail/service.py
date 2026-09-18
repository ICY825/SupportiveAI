"""Logic nghiệp vụ của phân hệ chuyển phát nhanh."""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Sequence
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import utcnow
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.document_flow.mail import notifications
from app.modules.document_flow.mail.events import MailAbandoned, MailOverdue, MailReceived
from app.modules.document_flow.mail.matcher import MatchResult, RecipientMatcher
from app.modules.document_flow.mail.models import (
    BatchStatus,
    HandoverMethod,
    MailBatch,
    MailItem,
    MailStatus,
    MatchFeedback,
    MatchingAlias,
    MatchMethod,
    MatchTier,
)
from app.modules.document_flow.mail.repository import MailRepository
from app.modules.document_flow.mail.schemas import MailRow, StationItem
from app.modules.document_flow.mail.workflow import (
    ABANDON_AFTER_DAYS,
    ACTION_ABANDON,
    ACTION_REMIND,
    ENTITY_TYPE,
    TRIGGER_ABANDON,
    TRIGGER_COLLECT,
    TRIGGER_NOTIFY,
)
from app.platform.audit.service import AuditService
from app.platform.events import Dispatcher
from app.platform.events import dispatcher as default_dispatcher
from app.platform.notification import NotificationPayload, NotificationService, Recipient
from app.platform.workflow import WorkflowEngine
from app.shared.employee.models import Employee
from app.shared.employee.normalization import normalize_name, normalize_sender
from app.shared.employee.repository import EmployeeRepository

logger = logging.getLogger(__name__)


def dedup_key(row: MailRow) -> str | None:
    """Khóa khử trùng lặp: người gửi + người nhận + ngày nhận (CR-001 §5.1).

    Khóa này dùng được vì lễ tân **gộp nhiều kiện cùng nguồn trong cùng
    ngày vào một dòng và ghi `số lượng`**. Nên hai dòng trùng khóa là dấu
    hiệu tải lại file, không phải mất dữ liệu.

    Trả `None` khi thiếu tên người nhận hoặc ngày — khóa dựng từ dữ liệu
    khuyết sẽ gom nhầm những dòng chẳng liên quan gì tới nhau.
    """
    recipient = normalize_name(row.recipient_name)
    if not recipient or row.received_on is None:
        return None
    raw = "|".join(
        [normalize_sender(row.sender) or "", recipient, row.received_on.isoformat()]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class MailService:
    def __init__(
        self,
        db: Session,
        *,
        engine: WorkflowEngine | None = None,
        notifier: NotificationService | None = None,
        dispatcher: Dispatcher | None = None,
    ) -> None:
        self.db = db
        self.repo = MailRepository(db)
        self.employees = EmployeeRepository(db)
        self.matcher = RecipientMatcher(db)
        self.engine = engine or WorkflowEngine(db)
        self.notifier = notifier or NotificationService(db)
        self.dispatcher = dispatcher or default_dispatcher

    # ------------------------------------------------------------------
    # Tiếp nhận danh sách (§3, CR-001 §5)
    # ------------------------------------------------------------------

    def import_rows(
        self,
        rows: Sequence[MailRow],
        *,
        source_filename: str,
        uploaded_by: str,
        ambiguous_date: bool = False,
    ) -> MailBatch:
        """Tạo một lô từ các dòng đã đọc được, khớp người nhận, đánh dấu nghi trùng.

        Nhận `MailRow` chứ không nhận file: phần đọc file nằm ở
        `importer.py`. Mọi thứ từ đây trở đi không phụ thuộc định dạng file.

        **Không dòng nào bị bỏ đi.** Dòng nghi trùng vẫn được tạo, chỉ là
        đánh dấu và mặc định không gửi — âm thầm nuốt dữ liệu là kiểu hỏng
        tệ nhất (CR-001 §5.2).
        """
        batch = MailBatch(
            source_filename=source_filename,
            uploaded_by=uploaded_by,
            uploaded_at=utcnow(),
            receipt_date=self._common_receipt_date(rows),
            row_count=len(rows),
            ambiguous_date=ambiguous_date,
        )
        self.db.add(batch)
        self.db.flush()

        keys = [dedup_key(row) for row in rows]
        da_gui = self.repo.find_sent_duplicates([k for k in keys if k])

        for row, key in zip(rows, keys, strict=True):
            result = self.matcher.match(
                name_raw=row.recipient_name,
                sender_raw=row.sender,
                phone_raw=row.recipient_phone,
            )
            truoc = da_gui.get(key) if key else None
            self._create_item(batch, row, key, result, duplicate_of=truoc)

        self._refresh_counters(batch)
        return batch

    @staticmethod
    def _common_receipt_date(rows: Sequence[MailRow]):
        """Ngày nhận chung của lô, hoặc `None` khi các dòng lệch ngày nhau.

        Chỉ dùng để cảnh báo tải lại cùng ngày (§5.3), nên lô lẫn nhiều
        ngày thì bỏ cảnh báo còn hơn là cảnh báo sai.
        """
        dates = {row.received_on for row in rows if row.received_on}
        return dates.pop() if len(dates) == 1 else None

    def _create_item(
        self,
        batch: MailBatch,
        row: MailRow,
        key: str | None,
        result: MatchResult,
        *,
        duplicate_of: MailItem | None,
    ) -> MailItem:
        item = MailItem(
            batch_id=batch.id,
            row_index=row.row_index,
            sender_raw=row.sender,
            sender_normalized=normalize_sender(row.sender),
            recipient_name_raw=row.recipient_name,
            recipient_name_normalized=normalize_name(row.recipient_name),
            recipient_phone_raw=row.recipient_phone,
            quantity=row.quantity,
            content_type=row.content_type,
            employee_id=result.employee_id,
            match_method=result.method,
            match_tier=result.tier,
            match_confidence=result.confidence,
            dedup_key=key,
            duplicate_suspect=duplicate_of is not None,
            duplicate_of_id=duplicate_of.id if duplicate_of else None,
            received_at=self._as_datetime(row),
            status=MailStatus.PENDING_MATCH,
            note=self._duplicate_note(duplicate_of, row) if duplicate_of else None,
        )
        self.db.add(item)
        self.db.flush()
        self.engine.start(ENTITY_TYPE, item.id)
        return item

    @staticmethod
    def _as_datetime(row: MailRow) -> datetime:
        """File chỉ ghi ngày, không ghi giờ — lấy đầu ngày làm mốc.

        Chấp nhận lệch tối đa một ngày so với giờ nhận thật. SLA của kiện
        tính từ `notified_at` chứ không từ đây, nên sai lệch này không chạm
        tới mốc nhắc hạn hay tồn đọng.
        """
        if row.received_on is None:
            return utcnow()
        return datetime.combine(row.received_on, time.min, tzinfo=UTC)

    @staticmethod
    def _duplicate_note(previous: MailItem, row: MailRow) -> str:
        """Ghi rõ dòng cũ ở đâu để HC quyết mà không phải đi tra lô khác."""
        note = (
            f"Nghi trùng với dòng đã gửi ở lô {previous.batch_id} "
            f"(ngày nhận {previous.receipt_date}, số lượng {previous.quantity})."
        )
        if previous.quantity != row.quantity:
            # CR-001 §5.3: không tự cộng dồn, không tự ghi đè — hiện cả hai
            # con số để HC chọn.
            note += f" Số lượng lần này là {row.quantity} — khác lần trước."
        return note

    def _refresh_counters(self, batch: MailBatch) -> None:
        items = list(batch.items)
        batch.matched_count = sum(1 for i in items if i.employee_id)
        batch.pending_match_count = sum(1 for i in items if i.status == MailStatus.PENDING_MATCH)
        batch.duplicate_suspect_count = sum(1 for i in items if i.duplicate_suspect)
        batch.sent_count = sum(1 for i in items if i.status != MailStatus.PENDING_MATCH)
        self.db.flush()

    def delete_batch(self, batch_id: str, *, actor_id: str | None = None) -> None:
        """Xóa một lô tải nhầm (nhầm file, nhầm ngày, tải hai lần...).

        Chỉ xóa được khi **chưa dòng nào được gửi thông báo**. Dòng đã gửi
        thì email đã tới người nhận, SLA đang chạy — xóa đi là mất dấu kiện
        thật mà người nhận vẫn đang chờ, và không thu hồi được email.

        Giữ lại có chủ đích:

        * `matching_alias` — HC chọn "tên này là người này" vẫn đúng dù
          file tải nhầm; bỏ đi là bắt HC chọn lại lần sau.
        * `mail_match_feedback` — vẫn là công HC đã bỏ ra (§8.1), chỉ gỡ
          liên kết tới dòng/lô không còn tồn tại.
        * Một dòng audit ghi tên file, số dòng và ai xóa.
        """
        batch = self.repo.get_batch(batch_id)
        if batch is None:
            raise NotFoundError(f"Không có lô {batch_id}")

        da_gui = [i for i in batch.items if i.status != MailStatus.PENDING_MATCH]
        if da_gui:
            raise ConflictError(
                f"Lô đã gửi thông báo cho {len(da_gui)} dòng — không xóa được. "
                "Email đã tới người nhận, xóa lô sẽ làm mất dấu các kiện đó.",
                details={"sent_items": len(da_gui)},
            )

        item_ids = [i.id for i in batch.items]
        if item_ids:
            self.db.execute(
                update(MatchFeedback)
                .where(MatchFeedback.mail_item_id.in_(item_ids))
                .values(mail_item_id=None)
            )
        self.db.execute(
            update(MatchFeedback)
            .where(MatchFeedback.batch_id == batch.id)
            .values(batch_id=None)
        )
        self.engine.discard(ENTITY_TYPE, item_ids)

        AuditService(self.db).record(
            entity_type="mail_batch",
            entity_id=batch.id,
            action="delete",
            actor_id=actor_id,
            note=f"Xóa lô tải nhầm: {batch.source_filename}",
            data={
                "source_filename": batch.source_filename,
                "receipt_date": batch.receipt_date.isoformat() if batch.receipt_date else None,
                "row_count": batch.row_count,
                "uploaded_by": batch.uploaded_by,
                "uploaded_at": batch.uploaded_at.isoformat(),
            },
        )
        self.db.delete(batch)
        self.db.flush()

    # ------------------------------------------------------------------
    # Màn hình soát (§5, CR-001 §7)
    # ------------------------------------------------------------------

    def assign_recipient(
        self,
        item_id: str,
        employee_id: str | None,
        *,
        note: str | None = None,
        apply_to_batch: bool = True,
        actor_id: str | None = None,
    ) -> MailItem:
        """HC chọn hoặc sửa người nhận của một dòng.

        Ba việc kèm theo, tất cả đều bắt buộc:

        * ghi `matching_alias` để lần sau khớp thẳng (CR-001 §3.3);
        * ghi `mail_match_feedback` để đo và để đi đòi thêm cột SĐT (§8.1);
        * áp cho các dòng cùng tên trong lô (§4.4).
        """
        item = self._get_item(item_id)
        if item.status != MailStatus.PENDING_MATCH:
            raise ConflictError("Đã gửi thông báo rồi, không sửa người nhận được nữa")

        if employee_id is not None and self.employees.get(employee_id) is None:
            raise NotFoundError(f"Không có nhân sự {employee_id}")

        self._record_feedback(item, employee_id, actor_id=actor_id)
        if employee_id is not None:
            self._learn_alias(item, employee_id, actor_id=actor_id)

        self._apply_choice(item, employee_id)
        if note is not None:
            item.note = note
        self.db.flush()

        if apply_to_batch and employee_id is not None:
            self._apply_to_same_name(item, employee_id)

        self._refresh_counters(item.batch)
        return item

    @staticmethod
    def _apply_choice(item: MailItem, employee_id: str | None) -> None:
        item.employee_id = employee_id
        # Ghi `manual` để KPI "tỷ lệ khớp tự động" không tính nhầm dòng này
        # là máy khớp được (§4.4).
        item.match_method = MatchMethod.MANUAL if employee_id else MatchMethod.NONE
        item.match_tier = MatchTier.CONFIRMED if employee_id else MatchTier.CHOOSE
        item.match_confidence = None
        # HC đã đích thân chọn — không bắt xác nhận thêm một lần nữa.
        item.review_confirmed = employee_id is not None

    def _apply_to_same_name(self, item: MailItem, employee_id: str) -> None:
        """Áp lựa chọn của HC cho mọi dòng cùng tên trong lô (CR-001 §4.4).

        Một file mười dòng của cùng một người thì HC chỉ phải chọn một lần.
        Vẫn sửa lại được từng dòng nếu hai người thật sự khác nhau lại viết
        trùng tên trên phong bì.
        """
        for other in self.repo.same_name_in_batch(
            item.batch_id, item.recipient_name_normalized, exclude_item_id=item.id
        ):
            self._record_feedback(other, employee_id, actor_id=None)
            self._apply_choice(other, employee_id)
        self.db.flush()

    def _learn_alias(self, item: MailItem, employee_id: str, *, actor_id: str | None) -> None:
        """Nhớ "chuỗi tên thô này là người này" cho lần sau (CR-001 §3.3)."""
        key = item.recipient_name_normalized
        if not key:
            return
        existing = self.repo.find_alias(key)
        if existing is None:
            self.db.add(
                MatchingAlias(
                    raw_name_normalized=key,
                    employee_id=employee_id,
                    hit_count=1,
                    created_by=actor_id,
                    last_used_at=utcnow(),
                )
            )
            self.db.flush()
            return

        if existing.employee_id != employee_id:
            # HC sửa một dòng đã khớp bằng alias — ghi đè, và ghi log để
            # truy vết (§3.3). Lần chọn mới nhất là lần đúng nhất.
            logger.info(
                "Ghi đè alias %r: %s → %s (HC %s)",
                key, existing.employee_id, employee_id, actor_id,
            )
            existing.employee_id = employee_id
            existing.hit_count = 1
        else:
            existing.hit_count += 1
        existing.last_used_at = utcnow()
        self.db.flush()

    def _record_feedback(
        self, item: MailItem, chosen_employee_id: str | None, *, actor_id: str | None
    ) -> None:
        self.db.add(
            MatchFeedback(
                mail_item_id=item.id,
                batch_id=item.batch_id,
                suggested_employee_id=item.employee_id,
                chosen_employee_id=chosen_employee_id,
                match_method_before=item.match_method,
                match_tier_before=item.match_tier,
                raw_name=item.recipient_name_raw,
                sender_raw=item.sender_raw,
                created_by=actor_id,
            )
        )

    def confirm_review(self, item_id: str, *, confirmed: bool = True) -> MailItem:
        """HC bấm xác nhận nhanh cho dòng ở mức `review` (CR-001 §7.2)."""
        item = self._get_item(item_id)
        if item.status != MailStatus.PENDING_MATCH:
            raise ConflictError("Đã gửi thông báo rồi, không xác nhận lại được")
        if item.employee_id is None:
            raise ValidationError("Dòng chưa có người nhận đề xuất — phải chọn trước")
        item.review_confirmed = confirmed
        self.db.flush()
        self._refresh_counters(item.batch)
        return item

    def keep_duplicate(self, item_id: str, *, keep: bool = True) -> MailItem:
        """HC giữ lại (hoặc bỏ lại) một dòng bị nghi trùng (CR-001 §5.2)."""
        item = self._get_item(item_id)
        if item.status != MailStatus.PENDING_MATCH:
            raise ConflictError("Đã gửi thông báo rồi")
        item.duplicate_suspect = not keep
        self.db.flush()
        self._refresh_counters(item.batch)
        return item

    def candidates_for(self, item: MailItem):
        """Chạy lại matcher để lấy danh sách ứng viên cho màn hình soát.

        Không lưu ứng viên xuống DB: chúng chỉ có nghĩa lúc HC đang nhìn
        màn hình, và danh mục nhân sự có thể đã đổi từ lúc tải file.
        """
        return self.matcher.match(
            name_raw=item.recipient_name_raw,
            sender_raw=item.sender_raw,
            phone_raw=item.recipient_phone_raw,
        ).candidates

    # ------------------------------------------------------------------
    # Gửi thông báo — gọi lại được nhiều lần (CR-001 §6.1)
    # ------------------------------------------------------------------

    def send_batch(self, batch_id: str, *, actor_id: str | None = None) -> dict:
        """HC bấm gửi: gửi những dòng đã sẵn sàng, để lại phần chưa rõ.

        **Không chặn cả lô vì một dòng chưa khớp được** (D5). Dòng còn
        `employee_id IS NULL` nằm lại ở `Chờ khớp` và được xử lý dần ở màn
        hình xuyên lô (§6.2); SLA của chúng tính từ lúc gửi bổ sung, không
        phải từ lần gửi đầu.
        """
        batch = self.repo.get_batch(batch_id)
        if batch is None:
            raise NotFoundError(f"Không có lô {batch_id}")

        gui = [i for i in batch.items if i.ready_to_send]
        con_lai = [i for i in batch.items if i.status == MailStatus.PENDING_MATCH and i not in gui]
        if not gui:
            raise ValidationError(
                "Không có dòng nào sẵn sàng gửi",
                details={"pending_match": [i.id for i in con_lai]},
            )

        now = utcnow()
        for item in gui:
            self._transition(item, TRIGGER_NOTIFY, MailStatus.NOTIFIED, actor_id=actor_id)
            item.notified_at = now

        batch.status = BatchStatus.SENT
        if batch.sent_at is None:
            # Chỉ ghi ở lần gọi đầu tiên — đây là mốc đo "thời gian soát
            # mỗi lô" (CR-001 §8.2), không phải mốc gửi hết lô.
            batch.sent_at = now
        self._refresh_counters(batch)

        sent = self._notify(gui, renderer=notifications.render_received,
                            kind=notifications.KIND_RECEIVED)

        self.dispatcher.publish(
            MailReceived(actor_id=actor_id, entity_id=batch.id,
                         item_ids=tuple(i.id for i in gui))
        )
        return {
            "batch_id": batch.id,
            "notified_items": len(gui),
            "pending_match": len(con_lai),
            "notifications_sent": len(sent),
            "failed": sum(1 for n in sent if n.status == "failed"),
        }

    def send_item(self, item_id: str, *, actor_id: str | None = None) -> MailItem:
        """Gửi ngay một dòng vừa được gán người nhận ở màn hình xuyên lô.

        CR-001 §6.2: HC gán được người nhận thì dòng đó gửi thông báo ngay
        tại chỗ. Mốc SLA tính từ đây, không phải từ lúc lô được gửi lần đầu.
        """
        item = self._get_item(item_id)
        if item.status != MailStatus.PENDING_MATCH:
            raise ConflictError("Dòng này đã được gửi rồi")
        if not item.ready_to_send:
            raise ValidationError("Dòng chưa sẵn sàng gửi — thiếu người nhận hoặc chưa xác nhận")

        self._transition(item, TRIGGER_NOTIFY, MailStatus.NOTIFIED, actor_id=actor_id)
        item.notified_at = utcnow()
        self._refresh_counters(item.batch)
        self._notify([item], renderer=notifications.render_received,
                     kind=notifications.KIND_RECEIVED)
        self.dispatcher.publish(
            MailReceived(actor_id=actor_id, entity_id=item.batch_id, item_ids=(item.id,))
        )
        return item

    def pending_match_items(self) -> list[tuple[MailItem, int, bool]]:
        """Màn hình "Chờ khớp" xuyên lô (CR-001 §6.2, §6.3).

        Trả về `(dòng, số ngày đã chờ, có quá ngưỡng cảnh báo không)`.
        Quá ngưỡng thì đẩy lên đầu — nhưng **không** tự chuyển sang
        `Tồn đọng`: "đã báo nhưng không ai lấy" khác hẳn với "chưa biết báo
        cho ai", gộp hai thứ lại là mất dấu những kiện thực sự bị bỏ quên.
        """
        now = utcnow()
        limit = settings.mail_pending_match_alert_days
        rows = []
        for item in self.repo.list_pending_match():
            waited = (now - (item.received_at or now)).days
            rows.append((item, waited, waited >= limit))
        rows.sort(key=lambda r: -r[1])
        return rows

    def _notify(self, items: Sequence[MailItem], *, renderer, kind: str):
        """Dựng payload rồi giao cho lớp notification gộp theo người."""
        payloads = []
        for item in items:
            employee = self.employees.get(item.employee_id) if item.employee_id else None
            if employee is None:
                logger.warning("Kiện %s không còn người nhận hợp lệ — bỏ qua", item.id)
                continue
            payloads.append(
                NotificationPayload(
                    recipient=self._recipient(employee),
                    entity_type=ENTITY_TYPE,
                    entity_id=item.id,
                    context={
                        "sender": item.sender_raw,
                        "content_type": item.content_type,
                        "quantity": item.quantity,
                        "received_at": item.received_at,
                        "deadline": self._deadline(item),
                    },
                )
            )
        return self.notifier.send_grouped(kind=kind, payloads=payloads, renderer=renderer)

    @staticmethod
    def _recipient(employee: Employee) -> Recipient:
        """Phân giải nhân sự thành người nhận.

        Dùng `employee.email` — **hộp thư thật**, không phải `employee.upn`
        (CR-001 §3.5, D8). Gửi vào UPN thì thư không tới ai nhưng hệ thống
        vẫn báo gửi thành công.

        `platform/notification` cố tình không biết tới bảng nhân sự, nên
        việc này thuộc về module (xem tests/test_architecture.py).
        """
        return Recipient(
            employee_id=employee.id,
            display_name=employee.full_name,
            email=employee.email,
            phone=employee.phone,
        )

    @staticmethod
    def _deadline(item: MailItem):
        """Hạn lấy in trong email (§6.2) — trùng mốc chuyển tồn đọng (§8.3)."""
        if item.notified_at is None:
            return None
        return item.notified_at + timedelta(days=ABANDON_AFTER_DAYS)

    # ------------------------------------------------------------------
    # Xác nhận đã nhận (§7) — CR-001 §9 xác nhận KHÔNG đổi
    # ------------------------------------------------------------------

    def lookup_station(self, phone_last4: str) -> list[StationItem]:
        """Người nhận gõ 4 số cuối tại khu để đơn.

        Bốn số lấy từ `employee.phone_last4` (nguồn HR), không lấy từ file
        lễ tân — nên màn hình này không bị CR-001 chạm tới.
        """
        rows = []
        for item in self.repo.uncollected_by_phone_last4(phone_last4):
            employee = self.employees.get(item.employee_id) if item.employee_id else None
            rows.append(
                StationItem(
                    item_id=item.id,
                    sender=item.sender_raw,
                    content_type=item.content_type,
                    quantity=item.quantity,
                    recipient_name=employee.full_name if employee else "",
                    received_at=item.received_at,
                    status=item.status,
                )
            )
        return rows

    def confirm_collect(
        self,
        item_id: str,
        *,
        handover_method: str = HandoverMethod.SELF_QR_STATION,
        collected_by: str | None = None,
    ) -> MailItem:
        """Ghi nhận đã trao kiện."""
        if handover_method not in HandoverMethod.ALL:
            raise ValidationError(f"Cách xác nhận không hợp lệ: {handover_method!r}")

        item = self._get_item(item_id)
        if item.status == MailStatus.COLLECTED:
            # Bấm hai lần không phải lỗi — không đổi gì và cũng không báo lỗi.
            return item
        if item.status == MailStatus.PENDING_MATCH:
            raise ConflictError("Kiện này chưa được gửi thông báo")

        self._transition(item, TRIGGER_COLLECT, MailStatus.COLLECTED, actor_id=collected_by)
        item.collected_at = utcnow()
        item.collected_by = collected_by or item.employee_id
        item.handover_method = handover_method
        self.db.flush()
        return item

    # ------------------------------------------------------------------
    # Job định kỳ (§8.3)
    # ------------------------------------------------------------------

    def run_reminders(self) -> int:
        """Nhắc lại các kiện đã quá 2 ngày mà chưa ai nhận.

        Gộp theo người như lần gửi đầu (§8.4): ba kiện chưa lấy của cùng
        một người chỉ sinh ra một lời nhắc.
        """
        due = self.engine.find_due(ENTITY_TYPE, action=ACTION_REMIND)
        if not due:
            return 0

        items = [i for i in (self.repo.get_item(d.instance.entity_id) for d in due) if i]
        self._notify(items, renderer=notifications.render_reminder,
                     kind=notifications.KIND_REMINDER)

        for item in due:
            self.engine.mark_fired(item)
        self.dispatcher.publish(MailOverdue(item_ids=tuple(i.id for i in items)))
        self.db.flush()
        return len(items)

    def run_abandonment(self) -> int:
        """Chuyển các kiện quá 5 ngày sang `Tồn đọng`.

        Không gửi gì cho người nhận nữa — mốc này chỉ để HC nắm và xử lý
        (§8.5). Chạy **sau** `run_reminders` trong cùng một lượt: nếu hệ
        thống ngừng vài ngày thì người nhận vẫn nhận được lời nhắc muộn,
        và vì vẫn nhận được đơn sau khi tồn đọng nên lời nhắc đó còn có ích.

        Chỉ chạm tới kiện ở `Đã thông báo`. Dòng ở `Chờ khớp` không bao giờ
        rơi vào đây, dù có nằm bao lâu (CR-001 §6.3).
        """
        due = self.engine.find_due(ENTITY_TYPE, action=ACTION_ABANDON)
        count = 0
        for entry in due:
            item = self.repo.get_item(entry.instance.entity_id)
            if item is None or item.status != MailStatus.NOTIFIED:
                continue
            self._transition(item, TRIGGER_ABANDON, MailStatus.ABANDONED)
            self.engine.mark_fired(entry)
            self.dispatcher.publish(MailAbandoned(entity_id=item.id))
            count += 1
        self.db.flush()
        return count

    # ------------------------------------------------------------------

    def _get_item(self, item_id: str) -> MailItem:
        item = self.repo.get_item(item_id)
        if item is None:
            raise NotFoundError(f"Không có kiện {item_id}")
        return item

    def _transition(
        self, item: MailItem, trigger: str, target: str, *, actor_id: str | None = None
    ) -> None:
        """Chuyển trạng thái qua engine rồi đồng bộ cột `status`.

        Đây là **chỗ duy nhất** được ghi `MailItem.status`. Engine là nguồn
        sự thật; cột `status` chỉ là bản sao để truy vấn và báo cáo khỏi
        phải join sang `workflow_instance`.
        """
        instance = self.engine.fire(ENTITY_TYPE, item.id, trigger, actor_id=actor_id)
        item.status = instance.state
        assert item.status == target, f"engine trả về {instance.state}, mong đợi {target}"
