"""Điều phối sự kiện, đồng bộ trong process."""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TypeVar

from app.platform.events.base import Event

logger = logging.getLogger(__name__)

E = TypeVar("E", bound=Event)
Handler = Callable[[Event], None]


@dataclass(frozen=True)
class HandlerFailure:
    handler_name: str
    error: Exception


@dataclass
class DispatchResult:
    """Kết quả một lần publish.

    Người phát sự kiện tự quyết làm gì với `failures`. Dispatcher không
    ném lỗi thay họ — xem ghi chú "Vì sao không ném lỗi" ở cuối file.
    """

    event: Event
    handled: int = 0
    failures: list[HandlerFailure] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failures


class Dispatcher:
    def __init__(self) -> None:
        self._handlers: dict[type[Event], list[Handler]] = defaultdict(list)

    def subscribe(self, event_type: type[E], handler: Callable[[E], None]) -> None:
        self._handlers[event_type].append(handler)  # type: ignore[arg-type]

    def unsubscribe(self, event_type: type[E], handler: Callable[[E], None]) -> None:
        handlers = self._handlers.get(event_type, [])
        if handler in handlers:  # type: ignore[comparison-overlap]
            handlers.remove(handler)  # type: ignore[arg-type]

    def handlers_for(self, event_type: type[Event]) -> list[Handler]:
        """Gồm cả handler đăng ký cho lớp cha, để nghe được nhóm sự kiện."""
        found: list[Handler] = []
        for registered, handlers in self._handlers.items():
            if issubclass(event_type, registered):
                found.extend(handlers)
        return found

    def publish(self, event: Event) -> DispatchResult:
        result = DispatchResult(event=event)
        for handler in self.handlers_for(type(event)):
            name = getattr(handler, "__qualname__", repr(handler))
            try:
                handler(event)
                result.handled += 1
            except Exception as exc:  # noqa: BLE001 - xem ghi chú cuối file
                logger.exception(
                    "Handler %s lỗi khi xử lý %s (event_id=%s)",
                    name, type(event).__name__, event.event_id,
                )
                result.failures.append(HandlerFailure(handler_name=name, error=exc))
        return result

    def clear(self) -> None:
        self._handlers.clear()


dispatcher = Dispatcher()


def publish(event: Event) -> DispatchResult:
    return dispatcher.publish(event)


def subscribe(event_type: type[E], handler: Callable[[E], None]) -> None:
    dispatcher.subscribe(event_type, handler)


# Vì sao không ném lỗi ra ngoài
# ------------------------------
# Handler ở đây là notification và audit. Nếu để lỗi gửi thông báo ném lên
# thì nó sẽ kéo rollback cả giao dịch nghiệp vụ đã thành công — thư đã ghi
# nhận xong lại bị hủy chỉ vì SMTP timeout. Ngược lại, nuốt lỗi im lặng thì
# mất thông báo mà không ai biết.
#
# Nên: ghi log đầy đủ, trả `failures` về cho người gọi tự xử lý. Khi đổi
# sang dispatcher bất đồng bộ, phần retry sẽ nằm ở đó.
