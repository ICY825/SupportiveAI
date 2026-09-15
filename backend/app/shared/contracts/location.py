from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class LocationBase(BaseModel):
    building: str
    floor: str
    zone: Optional[str] = None
    name: str
    description: Optional[str] = None


class LocationCreate(LocationBase):
    pass


class LocationRead(LocationBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
