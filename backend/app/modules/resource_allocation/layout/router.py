"""API của phân hệ bố trí mặt bằng.

Hình học, kiểm tra va chạm và mọi quy tắc đặt bàn nằm ở frontend, đọc thẳng
dataset. Backend chỉ trả lời: **cái bàn nào đã bị kéo đi đâu, lần cuối là khi
nào**. API vì thế mỏng đúng như vậy.

`PATCH` chứ không `PUT`: một lần lưu phủ một khu vực đang sửa, không phủ cả
tầng — xem `schemas.LayoutWrite`.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.modules.resource_allocation.layout.permissions import PERM_MANAGE, PERM_VIEW
from app.modules.resource_allocation.layout.schemas import (
    FloorLayoutRead,
    LayoutReconcileReport,
    LayoutWrite,
)
from app.modules.resource_allocation.layout.service import LayoutService
from app.shared.employee.dependencies import CurrentPrincipal, DbSession, requires

router = APIRouter(prefix="/layouts", tags=["layout"])

ManagePrincipal = Annotated[CurrentPrincipal, Depends(requires(PERM_MANAGE))]
ViewPrincipal = Annotated[CurrentPrincipal, Depends(requires(PERM_VIEW))]


@router.get("/floors/{floor_id}", response_model=FloorLayoutRead)
def read_floor_layout(
    floor_id: str, db: DbSession, principal: ViewPrincipal
) -> FloorLayoutRead:
    return LayoutService(db).read_floor(floor_id)


@router.patch("/floors/{floor_id}", response_model=FloorLayoutRead)
def save_floor_layout(
    floor_id: str, payload: LayoutWrite, db: DbSession, principal: ManagePrincipal
) -> FloorLayoutRead:
    """Gộp một đợt vị trí vào tầng, rồi trả lại toàn bộ tầng.

    Trả cả tầng chứ không chỉ phần vừa ghi: màn hình cần biết trạng thái thật
    sau khi ghi, và tự ghép lấy thì đúng là đoán.
    """
    service = LayoutService(db)
    service.save(floor_id, payload.placements, actor_id=principal.employee_id)
    db.commit()
    return service.read_floor(floor_id)


@router.delete("/floors/{floor_id}/entities/{entity_id}", status_code=204)
def forget_placement(
    floor_id: str, entity_id: str, db: DbSession, principal: ManagePrincipal
) -> Response:
    """Trả một thực thể về đúng chỗ của nó trong bản vẽ.

    204 cả khi không có gì để bỏ: đích đến là "đứng đúng chỗ bản vẽ", và một
    thực thể chưa từng bị kéo đi thì đã ở đó rồi.
    """
    LayoutService(db).forget(floor_id, entity_id)
    db.commit()
    return Response(status_code=204)


@router.get("/floors/{floor_id}/reconcile", response_model=LayoutReconcileReport)
def reconcile(
    floor_id: str, db: DbSession, principal: ViewPrincipal
) -> LayoutReconcileReport:
    """Đối chiếu vị trí đã lưu với dataset hiện tại. Chỉ đọc, không sửa gì."""
    return LayoutService(db).reconcile(floor_id)
