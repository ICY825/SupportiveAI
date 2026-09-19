"""Đề 1 — Quy hoạch văn phòng (phần bố trí bàn).

Anh em với `seat`, cùng một đề bài, khác câu hỏi: `seat` trả lời *ai ngồi
đâu*, phân hệ này trả lời *cái bàn đứng ở đâu* sau khi có người kéo nó đi.
Tách thành hai module vì tắt được riêng, và vì `seat` khai rõ là nó **không
giữ hình học** — nhập vị trí bàn vào đó sẽ làm câu ấy thành sai.

Phân hệ này giữ *phần chênh* so với bản vẽ, không giữ bản vẽ: dataset
(`data/floors/`) vẫn là nguồn thật cho việc có những bàn nào, còn DB chỉ nhớ
những cái đã bị đặt lại chỗ. Xem `models.py`.

Bật/tắt bằng biến môi trường:

    ENABLED_MODULES=layout
"""

from app.modules.registry import ModuleSpec


def register() -> None:
    """Nạp bảng quyền của phân hệ vào lõi chung."""
    from app.modules.resource_allocation.layout.permissions import grant_defaults

    grant_defaults()


def _router():
    from app.modules.resource_allocation.layout.router import router

    return router


MODULE = ModuleSpec(name="layout", router=_router(), register=register)

__all__ = ["MODULE", "register"]
