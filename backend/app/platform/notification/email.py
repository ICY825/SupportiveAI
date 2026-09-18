"""Kênh gửi email qua SMTP.

Module nghiệp vụ không bao giờ import file này — nó chỉ phát sự kiện và
để `NotificationService` chọn kênh (mail-tracking.md §6.3).
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings
from app.platform.notification.channels import DeliveryResult, Recipient, RenderedMessage

logger = logging.getLogger(__name__)


class EmailChannel:
    """Gửi qua SMTP.

    Không tự retry: một lần gửi hỏng được ghi `status='failed'` kèm lý do
    vào bảng `notification`, HC gửi lại từ màn hình quá hạn. Thêm retry tự
    động lúc này sẽ phải bàn cả hàng đợi và chống gửi trùng — chưa đáng
    trong pilot.
    """

    name = "email"

    def __init__(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
        use_starttls: bool | None = None,
        use_ssl: bool | None = None,
        sender: str | None = None,
        sender_name: str | None = None,
        timeout: int | None = None,
    ) -> None:
        self.host = host if host is not None else settings.smtp_host
        self.port = port if port is not None else settings.smtp_port
        self.username = username if username is not None else settings.smtp_username
        self.password = password if password is not None else settings.smtp_password
        self.use_starttls = (
            use_starttls if use_starttls is not None else settings.smtp_use_starttls
        )
        self.use_ssl = use_ssl if use_ssl is not None else settings.smtp_use_ssl
        self.sender = sender if sender is not None else settings.mail_from
        self.sender_name = sender_name if sender_name is not None else settings.mail_from_name
        self.timeout = timeout if timeout is not None else settings.smtp_timeout_seconds

        if not self.host:
            raise ValueError("EmailChannel cần smtp_host")
        if not self.sender:
            raise ValueError("EmailChannel cần mail_from")
        if self.use_ssl and self.use_starttls:
            raise ValueError("Chỉ được chọn một trong smtp_use_ssl (465) hoặc smtp_use_starttls (587)")

    def build_message(self, recipient: Recipient, message: RenderedMessage) -> EmailMessage:
        email = EmailMessage()
        email["Subject"] = message.subject
        email["From"] = formataddr((self.sender_name, self.sender))
        email["To"] = formataddr((recipient.display_name, recipient.email or ""))
        email.set_content(message.body)
        if message.html:
            email.add_alternative(message.html, subtype="html")
        return email

    def send(self, recipient: Recipient, message: RenderedMessage) -> DeliveryResult:
        if not recipient.email:
            # Không phải lỗi hệ thống: danh mục nhân sự thiếu email.
            return DeliveryResult(ok=False, error="Nhân sự chưa có địa chỉ email")

        email = self.build_message(recipient, message)
        try:
            with self._connect() as server:
                if self.use_starttls:
                    server.starttls()
                    server.ehlo()
                if self.username:
                    server.login(self.username, self.password)
                server.send_message(email)
        except (smtplib.SMTPException, OSError) as exc:
            logger.warning("Gửi email tới %s hỏng: %s", recipient.employee_id, exc)
            return DeliveryResult(ok=False, error=f"{type(exc).__name__}: {exc}")
        return DeliveryResult(ok=True)

    def _connect(self):
        if self.use_ssl:
            return smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout)
        return smtplib.SMTP(self.host, self.port, timeout=self.timeout)


def build_channel_from_settings():
    """Chọn kênh theo cấu hình.

    Có `SMTP_HOST` thì gửi email thật; không có thì trả `None` để tầng gọi
    giữ nguyên `OutboxChannel`.
    """
    if not settings.smtp_host:
        return None
    try:
        return EmailChannel()
    except ValueError as exc:
        logger.error("Cấu hình SMTP không hợp lệ (%s) — tạm dùng outbox", exc)
        return None
