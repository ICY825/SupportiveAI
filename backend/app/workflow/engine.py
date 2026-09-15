from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import EntityNotFoundError, WorkflowTransitionError
from app.shared.contracts.enums import DomainEventEnum, WorkflowStateEnum
from app.shared.contracts.event import DomainEvent
from app.shared.events.dispatcher import event_dispatcher
from app.shared.models.audit import AuditLog
from app.shared.models.workflow import WorkflowHistory, WorkflowInstance
from app.workflow.states import calculate_sla_deadline, is_transition_allowed


class WorkflowEngine:
    """Shared generic workflow engine used by all modules."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_instance(
        self,
        entity_type: str,
        entity_id: int,
        initial_state: WorkflowStateEnum = WorkflowStateEnum.CREATED,
        actor_id: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> WorkflowInstance:
        """Create a new workflow instance for an entity."""
        deadline = calculate_sla_deadline(initial_state)
        metadata_payload = metadata or {}

        instance = WorkflowInstance(
            entity_type=entity_type,
            entity_id=entity_id,
            current_state=initial_state.value,
            sla_deadline=deadline,
            metadata_payload=metadata_payload,
        )
        self.session.add(instance)
        await self.session.flush()

        # Initial history record
        history = WorkflowHistory(
            workflow_instance_id=instance.id,
            from_state="None",
            to_state=initial_state.value,
            actor_id=actor_id,
            comment="Workflow instance initialized",
            metadata_snapshot=metadata_payload,
            created_at=datetime.now(timezone.utc),
        )
        self.session.add(history)

        # Audit log
        audit = AuditLog(
            actor_id=actor_id,
            action="WORKFLOW_CREATED",
            entity_type=entity_type,
            entity_id=entity_id,
            old_state=None,
            new_state=initial_state.value,
            metadata_payload=metadata_payload,
        )
        self.session.add(audit)
        await self.session.flush()

        return instance

    async def get_instance(self, instance_id: int) -> Optional[WorkflowInstance]:
        """Fetch a workflow instance with its history."""
        stmt = (
            select(WorkflowInstance)
            .where(WorkflowInstance.id == instance_id)
            .options(selectinload(WorkflowInstance.history))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_instance_by_entity(self, entity_type: str, entity_id: int) -> Optional[WorkflowInstance]:
        """Fetch workflow instance for a given entity."""
        stmt = (
            select(WorkflowInstance)
            .where(
                and_(
                    WorkflowInstance.entity_type == entity_type,
                    WorkflowInstance.entity_id == entity_id,
                )
            )
            .options(selectinload(WorkflowInstance.history))
            .order_by(WorkflowInstance.id.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def transition(
        self,
        instance_id: int,
        target_state: WorkflowStateEnum,
        actor_id: Optional[int] = None,
        comment: Optional[str] = None,
        metadata_updates: Optional[Dict[str, Any]] = None,
    ) -> WorkflowInstance:
        """Execute a validated state transition with history and event emission."""
        instance = await self.get_instance(instance_id)
        if not instance:
            raise EntityNotFoundError("WorkflowInstance", instance_id)

        curr_state_enum = WorkflowStateEnum(instance.current_state)
        if not is_transition_allowed(curr_state_enum, target_state):
            raise WorkflowTransitionError(
                current_state=instance.current_state,
                requested_state=target_state.value,
                reason=f"Transition from {instance.current_state} to {target_state.value} is not permitted.",
            )

        old_state_str = instance.current_state
        new_state_str = target_state.value

        # Update metadata
        current_meta = dict(instance.metadata_payload)
        if metadata_updates:
            current_meta.update(metadata_updates)
        instance.metadata_payload = current_meta

        # Update state and SLA
        instance.current_state = new_state_str
        instance.sla_deadline = calculate_sla_deadline(target_state)

        # Record history
        history = WorkflowHistory(
            workflow_instance_id=instance.id,
            from_state=old_state_str,
            to_state=new_state_str,
            actor_id=actor_id,
            comment=comment,
            metadata_snapshot=current_meta,
            created_at=datetime.now(timezone.utc),
        )
        self.session.add(history)

        # Record audit log
        audit = AuditLog(
            actor_id=actor_id,
            action="WORKFLOW_TRANSITION",
            entity_type=instance.entity_type,
            entity_id=instance.entity_id,
            old_state=old_state_str,
            new_state=new_state_str,
            metadata_payload={"comment": comment, "metadata": current_meta},
        )
        self.session.add(audit)
        await self.session.flush()

        # Emit domain event
        event = DomainEvent(
            event_name=DomainEventEnum.WORKFLOW_TRANSITIONED,
            entity_type=instance.entity_type,
            entity_id=instance.entity_id,
            actor_id=actor_id,
            payload={
                "workflow_id": instance.id,
                "old_state": old_state_str,
                "new_state": new_state_str,
                "comment": comment,
            },
        )
        await event_dispatcher.publish(event)

        return instance

    async def get_overdue_instances(self) -> List[WorkflowInstance]:
        """Fetch all instances that have passed their SLA deadline."""
        now = datetime.now(timezone.utc)
        stmt = select(WorkflowInstance).where(
            and_(
                WorkflowInstance.sla_deadline.isnot(None),
                WorkflowInstance.sla_deadline < now,
                WorkflowInstance.current_state.notin_(
                    [WorkflowStateEnum.COMPLETED.value, WorkflowStateEnum.ARCHIVED.value, WorkflowStateEnum.OVERDUE.value]
                ),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
