"""DTO cho vị trí vật lý."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LocationCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    building: str | None = None
    floor: str | None = None
    zone: str | None = None
    parent_id: str | None = None


class LocationUpdate(BaseModel):
    name: str | None = None
    building: str | None = None
    floor: str | None = None
    zone: str | None = None
    parent_id: str | None = None
    active: bool | None = None


class LocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    building: str | None
    floor: str | None
    zone: str | None
    parent_id: str | None
    active: bool
