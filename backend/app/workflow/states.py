from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set
from app.shared.contracts.enums import WorkflowStateEnum

# Allowed transitions for generic state machine
ALLOWED_TRANSITIONS: Dict[WorkflowStateEnum, Set[WorkflowStateEnum]] = {
    WorkflowStateEnum.CREATED: {WorkflowStateEnum.ASSIGNED, WorkflowStateEnum.ARCHIVED},
    WorkflowStateEnum.ASSIGNED: {WorkflowStateEnum.PENDING, WorkflowStateEnum.PROCESSING, WorkflowStateEnum.COMPLETED, WorkflowStateEnum.ARCHIVED},
    WorkflowStateEnum.PENDING: {WorkflowStateEnum.PROCESSING, WorkflowStateEnum.OVERDUE, WorkflowStateEnum.COMPLETED, WorkflowStateEnum.ARCHIVED},
    WorkflowStateEnum.PROCESSING: {WorkflowStateEnum.COMPLETED, WorkflowStateEnum.OVERDUE, WorkflowStateEnum.ARCHIVED},
    WorkflowStateEnum.OVERDUE: {WorkflowStateEnum.PROCESSING, WorkflowStateEnum.COMPLETED, WorkflowStateEnum.ARCHIVED},
    WorkflowStateEnum.COMPLETED: {WorkflowStateEnum.CREATED, WorkflowStateEnum.ASSIGNED, WorkflowStateEnum.ARCHIVED},
    WorkflowStateEnum.ARCHIVED: {WorkflowStateEnum.CREATED},
}

# SLA configurations per ADD v2 Section 13
DEFAULT_SLA_HOURS: Dict[WorkflowStateEnum, int] = {
    WorkflowStateEnum.ASSIGNED: 24,
    WorkflowStateEnum.PENDING: 48,
    WorkflowStateEnum.PROCESSING: 72,
}


def calculate_sla_deadline(state: WorkflowStateEnum, from_time: Optional[datetime] = None) -> Optional[datetime]:
    """Calculate deadline based on state SLA definition."""
    hours = DEFAULT_SLA_HOURS.get(state)
    if hours is None:
        return None
    base_time = from_time or datetime.now(timezone.utc)
    return base_time + timedelta(hours=hours)


def is_transition_allowed(current_state: WorkflowStateEnum, target_state: WorkflowStateEnum) -> bool:
    """Check if transition is valid according to state machine rules."""
    allowed = ALLOWED_TRANSITIONS.get(current_state, set())
    return target_state in allowed
