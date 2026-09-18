"""Bảng lưu trạng thái workflow và lịch sử chuyển trạng thái."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UtcDateTime, new_uuid


class WorkflowInstance(Base, TimestampMixin):
    """Trạng thái hiện tại của một thực thể.

    Trỏ tới thực thể qua cặp `entity_type` + `entity_id`
    (mail-tracking.md §10.3), không dùng FK để engine không phải biết
    bảng nghiệp vụ nào tồn tại.
    """

    __tablename__ = "workflow_instance"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", name="uq_workflow_instance_entity"),
        Index("ix_workflow_instance_due_scan", "entity_type", "state", "entered_state_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(64), nullable=False)
    # Mốc tính SLA. Cập nhật mỗi lần đổi trạng thái.
    entered_state_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)

    history: Mapped[list["WorkflowHistory"]] = relationship(
        back_populates="instance", cascade="all, delete-orphan", order_by="WorkflowHistory.created_at"
    )

    def __repr__(self) -> str:
        return f"<WorkflowInstance {self.entity_type}:{self.entity_id} state={self.state}>"


class WorkflowHistory(Base, TimestampMixin):
    """Một lần chuyển trạng thái."""

    __tablename__ = "workflow_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    instance_id: Mapped[str] = mapped_column(
        ForeignKey("workflow_instance.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_state: Mapped[str] = mapped_column(String(64), nullable=False)
    trigger: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    instance: Mapped[WorkflowInstance] = relationship(back_populates="history")


class SLAEvent(Base, TimestampMixin):
    """Ghi nhận một hành động SLA đã chạy.

    Có bảng này để scheduler chạy lại (hoặc chạy trễ) không bắn nhắc hai
    lần cho cùng một mốc — mail-tracking.md coi việc spam người dùng là
    lỗi phải tránh (§6.1, §14).
    """

    __tablename__ = "workflow_sla_event"
    __table_args__ = (
        UniqueConstraint("instance_id", "state", "action", name="uq_sla_event_once"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    instance_id: Mapped[str] = mapped_column(
        ForeignKey("workflow_instance.id", ondelete="CASCADE"), nullable=False, index=True
    )
    state: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    due_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    fired_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
