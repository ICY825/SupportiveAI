"""Bảng vị trí bàn do người dùng đặt lại.

Issue #2 mục 2 chốt: **dataset sinh từ bản vẽ là nguồn thật cho hình học.**
Bảng này không phá quy tắc đó, vì nó không giữ bản vẽ — nó giữ *phần chênh*:
người dùng đã kéo cái bàn nào đi đâu so với chỗ bộ trích xuất đọc được. Bản
vẽ vẫn quyết định có những bàn nào; bảng này chỉ nói bàn đó đang đứng ở đâu
sau khi ai đó sửa.

Hệ quả của cách chia đó, và là lý do file này giống `seat/models.py`:

1. `entity_id` **không có khóa ngoại** — thứ nó trỏ tới nằm trong file JSON.
2. `layout_version` — sha256 của PDF nguồn lúc lưu. Bản vẽ mới đổi hash, nên
   đối chiếu được ngay bản ghi nào đặt theo bản vẽ cũ.
3. Chạy lại bộ trích xuất không kéo theo migration dữ liệu. Bản ghi lệch
   phiên bản bị báo, không bị âm thầm áp lên bản vẽ mới.

Chỉ giữ **trạng thái hiện tại**, mỗi thực thể một dòng: một chỗ ngồi có lịch
sử vì ai ngồi đó là sự kiện, còn cái bàn đứng ở đâu là sự kiện thì không —
nó chỉ có chỗ đang đứng. Cần lịch sử bố trí thì đó là một quyết định khác,
và phải bàn riêng.
"""

from __future__ import annotations

from sqlalchemy import JSON, Float, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, new_uuid

#: Giống `platform/audit/models.py`: JSONB trên Postgres, JSON trên SQLite.
JSONType = JSON().with_variant(JSONB(), "postgresql")


class LayoutPlacement(Base, TimestampMixin):
    """Một thực thể đã được đặt lại vị trí trên một tầng."""

    __tablename__ = "layout_placement"
    __table_args__ = (
        # Mỗi thực thể chỉ có một vị trí hiện tại. Ghi là upsert theo cặp này.
        Index("uq_layout_placement_entity", "floor_id", "entity_id", unique=True),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)

    # --- Thực thể, theo dataset chứ không theo DB ---
    floor_id: Mapped[str] = mapped_column(String(32), nullable=False)
    #: `id` trong dataset (`ws-16-001`), hoặc id của bàn do người dùng thêm.
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    #: sha256 của PDF nguồn lúc lưu — xem ghi chú đầu file.
    layout_version: Mapped[str] = mapped_column(String(64), nullable=False)

    # --- Vị trí ---
    #: Tâm mặt bàn, theo hệ tọa độ của bản vẽ (điểm PDF, gốc trên trái).
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    #: Kích thước lúc góc quay bằng 0: `width` dọc trục X, `depth` dọc trục Y.
    width: Mapped[float] = mapped_column(Float, nullable=False)
    depth: Mapped[float] = mapped_column(Float, nullable=False)
    #: Góc quay thật theo độ, thuận chiều kim đồng hồ. Không làm tròn về bội
    #: số của 90: tầng 16 có 18 cái bàn vẽ nghiêng ~45° dọc mặt đứng xiên.
    rotation: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # --- Phần phụ thuộc hình dạng, không tách thành cột ---
    #: Vết ghế đi kèm bàn. Hình dạng thay đổi theo loại bàn nên để nguyên
    #: JSON; frontend là bên duy nhất hiểu nó (`SpatialPlacement.chair`).
    chair: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    #: Cạnh người ngồi, khi người dùng ghi đè suy luận từ ghế.
    seated_side: Mapped[str | None] = mapped_column(String(8), nullable=True)

    # A human decision that the saved placement may disagree with the drawing.
    # updated_at and updated_by are the recorded date and actor.
    override_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    override_conflicts: Mapped[list[dict] | None] = mapped_column(JSONType, nullable=True)

    # --- Vết ---
    #: Người bấm lưu. Để trống khi do nhập liệu hàng loạt tạo ra.
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<LayoutPlacement {self.floor_id} {self.entity_id} ({self.x:.1f}, {self.y:.1f})>"
