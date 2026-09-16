"""Sự kiện do chính engine phát ra."""

from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar

from app.platform.events import Event


@dataclass(frozen=True, kw_only=True)
class WorkflowTransitioned(Event):
    """Phát mỗi lần một thực thể đổi trạng thái.

    `platform/audit` nghe sự kiện này để ghi log cho cả 4 phân hệ mà
    không cần biết phân hệ nào tồn tại (README §5.5).
    """

    name: ClassVar[str] = "WORKFLOW_TRANSITIONED"

    entity_type: str
    entity_id: str
    from_state: str | None
    to_state: str
    trigger: str


@dataclass(frozen=True, kw_only=True)
class SLABreached(Event):
    """Phát khi scheduler thấy một bản ghi đã quá mốc SLA.

    Module tự quyết làm gì với `action` — engine không biết "remind" hay
    "mark_abandoned" nghĩa là gì.
    """

    name: ClassVar[str] = "SLA_BREACHED"

    entity_type: str
    entity_id: str
    state: str
    action: str
