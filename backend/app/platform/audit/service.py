"""Ghi audit log."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.database import utcnow
from app.platform.audit.models import AuditLog
from app.platform.events import Event
from app.platform.workflow.events import WorkflowTransitioned


class AuditService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def record(
        self,
        *,
        entity_type: str,
        entity_id: str,
        action: str,
        actor_id: str | None = None,
        from_state: str | None = None,
        to_state: str | None = None,
        occurred_at: datetime | None = None,
        note: str | None = None,
        data: dict | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor_id=actor_id,
            from_state=from_state,
            to_state=to_state,
            occurred_at=occurred_at or utcnow(),
            note=note,
            data=data,
        )
        self.db.add(entry)
        return entry

    def record_transition(self, event: WorkflowTransitioned) -> AuditLog:
        return self.record(
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            action=event.trigger,
            actor_id=event.actor_id,
            from_state=event.from_state,
            to_state=event.to_state,
            occurred_at=event.occurred_at,
        )

    def record_event(self, event: Event) -> AuditLog:
        """Ghi một sự kiện nghiệp vụ bất kỳ.

        Dùng cho sự kiện không phải chuyển trạng thái, ví dụ
        `EMPLOYEE_DEACTIVATED`.
        """
        payload = event.payload()
        return self.record(
            entity_type=payload.get("entity_type") or type(event).__name__,
            entity_id=str(payload.get("entity_id") or event.event_id),
            action=type(event).name,
            actor_id=event.actor_id,
            occurred_at=event.occurred_at,
            data={k: _jsonable(v) for k, v in payload.items()},
        )


def _jsonable(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    return str(value)


def make_transition_listener(session_factory: Callable[[], Session]):
    """Handler đăng ký vào dispatcher lúc khởi động.

    Nhận `session_factory` thay vì một Session cố định vì handler chạy
    trong nhiều request khác nhau.
    """

    def listener(event: Event) -> None:
        if not isinstance(event, WorkflowTransitioned):
            return
        db = session_factory()
        try:
            AuditService(db).record_transition(event)
            db.commit()
        finally:
            db.close()

    listener.__qualname__ = "audit.transition_listener"
    return listener
