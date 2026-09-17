"""DTO vào/ra của phân hệ chuyển phát nhanh.

Tách khỏi model theo README §13. Đồng bộ với CR-001 §3 (mô hình dữ liệu
mới) và §7 (yêu cầu chi tiết của màn hình soát).
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class MailRow(BaseModel):
    """Một dòng đọc được từ file lễ tân, trước khi khớp người nhận.

    Ranh giới giữa `importer.py` và phần còn lại của phân hệ: importer chỉ
    cần dựng ra danh sách `MailRow`, mọi thứ phía sau không phụ thuộc định
    dạng file.

    Sáu trường đúng bằng sáu cột của file mẫu thật (CR-001 §1), cộng thêm
    `recipient_phone` luôn `None` với định dạng hiện nay — giữ cho D7.
    """

    row_index: int | None = None
    sender: str | None = None
    recipient_name: str | None = None
    recipient_phone: str | None = None
    quantity: int = Field(default=1, ge=1)
    content_type: str | None = None
    # Ngày, không phải datetime: file lễ tân chỉ ghi ngày, không ghi giờ.
    received_on: date | None = None


class MatchCandidateRead(BaseModel):
    employee_id: str
    employee_code: str
    full_name: str
    department_id: str | None
    score: float
    # Số lần người này đã nhận hàng từ cùng người gửi — lý do họ đứng đầu
    # danh sách (CR-001 §4.3). Hiện ra để HC hiểu vì sao máy xếp như vậy.
    sender_history: int = 0


class DuplicateReference(BaseModel):
    """Dòng cũ mà dòng hiện tại bị nghi trùng với (CR-001 §5.2).

    Đủ để HC quyết định giữ hay bỏ mà không phải đi tra lô cũ.
    """

    item_id: str
    batch_id: str
    receipt_date: date | None
    quantity: int
    sent_at: datetime | None


class MailItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    batch_id: str
    row_index: int | None
    sender_raw: str | None
    recipient_name_raw: str | None
    recipient_phone_raw: str | None
    quantity: int
    content_type: str | None
    employee_id: str | None
    match_method: str
    match_tier: str
    match_confidence: float | None
    review_confirmed: bool
    duplicate_suspect: bool
    status: str
    received_at: datetime | None
    notified_at: datetime | None
    collected_at: datetime | None
    handover_method: str | None
    note: str | None


class MailItemReview(MailItemRead):
    """Một dòng trên màn hình soát (CR-001 §7.2).

    §6 chốt hiện **toàn bộ** dòng chứ không chỉ dòng có vấn đề — HC cần
    nhìn được cả lô để biết cái gì sắp gửi đi.
    """

    needs_review: bool
    ready_to_send: bool
    missing_email: bool = False
    duplicate_of: DuplicateReference | None = None
    candidates: list[MatchCandidateRead] = Field(default_factory=list)


class BatchSummary(BaseModel):
    """Phần tổng quan đầu màn hình soát (CR-001 §7.1).

    Đếm **cả dòng và kiện**: lễ tân gộp nhiều kiện cùng nguồn vào một dòng
    rồi ghi `số lượng`, nên hai con số này khác nhau và báo nhầm là HC
    tưởng thiếu hàng.
    """

    total_rows: int
    total_parcels: int
    confirmed: int
    review: int
    choose: int
    duplicate_suspect: int
    pending_match: int
    sent: int = 0
    # Khớp được người nhận nhưng người đó không có email — gửi sẽ không
    # tới nơi. Không chặn gửi, nhưng phải hiện rõ để HC biết mà xử lý.
    missing_email: int = 0
    # Ngày trong file mơ hồ, HC phải xác nhận (CR-001 §3.4).
    ambiguous_date: bool = False

    @property
    def ready_to_send(self) -> int:
        """Số dòng đi được ngay trong đợt gửi tới.

        CR-001 §7.3: nút gửi **luôn bật** khi con số này > 0 — không chặn
        cả lô vì một dòng chưa rõ.
        """
        return self.confirmed


class SameDateBatch(BaseModel):
    """Lô đã có cho cùng ngày nhận (CR-001 §5.3)."""

    batch_id: str
    source_filename: str
    uploaded_at: datetime
    row_count: int


class MailBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_filename: str
    uploaded_by: str
    uploaded_at: datetime
    receipt_date: date | None
    row_count: int
    matched_count: int
    sent_count: int
    pending_match_count: int
    duplicate_suspect_count: int
    ambiguous_date: bool
    status: str
    sent_at: datetime | None


class MailBatchDetail(MailBatchRead):
    summary: BatchSummary
    items: list[MailItemReview] = Field(default_factory=list)
    # Cảnh báo ở đầu màn hình soát: "Đã có lô cho ngày này, tải lên lúc…".
    same_date_batches: list[SameDateBatch] = Field(default_factory=list)


class AssignRecipient(BaseModel):
    """HC chọn hoặc sửa người nhận của một dòng ở màn hình soát.

    `apply_to_batch` mặc định bật theo CR-001 §4.4: chọn một lần thì mọi
    dòng cùng tên trong lô được áp theo. Tắt đi khi hai người thật sự khác
    nhau lại viết trùng tên trên phong bì.
    """

    employee_id: str | None = None
    note: str | None = None
    apply_to_batch: bool = True


class ConfirmReview(BaseModel):
    """HC bấm xác nhận nhanh cho dòng ở mức `review` (CR-001 §7.2)."""

    confirmed: bool = True


class KeepDuplicate(BaseModel):
    """HC giữ lại một dòng bị nghi trùng (CR-001 §5.2).

    Mặc định dòng nghi trùng bị bỏ qua, nhưng phải bấm giữ lại được: âm
    thầm nuốt dữ liệu là kiểu hỏng tệ nhất — không ai phát hiện ra, và
    người nhận không bao giờ biết mình có kiện.
    """

    keep: bool = True


class ImportResult(BaseModel):
    batch_id: str
    row_count: int
    matched_count: int
    summary: BatchSummary
    same_date_batches: list[SameDateBatch] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SendResult(BaseModel):
    """Kết quả một đợt gửi (CR-001 §6.1).

    Endpoint gọi lại được nhiều lần, nên các con số này là **của đợt vừa
    rồi**, không phải của cả lô.
    """

    batch_id: str
    notified_items: int
    pending_match: int
    notifications_sent: int   # nhỏ hơn notified_items vì gộp theo người (§6.1)
    failed: int


class PendingMatchItem(MailItemRead):
    """Một dòng trên màn hình "Chờ khớp" xuyên lô (CR-001 §6.2)."""

    batch_filename: str
    waiting_days: int
    # Quá ngưỡng `MAIL_PENDING_MATCH_ALERT_DAYS` thì đẩy lên đầu và cảnh
    # báo trên bảng điều khiển HC (§6.3). Không tự chuyển sang `Tồn đọng`:
    # "đã báo nhưng không ai lấy" khác hẳn "chưa biết báo cho ai".
    overdue: bool = False
    candidates: list[MatchCandidateRead] = Field(default_factory=list)


class StationLookup(BaseModel):
    """Người nhận gõ 4 số cuối tại khu để đơn (§7.2).

    Bốn số này lấy từ `employee.phone_last4` (nguồn HR), **không** từ file
    lễ tân — nên CR-001 không đụng tới màn hình này (§9).
    """

    phone_last4: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class StationItem(BaseModel):
    """Một dòng hiện ra sau khi tra — đủ để người dùng nhận ra kiện của mình."""

    item_id: str
    sender: str | None
    content_type: str | None
    quantity: int
    recipient_name: str
    received_at: datetime | None
    status: str


class CollectRequest(BaseModel):
    handover_method: str
