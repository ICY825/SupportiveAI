from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

if TYPE_CHECKING:
    from app.shared.models.resource import LockerDetail, Resource


class Location(Base):
    """Location entity representing buildings, floors, and physical zones."""

    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    building: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    floor: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    zone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    resources: Mapped[List["Resource"]] = relationship(
        "Resource",
        back_populates="location",
        cascade="all, delete-orphan",
    )
    lockers: Mapped[List["LockerDetail"]] = relationship(
        "LockerDetail",
        back_populates="location",
        cascade="all, delete-orphan",
    )
