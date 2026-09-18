"""DTO của phân hệ quy hoạch chỗ ngồi."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.resource_allocation.seat.models import SeatDecision


class AssignSeat(BaseModel):
    """Gán một người vào một chỗ ngồi."""

    floor_id: str = Field(min_length=1, max_length=32)
    #: `id` của workstation trong dataset (`ws-16-001`), không phải mã hiển thị.
    workstation_id: str = Field(min_length=1, max_length=64)
    employee_id: str = Field(min_length=1, max_length=36)
    #: accept / override / manual — mẫu số để tính tỷ lệ tự động hóa (README §11).
    decision: str = Field(default=SeatDecision.MANUAL)
    note: str | None = Field(default=None, max_length=500)


class ReleaseSeat(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class EmployeeBrief(BaseModel):
    """Vừa đủ để vẽ chỗ ngồi lên sơ đồ, không kéo cả hồ sơ nhân sự."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    employee_code: str
    full_name: str
    department_id: str | None


class SeatAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    floor_id: str
    workstation_id: str
    layout_version: str
    employee: EmployeeBrief
    assigned_at: datetime
    released_at: datetime | None
    assigned_by: str | None
    decision: str
    note: str | None


class FloorOccupancy(BaseModel):
    """Tình trạng dùng chỗ của một tầng, đủ cho thẻ đếm ở bảng điều khiển."""

    floor_id: str
    layout_version: str
    seats: int
    occupied: int
    free: int


class StaleAssignment(BaseModel):
    """Một bản ghi gán không còn khớp với dataset hiện tại."""

    assignment_id: str
    floor_id: str
    workstation_id: str
    employee_code: str
    #: `missing-seat` = mã chỗ ngồi không còn trong bản vẽ;
    #: `old-layout` = còn chỗ, nhưng gán từ thời bản vẽ khác.
    reason: str
    assigned_layout_version: str
    current_layout_version: str


class ReconcileReport(BaseModel):
    """Kết quả đối chiếu DB với dataset — chạy sau mỗi lần trích xuất lại."""

    floor_id: str
    current_layout_version: str
    checked: int
    stale: list[StaleAssignment]
