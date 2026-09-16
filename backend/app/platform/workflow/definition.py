"""Khai báo workflow.

Engine nằm ở `platform/workflow`, **cấu hình nằm ở module**
(repository-structure.md §4.1). File này chỉ định nghĩa hình dạng của
cấu hình, không biết trạng thái cụ thể của thư hay công văn.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.platform.workflow.calendar import BusinessCalendar


@dataclass(frozen=True)
class Transition:
    """Một chuyển trạng thái hợp lệ."""

    trigger: str
    source: tuple[str, ...]
    target: str
    required_permission: str | None = None

    def __post_init__(self) -> None:
        if isinstance(self.source, str):
            object.__setattr__(self, "source", (self.source,))
        if not self.source:
            raise ValueError(f"Transition '{self.trigger}' phải có ít nhất một trạng thái nguồn")

    def accepts(self, state: str) -> bool:
        return state in self.source


@dataclass(frozen=True)
class SLA:
    """Một mốc hạn gắn với trạng thái.

    Đặt đúng một trong `after_hours` / `after_days`.

    `business_time=True` tính theo giờ làm việc (mail-tracking.md §8.4).
    Với `after_days`, giờ làm việc nghĩa là **ngày làm việc**.
    """

    state: str
    action: str
    after_hours: float | None = None
    after_days: float | None = None
    business_time: bool = True

    def __post_init__(self) -> None:
        if (self.after_hours is None) == (self.after_days is None):
            raise ValueError(
                f"SLA({self.state}/{self.action}) phải đặt đúng một trong after_hours hoặc after_days"
            )
        value = self.after_hours if self.after_hours is not None else self.after_days
        if value is None or value <= 0:
            raise ValueError(f"SLA({self.state}/{self.action}) phải có giá trị dương")

    def due_at(self, entered_at: datetime, calendar: BusinessCalendar) -> datetime:
        """Mốc hạn, tính từ lúc vào trạng thái."""
        if self.business_time:
            hours = (
                self.after_hours
                if self.after_hours is not None
                else self.after_days * calendar.working_seconds_per_day() / 3600  # type: ignore[operator]
            )
            return calendar.add_business_hours(entered_at, hours)
        delta = (
            timedelta(hours=self.after_hours)
            if self.after_hours is not None
            else timedelta(days=self.after_days)  # type: ignore[arg-type]
        )
        return entered_at + delta

    def wall_clock_lower_bound(self, calendar: BusinessCalendar) -> timedelta:
        """Cận dưới theo giờ đồng hồ của mốc hạn này.

        Dùng để lọc sơ bộ bằng SQL: một khoảng giờ làm việc bao giờ cũng
        mất ít nhất từng ấy giờ đồng hồ, nên bản ghi chưa đạt cận dưới thì
        chắc chắn chưa quá hạn. Xem `engine.find_due`.
        """
        if not self.business_time:
            return (
                timedelta(hours=self.after_hours)
                if self.after_hours is not None
                else timedelta(days=self.after_days)  # type: ignore[arg-type]
            )
        hours = (
            self.after_hours
            if self.after_hours is not None
            else self.after_days * calendar.working_seconds_per_day() / 3600  # type: ignore[operator]
        )
        return timedelta(hours=hours)


@dataclass(frozen=True)
class WorkflowDefinition:
    """Toàn bộ khai báo workflow của một loại thực thể."""

    entity_type: str
    states: tuple[str, ...]
    initial_state: str
    transitions: tuple[Transition, ...] = ()
    sla: tuple[SLA, ...] = ()
    terminal_states: tuple[str, ...] = field(default=())

    def __post_init__(self) -> None:
        known = set(self.states)
        if not known:
            raise ValueError(f"Workflow '{self.entity_type}' phải khai báo ít nhất một trạng thái")
        if len(known) != len(self.states):
            raise ValueError(f"Workflow '{self.entity_type}' có trạng thái trùng tên")
        if self.initial_state not in known:
            raise ValueError(
                f"Workflow '{self.entity_type}': initial_state '{self.initial_state}' không nằm trong states"
            )
        for transition in self.transitions:
            unknown = (set(transition.source) | {transition.target}) - known
            if unknown:
                raise ValueError(
                    f"Workflow '{self.entity_type}': transition '{transition.trigger}' "
                    f"dùng trạng thái lạ {sorted(unknown)}"
                )
        for item in self.sla:
            if item.state not in known:
                raise ValueError(
                    f"Workflow '{self.entity_type}': SLA gắn với trạng thái lạ '{item.state}'"
                )
        unknown_terminal = set(self.terminal_states) - known
        if unknown_terminal:
            raise ValueError(
                f"Workflow '{self.entity_type}': terminal_states lạ {sorted(unknown_terminal)}"
            )

    def find_transition(self, trigger: str, state: str) -> Transition | None:
        for transition in self.transitions:
            if transition.trigger == trigger and transition.accepts(state):
                return transition
        return None

    def triggers_from(self, state: str) -> tuple[str, ...]:
        return tuple(t.trigger for t in self.transitions if t.accepts(state))

    def sla_for(self, state: str) -> tuple[SLA, ...]:
        return tuple(item for item in self.sla if item.state == state)

    def is_terminal(self, state: str) -> bool:
        return state in self.terminal_states
