"""Danh mục phòng ban."""

from app.shared.department.models import Department
from app.shared.department.repository import DepartmentRepository
from app.shared.department.service import DepartmentService

__all__ = ["Department", "DepartmentRepository", "DepartmentService"]
