"""Dependency dùng chung cho tầng API.

Đặt ở `shared/employee` vì đây là nơi giữ danh tính người dùng; module
nghiệp vụ import từ đây (chiều `modules → shared` hợp lệ).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import AuthenticationError
from app.core.permissions import Principal
from app.core.security import decode_access_token
from app.shared.employee.models import Employee
from app.shared.employee.service import EmployeeService

bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_employee(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> Employee:
    if credentials is None:
        raise AuthenticationError("Thiếu token")
    payload = decode_access_token(credentials.credentials)
    employee = EmployeeService(db).get(payload["sub"])
    if not employee.is_active:
        raise AuthenticationError("Tài khoản đã ngừng hoạt động")
    return employee


CurrentEmployee = Annotated[Employee, Depends(get_current_employee)]


def get_current_principal(employee: CurrentEmployee) -> Principal:
    return Principal(
        employee_id=employee.id,
        roles=employee.role_names,
        department_id=employee.department_id,
    )


CurrentPrincipal = Annotated[Principal, Depends(get_current_principal)]
