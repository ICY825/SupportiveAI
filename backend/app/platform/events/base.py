"""Lớp gốc của sự kiện."""

from __future__ import annotations

from dataclasses import dataclass, field, fields
from datetime import datetime
from typing import Any, ClassVar

from app.core.database import new_uuid, utcnow


@dataclass(frozen=True, kw_only=True)
class Event:
    """Sự kiện nghiệp vụ.

    Lớp con đặt `name` theo bảng ở repository-structure.md §6, ví dụ
    `MAIL_RECEIVED`. Sự kiện là bất biến và chỉ chứa dữ liệu thô
    (id, thời điểm) — không mang theo ORM object, vì handler có thể chạy
    ngoài session đã tạo ra nó.
    """

    name: ClassVar[str] = "EVENT"

    event_id: str = field(default_factory=new_uuid)
    occurred_at: datetime = field(default_factory=utcnow)
    actor_id: str | None = None

    def payload(self) -> dict[str, Any]:
        """Dữ liệu riêng của sự kiện, bỏ các trường khung."""
        skip = {"event_id", "occurred_at", "actor_id"}
        return {f.name: getattr(self, f.name) for f in fields(self) if f.name not in skip}
