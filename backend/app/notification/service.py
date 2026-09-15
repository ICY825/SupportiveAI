import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.shared.contracts.enums import DomainEventEnum, NotificationChannelEnum
from app.shared.contracts.event import DomainEvent
from app.shared.events.dispatcher import event_dispatcher
from app.shared.models.notification import Notification

logger = logging.getLogger("supportive_ai.notifications")


class NotificationService:
    """Unified Notification Engine subscribing to domain events."""

    def __init__(self, session: Optional[AsyncSession] = None):
        self._session = session

    async def send_notification(
        self,
        recipient_id: int,
        channel: NotificationChannelEnum,
        title: str,
        content: str,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        session: Optional[AsyncSession] = None,
    ) -> Notification:
        """Send and persist a notification across requested channel."""
        db = session or self._session
        should_close = False
        if not db:
            db = async_session_factory()
            should_close = True

        try:
            notification = Notification(
                recipient_id=recipient_id,
                channel=channel.value,
                title=title,
                content=content,
                entity_type=entity_type,
                entity_id=entity_id,
                sent_at=datetime.utcnow(),
            )
            try:
                db.add(notification)
                await db.flush()
                if should_close:
                    await db.commit()
            except Exception as dbe:
                logger.warning("Could not persist notification to DB: %s", dbe)

            # Channel dispatch simulation for pilot
            if channel == NotificationChannelEnum.EMAIL:
                logger.info("[EMAIL DISPATCH] To User %s: %s - %s", recipient_id, title, content)
            elif channel == NotificationChannelEnum.TEAMS:
                logger.info("[TEAMS DISPATCH] To User %s: %s", recipient_id, title)
            elif channel == NotificationChannelEnum.QR:
                logger.info("[QR NOTIFY] Ready for pickup user %s", recipient_id)
            else:
                logger.info("[DASHBOARD ALERT] User %s: %s", recipient_id, title)

            return notification
        finally:
            if should_close:
                await db.close()

    @classmethod
    def register_event_listeners(cls) -> None:
        """Wire event listeners to the shared event dispatcher."""

        async def on_document_received(event: DomainEvent):
            recipient_id = event.payload.get("recipient_id")
            if recipient_id:
                svc = NotificationService()
                await svc.send_notification(
                    recipient_id=recipient_id,
                    channel=NotificationChannelEnum.EMAIL,
                    title="New Official Document Received",
                    content=f"Document '{event.payload.get('title')}' is ready for review.",
                    entity_type="document",
                    entity_id=event.entity_id,
                )

        async def on_document_overdue(event: DomainEvent):
            recipient_id = event.payload.get("recipient_id")
            if recipient_id:
                svc = NotificationService()
                await svc.send_notification(
                    recipient_id=recipient_id,
                    channel=NotificationChannelEnum.TEAMS,
                    title="URGENT: Document Overdue Reminder",
                    content=f"Document '{event.payload.get('title', event.entity_id)}' is overdue SLA.",
                    entity_type="document",
                    entity_id=event.entity_id,
                )

        async def on_locker_assigned(event: DomainEvent):
            recipient_id = event.payload.get("employee_id")
            if recipient_id:
                svc = NotificationService()
                await svc.send_notification(
                    recipient_id=recipient_id,
                    channel=NotificationChannelEnum.QR,
                    title="Locker Allocation Ready",
                    content=f"Locker {event.payload.get('locker_code')} has been assigned to you. Scan QR to unlock.",
                    entity_type="locker",
                    entity_id=event.entity_id,
                )

        async def on_seat_changed(event: DomainEvent):
            recipient_id = event.payload.get("employee_id")
            if recipient_id:
                svc = NotificationService()
                await svc.send_notification(
                    recipient_id=recipient_id,
                    channel=NotificationChannelEnum.EMAIL,
                    title="Seat Allocation Updated",
                    content=f"Your seat has been updated to seat code {event.payload.get('seat_code')}.",
                    entity_type="seat",
                    entity_id=event.entity_id,
                )

        event_dispatcher.subscribe(DomainEventEnum.DOCUMENT_RECEIVED.value, on_document_received)
        event_dispatcher.subscribe(DomainEventEnum.DOCUMENT_OVERDUE.value, on_document_overdue)
        event_dispatcher.subscribe(DomainEventEnum.LOCKER_ASSIGNED.value, on_locker_assigned)
        event_dispatcher.subscribe(DomainEventEnum.SEAT_CHANGED.value, on_seat_changed)
        logger.info("Notification event listeners registered.")
