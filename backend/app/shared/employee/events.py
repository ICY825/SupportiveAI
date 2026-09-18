"""Sự kiện do danh mục nhân sự phát ra."""

from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar

from app.platform.events import Event


@dataclass(frozen=True, kw_only=True)
class EmployeeDeactivated(Event):
    """Nhân sự nghỉ việc / ngừng hoạt động.

    Ví dụ điển hình cho cơ chế sự kiện (repository-structure.md §6): cả
    locker và seat đều cần phản ứng (thu hồi tủ, giải phóng chỗ ngồi).
    Không có event thì `shared/employee` phải biết về hai module — sai
    chiều phụ thuộc.
    """

    name: ClassVar[str] = "EMPLOYEE_DEACTIVATED"

    entity_type: str = "employee"
    entity_id: str
    employee_code: str
    department_id: str | None = None
