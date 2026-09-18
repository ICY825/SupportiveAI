"""Event dispatcher dùng chung.

Module phát sự kiện, không gọi trực tiếp module khác
(repository-structure.md §5, §6).

Pilot chạy **đồng bộ trong process**, chưa cần message queue. Giao diện
`publish` / `subscribe` giữ nguyên để sau này đổi sang bất đồng bộ mà
module không phải sửa.
"""

from app.platform.events.base import Event
from app.platform.events.dispatcher import (
    Dispatcher,
    DispatchResult,
    HandlerFailure,
    dispatcher,
    publish,
    subscribe,
)

__all__ = [
    "Event",
    "Dispatcher",
    "DispatchResult",
    "HandlerFailure",
    "dispatcher",
    "publish",
    "subscribe",
]
