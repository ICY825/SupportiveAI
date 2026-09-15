from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field


class AuditLogCreate(BaseModel):
    actor_id: Optional[int] = None
    action: str
    entity_type: str
    entity_id: int
    old_state: Optional[str] = None
    new_state: Optional[str] = None
    metadata_payload: Dict[str, Any] = Field(default_factory=dict)


class AuditLogRead(AuditLogCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
