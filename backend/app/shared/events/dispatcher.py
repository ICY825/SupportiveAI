import asyncio
import logging
from typing import Callable, Coroutine, Dict, List
from app.shared.contracts.event import DomainEvent

logger = logging.getLogger("supportive_ai.events")

EventHandler = Callable[[DomainEvent], Coroutine[None, None, None]]


class EventDispatcher:
    """Shared event bus dispatcher for decoupling workflows and notifications."""

    def __init__(self):
        self._subscribers: Dict[str, List[EventHandler]] = {}

    def subscribe(self, event_name: str, handler: EventHandler) -> None:
        """Subscribe a handler coroutine to an event."""
        if event_name not in self._subscribers:
            self._subscribers[event_name] = []
        self._subscribers[event_name].append(handler)
        logger.debug("Subscribed %s to event %s", handler.__name__, event_name)

    async def publish(self, event: DomainEvent) -> None:
        """Publish an event to all subscribed handlers concurrently."""
        event_name = event.event_name.value
        handlers = self._subscribers.get(event_name, []) + self._subscribers.get("*", [])

        if not handlers:
            logger.info("No handlers registered for event: %s", event_name)
            return

        logger.info("Publishing event %s (entity: %s:%s)", event_name, event.entity_type, event.entity_id)
        tasks = [asyncio.create_task(handler(event)) for handler in handlers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for res in results:
            if isinstance(res, Exception):
                logger.error("Error executing handler for event %s: %s", event_name, res, exc_info=res)


# Global singleton dispatcher
event_dispatcher = EventDispatcher()
