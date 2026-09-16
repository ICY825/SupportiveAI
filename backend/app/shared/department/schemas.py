"""DTO cho phòng ban."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)
    parent_id: str | None = None
    manager_employee_id: str | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = None
    parent_id: str | None = None
    manager_employee_id: str | None = None
    active: bool | None = None


class DepartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    parent_id: str | None
    manager_employee_id: str | None
    active: bool
