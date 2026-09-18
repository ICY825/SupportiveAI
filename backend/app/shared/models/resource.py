import hashlib
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.models.locker_compartment import LockerCompartment

if TYPE_CHECKING:
    from app.shared.models.employee import Employee
    from app.shared.models.location import Location


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)  # "seat", "locker"
    location_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(50), index=True, default="Available", nullable=False)
    attributes: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
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

    __table_args__ = (
        UniqueConstraint("location_id", "code", name="uq_resource_location_code"),
    )

    # Relationships
    location: Mapped["Location"] = relationship("Location", back_populates="resources")
    seat_detail: Mapped[Optional["SeatDetail"]] = relationship(
        "SeatDetail", back_populates="resource", uselist=False, cascade="all, delete-orphan"
    )
    locker_detail: Mapped[Optional["LockerDetail"]] = relationship(
        "LockerDetail", back_populates="resource", uselist=False, cascade="all, delete-orphan"
    )
    assignments: Mapped[List["ResourceAssignment"]] = relationship(
        "ResourceAssignment", back_populates="resource", cascade="all, delete-orphan"
    )


class SeatDetail(Base):
    __tablename__ = "seat_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resource_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("resources.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    x: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    y: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    layout_version: Mapped[str] = mapped_column(String(50), default="v1", nullable=False)
    zone: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
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
    resource: Mapped["Resource"] = relationship("Resource", back_populates="seat_detail")


class LockerDetail(Base):
    __tablename__ = "locker_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resource_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("resources.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    location_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    bank_code: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    locker_number: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    lock_type: Mapped[str] = mapped_column(
        String(50), default="mechanical_key", nullable=False
    )  # mechanical_key, electronic_pin, rfid, combination
    key_reference: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )  # Non-secret key hook / tag identifier
    row: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
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

    __table_args__ = (
        UniqueConstraint("location_id", "bank_code", "locker_number", name="uq_locker_location_bank_number"),
    )

    # Relationships
    resource: Mapped["Resource"] = relationship("Resource", back_populates="locker_detail")
    location: Mapped["Location"] = relationship("Location", back_populates="lockers")
    keys: Mapped[List["LockerKey"]] = relationship(
        "LockerKey", back_populates="locker_detail", cascade="all, delete-orphan"
    )
    incidents: Mapped[List["LockerIncident"]] = relationship(
        "LockerIncident", back_populates="locker_detail", cascade="all, delete-orphan"
    )
    status_history: Mapped[List["LockerStatusHistory"]] = relationship(
        "LockerStatusHistory", back_populates="locker_detail", cascade="all, delete-orphan"
    )
    compartments: Mapped[List["LockerCompartment"]] = relationship(
        "LockerCompartment", back_populates="locker_detail", cascade="all, delete-orphan"
    )


class ResourceAssignment(Base):
    __tablename__ = "resource_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resource_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("resources.id", ondelete="CASCADE"), index=True, nullable=False
    )
    employee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(50), default="Assigned", index=True, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    returned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
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
    resource: Mapped["Resource"] = relationship("Resource", back_populates="assignments")
    employee: Mapped["Employee"] = relationship("Employee", back_populates="assignments")


class LockerKey(Base):
    __tablename__ = "locker_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    locker_detail_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("locker_details.id", ondelete="SET NULL"), nullable=True, index=True
    )
    key_code: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    key_type: Mapped[str] = mapped_column(
        String(50), default="physical", nullable=False
    )  # physical, master, duplicate, rfid
    status: Mapped[str] = mapped_column(
        String(50), default="available", index=True, nullable=False
    )  # available, assigned, lost, maintenance
    assigned_to_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
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

    __table_args__ = (
        CheckConstraint(
            "key_type IN ('physical', 'master', 'duplicate', 'rfid')",
            name="ck_locker_key_type",
        ),
        CheckConstraint(
            "status IN ('available', 'assigned', 'lost', 'maintenance')",
            name="ck_locker_key_status",
        ),
    )

    # Relationships
    locker_detail: Mapped[Optional["LockerDetail"]] = relationship("LockerDetail", back_populates="keys")
    assigned_to: Mapped[Optional["Employee"]] = relationship("Employee")


class LockerIncident(Base):
    __tablename__ = "locker_incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    locker_detail_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locker_details.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reported_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    incident_type: Mapped[str] = mapped_column(
        String(50), index=True, nullable=False
    )  # lost_key, damaged_lock, stuck_door, vandalism, other
    severity: Mapped[str] = mapped_column(
        String(50), default="medium", index=True, nullable=False
    )  # low, medium, high, critical
    status: Mapped[str] = mapped_column(
        String(50), default="reported", index=True, nullable=False
    )  # reported, in_progress, resolved, closed
    description: Mapped[str] = mapped_column(Text, nullable=False)
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
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

    __table_args__ = (
        CheckConstraint(
            "incident_type IN ('lost_key', 'damaged_lock', 'stuck_door', 'vandalism', 'other')",
            name="ck_locker_incident_type",
        ),
        CheckConstraint(
            "severity IN ('low', 'medium', 'high', 'critical')",
            name="ck_locker_incident_severity",
        ),
        CheckConstraint(
            "status IN ('reported', 'in_progress', 'resolved', 'closed')",
            name="ck_locker_incident_status",
        ),
    )

    # Relationships
    locker_detail: Mapped["LockerDetail"] = relationship("LockerDetail", back_populates="incidents")
    reported_by: Mapped[Optional["Employee"]] = relationship("Employee", back_populates="incidents")


class LockerStatusHistory(Base):
    __tablename__ = "locker_status_histories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    locker_detail_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locker_details.id", ondelete="CASCADE"), index=True, nullable=False
    )
    from_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    changed_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), index=True, nullable=False
    )

    # Relationships
    locker_detail: Mapped["LockerDetail"] = relationship("LockerDetail", back_populates="status_history")
    changed_by: Mapped[Optional["Employee"]] = relationship("Employee")


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_reference: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="pending", index=True, nullable=False
    )  # pending, processing, completed, failed
    imported_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')",
            name="ck_import_batch_status",
        ),
    )

    # Relationships
    imported_by: Mapped[Optional["Employee"]] = relationship("Employee")
    rows: Mapped[List["ImportRow"]] = relationship(
        "ImportRow", back_populates="batch", cascade="all, delete-orphan"
    )


class ImportRow(Base):
    __tablename__ = "import_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("import_batches.id", ondelete="CASCADE"), index=True, nullable=False
    )
    row_number: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    raw_data: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="pending", index=True, nullable=False
    )  # pending, success, error
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'success', 'error')",
            name="ck_import_row_status",
        ),
    )

    # Relationships
    batch: Mapped["ImportBatch"] = relationship("ImportBatch", back_populates="rows")
