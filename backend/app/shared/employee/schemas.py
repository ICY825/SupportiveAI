"""DTO cho danh mục nhân sự. Tách khỏi model theo README §13."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=1, max_length=32)
    full_name: str = Field(min_length=1, max_length=255)
    # Hộp thư thật, không phải tài khoản AD — xem `upn` (CR-001 §3.5).
    email: str | None = None
    upn: str | None = None
    email_source: str | None = None
    phone: str | None = None
    department_id: str | None = None
    job_title: str | None = None
    roles: list[str] = Field(default_factory=list)


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    upn: str | None = None
    email_source: str | None = None
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
    upn: str | None = None
    email_source: str | None = None
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


class EmployeeWithWarnings(BaseModel):
    """Nhân sự kèm cảnh báo chất lượng dữ liệu khi nhập danh mục (CR-001 §3.5).

    Cảnh báo **không chặn** việc ghi: HR vẫn nhập được, nhưng màn hình nhập
    phải hiện rõ để không ai lỡ tay lấy nhầm cột tài khoản AD sang cột email.
    """

    employee: EmployeeRead
    warnings: list[str] = Field(default_factory=list)
