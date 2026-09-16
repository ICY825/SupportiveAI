"""Truy vấn danh mục nhân sự.

Các hàm tra cứu ở đây là nguyên liệu thô; việc xếp chúng thành 4 bậc ưu
tiên là logic của `modules/document_flow/mail/matcher.py`, không phải
việc của `shared`.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.shared.employee.models import Employee, EmployeeStatus
from app.shared.employee.normalization import normalize_name, normalize_phone, phone_last4


class EmployeeRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Tra cứu đơn lẻ ---

    def get(self, employee_id: str) -> Employee | None:
        return self.db.get(Employee, employee_id)

    def get_by_code(self, employee_code: str) -> Employee | None:
        return self.db.execute(
            select(Employee).where(Employee.employee_code == employee_code)
        ).scalar_one_or_none()

    def get_by_email(self, email: str) -> Employee | None:
        return self.db.execute(
            select(Employee).where(func.lower(Employee.email) == email.strip().lower())
        ).scalar_one_or_none()

    # --- Tra cứu phục vụ khớp người nhận ---

    def find_by_phone(self, raw_phone: str | None, *, active_only: bool = True) -> Employee | None:
        """Bậc 1: khớp số điện thoại chính xác.

        Trả về nhiều nhất một người vì `phone_normalized` có ràng buộc
        UNIQUE (mail-tracking.md §4.3).
        """
        normalized = normalize_phone(raw_phone)
        if not normalized:
            return None
        stmt = select(Employee).where(Employee.phone_normalized == normalized)
        if active_only:
            stmt = stmt.where(Employee.status == EmployeeStatus.ACTIVE)
        return self.db.execute(stmt).scalar_one_or_none()

    def find_by_phone_last4(
        self, raw_phone: str | None, *, active_only: bool = True
    ) -> Sequence[Employee]:
        """Bậc 2 (phần số): các nhân sự trùng 4 số cuối."""
        last4 = phone_last4(raw_phone)
        if not last4:
            return []
        stmt = select(Employee).where(Employee.phone_last4 == last4)
        if active_only:
            stmt = stmt.where(Employee.status == EmployeeStatus.ACTIVE)
        return self.db.execute(stmt).scalars().all()

    def find_by_name(self, raw_name: str | None, *, active_only: bool = True) -> Sequence[Employee]:
        """Bậc 3: khớp tên đã chuẩn hóa. Có thể trả về nhiều ứng viên."""
        normalized = normalize_name(raw_name)
        if not normalized:
            return []
        stmt = select(Employee).where(Employee.full_name_normalized == normalized)
        if active_only:
            stmt = stmt.where(Employee.status == EmployeeStatus.ACTIVE)
        return self.db.execute(stmt).scalars().all()

    def search(
        self, term: str, *, limit: int = 20, active_only: bool = True
    ) -> Sequence[Employee]:
        """Gợi ý cho ô tìm nhân sự ở màn hình soát (mail-tracking.md §5.2)."""
        cleaned = (term or "").strip()
        if not cleaned:
            return []
        name_pattern = f"%{normalize_name(cleaned)}%"
        code_pattern = f"{cleaned.upper()}%"
        stmt = (
            select(Employee)
            .where(
                or_(
                    Employee.full_name_normalized.like(name_pattern),
                    func.upper(Employee.employee_code).like(code_pattern),
                )
            )
            .order_by(Employee.full_name)
            .limit(limit)
        )
        if active_only:
            stmt = stmt.where(Employee.status == EmployeeStatus.ACTIVE)
        return self.db.execute(stmt).scalars().all()

    # --- Ghi ---

    def add(self, employee: Employee) -> Employee:
        self.db.add(employee)
        self.db.flush()
        return employee

    def list_by_department(
        self, department_id: str, *, active_only: bool = True
    ) -> Sequence[Employee]:
        stmt = select(Employee).where(Employee.department_id == department_id)
        if active_only:
            stmt = stmt.where(Employee.status == EmployeeStatus.ACTIVE)
        return self.db.execute(stmt).scalars().all()
