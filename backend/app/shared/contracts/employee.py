from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr


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
