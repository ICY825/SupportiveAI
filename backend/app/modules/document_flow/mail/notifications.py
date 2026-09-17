"""Dựng nội dung thông báo cho phân hệ chuyển phát nhanh.

`platform/notification` lo việc gộp theo người và gửi đi; việc viết nội
dung là của module, vì chỉ module mới biết "kiện hàng" nghĩa là gì.

Nội dung theo mail-tracking.md §6.2, cập nhật theo CR-001 §1: file lễ tân
không còn mã vận đơn và đơn vị vận chuyển để in vào email.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from app.core.config import settings
from app.platform.notification import NotificationPayload, Recipient, RenderedMessage

KIND_RECEIVED = "mail_received"
KIND_REMINDER = "mail_reminder"


def _ngay(value: datetime | None) -> str:
    """File lễ tân chỉ ghi ngày, không ghi giờ — in giờ ra là giả chính xác."""
    return value.strftime("%d/%m/%Y") if value else "—"


def _danh_sach_kien(items: Sequence[NotificationPayload]) -> str:
    """Mỗi dòng: người gửi, nội dung, số lượng, ngày về.

    Bốn thứ này là **tất cả** những gì file lễ tân có (CR-001 §1). Không
    còn mã vận đơn hay đơn vị vận chuyển để in, nên người gửi phải đứng đầu
    dòng: đó là thứ duy nhất giúp người nhận đoán ra kiện nào của mình.
    """
    dong = []
    for index, item in enumerate(items, start=1):
        ctx = item.context
        phan = [f"  {index}. Từ {ctx.get('sender') or '(không rõ người gửi)'}"]
        if ctx.get("content_type"):
            phan.append(str(ctx["content_type"]))
        so_luong = int(ctx.get("quantity") or 1)
        if so_luong > 1:
            phan.append(f"{so_luong} kiện")
        phan.append(f"về ngày {_ngay(ctx.get('received_at'))}")
        dong.append(" — ".join(phan))
    return "\n".join(dong)


def _dem_kien(items: Sequence[NotificationPayload]) -> int:
    """Tổng số **kiện**, không phải số dòng (CR-001 §7.1).

    Lễ tân gộp nhiều kiện cùng nguồn trong cùng ngày vào một dòng rồi ghi
    `số lượng`. Nói "bạn có 1 kiện" khi thật ra có 3 thì người nhận xuống
    lấy một kiện rồi về.
    """
    return sum(int(i.context.get("quantity") or 1) for i in items)


def _han_lay(items: Sequence[NotificationPayload]) -> str:
    """Hạn muộn nhất trong nhóm, để một thông báo chỉ nêu một mốc."""
    deadlines = [i.context.get("deadline") for i in items if i.context.get("deadline")]
    return _ngay(max(deadlines)) if deadlines else "—"


def _than_thu(
    recipient: Recipient, items: Sequence[NotificationPayload], mo_dau: str
) -> str:
    return (
        f"Kính gửi {recipient.display_name},\n\n"
        f"{mo_dau}\n\n"
        f"{_danh_sach_kien(items)}\n\n"
        f"Nơi lấy: {settings.mail_pickup_location}\n"
        f"Vui lòng nhận trước: {_han_lay(items)}\n\n"
        "Sau khi lấy, xin quét mã QR dán tại khu để đơn để xác nhận đã nhận.\n\n"
        "Trân trọng,\n"
        f"{settings.mail_from_name}"
    )


def render_received(recipient: Recipient, items: Sequence[NotificationPayload]) -> RenderedMessage:
    """Thông báo lần đầu, ngay khi HC bấm gửi."""
    so_kien = _dem_kien(items)
    return RenderedMessage(
        subject=f"[Chuyển phát] Bạn có {so_kien} kiện hàng cần nhận",
        body=_than_thu(
            recipient,
            items,
            f"Bạn có {so_kien} kiện hàng đã về, hiện đang chờ tại nơi lấy:",
        ),
        data={"item_count": so_kien, "row_count": len(items), "kind": KIND_RECEIVED},
    )


def render_reminder(recipient: Recipient, items: Sequence[NotificationPayload]) -> RenderedMessage:
    """Nhắc lại ở mốc T+2 (§8.3).

    Chỉ là nhắc cho người quên kiểm tra hộp thư, không phải leo thang —
    nên không cc ai và giọng văn giữ nguyên như lần đầu.
    """
    so_kien = _dem_kien(items)
    return RenderedMessage(
        subject=f"[Nhắc lại] {so_kien} kiện hàng của bạn vẫn chưa được nhận",
        body=_than_thu(
            recipient,
            items,
            f"Nhắc lại: {so_kien} kiện hàng sau vẫn đang chờ bạn tới nhận:",
        ),
        data={"item_count": so_kien, "row_count": len(items), "kind": KIND_REMINDER},
    )
