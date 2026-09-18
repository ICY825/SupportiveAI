from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.shared.models.employee import Employee
    from app.shared.models.resource import LockerDetail


class LockerCompartment(Base):
    """
    Individual locker compartment within a locker unit/cabinet.
    Enforces unique compartment numbers per locker unit.
    Each compartment can be assigned to at most one employee.
    """
    __tablename__ = "locker_compartments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    locker_detail_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locker_details.id", ondelete="CASCADE"), index=True, nullable=False
    )
    compartment_number: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="available", server_default="available", nullable=False
    )
    employee_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assigned_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    recall_due_date: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ai_suggestion: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "locker_detail_id",
            "compartment_number",
            name="uq_locker_compartment_number",
        ),
    )

    # Relationships
    locker_detail: Mapped["LockerDetail"] = relationship(
        "LockerDetail", back_populates="compartments"
    )
    employee: Mapped[Optional["Employee"]] = relationship(
        "Employee", back_populates="locker_compartments"
    )
