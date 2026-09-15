from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from app.shared.contracts.enums import DomainEventEnum


class DomainEvent(BaseModel):
    event_name: DomainEventEnum
    entity_type: str
    entity_id: int
    actor_id: Optional[int] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
