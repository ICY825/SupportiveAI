from typing import Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.exceptions import EntityNotFoundError
from app.core.security import CurrentUser, get_current_user
from app.shared.contracts.enums import WorkflowStateEnum
from app.shared.contracts.workflow import (
    WorkflowHistoryRead,
    WorkflowInstanceRead,
    WorkflowTransitionRequest,
)
from app.shared.models.workflow import WorkflowInstance
from app.workflow.engine import WorkflowEngine

router = APIRouter(tags=["Shared Workflow Engine"])


def _to_wf_read(wf: WorkflowInstance) -> WorkflowInstanceRead:
    return WorkflowInstanceRead(
        id=wf.id,
        entity_type=wf.entity_type,
        entity_id=wf.entity_id,
        current_state=WorkflowStateEnum(wf.current_state),
        sla_deadline=wf.sla_deadline,
        metadata_payload=wf.metadata_payload,
        is_overdue=bool(wf.current_state == WorkflowStateEnum.OVERDUE.value),
        created_at=wf.created_at,
        updated_at=wf.updated_at,
    )


@router.get("/workflow/{id}", response_model=WorkflowInstanceRead)
async def get_workflow(
    id: int,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Retrieve workflow instance and status."""
    engine = WorkflowEngine(db)
    wf = await engine.get_instance(id)
    if not wf:
        raise EntityNotFoundError("WorkflowInstance", id)
    return _to_wf_read(wf)


@router.get("/workflow/entity/{entity_type}/{entity_id}", response_model=WorkflowInstanceRead)
async def get_workflow_by_entity(
    entity_type: str,
    entity_id: int,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Get active workflow for a specific entity (e.g. document, locker, seat)."""
    engine = WorkflowEngine(db)
    wf = await engine.get_instance_by_entity(entity_type, entity_id)
    if not wf:
        raise EntityNotFoundError(f"Workflow for {entity_type}", entity_id)
    return _to_wf_read(wf)


@router.post("/workflow/{id}/transition", response_model=WorkflowInstanceRead)
async def transition_workflow(
    id: int,
    req: WorkflowTransitionRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Transition workflow instance to next valid state with SLA and audit logging."""
    engine = WorkflowEngine(db)
    wf = await engine.transition(
        instance_id=id,
        target_state=req.target_state,
        actor_id=current_user.user_id,
        comment=req.comment,
        metadata_updates=req.metadata_updates,
    )
    return _to_wf_read(wf)
