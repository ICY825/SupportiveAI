from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

if TYPE_CHECKING:
    from app.shared.models.locker_compartment import LockerCompartment
    from app.shared.models.resource import LockerIncident, ResourceAssignment


class Department(Base):
    """Department entity representing organizational hierarchy."""

    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("departments.id"), nullable=True, index=True
    )

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
    parent: Mapped[Optional["Department"]] = relationship(
        "Department",
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[List["Department"]] = relationship(
        "Department",
        back_populates="parent",
    )
    employees: Mapped[List["Employee"]] = relationship(
        "Employee",
        back_populates="department",
    )


class Employee(Base):
    """Employee entity representing personnel directory across administrative domains."""

    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("departments.id"), nullable=True, index=True
    )
    title: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

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
    department: Mapped[Optional[Department]] = relationship(
        "Department",
        back_populates="employees",
    )
    assignments: Mapped[List["ResourceAssignment"]] = relationship(
        "ResourceAssignment",
        back_populates="employee",
    )
    incidents: Mapped[List["LockerIncident"]] = relationship(
        "LockerIncident",
        back_populates="reported_by",
    )
    locker_compartments: Mapped[List["LockerCompartment"]] = relationship(
        "LockerCompartment",
        back_populates="employee",
    )
