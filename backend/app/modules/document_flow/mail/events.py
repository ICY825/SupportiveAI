"""Sự kiện phân hệ chuyển phát nhanh phát ra.

Module phát sự kiện, không gọi trực tiếp module hay dịch vụ nào khác
(repository-structure.md §6). `platform/notification` nghe và gửi thông
báo; module không biết thông báo đi bằng kênh gì (§6.3).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import ClassVar

from app.platform.events import Event


@dataclass(frozen=True, kw_only=True)
class MailReceived(Event):
    """HC đã soát xong và bấm gửi cho một lô.

    Mang theo **cả lô** chứ không phải từng kiện, vì thông báo phải gộp
    theo người (§6.1): một người có nhiều kiện chỉ nhận một thông báo.
    Bắn từng kiện một thì không còn chỗ nào gộp được nữa.
    """

    name: ClassVar[str] = "MAIL_RECEIVED"

    entity_type: str = "mail_batch"
    entity_id: str                      # batch_id
    item_ids: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True, kw_only=True)
class MailOverdue(Event):
    """Đến mốc nhắc lại mà vẫn chưa ai nhận (§8.3, T+2).

    Cũng gộp theo người như lần gửi đầu (§8.4).
    """

    name: ClassVar[str] = "MAIL_OVERDUE"

    entity_type: str = "mail_item"
    item_ids: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True, kw_only=True)
class MailAbandoned(Event):
    """Kiện chuyển sang `Tồn đọng` (§8.5, T+5).

    Không gửi cho người nhận nữa — chỉ để HC nắm và xử lý.
    """

    name: ClassVar[str] = "MAIL_ABANDONED"

    entity_type: str = "mail_item"
    entity_id: str
