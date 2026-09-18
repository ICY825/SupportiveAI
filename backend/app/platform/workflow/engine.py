"""State machine engine.

Engine **không biết tên trạng thái cụ thể** của bất kỳ nghiệp vụ nào —
mọi thứ nó biết đều đến từ `WorkflowDefinition` mà module đăng ký
(repository-structure.md §12: "Workflow engine biết tên trạng thái cụ thể"
là lỗi phải tránh).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import utcnow
from app.core.exceptions import NotFoundError, WorkflowError
from app.core.permissions import Principal, require_permission
from app.platform.events import Dispatcher
from app.platform.events import dispatcher as default_dispatcher
from app.platform.workflow.calendar import BusinessCalendar
from app.platform.workflow.definition import SLA, WorkflowDefinition
from app.platform.workflow.events import SLABreached, WorkflowTransitioned
from app.platform.workflow.models import SLAEvent, WorkflowHistory, WorkflowInstance
from app.platform.workflow.registry import WorkflowRegistry
from app.platform.workflow.registry import registry as default_registry


@dataclass(frozen=True)
class DueItem:
    """Một bản ghi đã chạm mốc SLA và chưa được xử lý."""

    instance: WorkflowInstance
    sla: SLA
    due_at: datetime


class WorkflowEngine:
    def __init__(
        self,
        db: Session,
        *,
        calendar: BusinessCalendar | None = None,
        registry: WorkflowRegistry | None = None,
        dispatcher: Dispatcher | None = None,
    ) -> None:
        self.db = db
        self.calendar = calendar or BusinessCalendar.from_settings()
        self.registry = registry or default_registry
        self.dispatcher = dispatcher or default_dispatcher

    # --- Vòng đời ---

    def start(
        self, entity_type: str, entity_id: str, *, actor_id: str | None = None
    ) -> WorkflowInstance:
        """Tạo instance ở trạng thái khởi đầu của workflow."""
        definition = self.registry.get(entity_type)
        if self._find(entity_type, entity_id) is not None:
            raise WorkflowError(f"{entity_type}:{entity_id} đã có workflow instance")

        instance = WorkflowInstance(
            entity_type=entity_type,
            entity_id=entity_id,
            state=definition.initial_state,
            entered_state_at=utcnow(),
        )
        self.db.add(instance)
        self.db.flush()
        self.db.add(
            WorkflowHistory(
                instance_id=instance.id,
                from_state=None,
                to_state=definition.initial_state,
                trigger="start",
                actor_id=actor_id,
            )
        )
        self.dispatcher.publish(
            WorkflowTransitioned(
                actor_id=actor_id,
                entity_type=entity_type,
                entity_id=entity_id,
                from_state=None,
                to_state=definition.initial_state,
                trigger="start",
            )
        )
        return instance

    def fire(
        self,
        entity_type: str,
        entity_id: str,
        trigger: str,
        *,
        principal: Principal | None = None,
        actor_id: str | None = None,
        note: str | None = None,
    ) -> WorkflowInstance:
        """Thực hiện một chuyển trạng thái."""
        definition = self.registry.get(entity_type)
        instance = self.get(entity_type, entity_id)

        transition = definition.find_transition(trigger, instance.state)
        if transition is None:
            raise WorkflowError(
                f"Không chuyển được {entity_type}:{entity_id} bằng {trigger} "
                f"khi đang ở trạng thái {instance.state}",
                details={
                    "current_state": instance.state,
                    "trigger": trigger,
                    "available": list(definition.triggers_from(instance.state)),
                },
            )

        if transition.required_permission:
            if principal is None:
                raise WorkflowError(
                    f"Chuyển trạng thái {trigger} cần quyền "
                    f"{transition.required_permission} nhưng không biết ai đang gọi"
                )
            require_permission(principal, transition.required_permission)

        from_state = instance.state
        if from_state == transition.target:
            # Không coi là lỗi, nhưng cũng không ghi một dòng lịch sử rỗng.
            return instance

        instance.state = transition.target
        instance.entered_state_at = utcnow()
        actor = actor_id or (principal.employee_id if principal else None)

        self.db.add(
            WorkflowHistory(
                instance_id=instance.id,
                from_state=from_state,
                to_state=transition.target,
                trigger=trigger,
                actor_id=actor,
                note=note,
            )
        )
        self.db.flush()
        self.dispatcher.publish(
            WorkflowTransitioned(
                actor_id=actor,
                entity_type=entity_type,
                entity_id=entity_id,
                from_state=from_state,
                to_state=transition.target,
                trigger=trigger,
            )
        )
        return instance

    # --- Truy vấn ---

    def _find(self, entity_type: str, entity_id: str) -> WorkflowInstance | None:
        return self.db.execute(
            select(WorkflowInstance).where(
                WorkflowInstance.entity_type == entity_type,
                WorkflowInstance.entity_id == entity_id,
            )
        ).scalar_one_or_none()

    def get(self, entity_type: str, entity_id: str) -> WorkflowInstance:
        instance = self._find(entity_type, entity_id)
        if instance is None:
            raise NotFoundError(f"Chưa có workflow instance cho {entity_type}:{entity_id}")
        return instance

    def available_triggers(self, entity_type: str, entity_id: str) -> tuple[str, ...]:
        definition = self.registry.get(entity_type)
        return definition.triggers_from(self.get(entity_type, entity_id).state)

    # --- SLA ---
    #
    # mail-tracking.md §8.2: "quá hạn" KHÔNG phải trạng thái mà là thuộc tính
    # suy ra. Engine vì vậy không bao giờ tự đổi trạng thái theo thời gian;
    # nó chỉ trả lời câu hỏi "cái nào đã quá hạn".

    def due_at(self, instance: WorkflowInstance, sla: SLA) -> datetime:
        return sla.due_at(instance.entered_state_at, self.calendar)

    def is_overdue(
        self, instance: WorkflowInstance, sla: SLA, *, now: datetime | None = None
    ) -> bool:
        return (now or utcnow()) >= self.due_at(instance, sla)

    def find_due(
        self,
        entity_type: str,
        *,
        now: datetime | None = None,
        action: str | None = None,
        include_fired: bool = False,
    ) -> list[DueItem]:
        """Các bản ghi đã chạm mốc SLA, dùng cho scheduler.

        Lọc hai bước: SQL cắt thô theo giờ đồng hồ, rồi Python tính lại
        chính xác theo giờ làm việc. Cắt thô an toàn vì `k` giờ làm việc
        bao giờ cũng tốn ít nhất `k` giờ đồng hồ — bản ghi chưa đạt cận
        dưới thì chắc chắn chưa quá hạn.
        """
        definition: WorkflowDefinition = self.registry.get(entity_type)
        moment = now or utcnow()
        results: list[DueItem] = []

        for sla in definition.sla:
            if action is not None and sla.action != action:
                continue
            cutoff = moment - sla.wall_clock_lower_bound(self.calendar)
            candidates = (
                self.db.execute(
                    select(WorkflowInstance).where(
                        WorkflowInstance.entity_type == entity_type,
                        WorkflowInstance.state == sla.state,
                        WorkflowInstance.entered_state_at <= cutoff,
                    )
                )
                .scalars()
                .all()
            )

            for instance in candidates:
                due = self.due_at(instance, sla)
                if moment < due:
                    continue
                if not include_fired and self._already_fired(instance.id, sla):
                    continue
                results.append(DueItem(instance=instance, sla=sla, due_at=due))

        results.sort(key=lambda item: item.due_at)
        return results

    def _already_fired(self, instance_id: str, sla: SLA) -> bool:
        found = self.db.execute(
            select(SLAEvent.id).where(
                SLAEvent.instance_id == instance_id,
                SLAEvent.state == sla.state,
                SLAEvent.action == sla.action,
            )
        ).first()
        return found is not None

    def mark_fired(self, item: DueItem, *, now: datetime | None = None) -> SLAEvent:
        """Ghi nhận đã chạy hành động SLA, để lần quét sau không lặp lại."""
        event = SLAEvent(
            instance_id=item.instance.id,
            state=item.sla.state,
            action=item.sla.action,
            due_at=item.due_at,
            fired_at=now or utcnow(),
        )
        self.db.add(event)
        self.db.flush()
        return event

    def publish_breach(self, item: DueItem) -> None:
        self.dispatcher.publish(
            SLABreached(
                entity_type=item.instance.entity_type,
                entity_id=item.instance.entity_id,
                state=item.sla.state,
                action=item.sla.action,
            )
        )
