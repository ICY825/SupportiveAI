"""Dựng nội dung thông báo cho phân hệ chuyển phát nhanh.

`platform/notification` lo việc gộp theo người và gửi đi; việc viết nội
dung là của module, vì chỉ module mới biết "kiện hàng" nghĩa là gì.

Nội dung theo mail-tracking.md §6.2, cập nhật theo CR-001 §1: file lễ tân
không còn mã vận đơn và đơn vị vận chuyển để in vào email.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from html import escape

from app.core.config import settings
from app.core.database import new_uuid
from app.core.security import create_confirm_token
from app.platform.notification import NotificationPayload, Recipient, RenderedMessage

KIND_RECEIVED = "mail_received"
KIND_REMINDER = "mail_reminder"

# `ent` trong token của link xác nhận. Token mang **người nhận + đúng các
# kiện trong email đó** — xem `MailService.confirm_link_items`.
CONFIRM_ENTITY = "mail_recipient"


def confirm_link(recipient: Recipient, items: Sequence[NotificationPayload]) -> str:
    """Link "Tôi đã nhận hàng" cho một email (§7.2, đường phụ).

    Không cần đăng nhập: phần lớn CBNV không có tài khoản. Token giới hạn
    vào đúng các kiện trong email, nên email bị chuyển tiếp cũng chỉ lộ
    đúng những kiện đó.
    """
    token = create_confirm_token(
        CONFIRM_ENTITY,
        recipient.employee_id,
        jti=new_uuid(),
        claims={"items": [item.entity_id for item in items]},
    )
    # Frontend dùng HashRouter nên đường dẫn trang nằm sau `#/`.
    return f"{settings.public_base_url.rstrip('/')}/#/confirm?token={token}"


def _ngay(value: datetime | None) -> str:
    """File lễ tân chỉ ghi ngày, không ghi giờ — in giờ ra là giả chính xác."""
    return value.strftime("%d/%m/%Y") if value else "—"


def _danh_sach_kien(items: Sequence[NotificationPayload]) -> str:
    """Mỗi dòng: người gửi, nội dung, số lượng, ngày về.

    Bốn thứ này là **tất cả** những gì file lễ tân có (CR-001 §1). Không
    còn mã vận đơn hay đơn vị vận chuyển để in, nên người gửi phải đứng đầu
    dòng: đó là thứ duy nhất giúp người nhận đoán ra kiện nào của mình.
    """
    return "\n".join(
        f"  {index}. {_mo_ta_kien(item)}" for index, item in enumerate(items, start=1)
    )


def _mo_ta_kien(item: NotificationPayload) -> str:
    ctx = item.context
    phan = [f"Từ {ctx.get('sender') or '(không rõ người gửi)'}"]
    if ctx.get("content_type"):
        phan.append(str(ctx["content_type"]))
    so_luong = int(ctx.get("quantity") or 1)
    if so_luong > 1:
        phan.append(f"{so_luong} kiện")
    phan.append(f"về ngày {_ngay(ctx.get('received_at'))}")
    return " — ".join(phan)


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
    recipient: Recipient, items: Sequence[NotificationPayload], mo_dau: str, link: str
) -> str:
    return (
        f"Kính gửi {recipient.display_name},\n\n"
        f"{mo_dau}\n\n"
        f"{_danh_sach_kien(items)}\n\n"
        f"Nơi lấy: {settings.mail_pickup_location}\n"
        f"Vui lòng nhận trước: {_han_lay(items)}\n\n"
        "Sau khi lấy, xin quét mã QR dán tại khu để đơn để xác nhận đã nhận,\n"
        f"hoặc mở link sau: {link}\n\n"
        "Trân trọng,\n"
        f"{settings.mail_from_name}"
    )


def _than_thu_html(
    recipient: Recipient, items: Sequence[NotificationPayload], mo_dau: str, link: str
) -> str:
    """Cùng nội dung với bản chữ, thêm nút bấm to cho điện thoại.

    Chỉ dùng style inline — phần lớn trình đọc email bỏ thẻ `<style>`.
    """
    dong = "".join(f'<li style="margin:4px 0">{escape(_mo_ta_kien(i))}</li>' for i in items)
    href = escape(link, quote=True)
    return (
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.5">'
        f"<p>Kính gửi {escape(recipient.display_name)},</p>"
        f"<p>{escape(mo_dau)}</p>"
        f'<ol style="padding-left:20px">{dong}</ol>'
        f"<p><strong>Nơi lấy:</strong> {escape(settings.mail_pickup_location)}<br>"
        f"<strong>Vui lòng nhận trước:</strong> {escape(_han_lay(items))}</p>"
        "<p>Sau khi lấy, xin quét mã QR dán tại khu để đơn, hoặc bấm nút dưới đây:</p>"
        f'<p><a href="{href}" style="display:inline-block;padding:12px 22px;'
        "background:#C8102E;color:#ffffff;text-decoration:none;border-radius:6px;"
        'font-weight:bold">Tôi đã nhận hàng</a></p>'
        '<p style="color:#666;font-size:12px">Không bấm được nút thì chép link này vào '
        f'trình duyệt:<br><span style="word-break:break-all">{escape(link)}</span></p>'
        f"<p>Trân trọng,<br>{escape(settings.mail_from_name)}</p>"
        "</div>"
    )


def _render(
    recipient: Recipient,
    items: Sequence[NotificationPayload],
    *,
    subject: str,
    mo_dau: str,
    kind: str,
    so_kien: int,
) -> RenderedMessage:
    # Mỗi email một link riêng, nên lời nhắc T+2 mang link mới — link cũ
    # vẫn dùng được tới khi hết hạn.
    link = confirm_link(recipient, items)
    return RenderedMessage(
        subject=subject,
        body=_than_thu(recipient, items, mo_dau, link),
        html=_than_thu_html(recipient, items, mo_dau, link),
        data={"item_count": so_kien, "row_count": len(items), "kind": kind},
    )


def render_received(recipient: Recipient, items: Sequence[NotificationPayload]) -> RenderedMessage:
    """Thông báo lần đầu, ngay khi HC bấm gửi."""
    so_kien = _dem_kien(items)
    return _render(
        recipient,
        items,
        subject=f"[Chuyển phát] Bạn có {so_kien} kiện hàng cần nhận",
        mo_dau=f"Bạn có {so_kien} kiện hàng đã về, hiện đang chờ tại nơi lấy:",
        kind=KIND_RECEIVED,
        so_kien=so_kien,
    )


def render_reminder(recipient: Recipient, items: Sequence[NotificationPayload]) -> RenderedMessage:
    """Nhắc lại ở mốc T+2 (§8.3).

    Chỉ là nhắc cho người quên kiểm tra hộp thư, không phải leo thang —
    nên không cc ai và giọng văn giữ nguyên như lần đầu.
    """
    so_kien = _dem_kien(items)
    return _render(
        recipient,
        items,
        subject=f"[Nhắc lại] {so_kien} kiện hàng của bạn vẫn chưa được nhận",
        mo_dau=f"Nhắc lại: {so_kien} kiện hàng sau vẫn đang chờ bạn tới nhận:",
        kind=KIND_REMINDER,
        so_kien=so_kien,
    )
