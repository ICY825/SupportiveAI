"""Gửi thông báo, gộp theo người.

Quy tắc quan trọng nhất của lớp này: **một người nhận đúng một thông báo
cho một lô**, dù có bao nhiêu kiện. Áp dụng cho cả lần gửi đầu và các lần
nhắc lại (mail-tracking.md §6.1 và §8.4).

Gộp nằm ở platform chứ không ở module vì cả 4 phân hệ đều cần: một người
vừa có thư, vừa có công văn quá hạn cũng không nên bị bắn hai lần bởi
cùng một job nhắc.
"""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core.database import utcnow
from app.platform.notification.channels import (
    Channel,
    ChannelRegistry,
    Recipient,
    RenderedMessage,
)
from app.platform.notification.channels import registry as default_registry
from app.platform.notification.models import Notification, NotificationItem, NotificationStatus


@dataclass(frozen=True)
class NotificationPayload:
    """Một mẩu nội dung cần báo cho một người.

    Nhiều payload cùng `recipient.employee_id` sẽ được gộp vào một
    thông báo duy nhất.
    """

    recipient: Recipient
    entity_type: str
    entity_id: str
    context: dict = field(default_factory=dict)


# Module cung cấp hàm dựng nội dung: nhận người nhận + các mẩu của họ,
# trả về một message duy nhất. Platform không biết viết nội dung thư.
Renderer = Callable[[Recipient, Sequence[NotificationPayload]], RenderedMessage]


class NotificationService:
    def __init__(
        self,
        db: Session,
        *,
        channels: ChannelRegistry | None = None,
    ) -> None:
        self.db = db
        self.channels = channels or default_registry

    def send_grouped(
        self,
        *,
        kind: str,
        payloads: Iterable[NotificationPayload],
        renderer: Renderer,
        channel_name: str | None = None,
    ) -> list[Notification]:
        """Gộp `payloads` theo người nhận rồi gửi mỗi người một thông báo."""
        grouped = self._group_by_recipient(payloads)
        if not grouped:
            return []

        channel = self.channels.get(channel_name)
        notifications: list[Notification] = []
        for recipient, items in grouped.values():
            notifications.append(
                self._send_one(kind=kind, recipient=recipient, items=items,
                               renderer=renderer, channel=channel)
            )
        return notifications

    @staticmethod
    def _group_by_recipient(
        payloads: Iterable[NotificationPayload],
    ) -> "OrderedDict[str, tuple[Recipient, list[NotificationPayload]]]":
        """Giữ nguyên thứ tự xuất hiện để nội dung thông báo ổn định."""
        grouped: OrderedDict[str, tuple[Recipient, list[NotificationPayload]]] = OrderedDict()
        for payload in payloads:
            key = payload.recipient.employee_id
            if key not in grouped:
                grouped[key] = (payload.recipient, [])
            grouped[key][1].append(payload)
        return grouped

    def _send_one(
        self,
        *,
        kind: str,
        recipient: Recipient,
        items: Sequence[NotificationPayload],
        renderer: Renderer,
        channel: Channel,
    ) -> Notification:
        message = renderer(recipient, items)
        notification = Notification(
            recipient_employee_id=recipient.employee_id,
            kind=kind,
            channel=channel.name,
            subject=message.subject,
            body=message.body,
            status=NotificationStatus.PENDING,
            data=message.data or None,
        )
        notification.items = [
            NotificationItem(entity_type=item.entity_type, entity_id=item.entity_id)
            for item in items
        ]
        self.db.add(notification)
        self.db.flush()

        try:
            result = channel.send(recipient, message)
        except Exception as exc:  # noqa: BLE001 - lỗi kênh không được làm hỏng giao dịch nghiệp vụ
            notification.status = NotificationStatus.FAILED
            notification.error = f"{type(exc).__name__}: {exc}"
            return notification

        if result.ok:
            notification.status = NotificationStatus.SENT
            notification.sent_at = utcnow()
        else:
            notification.status = NotificationStatus.FAILED
            notification.error = result.error
        return notification
