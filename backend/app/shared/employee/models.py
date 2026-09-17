"""Bảng nhân sự và vai trò.

Danh mục nhân sự là điều kiện tiên quyết của cả 4 phân hệ (README §5.1).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, new_uuid

if TYPE_CHECKING:
    from app.shared.department.models import Department


class EmployeeStatus:
    ACTIVE = "active"
    INACTIVE = "inactive"


class EmailSource:
    """Nguồn gốc của cột `email` (CR-001 §3.5)."""

    CONFIRMED = "confirmed"   # HR xác nhận đây là hộp thư thật
    DERIVED = "derived"       # suy ra từ quy tắc đặt tên, chưa ai kiểm chứng

    ALL = (CONFIRMED, DERIVED)


class Employee(Base, TimestampMixin):
    __tablename__ = "employee"
    __table_args__ = (
        # mail-tracking.md §4.3: mỗi nhân sự dùng một số điện thoại riêng,
        # nên khớp bậc 1 luôn trả về nhiều nhất một ứng viên.
        UniqueConstraint("phone_normalized", name="uq_employee_phone_normalized"),
        Index("ix_employee_name_normalized", "full_name_normalized"),
        Index("ix_employee_phone_last4", "phone_last4"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    employee_code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Các cột *_normalized do service ghi, không nhận từ ngoài — xem
    # normalization.py. Khớp bao giờ cũng chạy trên cột đã chuẩn hóa.
    full_name_normalized: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # `email` là **hộp thư thật sự nhận mail** (CR-001 §3.5, D8), ví dụ
    # v.trungab1@vinsmartfuture.tech — không phải tài khoản đăng nhập AD.
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    # Tài khoản AD (User Principal Name), ví dụ trungab1@vingroup.net. Giữ
    # riêng vì hai chuỗi này khác nhau và gửi nhầm vào UPN thì thư không tới
    # ai, mà hệ thống vẫn báo gửi thành công.
    upn: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # confirmed = HR xác nhận đúng hộp thư; derived = suy ra, chưa kiểm chứng.
    email_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    phone_normalized: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Tách sẵn 4 số cuối cho khớp bậc 2 (mail-tracking.md §4.2) để khỏi
    # quét bảng bằng LIKE '%1234'.
    phone_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)

    department_id: Mapped[str | None] = mapped_column(
        ForeignKey("department.id", ondelete="SET NULL"), nullable=True, index=True
    )
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=EmployeeStatus.ACTIVE)

    # Để nullable vì phần lớn nhân sự chỉ là người nhận thư, không bao giờ
    # đăng nhập vào hệ thống.
    password_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    department: Mapped["Department | None"] = relationship(
        back_populates="employees", foreign_keys=[department_id]
    )
    roles: Mapped[list["EmployeeRole"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def is_active(self) -> bool:
        return self.status == EmployeeStatus.ACTIVE

    @property
    def role_names(self) -> frozenset[str]:
        return frozenset(role.role for role in self.roles)

    def __repr__(self) -> str:
        return f"<Employee {self.employee_code} {self.full_name}>"


class EmployeeRole(Base):
    """Vai trò gán cho nhân sự.

    Lưu vai trò dạng chuỗi, **chưa** ràng vào enum cố định, vì danh sách
    vai trò còn lệch giữa hai tài liệu — xem ghi chú cuối
    `app/core/permissions.py`.
    """

    __tablename__ = "employee_role"
    __table_args__ = (UniqueConstraint("employee_id", "role", name="uq_employee_role"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    employee_id: Mapped[str] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(64), nullable=False)

    employee: Mapped[Employee] = relationship(back_populates="roles")
