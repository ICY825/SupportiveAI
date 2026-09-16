"""DTO cho danh mục nhân sự. Tách khỏi model theo README §13."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=1, max_length=32)
    full_name: str = Field(min_length=1, max_length=255)
    email: str | None = None
    phone: str | None = None
    department_id: str | None = None
    job_title: str | None = None
    roles: list[str] = Field(default_factory=list)


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    department_id: str | None = None
    job_title: str | None = None
    status: str | None = None
    roles: list[str] | None = None


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    employee_code: str
    full_name: str
    email: str | None
    phone: str | None
    department_id: str | None
    job_title: str | None
    status: str


class EmployeeBrief(BaseModel):
    """Bản rút gọn cho ô tìm nhân sự ở màn hình soát (mail-tracking.md §5.2)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    employee_code: str
    full_name: str
    department_id: str | None
