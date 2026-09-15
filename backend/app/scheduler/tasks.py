import asyncio
import logging
from app.core.database import async_session_factory
from app.shared.contracts.enums import DomainEventEnum, WorkflowStateEnum
from app.shared.contracts.event import DomainEvent
from app.shared.events.dispatcher import event_dispatcher
from app.workflow.engine import WorkflowEngine

logger = logging.getLogger("supportive_ai.scheduler")


async def check_sla_overdue_tasks() -> int:
    """Periodic job scanning for workflows exceeding SLA deadline."""
    logger.info("Running periodic SLA check...")
    async with async_session_factory() as session:
        engine = WorkflowEngine(session)
        overdue_list = await engine.get_overdue_instances()
        count = 0

        for instance in overdue_list:
            logger.warning("Workflow %s (entity %s:%s) exceeded SLA deadline %s",
                           instance.id, instance.entity_type, instance.entity_id, instance.sla_deadline)
            try:
                await engine.transition(
                    instance_id=instance.id,
                    target_state=WorkflowStateEnum.OVERDUE,
                    comment="Automated SLA check: deadline passed.",
                )
                # Emit overdue event
                await event_dispatcher.publish(
                    DomainEvent(
                        event_name=DomainEventEnum.DOCUMENT_OVERDUE,
                        entity_type=instance.entity_type,
                        entity_id=instance.entity_id,
                        payload={"workflow_id": instance.id, "deadline": str(instance.sla_deadline)},
                    )
                )
                count += 1
            except Exception as e:
                logger.error("Failed to transition instance %s to OVERDUE: %s", instance.id, e)

        await session.commit()
        logger.info("SLA check completed. %d instances transitioned to OVERDUE.", count)
        return count
