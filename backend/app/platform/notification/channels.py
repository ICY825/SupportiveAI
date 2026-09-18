"""Kênh gửi thông báo.

Kênh cụ thể **chưa chốt** ở cấp hệ thống (README B2: email, Teams hay
Zalo OA; B5: Exchange hay Google). Vì vậy ở đây chỉ có giao diện `Channel`
và một cài đặt `OutboxChannel` ghi lại thay vì gửi đi thật.

Module nghiệp vụ không bao giờ chọn kênh — nó chỉ phát sự kiện
(mail-tracking.md §6.3).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Recipient:
    """Người nhận, đã được tầng gọi phân giải sẵn.

    `platform/notification` cố tình **không** import `shared/employee`:
    giữ như vậy thì engine thông báo vẫn dùng được cho người nhận không
    phải nhân sự nội bộ, và chiều phụ thuộc vẫn đúng như
    repository-structure.md §5.
    """

    employee_id: str
    display_name: str
    email: str | None = None
    phone: str | None = None


@dataclass(frozen=True)
class RenderedMessage:
    """Nội dung đã dựng xong, sẵn sàng đưa cho kênh."""

    subject: str
    body: str
    # Bản HTML tuỳ chọn. Kênh nào không hiểu HTML thì bỏ qua, `body` luôn
    # là bản chữ thuần đọc được.
    html: str | None = None
    data: dict = field(default_factory=dict)


@dataclass(frozen=True)
class DeliveryResult:
    ok: bool
    error: str | None = None


@runtime_checkable
class Channel(Protocol):
    name: str

    def send(self, recipient: Recipient, message: RenderedMessage) -> DeliveryResult: ...


class OutboxChannel:
    """Kênh mặc định của pilot: không gửi đi đâu cả.

    Thông báo vẫn được lưu đầy đủ vào bảng `notification` với trạng thái
    `pending`, nên luồng nghiệp vụ và KPI kiểm thử được ngay mà không phải
    chờ chốt kênh thật. Khi B2/B5 có câu trả lời, thêm một lớp cài đặt
    `Channel` mới và đổi cấu hình — không phải sửa module nào.
    """

    name = "outbox"

    def send(self, recipient: Recipient, message: RenderedMessage) -> DeliveryResult:
        logger.info(
            "[outbox] gửi tới %s (%s): %s",
            recipient.display_name,
            recipient.employee_id,
            message.subject,
        )
        return DeliveryResult(ok=True)


class ChannelRegistry:
    def __init__(self) -> None:
        self._channels: dict[str, Channel] = {}
        self._default: str | None = None

    def register(self, channel: Channel, *, default: bool = False) -> None:
        self._channels[channel.name] = channel
        if default or self._default is None:
            self._default = channel.name

    def get(self, name: str | None = None) -> Channel:
        key = name or self._default
        if key is None:
            raise LookupError("Chưa đăng ký kênh thông báo nào")
        try:
            return self._channels[key]
        except KeyError:
            raise LookupError(f"Không có kênh thông báo tên {key!r}") from None

    def names(self) -> tuple[str, ...]:
        return tuple(self._channels)

    def clear(self) -> None:
        self._channels.clear()
        self._default = None


registry = ChannelRegistry()
registry.register(OutboxChannel(), default=True)
