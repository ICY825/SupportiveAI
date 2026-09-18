"""Danh mục nhân sự — dữ liệu nền cho cả 4 phân hệ."""

from app.shared.employee.events import EmployeeDeactivated
from app.shared.employee.models import Employee, EmployeeRole, EmployeeStatus
from app.shared.employee.normalization import normalize_name, normalize_phone, phone_last4
from app.shared.employee.repository import EmployeeRepository
from app.shared.employee.service import EmployeeService

__all__ = [
    "Employee",
    "EmployeeDeactivated",
    "EmployeeRepository",
    "EmployeeRole",
    "EmployeeService",
    "EmployeeStatus",
    "normalize_name",
    "normalize_phone",
    "phone_last4",
]
