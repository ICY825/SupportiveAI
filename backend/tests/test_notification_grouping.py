"""Test gộp thông báo theo người.

mail-tracking.md §6.1: "Một người có nhiều kiện trong cùng lô chỉ nhận
một thông báo". §14 xếp việc spam người dùng là rủi ro phải chặn.
"""

from __future__ import annotations

import pytest

from app.platform.notification import (
    DeliveryResult,
    NotificationPayload,
    NotificationService,
    NotificationStatus,
    Recipient,
    RenderedMessage,
)
from app.platform.notification.models import Notification

DUYEN = Recipient(employee_id="e1", display_name="Phạm Thị Duyên", email="duyen@example.com")
NAM = Recipient(employee_id="e2", display_name="Lưu Hải Nam", email="nam@example.com")


def render(recipient: Recipient, items) -> RenderedMessage:
    codes = ", ".join(item.context["tracking_code"] for item in items)
    return RenderedMessage(
        subject=f"Bạn có {len(items)} kiện",
        body=f"{recipient.display_name}: {codes}",
        data={"count": len(items)},
    )


def payload(recipient: Recipient, code: str) -> NotificationPayload:
    return NotificationPayload(
        recipient=recipient,
        entity_type="mail_item",
        entity_id=code,
        context={"tracking_code": code},
    )


@pytest.fixture
def service(db, channels) -> NotificationService:
    return NotificationService(db, channels=channels)


def test_mot_nguoi_nhieu_kien_chi_mot_thong_bao(service, db):
    sent = service.send_grouped(
        kind="mail_received",
        payloads=[payload(DUYEN, "VN001"), payload(DUYEN, "VN002"), payload(DUYEN, "VN003")],
        renderer=render,
    )

    assert len(sent) == 1
    assert db.query(Notification).count() == 1
    assert sent[0].subject == "Bạn có 3 kiện"
    # Ba kiện vẫn truy ngược được từng cái.
    assert {item.entity_id for item in sent[0].items} == {"VN001", "VN002", "VN003"}


def test_nhieu_nguoi_thi_moi_nguoi_mot_thong_bao(service):
    sent = service.send_grouped(
        kind="mail_received",
        payloads=[payload(DUYEN, "VN001"), payload(NAM, "GHN001"), payload(DUYEN, "VN002")],
        renderer=render,
    )

    assert len(sent) == 2
    by_recipient = {n.recipient_employee_id: n for n in sent}
    assert by_recipient["e1"].subject == "Bạn có 2 kiện"
    assert by_recipient["e2"].subject == "Bạn có 1 kiện"


def test_giu_thu_tu_xuat_hien(service):
    sent = service.send_grouped(
        kind="mail_received",
        payloads=[payload(NAM, "GHN001"), payload(DUYEN, "VN001")],
        renderer=render,
    )
    assert [n.recipient_employee_id for n in sent] == ["e2", "e1"]


def test_danh_sach_rong_khong_gui_gi(service, db):
    assert service.send_grouped(kind="mail_received", payloads=[], renderer=render) == []
    assert db.query(Notification).count() == 0


def test_gui_thanh_cong_thi_danh_dau_sent(service):
    sent = service.send_grouped(kind="mail_received", payloads=[payload(DUYEN, "VN001")], renderer=render)
    assert sent[0].status == NotificationStatus.SENT
    assert sent[0].sent_at is not None


class KenhHong:
    name = "hong"

    def send(self, recipient, message):
        raise RuntimeError("SMTP timeout")


class KenhTuChoi:
    name = "tu_choi"

    def send(self, recipient, message):
        return DeliveryResult(ok=False, error="địa chỉ không tồn tại")


def test_kenh_nem_loi_thi_luu_failed_chu_khong_vo(db, channels):
    channels.register(KenhHong(), default=True)
    sent = NotificationService(db, channels=channels).send_grouped(
        kind="mail_received", payloads=[payload(DUYEN, "VN001")], renderer=render
    )
    assert sent[0].status == NotificationStatus.FAILED
    assert "SMTP timeout" in sent[0].error
    # Vẫn còn bản ghi để tra lại và gửi lại.
    assert db.query(Notification).count() == 1


def test_kenh_tra_ve_that_bai_thi_ghi_ly_do(db, channels):
    channels.register(KenhTuChoi(), default=True)
    sent = NotificationService(db, channels=channels).send_grouped(
        kind="mail_received", payloads=[payload(DUYEN, "VN001")], renderer=render
    )
    assert sent[0].status == NotificationStatus.FAILED
    assert sent[0].error == "địa chỉ không tồn tại"


def test_dem_so_lan_nhac_cua_mot_kien(service, db):
    """Phục vụ cột "đã nhắc mấy lần" ở màn hình quá hạn."""
    from app.platform.notification.models import NotificationItem

    service.send_grouped(kind="mail_received", payloads=[payload(DUYEN, "VN001")], renderer=render)
    service.send_grouped(kind="mail_reminder", payloads=[payload(DUYEN, "VN001")], renderer=render)

    count = (
        db.query(NotificationItem)
        .filter(NotificationItem.entity_type == "mail_item", NotificationItem.entity_id == "VN001")
        .count()
    )
    assert count == 2
