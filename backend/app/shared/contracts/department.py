from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr


class DepartmentBase(BaseModel):
    code: str
    name: str
    parent_id: Optional[int] = None
    description: Optional[str] = None


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentRead(DepartmentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
