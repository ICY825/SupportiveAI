from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.contracts.enums import ResourceStatusEnum, ResourceTypeEnum
from app.shared.models.base import TimestampMixin


class Resource(Base, TimestampMixin):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)  # seat or locker
    location_id: Mapped[int] = mapped_column(Integer, ForeignKey("locations.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=ResourceStatusEnum.AVAILABLE.value, nullable=False)
    attributes: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    location: Mapped["Location"] = relationship("Location", back_populates="resources")
    assignments: Mapped[List["ResourceAssignment"]] = relationship("ResourceAssignment", back_populates="resource")
    seat_detail: Mapped[Optional["SeatDetail"]] = relationship("SeatDetail", back_populates="resource", uselist=False)
    locker_detail: Mapped[Optional["LockerDetail"]] = relationship("LockerDetail", back_populates="resource", uselist=False)


class SeatDetail(Base, TimestampMixin):
    __tablename__ = "seat_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    resource_id: Mapped[int] = mapped_column(Integer, ForeignKey("resources.id"), unique=True, nullable=False)
    x: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    y: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    layout_version: Mapped[str] = mapped_column(String(50), default="v1", nullable=False)
    zone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    resource: Mapped["Resource"] = relationship("Resource", back_populates="seat_detail")


class LockerDetail(Base, TimestampMixin):
    __tablename__ = "locker_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    resource_id: Mapped[int] = mapped_column(Integer, ForeignKey("resources.id"), unique=True, nullable=False)
    row: Mapped[str] = mapped_column(String(50), nullable=False)
    pin_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    resource: Mapped["Resource"] = relationship("Resource", back_populates="locker_detail")


class ResourceAssignment(Base, TimestampMixin):
    __tablename__ = "resource_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    resource_id: Mapped[int] = mapped_column(Integer, ForeignKey("resources.id"), nullable=False)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=ResourceStatusEnum.ASSIGNED.value, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    returned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    resource: Mapped["Resource"] = relationship("Resource", back_populates="assignments")
    employee: Mapped["Employee"] = relationship("Employee", back_populates="resource_assignments")
