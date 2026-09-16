"""Workflow engine dùng chung cho cả 4 phân hệ.

Engine ở đây là generic; **cấu hình nằm ở module** — mỗi module khai báo
trạng thái, chuyển tiếp và SLA của mình trong `workflow.py` rồi đăng ký
vào `registry` (repository-structure.md §4.1).
"""

from app.platform.workflow.calendar import BusinessCalendar
from app.platform.workflow.definition import SLA, Transition, WorkflowDefinition
from app.platform.workflow.engine import DueItem, WorkflowEngine
from app.platform.workflow.events import SLABreached, WorkflowTransitioned
from app.platform.workflow.models import SLAEvent, WorkflowHistory, WorkflowInstance
from app.platform.workflow.registry import WorkflowRegistry, registry

__all__ = [
    "SLA",
    "BusinessCalendar",
    "DueItem",
    "SLABreached",
    "SLAEvent",
    "Transition",
    "WorkflowDefinition",
    "WorkflowEngine",
    "WorkflowHistory",
    "WorkflowInstance",
    "WorkflowRegistry",
    "WorkflowTransitioned",
    "registry",
]
