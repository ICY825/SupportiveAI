from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.core.exceptions import EntityNotFoundError
from app.core.security import CurrentUser, get_current_user
from app.modules.resource_allocation.services import ResourceAllocationService
from app.shared.contracts.enums import ResourceStatusEnum, ResourceTypeEnum
from app.shared.contracts.resource import (
    FloorLayoutResponse,
    LockerCreate,
    ResourceAssignRequest,
    ResourceAssignmentRead,
    ResourceRead,
    ResourceReturnRequest,
    SeatCreate,
    SeatPositionUpdate,
    SeatRecommendationRequest,
    SeatRecommendationResponse,
)
from app.shared.models.location import Location
from app.shared.models.resource import Resource, ResourceAssignment

router = APIRouter(tags=["Floor Layout & Seat Management"])


def _to_resource_read(res: Resource) -> ResourceRead:
    current_assign = None
    if res.assignments:
        active = [a for a in res.assignments if a.returned_at is None]
        if active:
            current_assign = ResourceAssignmentRead.model_validate(active[0])

    return ResourceRead(
        id=res.id,
        code=res.code,
        resource_type=ResourceTypeEnum(res.resource_type),
        location_id=res.location_id,
        status=ResourceStatusEnum(res.status),
        attributes=res.attributes,
        current_assignment=current_assign,
        created_at=res.created_at,
        updated_at=res.updated_at,
    )


# ---------------- Floor Layout & Management Endpoints (First Flow) ----------------

@router.get("/layout/floor-19", response_model=FloorLayoutResponse)
async def get_floor_19_layout(
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Retrieve full layout for Floor 19 (auto-seeds default layout if not yet created)."""
    svc = ResourceAllocationService(db)
    loc_stmt = select(Location).where(Location.floor == "19")
    loc = (await db.execute(loc_stmt)).scalars().first()
    if not loc:
        loc = await svc.seed_floor_19()

    return await svc.get_floor_layout(location_id=loc.id)


@router.post("/layout/seed-floor-19", response_model=FloorLayoutResponse)
async def seed_floor_19_data(
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Seed / re-initialize default layout and sample seats for Floor 19."""
    svc = ResourceAllocationService(db)
    loc = await svc.seed_floor_19()
    return await svc.get_floor_layout(location_id=loc.id)


@router.get("/locations/{id}/layout", response_model=FloorLayoutResponse)
async def get_location_layout(
    id: int,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Get complete layout map, coordinates, and seat assignments for a location."""
    svc = ResourceAllocationService(db)
    return await svc.get_floor_layout(location_id=id)


@router.put("/seats/{id}/position", response_model=ResourceRead)
async def update_seat_position(
    id: int,
    pos: SeatPositionUpdate,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Update seat position coordinates (supports visual drag-and-drop editor)."""
    svc = ResourceAllocationService(db)
    updated = await svc.update_seat_position(seat_id=id, pos=pos)
    return _to_resource_read(updated)


@router.post("/seats/{id}/assign", response_model=ResourceAssignmentRead, status_code=status.HTTP_201_CREATED)
async def assign_seat_to_employee(
    id: int,
    request: ResourceAssignRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Assign an employee to a seat."""
    svc = ResourceAllocationService(db)
    req = request.model_copy(update={"actor_id": current_user.user_id})
    assignment = await svc.assign_resource(id, req)
    return ResourceAssignmentRead.model_validate(assignment)


@router.post("/seats/{id}/release", response_model=ResourceRead)
async def release_seat(
    id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Release / unassign a seat and mark it available."""
    svc = ResourceAllocationService(db)
    req = ResourceReturnRequest(actor_id=current_user.user_id, notes="Seat released")
    resource = await svc.return_resource(id, req)
    return _to_resource_read(resource)


@router.post("/seats/recommend", response_model=SeatRecommendationResponse)
async def recommend_seat(
    req: SeatRecommendationRequest,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """AI Recommendation: suggest optimal vacant seat based on department cluster & nearest vacancy."""
    svc = ResourceAllocationService(db)
    return await svc.recommend_seat(employee_id=req.employee_id, preferred_zone=req.preferred_zone)


# ---------------- General Resource Endpoints ----------------

@router.get("/resources", response_model=List[ResourceRead])
async def list_resources(
    resource_type: Optional[ResourceTypeEnum] = None,
    location_id: Optional[int] = None,
    status: Optional[ResourceStatusEnum] = None,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """List resources with optional filtering."""
    svc = ResourceAllocationService(db)
    items = await svc.list_resources(resource_type=resource_type, location_id=location_id, status=status)
    return [_to_resource_read(r) for r in items]


@router.get("/seats", response_model=List[ResourceRead])
async def list_seats(
    location_id: Optional[int] = None,
    status: Optional[ResourceStatusEnum] = None,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Convenience endpoint to list all seats."""
    svc = ResourceAllocationService(db)
    items = await svc.list_resources(resource_type=ResourceTypeEnum.SEAT, location_id=location_id, status=status)
    return [_to_resource_read(r) for r in items]


@router.post("/seats", response_model=ResourceRead, status_code=status.HTTP_201_CREATED)
async def create_seat(
    data: SeatCreate,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Create a new office seat with coordinates."""
    svc = ResourceAllocationService(db)
    resource = await svc.create_seat(data)
    return _to_resource_read(resource)


@router.post("/resources/assign", response_model=ResourceAssignmentRead, status_code=status.HTTP_201_CREATED)
async def assign_resource(
    resource_id: int,
    request: ResourceAssignRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Assign a resource to an employee."""
    svc = ResourceAllocationService(db)
    req = request.model_copy(update={"actor_id": current_user.user_id})
    assignment = await svc.assign_resource(resource_id, req)
    return ResourceAssignmentRead.model_validate(assignment)


@router.post("/resources/return", response_model=ResourceRead)
async def return_resource(
    resource_id: int,
    request: ResourceReturnRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Return an assigned resource to make it available."""
    svc = ResourceAllocationService(db)
    req = request.model_copy(update={"actor_id": current_user.user_id})
    resource = await svc.return_resource(resource_id, req)
    return _to_resource_read(resource)


@router.get("/resources/history", response_model=List[ResourceAssignmentRead])
async def list_assignment_history(
    resource_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Query assignment history logs."""
    stmt = select(ResourceAssignment).order_by(ResourceAssignment.id.desc())
    if resource_id:
        stmt = stmt.where(ResourceAssignment.resource_id == resource_id)
    if employee_id:
        stmt = stmt.where(ResourceAssignment.employee_id == employee_id)

    res = await db.execute(stmt)
    assignments = res.scalars().all()
    return [ResourceAssignmentRead.model_validate(a) for a in assignments]


@router.get("/resources/stats")
async def get_resource_stats(
    location_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Get vacancy and allocation statistics."""
    svc = ResourceAllocationService(db)
    return await svc.get_allocation_stats(location_id=location_id)
