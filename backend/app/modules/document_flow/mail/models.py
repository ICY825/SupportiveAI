"""Bảng của phân hệ chuyển phát nhanh (Đề 3).

Theo mail-tracking.md §10, đã cập nhật theo CR-001 cho file mẫu thật từ
lễ tân: file **không có** mã vận đơn, số điện thoại hay phòng ban, nên
khóa khớp và khóa khử trùng lặp đều đổi (CR-001 §2, D1–D3).
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UtcDateTime, new_uuid


class MailStatus:
    """Tập trạng thái của một kiện (§8.1).

    Đây là **bản sao đọc nhanh** của `workflow_instance.state`. Nguồn sự
    thật là workflow engine — chỉ `MailService` được ghi cột `status`, và
    luôn ghi ngay sau khi engine chuyển trạng thái thành công.

    CR-001 §9 chốt: **không thêm trạng thái mới.** Riêng `Chờ khớp` bây giờ
    có thể tồn tại lâu sau khi lô đã gửi (gửi một phần, §6) — nhưng đó là
    hệ quả của luồng, không phải trạng thái khác.
    """

    PENDING_MATCH = "pending_match"   # Chờ khớp — chưa xác định được người nhận
    NOTIFIED = "notified"             # Đã thông báo, chờ người xuống lấy
    COLLECTED = "collected"           # Đã nhận
    ABANDONED = "abandoned"           # Tồn đọng — 5 ngày không ai lấy

    ALL = (PENDING_MATCH, NOTIFIED, COLLECTED, ABANDONED)


class MatchMethod:
    """Bậc khớp người nhận (CR-001 §4.2). Lưu lại để tính KPI (§8.2)."""

    # Bậc 0 — chỉ chạy khi file có cột số điện thoại. File hiện tại không
    # có, nhưng nhánh vẫn nằm trong mã và bật bằng `MAIL_MATCH_BY_PHONE`
    # khi lễ tân thêm cột (D7). Xóa đi là mất công viết lại.
    PHONE = "phone"
    ALIAS = "alias"              # Bậc 1 — chuỗi tên thô đã có trong matching_alias
    NAME_EXACT = "name_exact"    # Bậc 2/3 — tên chuẩn hóa khớp chính xác
    NAME_FUZZY = "name_fuzzy"    # Bậc 4/5 — khớp gần đúng sau khi bỏ dấu
    MANUAL = "manual"            # HC tự chọn ở màn hình soát
    NONE = "none"                # Bậc 6 — không ra ứng viên nào

    ALL = (PHONE, ALIAS, NAME_EXACT, NAME_FUZZY, MANUAL, NONE)
    # Các bậc máy tự khớp — mẫu số của KPI "tỷ lệ khớp tự động" (§8.2).
    AUTOMATIC = (PHONE, ALIAS, NAME_EXACT, NAME_FUZZY)


class MatchTier:
    """Mức chắc chắn của kết quả khớp — quyết định cách hiển thị và gửi.

    Tách khỏi `match_method` có chủ đích: cùng một `name_exact` có thể là
    `confirmed` (ra đúng một người) hoặc `choose` (ra nhiều người trùng
    tên). Cái quyết định "được gửi hay không" là tier, không phải method.
    """

    CONFIRMED = "confirmed"   # Điền sẵn, gửi được ngay
    REVIEW = "review"         # Điền sẵn nhưng HC phải bấm xác nhận mới gửi
    CHOOSE = "choose"         # Để trống, HC phải chọn

    ALL = (CONFIRMED, REVIEW, CHOOSE)


class HandoverMethod:
    """Nguồn xác nhận đã nhận (§7.4)."""

    SELF_QR_STATION = "self_qr_station"   # Quét QR tại khu để đơn — đường chính
    SELF_LINK = "self_link"               # Bấm link trong email — đường phụ
    HC_RECONCILED = "hc_reconciled"       # HC đối chiếu tờ ký giấy

    ALL = (SELF_QR_STATION, SELF_LINK, HC_RECONCILED)


class BatchStatus:
    REVIEWING = "reviewing"   # Đã đọc file, đang chờ HC soát
    SENT = "sent"             # HC đã bấm gửi ít nhất một lần (CR-001 §6.1)


class MailBatch(Base, TimestampMixin):
    """Một lần HC tải file danh sách lên.

    Từ CR-001 §6 (D5) một lô **gửi được nhiều đợt**: dòng chưa khớp được
    nằm lại ở `Chờ khớp` mà không chặn các dòng còn lại.
    """

    __tablename__ = "mail_batch"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(
        ForeignKey("employee.id", ondelete="RESTRICT"), nullable=False
    )
    uploaded_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)

    # Ngày nhận của các dòng trong lô. Dùng để phát hiện lễ tân tải lại
    # file của cùng một ngày (CR-001 §5.3). NULL khi các dòng lệch ngày nhau.
    receipt_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    matched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pending_match_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_suspect_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Ngày trong file mơ hồ (`09/17/26` đọc được cả hai cách) — không đoán,
    # bắt HC xác nhận ở màn hình soát (CR-001 §3.4).
    ambiguous_date: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default=BatchStatus.REVIEWING)
    # Thời điểm **lần gửi đầu tiên**, không phải lúc gửi hết lô (CR-001 §3.2).
    # Mốc SLA của từng kiện tính từ `notified_at` của chính nó, không từ đây.
    sent_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)

    items: Mapped[list[MailItem]] = relationship(
        back_populates="batch", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<MailBatch {self.source_filename} rows={self.row_count}>"


class MailItem(Base, TimestampMixin):
    """Một dòng trong file lễ tân.

    Lưu ý **một dòng không phải một kiện**: lễ tân gộp nhiều kiện cùng
    nguồn trong cùng ngày vào một dòng rồi ghi `quantity`. Mọi con số báo
    cáo phải nói rõ đang đếm dòng hay đếm kiện (CR-001 §7.1).
    """

    __tablename__ = "mail_item"
    __table_args__ = (
        # CR-001 §5.2: **không** UNIQUE. Khóa tổ hợp chỉ đủ tin để cảnh
        # báo mềm; ràng buộc cứng sẽ âm thầm nuốt kiện thật.
        Index("ix_mail_item_dedup_key", "dedup_key"),
        # Phục vụ xếp hạng ứng viên theo lịch sử người gửi (CR-001 §4.3).
        Index("ix_mail_item_sender", "sender_normalized"),
        Index("ix_mail_item_recipient_name", "recipient_name_normalized"),
        Index("ix_mail_item_status", "status"),
        Index("ix_mail_item_employee", "employee_id"),
        Index("ix_mail_item_batch", "batch_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    batch_id: Mapped[str] = mapped_column(
        ForeignKey("mail_batch.id", ondelete="CASCADE"), nullable=False
    )
    # Cột `stt` trong file — để truy ngược về đúng dòng gốc khi có khiếu nại.
    row_index: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # --- Dữ liệu thô từ file lễ tân ---
    # Giữ nguyên bên cạnh `employee_id` đã khớp: khi có sai sót cần truy
    # lại thì phải biết file gốc ghi gì (§10.2).
    sender_raw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sender_normalized: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_name_raw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_name_normalized: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # ⚠️ Luôn NULL với định dạng file hiện nay. Giữ cột lại cho D7: khi lễ
    # tân thêm cột số điện thoại thì chỉ cần bật `MAIL_MATCH_BY_PHONE`.
    recipient_phone_raw: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # --- Kết quả khớp ---
    employee_id: Mapped[str | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL"), nullable=True
    )
    match_method: Mapped[str] = mapped_column(String(16), nullable=False, default=MatchMethod.NONE)
    match_tier: Mapped[str] = mapped_column(String(16), nullable=False, default=MatchTier.CHOOSE)
    match_confidence: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)
    # Bậc `review` điền sẵn ứng viên nhưng chỉ gửi sau khi HC bấm xác nhận
    # (CR-001 §4.2, §6.1).
    review_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # --- Khử trùng lặp mềm (CR-001 §5) ---
    dedup_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # True = nghi trùng với một dòng thuộc lô đã gửi. Mặc định **không gửi**,
    # nhưng dòng vẫn nằm trong DB để HC bấm giữ lại được.
    duplicate_suspect: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    duplicate_of_id: Mapped[str | None] = mapped_column(
        ForeignKey("mail_item.id", ondelete="SET NULL"), nullable=True
    )

    # --- Mốc thời gian ---
    received_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    notified_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    collected_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)

    collected_by: Mapped[str | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL"), nullable=True
    )
    handover_method: Mapped[str | None] = mapped_column(String(20), nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=MailStatus.PENDING_MATCH
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    batch: Mapped[MailBatch] = relationship(back_populates="items")
    duplicate_of: Mapped[MailItem | None] = relationship(remote_side=[id])

    @property
    def receipt_date(self) -> date | None:
        """Ngày nhận, phần dùng làm khóa khử trùng lặp (CR-001 §5.1)."""
        return self.received_at.date() if self.received_at else None

    @property
    def needs_review(self) -> bool:
        """Dòng HC phải động tay vào trước khi gửi (CR-001 §4.2)."""
        return self.match_tier != MatchTier.CONFIRMED

    @property
    def ready_to_send(self) -> bool:
        """Đủ điều kiện đi trong đợt gửi tiếp theo (CR-001 §6.1).

        Ba điều kiện, thiếu một là không gửi: có người nhận, mức chắc chắn
        đạt yêu cầu, và không phải dòng nghi trùng chưa được HC duyệt.
        """
        if self.employee_id is None or self.status != MailStatus.PENDING_MATCH:
            return False
        if self.duplicate_suspect:
            return False
        if self.match_tier == MatchTier.CONFIRMED:
            return True
        # `manual` và `review` đều phải qua tay HC; `assign_recipient` đặt
        # `review_confirmed` cho cả hai.
        return self.review_confirmed

    def __repr__(self) -> str:
        return f"<MailItem #{self.row_index} {self.recipient_name_raw!r} status={self.status}>"


class MatchingAlias(Base, TimestampMixin):
    """Chuỗi tên thô trên phong bì → nhân sự, học từ lần HC chọn (CR-001 §3.3).

    Đây là **cơ chế khớp chính** sau khi mất khóa số điện thoại (D3), không
    phải tính năng phụ. Tên trên phong bì viết không chuẩn — thiếu họ, viết
    tắt, hoa thường lẫn lộn — nên không quy tắc nào khớp được lần đầu; cái
    khớp được là trí nhớ về lần HC đã chọn.

    Hệ quả cho báo cáo: tỷ lệ khớp tự động **tăng dần theo tuần**. Báo một
    con số trung bình cả kỳ sẽ làm hệ thống trông tệ hơn thực lực (§8.2).
    """

    __tablename__ = "matching_alias"
    __table_args__ = (
        UniqueConstraint("raw_name_normalized", name="uq_matching_alias_raw_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    raw_name_normalized: Mapped[str] = mapped_column(String(255), nullable=False)
    employee_id: Mapped[str] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL"), nullable=True
    )
    last_used_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<MatchingAlias {self.raw_name_normalized!r} → {self.employee_id}>"


class MatchFeedback(Base, TimestampMixin):
    """Mỗi lần HC sửa hoặc chọn người nhận (CR-001 §8.1).

    Hai công dụng, công dụng thứ hai mới là lý do chính:

    1. Mẫu số để tính độ chính xác của máy.
    2. **Căn cứ bằng số để đi đòi lễ tân thêm cột số điện thoại** sau 1–2
       tuần chạy thật. "HC phải chọn tay X% số dòng, mất Y phút mỗi ngày"
       thuyết phục hơn nhiều so với đề nghị trước khi chạy.
    """

    __tablename__ = "mail_match_feedback"
    __table_args__ = (Index("ix_mail_feedback_batch", "batch_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    mail_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("mail_item.id", ondelete="SET NULL"), nullable=True
    )
    batch_id: Mapped[str | None] = mapped_column(
        ForeignKey("mail_batch.id", ondelete="SET NULL"), nullable=True
    )

    suggested_employee_id: Mapped[str | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL"), nullable=True
    )
    chosen_employee_id: Mapped[str | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL"), nullable=True
    )
    match_method_before: Mapped[str | None] = mapped_column(String(16), nullable=True)
    match_tier_before: Mapped[str | None] = mapped_column(String(16), nullable=True)
    raw_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sender_raw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL"), nullable=True
    )

    @property
    def machine_was_right(self) -> bool:
        """Máy đề xuất đúng người HC cuối cùng chọn."""
        return (
            self.suggested_employee_id is not None
            and self.suggested_employee_id == self.chosen_employee_id
        )

    def __repr__(self) -> str:
        return f"<MatchFeedback {self.raw_name!r} → {self.chosen_employee_id}>"
