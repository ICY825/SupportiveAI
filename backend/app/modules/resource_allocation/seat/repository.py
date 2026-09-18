"""Truy vấn bảng gán chỗ ngồi."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.resource_allocation.seat.models import SeatAssignment
from app.shared.employee.models import Employee


class SeatRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Kỳ hạn đang hiệu lực ---

    def active_on_seat(self, floor_id: str, workstation_id: str) -> SeatAssignment | None:
        return self.db.execute(
            select(SeatAssignment).where(
                SeatAssignment.floor_id == floor_id,
                SeatAssignment.workstation_id == workstation_id,
                SeatAssignment.released_at.is_(None),
            )
        ).scalar_one_or_none()

    def active_of_employee(self, employee_id: str) -> SeatAssignment | None:
        return self.db.execute(
            select(SeatAssignment).where(
                SeatAssignment.employee_id == employee_id,
                SeatAssignment.released_at.is_(None),
            )
        ).scalar_one_or_none()

    def list_active(self, floor_id: str) -> Sequence[SeatAssignment]:
        return (
            self.db.execute(
                select(SeatAssignment)
                .where(
                    SeatAssignment.floor_id == floor_id,
                    SeatAssignment.released_at.is_(None),
                )
                .order_by(SeatAssignment.workstation_id)
            )
            .scalars()
            .all()
        )

    # --- Lịch sử ---

    def history_of_seat(
        self, floor_id: str, workstation_id: str, *, limit: int = 50
    ) -> Sequence[SeatAssignment]:
        return (
            self.db.execute(
                select(SeatAssignment)
                .where(
                    SeatAssignment.floor_id == floor_id,
                    SeatAssignment.workstation_id == workstation_id,
                )
                .order_by(SeatAssignment.assigned_at.desc())
                .limit(limit)
            )
            .scalars()
            .all()
        )

    def get(self, assignment_id: str) -> SeatAssignment | None:
        return self.db.get(SeatAssignment, assignment_id)

    # --- Nhân sự ---

    def employee(self, employee_id: str) -> Employee | None:
        return self.db.get(Employee, employee_id)

    def add(self, assignment: SeatAssignment) -> SeatAssignment:
        self.db.add(assignment)
        self.db.flush()
        return assignment
