"""Logic nghiệp vụ của danh mục phòng ban."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.shared.department.models import Department
from app.shared.department.repository import DepartmentRepository
from app.shared.department.schemas import DepartmentCreate, DepartmentUpdate
from app.shared.employee.normalization import normalize_name


class DepartmentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = DepartmentRepository(db)

    def get(self, department_id: str) -> Department:
        department = self.repo.get(department_id)
        if department is None:
            raise NotFoundError(f"Không có phòng ban {department_id}")
        return department

    def create(self, payload: DepartmentCreate) -> Department:
        if self.repo.get_by_code(payload.code):
            raise ConflictError(f"Mã phòng ban {payload.code} đã tồn tại")
        department = Department(
            code=payload.code.strip(),
            name=payload.name.strip(),
            name_normalized=normalize_name(payload.name),
            parent_id=payload.parent_id,
            manager_employee_id=payload.manager_employee_id,
        )
        return self.repo.add(department)

    def update(self, department_id: str, payload: DepartmentUpdate) -> Department:
        department = self.get(department_id)
        if payload.name is not None:
            department.name = payload.name.strip()
            department.name_normalized = normalize_name(payload.name)
        if payload.parent_id is not None:
            if payload.parent_id == department_id:
                raise ValidationError("Phòng ban không thể là cha của chính nó")
            department.parent_id = payload.parent_id
        if payload.manager_employee_id is not None:
            department.manager_employee_id = payload.manager_employee_id
        if payload.active is not None:
            department.active = payload.active
        self.db.flush()
        return department
