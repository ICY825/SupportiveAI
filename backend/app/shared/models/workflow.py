from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    current_state: Mapped[str] = mapped_column(String(50), index=True, default="Created", nullable=False)
    sla_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    metadata_payload: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    history: Mapped[List["WorkflowHistory"]] = relationship(
        "WorkflowHistory",
        back_populates="workflow_instance",
        cascade="all, delete-orphan",
        order_by="WorkflowHistory.id",
    )


class WorkflowHistory(Base):
    __tablename__ = "workflow_histories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_instance_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflow_instances.id", ondelete="CASCADE"), index=True, nullable=False
    )
    from_state: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    to_state: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    actor_id: Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    metadata_snapshot: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )

    # Relationships
    workflow_instance: Mapped["WorkflowInstance"] = relationship(
        "WorkflowInstance", back_populates="history"
    )
