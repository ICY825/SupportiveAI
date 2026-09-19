"""DTO của phân hệ bố trí mặt bằng."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PlacementWrite(BaseModel):
    """Một vị trí người dùng vừa đặt.

    Tên trường giữ đúng `SpatialPlacement` của frontend, trừ `entityId` được
    viết theo lối rắn để hợp với phần còn lại của API. Dịch tên ở một chỗ
    (`frontend/src/api/layout.ts`) chứ không rải rác trong màn hình.
    """

    entity_id: str = Field(min_length=1, max_length=64)
    x: float
    y: float
    width: float = Field(gt=0)
    depth: float = Field(gt=0)
    rotation: float = 0.0
    chair: dict | None = None
    seated_side: str | None = Field(default=None, max_length=8)
    override_reason: str | None = Field(default=None, max_length=1000)
    override_conflicts: list[dict] | None = None


class LayoutWrite(BaseModel):
    """Một lần lưu, luôn là **gộp**.

    Một lần lưu chỉ phủ một khu vực đang sửa, không phủ cả tầng. Thay toàn bộ
    thì sẽ xóa mất vị trí đã lưu của mọi khu vực khác — vì vậy PATCH, không
    bao giờ PUT. `LayoutStore.write` phía frontend nói đúng điều này.
    """

    placements: list[PlacementWrite] = Field(min_length=1)


class PlacementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: str
    x: float
    y: float
    width: float
    depth: float
    rotation: float
    chair: dict | None
    seated_side: str | None
    layout_version: str
    updated_at: datetime
    updated_by: str | None
    override_reason: str | None
    override_conflicts: list[dict] | None


class FloorLayoutRead(BaseModel):
    """Toàn bộ vị trí đã lưu của một tầng."""

    floor_id: str
    #: Phiên bản bản vẽ **hiện tại**, không phải phiên bản của từng bản ghi.
    current_layout_version: str
    placements: list[PlacementRead]
    #: Số bản ghi đặt theo một bản vẽ khác bản vẽ hiện tại. Xem `stale`.
    stale: int


class StalePlacement(BaseModel):
    """Một vị trí không còn khớp với dataset hiện tại."""

    entity_id: str
    #: `missing-entity` = id không còn trong bản vẽ;
    #: `old-layout` = còn, nhưng đặt từ thời bản vẽ khác.
    reason: str
    saved_layout_version: str
    current_layout_version: str


class OverriddenPlacement(BaseModel):
    entity_id: str
    reason: str
    actor_id: str | None
    recorded_at: datetime
    conflicts: list[dict]


class LayoutReconcileReport(BaseModel):
    """Kết quả đối chiếu vị trí đã lưu với dataset — chạy sau mỗi lần trích xuất lại."""

    floor_id: str
    current_layout_version: str
    checked: int
    stale: list[StalePlacement]
    overridden: list[OverriddenPlacement]
