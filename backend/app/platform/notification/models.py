"""Bảng thông báo đã phát."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UtcDateTime, new_uuid
from app.platform.audit.models import JSONType


class NotificationStatus:
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class Notification(Base, TimestampMixin):
    """Một thông báo gửi tới **một người**.

    Một người nhiều kiện chỉ có một dòng ở đây, các kiện nằm ở
    `notification_item` — mail-tracking.md §6.1.
    """

    __tablename__ = "notification"
    __table_args__ = (
        Index("ix_notification_recipient", "recipient_employee_id", "created_at"),
        Index("ix_notification_status", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    recipient_employee_id: Mapped[str] = mapped_column(String(36), nullable=False)
    # Loại thông báo do module đặt tên, ví dụ "mail_received" / "mail_reminder".
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    subject: Mapped[str] = mapped_column(String(512), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=NotificationStatus.PENDING)
    sent_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    data: Mapped[dict | None] = mapped_column(JSONType, nullable=True)

    items: Mapped[list["NotificationItem"]] = relationship(
        back_populates="notification", cascade="all, delete-orphan"
    )


class NotificationItem(Base):
    """Một thực thể được nhắc tới trong thông báo.

    Có bảng này thì đếm được "kiện X đã nhắc mấy lần" mà không phải bóc
    JSON, phục vụ cả màn hình quá hạn lẫn KPI.
    """

    __tablename__ = "notification_item"
    __table_args__ = (Index("ix_notification_item_entity", "entity_type", "entity_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    notification_id: Mapped[str] = mapped_column(
        ForeignKey("notification.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)

    notification: Mapped[Notification] = relationship(back_populates="items")
