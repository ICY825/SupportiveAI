"""API đăng nhập và tra cứu nhân sự."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.shared.employee.dependencies import CurrentEmployee, DbSession
from app.shared.employee.repository import EmployeeRepository
from app.shared.employee.schemas import EmployeeBrief, EmployeeRead
from app.shared.employee.service import EmployeeService
from app.core.security import create_access_token

router = APIRouter(tags=["shared"])


class LoginRequest(BaseModel):
    employee_code: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    employee: EmployeeRead


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: DbSession) -> LoginResponse:
    employee = EmployeeService(db).authenticate(payload.employee_code, payload.password)
    token = create_access_token(employee.id, roles=sorted(employee.role_names))
    return LoginResponse(access_token=token, employee=EmployeeRead.model_validate(employee))


@router.get("/me", response_model=EmployeeRead)
def me(employee: CurrentEmployee) -> EmployeeRead:
    return EmployeeRead.model_validate(employee)


@router.get("/employees/search", response_model=list[EmployeeBrief])
def search_employees(q: str, db: DbSession, _: CurrentEmployee, limit: int = 20) -> list[EmployeeBrief]:
    """Gợi ý nhân sự cho ô tìm ở màn hình soát (mail-tracking.md §5.2)."""
    found = EmployeeRepository(db).search(q, limit=limit)
    return [EmployeeBrief.model_validate(item) for item in found]
