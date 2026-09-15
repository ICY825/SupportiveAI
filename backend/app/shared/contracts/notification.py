from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.shared.contracts.enums import NotificationChannelEnum


class NotificationCreate(BaseModel):
    recipient_id: int
    channel: NotificationChannelEnum
    title: str
    content: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None


class NotificationRead(BaseModel):
    id: int
    recipient_id: int
    channel: NotificationChannelEnum
    title: str
    content: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    is_read: bool = False
    sent_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
