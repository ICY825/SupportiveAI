from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.shared.contracts.enums import WorkflowStateEnum


class SLAConfig(BaseModel):
    state: WorkflowStateEnum
    sla_hours: int
    escalation_hours: Optional[int] = None


class WorkflowInstanceBase(BaseModel):
    entity_type: str = Field(..., description="e.g. document, locker, seat, mail")
    entity_id: int = Field(..., description="ID of the associated entity")
    current_state: WorkflowStateEnum = WorkflowStateEnum.CREATED
    sla_deadline: Optional[datetime] = None
    metadata_payload: Dict[str, Any] = Field(default_factory=dict)


class WorkflowInstanceCreate(WorkflowInstanceBase):
    pass


class WorkflowTransitionRequest(BaseModel):
    target_state: WorkflowStateEnum
    actor_id: Optional[int] = None
    comment: Optional[str] = None
    metadata_updates: Optional[Dict[str, Any]] = None


class WorkflowHistoryRead(BaseModel):
    id: int
    workflow_instance_id: int
    from_state: WorkflowStateEnum
    to_state: WorkflowStateEnum
    actor_id: Optional[int] = None
    comment: Optional[str] = None
    metadata_snapshot: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkflowInstanceRead(WorkflowInstanceBase):
    id: int
    is_overdue: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
