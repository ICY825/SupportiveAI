"""Đề 1 — Quy hoạch văn phòng (phần chỗ ngồi).

Phân hệ này **không giữ hình học**. Bàn, phòng, vật cản và tọa độ nằm trong
dataset sinh từ bản vẽ (`data/floors/`), frontend đọc thẳng file đó; backend
chỉ giữ việc ai ngồi đâu và đọc dataset để biết mã chỗ ngồi nào có thật
(Issue #2 mục 2 và 3).

Cũng vì thế mà không có `workflow.py`: gán chỗ ngồi không phải một máy trạng
thái nhiều bước như luồng thư hay công văn — chỉ có đang ngồi hoặc đã thu
hồi, và cái đó là `released_at IS NULL`.

Bật/tắt bằng biến môi trường:

    ENABLED_MODULES=seat
"""

from app.modules.registry import ModuleSpec


def register() -> None:
    """Nạp bảng quyền của phân hệ vào lõi chung."""
    from app.modules.resource_allocation.seat.permissions import grant_defaults

    grant_defaults()


def _router():
    from app.modules.resource_allocation.seat.router import router

    return router


MODULE = ModuleSpec(name="seat", router=_router(), register=register)

__all__ = ["MODULE", "register"]
