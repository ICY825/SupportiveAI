"""API của phân hệ quy hoạch chỗ ngồi (Đề 1).

Sơ đồ mặt bằng, hình học và kiểm tra va chạm nằm ở frontend, đọc thẳng
dataset. Backend chỉ trả lời một câu: **ai đang ngồi đâu, từ bao giờ** — nên
API ở đây mỏng đúng như vậy.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.modules.resource_allocation.seat.models import SeatAssignment
from app.modules.resource_allocation.seat.permissions import PERM_MANAGE, PERM_VIEW
from app.modules.resource_allocation.seat.schemas import (
    AssignSeat,
    FloorOccupancy,
    ReconcileReport,
    ReleaseSeat,
    SeatAssignmentRead,
)
from app.modules.resource_allocation.seat.service import SeatService
from app.shared.employee.dependencies import CurrentPrincipal, DbSession, requires

router = APIRouter(prefix="/seats", tags=["seat"])

ManagePrincipal = Annotated[CurrentPrincipal, Depends(requires(PERM_MANAGE))]
ViewPrincipal = Annotated[CurrentPrincipal, Depends(requires(PERM_VIEW))]


def _read(assignment: SeatAssignment) -> SeatAssignmentRead:
    return SeatAssignmentRead.model_validate(assignment)


@router.get("/floors/{floor_id}/assignments", response_model=list[SeatAssignmentRead])
def list_assignments(
    floor_id: str, db: DbSession, principal: ViewPrincipal
) -> list[SeatAssignmentRead]:
    return [_read(a) for a in SeatService(db).list_active(floor_id)]


@router.get("/floors/{floor_id}/occupancy", response_model=FloorOccupancy)
def floor_occupancy(floor_id: str, db: DbSession, principal: ViewPrincipal) -> FloorOccupancy:
    return SeatService(db).occupancy(floor_id)


@router.get(
    "/floors/{floor_id}/seats/{workstation_id}/history",
    response_model=list[SeatAssignmentRead],
)
def seat_history(
    floor_id: str, workstation_id: str, db: DbSession, principal: ViewPrincipal
) -> list[SeatAssignmentRead]:
    return [_read(a) for a in SeatService(db).history(floor_id, workstation_id)]


@router.post("/assignments", response_model=SeatAssignmentRead, status_code=201)
def assign_seat(
    payload: AssignSeat, db: DbSession, principal: ManagePrincipal
) -> SeatAssignmentRead:
    assignment = SeatService(db).assign(
        floor_id=payload.floor_id,
        workstation_id=payload.workstation_id,
        employee_id=payload.employee_id,
        decision=payload.decision,
        note=payload.note,
        actor_id=principal.employee_id,
    )
    db.commit()
    return _read(assignment)


@router.post("/assignments/{assignment_id}/release", response_model=SeatAssignmentRead)
def release_seat(
    assignment_id: str, payload: ReleaseSeat, db: DbSession, principal: ManagePrincipal
) -> SeatAssignmentRead:
    assignment = SeatService(db).release(
        assignment_id, note=payload.note, actor_id=principal.employee_id
    )
    db.commit()
    return _read(assignment)


@router.post("/assignments/{assignment_id}/move", response_model=SeatAssignmentRead)
def move_seat(
    assignment_id: str,
    payload: AssignSeat,
    db: DbSession,
    principal: ManagePrincipal,
) -> SeatAssignmentRead:
    """Chuyển sang chỗ khác. Chỉ đọc `workstation_id`, `decision` và `note`
    trong payload — người và tầng lấy từ bản ghi đang hiệu lực."""
    assignment = SeatService(db).move(
        assignment_id=assignment_id,
        workstation_id=payload.workstation_id,
        decision=payload.decision,
        note=payload.note,
        actor_id=principal.employee_id,
    )
    db.commit()
    return _read(assignment)


@router.get("/floors/{floor_id}/reconcile", response_model=ReconcileReport)
def reconcile(floor_id: str, db: DbSession, principal: ViewPrincipal) -> ReconcileReport:
    """Đối chiếu bản ghi gán với dataset hiện tại. Chỉ đọc, không sửa gì."""
    return SeatService(db).reconcile(floor_id)
