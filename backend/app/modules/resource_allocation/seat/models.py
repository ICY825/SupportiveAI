"""Bảng gán chỗ ngồi.

Chỉ có **một** bảng, và nó không giữ hình học. Issue #2 mục 2 chốt: dataset
sinh từ bản vẽ là nguồn thật cho bàn, phòng và vật cản; DB chỉ giữ việc ai
ngồi đâu, từ lúc nào. Nhờ vậy chạy lại bộ trích xuất khi có bản vẽ mới không
kéo theo migration dữ liệu.

`workstation_id` vì thế **không có khóa ngoại** — bảng nó trỏ tới nằm trong
file JSON, không nằm trong DB. Đó là cái giá của quyết định trên, và là lý do
có hai thứ:

1. `layout_version` — hash của PDF nguồn lúc gán. Bản vẽ mới đổi hash, nên
   một lệnh đối chiếu so được ngay bản ghi nào đang trỏ vào hư không.
2. Kiểm tra ở tầng service (`common/floor_catalog.py`) trước mọi lần ghi.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UtcDateTime, new_uuid
from app.shared.employee.models import Employee


class SeatDecision:
    """Người dùng đã làm gì với đề xuất của hệ thống (README §11).

    Ba chuỗi này dùng chung cho cả bốn đề bài, chốt ở Issue #2 mục 5. Chúng
    là mẫu số để tính tỷ lệ tự động hóa ở Tuần 6, nên đừng đặt thêm giá trị
    thứ tư mà không sửa cả bốn phân hệ.
    """

    ACCEPT = "accept"      # nhận nguyên đề xuất của hệ thống
    OVERRIDE = "override"  # có đề xuất, người dùng sửa
    MANUAL = "manual"      # không có đề xuất, người dùng tự làm từ đầu

    ALL = (ACCEPT, OVERRIDE, MANUAL)


class SeatAssignment(Base, TimestampMixin):
    """Một kỳ hạn ngồi: ai, chỗ nào, từ bao giờ tới bao giờ.

    `released_at IS NULL` nghĩa là đang hiệu lực — ngữ nghĩa dùng chung với
    tủ locker, xem `resource_allocation/common/assignment.py`.
    """

    __tablename__ = "seat_assignment"
    __table_args__ = (
        Index("ix_seat_assignment_workstation", "floor_id", "workstation_id"),
        Index("ix_seat_assignment_employee", "employee_id"),
        # Một chỗ ngồi chỉ có một người đang ngồi, và một người chỉ ngồi một
        # chỗ. Ràng buộc từng phần: chỉ áp lên các dòng còn hiệu lực, vì lịch
        # sử thì được phép trùng bao nhiêu lần cũng được.
        Index(
            "uq_seat_assignment_active_seat",
            "floor_id",
            "workstation_id",
            unique=True,
            sqlite_where=text("released_at IS NULL"),
            postgresql_where=text("released_at IS NULL"),
        ),
        Index(
            "uq_seat_assignment_active_employee",
            "employee_id",
            unique=True,
            sqlite_where=text("released_at IS NULL"),
            postgresql_where=text("released_at IS NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)

    # --- Chỗ ngồi, theo dataset chứ không theo DB ---
    floor_id: Mapped[str] = mapped_column(String(32), nullable=False)
    #: `id` của workstation trong bản vẽ, ví dụ `ws-16-001`. Không phải mã
    #: hiển thị `F16-D-367` — mã đó suy ra từ thứ tự khu vực.
    workstation_id: Mapped[str] = mapped_column(String(64), nullable=False)
    #: sha256 của PDF nguồn lúc gán — xem ghi chú đầu file.
    layout_version: Mapped[str] = mapped_column(String(64), nullable=False)

    # --- Người ---
    employee_id: Mapped[str] = mapped_column(
        ForeignKey("employee.id", ondelete="RESTRICT"), nullable=False
    )

    # --- Kỳ hạn ---
    assigned_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)

    # --- Vết để đo KPI ---
    #: Người bấm nút. Để trống khi do job hoặc nhập liệu hàng loạt tạo ra.
    assigned_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    #: accept / override / manual — xem `SeatDecision`.
    decision: Mapped[str] = mapped_column(String(16), nullable=False, default=SeatDecision.MANUAL)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    employee: Mapped[Employee] = relationship(lazy="joined")

    @property
    def is_active(self) -> bool:
        return self.released_at is None

    def __repr__(self) -> str:
        state = "đang ngồi" if self.is_active else "đã thu hồi"
        return f"<SeatAssignment {self.workstation_id} {self.employee_id} {state}>"
