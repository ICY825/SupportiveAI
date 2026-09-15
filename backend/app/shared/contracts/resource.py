from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.shared.contracts.enums import ResourceStatusEnum, ResourceTypeEnum


class ResourceBase(BaseModel):
    code: str
    resource_type: ResourceTypeEnum
    location_id: int
    status: ResourceStatusEnum = ResourceStatusEnum.AVAILABLE
    attributes: Dict[str, Any] = Field(default_factory=dict)


class ResourceCreate(ResourceBase):
    pass


class SeatCreate(BaseModel):
    code: str
    location_id: int
    x: float
    y: float
    layout_version: str = "v1"
    zone: Optional[str] = None


class SeatPositionUpdate(BaseModel):
    x: float
    y: float
    zone: Optional[str] = None


class LockerCreate(BaseModel):
    code: str
    location_id: int
    row: str
    pin_code: Optional[str] = None


class ResourceAssignRequest(BaseModel):
    employee_id: int
    actor_id: Optional[int] = None
    notes: Optional[str] = None


class ResourceReturnRequest(BaseModel):
    actor_id: Optional[int] = None
    notes: Optional[str] = None


class ResourceAssignmentRead(BaseModel):
    id: int
    resource_id: int
    employee_id: int
    status: ResourceStatusEnum
    assigned_at: datetime
    activated_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ResourceRead(ResourceBase):
    id: int
    current_assignment: Optional[ResourceAssignmentRead] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SeatEmployeeInfo(BaseModel):
    id: int
    employee_code: str
    full_name: str
    email: str
    department_name: Optional[str] = None
    title: Optional[str] = None


class SeatLayoutItem(BaseModel):
    id: int
    code: str
    location_id: int
    x: float
    y: float
    zone: Optional[str] = None
    layout_version: str
    status: ResourceStatusEnum
    assigned_employee: Optional[SeatEmployeeInfo] = None
    assignment_id: Optional[int] = None


class FloorLayoutResponse(BaseModel):
    location_id: int
    building: str
    floor: str
    layout_name: str
    total_seats: int
    occupied_seats: int
    available_seats: int
    occupancy_rate: float
    zones: List[str]
    seats: List[SeatLayoutItem]


class SeatRecommendationRequest(BaseModel):
    employee_id: int
    preferred_zone: Optional[str] = None


class SeatRecommendationResponse(BaseModel):
    recommended_seat_id: int
    seat_code: str
    zone: Optional[str] = None
    reason: str
    confidence: float
    distance_score: float
