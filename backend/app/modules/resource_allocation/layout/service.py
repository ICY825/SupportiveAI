"""Nghiệp vụ bố trí mặt bằng.

Một quy tắc chi phối cả file: **ghi là gộp.** Một lần lưu chỉ phủ một khu vực
đang sửa, nên bản ghi không có trong lần lưu này phải giữ nguyên. Thay toàn bộ
thì mọi khu vực khác mất vị trí đã lưu, và người dùng không có cách nào biết
cho tới lúc mở lại đúng khu vực đó.

Khác `seat/service.py` ở một điểm cố ý: **không chặn id lạ.** Bên chỗ ngồi,
một mã không có trong dataset là lỗi, vì backend không bao giờ tự tạo chỗ
ngồi. Bên này thì người dùng thêm được bàn mới, và bàn đó chưa có trong bản
vẽ theo đúng định nghĩa. Chặn ở đây sẽ làm hỏng chính tính năng đó.

Cái thay cho việc chặn là `reconcile()`: đọc, không sửa, và chỉ ra bản ghi
nào đang trỏ vào hư không. Frontend còn một lớp chắn nữa —
`mergeStoredPlacements` chỉ tin vị trí đã lưu của thực thể mà dataset hiện
tại vẫn có — nên một bản ghi cũ không thể làm sống lại cái bàn đã bị xóa.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.modules.resource_allocation.common.floor_catalog import FloorCatalog, load_catalog
from app.modules.resource_allocation.layout.models import LayoutPlacement
from app.modules.resource_allocation.layout.repository import LayoutRepository
from app.modules.resource_allocation.layout.schemas import (
    FloorLayoutRead,
    LayoutReconcileReport,
    PlacementRead,
    PlacementWrite,
    StalePlacement,
)

#: Lý do một bản ghi lệch với dataset. Dùng chung chuỗi với phần chỗ ngồi để
#: hai màn hình đối chiếu nói cùng một thứ tiếng.
REASON_MISSING = "missing-entity"
REASON_OLD_LAYOUT = "old-layout"


class LayoutService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = LayoutRepository(db)

    # --- Đọc ---

    def read_floor(self, floor_id: str) -> FloorLayoutRead:
        """Mọi vị trí đã lưu của một tầng, kèm phiên bản bản vẽ hiện tại."""
        catalog = load_catalog(floor_id)
        rows = self.repo.list_for_floor(floor_id)
        return FloorLayoutRead(
            floor_id=floor_id,
            current_layout_version=catalog.layout_version,
            placements=[PlacementRead.model_validate(row) for row in rows],
            stale=sum(1 for row in rows if self._stale_reason(row, catalog) is not None),
        )

    def reconcile(self, floor_id: str) -> LayoutReconcileReport:
        """Đối chiếu vị trí đã lưu với dataset hiện tại. Chỉ đọc, không sửa gì."""
        catalog = load_catalog(floor_id)
        rows = self.repo.list_for_floor(floor_id)
        stale: list[StalePlacement] = []
        for row in rows:
            reason = self._stale_reason(row, catalog)
            if reason is None:
                continue
            stale.append(
                StalePlacement(
                    entity_id=row.entity_id,
                    reason=reason,
                    saved_layout_version=row.layout_version,
                    current_layout_version=catalog.layout_version,
                )
            )
        return LayoutReconcileReport(
            floor_id=floor_id,
            current_layout_version=catalog.layout_version,
            checked=len(rows),
            stale=stale,
        )

    # --- Ghi ---

    def save(
        self,
        floor_id: str,
        placements: Sequence[PlacementWrite],
        *,
        actor_id: str | None = None,
    ) -> list[LayoutPlacement]:
        """Gộp một đợt vị trí vào tầng. Id chưa có thì thêm, đã có thì cập nhật."""
        # Tầng không có dataset thì báo ngay: `load_catalog` ném NotFoundError.
        # Cũng là chỗ lấy phiên bản bản vẽ để đóng dấu lên từng bản ghi.
        catalog = load_catalog(floor_id)
        existing = self.repo.by_entity_id(floor_id, [p.entity_id for p in placements])

        saved: list[LayoutPlacement] = []
        for placement in placements:
            row = existing.get(placement.entity_id)
            is_new = row is None
            if row is None:
                row = LayoutPlacement(floor_id=floor_id, entity_id=placement.entity_id)
            row.x = placement.x
            row.y = placement.y
            row.width = placement.width
            row.depth = placement.depth
            row.rotation = placement.rotation
            row.chair = placement.chair
            row.seated_side = placement.seated_side
            row.layout_version = catalog.layout_version
            row.updated_by = actor_id
            if is_new:
                # Thêm sau khi đã điền đủ: `add()` flush ngay, mà dòng thiếu
                # `layout_version` thì vi phạm NOT NULL.
                self.repo.add(row)
            saved.append(row)

        self.db.flush()
        return saved

    def forget(self, floor_id: str, entity_id: str) -> bool:
        """Bỏ vị trí đã lưu của một thực thể, trả nó về đúng chỗ trong bản vẽ.

        Trả `False` khi không có gì để bỏ. Đó không phải lỗi: "về lại như bản
        vẽ" là trạng thái đích, và một thực thể chưa từng bị kéo đi thì đã ở
        đó rồi.
        """
        row = self.repo.get(floor_id, entity_id)
        if row is None:
            return False
        self.repo.delete(row)
        return True

    # --- Nội bộ ---

    @staticmethod
    def _stale_reason(row: LayoutPlacement, catalog: FloorCatalog) -> str | None:
        if not catalog.has(row.entity_id):
            # Có thể là bàn người dùng tự thêm, cũng có thể là bàn đã bị xóa
            # khỏi bản vẽ. Từ phía backend hai thứ đó nhìn giống hệt nhau, nên
            # đây là báo cáo chứ không phải kết luận.
            return REASON_MISSING
        if row.layout_version != catalog.layout_version:
            return REASON_OLD_LAYOUT
        return None
