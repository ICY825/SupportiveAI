from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.contracts.enums import WorkflowStateEnum
from app.shared.models.base import TimestampMixin


class WorkflowInstance(Base, TimestampMixin):
    __tablename__ = "workflow_instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)  # document, locker, seat, mail
    entity_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    current_state: Mapped[str] = mapped_column(
        String(50),
        default=WorkflowStateEnum.CREATED.value,
        index=True,
        nullable=False,
    )
    sla_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    metadata_payload: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    history: Mapped[List["WorkflowHistory"]] = relationship(
        "WorkflowHistory",
        back_populates="instance",
        cascade="all, delete-orphan",
        order_by="WorkflowHistory.id",
    )


class WorkflowHistory(Base):
    __tablename__ = "workflow_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    workflow_instance_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflow_instances.id"), nullable=False)
    from_state: Mapped[str] = mapped_column(String(50), nullable=False)
    to_state: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    metadata_snapshot: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    instance: Mapped["WorkflowInstance"] = relationship("WorkflowInstance", back_populates="history")
