"""Engine thông báo dùng chung.

Module chỉ phát sự kiện; việc chọn kênh và gộp theo người nằm ở đây.
"""

from app.platform.notification.channels import (
    Channel,
    ChannelRegistry,
    DeliveryResult,
    OutboxChannel,
    Recipient,
    RenderedMessage,
    registry,
)
from app.platform.notification.email import EmailChannel, build_channel_from_settings
from app.platform.notification.models import (
    Notification,
    NotificationItem,
    NotificationStatus,
)
from app.platform.notification.service import (
    NotificationPayload,
    NotificationService,
    Renderer,
)

__all__ = [
    "Channel",
    "EmailChannel",
    "build_channel_from_settings",
    "ChannelRegistry",
    "DeliveryResult",
    "Notification",
    "NotificationItem",
    "NotificationPayload",
    "NotificationService",
    "NotificationStatus",
    "OutboxChannel",
    "Recipient",
    "RenderedMessage",
    "Renderer",
    "registry",
]
