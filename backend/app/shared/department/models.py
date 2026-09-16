"""Bảng phòng ban / khối."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, new_uuid

if TYPE_CHECKING:
    from app.shared.employee.models import Employee


class Department(Base, TimestampMixin):
    __tablename__ = "department"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Dạng chuẩn hóa, để khớp trường "đơn vị" thô trong file lễ tân
    # (mail-tracking.md §4.2 — tín hiệu phụ khi tên trùng).
    name_normalized: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("department.id", ondelete="SET NULL"), nullable=True
    )
    # Dùng khi SLA leo thang "nhắc lần 2, cc quản lý trực tiếp"
    # (mail-tracking.md §8.3).
    manager_employee_id: Mapped[str | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL", use_alter=True, name="fk_department_manager"),
        nullable=True,
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    parent: Mapped["Department | None"] = relationship(
        back_populates="children", remote_side=[id], foreign_keys=[parent_id]
    )
    children: Mapped[list["Department"]] = relationship(
        back_populates="parent", foreign_keys=[parent_id]
    )
    employees: Mapped[list["Employee"]] = relationship(
        back_populates="department", foreign_keys="Employee.department_id"
    )
    manager: Mapped["Employee | None"] = relationship(foreign_keys=[manager_employee_id])

    def __repr__(self) -> str:
        return f"<Department {self.code} {self.name}>"
