from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

try:
    import email_validator  # noqa: F401
    from pydantic import EmailStr
except ImportError:
    EmailStr = str  # type: ignore[misc,assignment]


class EmployeeBase(BaseModel):
    employee_code: str
    full_name: str
    email: EmailStr
    department_id: Optional[int] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    department_id: Optional[int] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class EmployeeRead(EmployeeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
