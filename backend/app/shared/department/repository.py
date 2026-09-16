"""Truy vấn phòng ban."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.shared.department.models import Department
from app.shared.employee.normalization import normalize_name


class DepartmentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, department_id: str) -> Department | None:
        return self.db.get(Department, department_id)

    def get_by_code(self, code: str) -> Department | None:
        return self.db.execute(
            select(Department).where(Department.code == code)
        ).scalar_one_or_none()

    def find_by_name(self, raw_name: str | None) -> Sequence[Department]:
        """Khớp trường "đơn vị" thô từ file lễ tân với danh mục phòng ban.

        mail-tracking.md §4.2 dùng kết quả này làm tín hiệu phụ để thu hẹp
        ứng viên khi tên người trùng nhau.
        """
        normalized = normalize_name(raw_name)
        if not normalized:
            return []
        return self.db.execute(
            select(Department).where(Department.name_normalized == normalized)
        ).scalars().all()

    def list_all(self, *, active_only: bool = True) -> Sequence[Department]:
        stmt = select(Department).order_by(Department.code)
        if active_only:
            stmt = stmt.where(Department.active.is_(True))
        return self.db.execute(stmt).scalars().all()

    def add(self, department: Department) -> Department:
        self.db.add(department)
        self.db.flush()
        return department
