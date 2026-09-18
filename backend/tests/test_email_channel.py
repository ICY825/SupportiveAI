"""Test kênh email.

Không đụng tới SMTP server thật — thay `smtplib.SMTP` bằng bản giả và
kiểm chính những gì gửi đi.
"""

from __future__ import annotations

import smtplib

import pytest

from app.platform.notification.channels import Recipient, RenderedMessage
from app.platform.notification.email import EmailChannel, build_channel_from_settings

DUYEN = Recipient(employee_id="e1", display_name="Phạm Thị Duyên", email="duyen@example.com")
MESSAGE = RenderedMessage(subject="Bạn có 2 kiện", body="VN001, VN002")


class FakeSMTP:
    """Ghi lại mọi thao tác thay vì nối mạng."""

    instances: list["FakeSMTP"] = []

    def __init__(self, host, port, timeout=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.actions: list[str] = []
        self.sent: list = []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.actions.append("quit")
        return False

    def starttls(self):
        self.actions.append("starttls")

    def ehlo(self):
        self.actions.append("ehlo")

    def login(self, username, password):
        self.actions.append(f"login:{username}")

    def send_message(self, message):
        self.actions.append("send")
        self.sent.append(message)


@pytest.fixture(autouse=True)
def reset_fake():
    FakeSMTP.instances.clear()
    yield
    FakeSMTP.instances.clear()


@pytest.fixture
def channel(monkeypatch):
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    return EmailChannel(
        host="smtp.example.com",
        port=587,
        username="hanhchinh@example.com",
        password="secret",
        use_starttls=True,
        sender="hanhchinh@example.com",
        sender_name="Phòng Hành chính",
    )


class TestDungThuDienTu:
    def test_tieu_de_va_noi_dung(self, channel):
        email = channel.build_message(DUYEN, MESSAGE)
        assert email["Subject"] == "Bạn có 2 kiện"
        assert email.get_content().strip() == "VN001, VN002"

    def test_nguoi_gui_la_hop_thu_dung_chung(self, channel):
        email = channel.build_message(DUYEN, MESSAGE)
        assert "hanhchinh@example.com" in email["From"]
        assert "Phòng Hành chính" in email["From"]

    def test_nguoi_nhan_co_ten(self, channel):
        email = channel.build_message(DUYEN, MESSAGE)
        assert "duyen@example.com" in email["To"]

    def test_kem_ban_html_khi_co(self, channel):
        message = RenderedMessage(subject="x", body="chữ thuần", html="<p>đậm</p>")
        email = channel.build_message(DUYEN, message)
        assert email.is_multipart()
        types = {part.get_content_type() for part in email.walk()}
        assert {"text/plain", "text/html"} <= types


class TestGui:
    def test_gui_thanh_cong(self, channel):
        assert channel.send(DUYEN, MESSAGE).ok

        smtp = FakeSMTP.instances[0]
        assert (smtp.host, smtp.port) == ("smtp.example.com", 587)
        assert smtp.actions == ["starttls", "ehlo", "login:hanhchinh@example.com", "send", "quit"]

    def test_khong_login_khi_relay_noi_bo_khong_can_xac_thuc(self, monkeypatch):
        monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
        channel = EmailChannel(
            host="relay.noi-bo.local", port=25, username="", password="",
            use_starttls=False, sender="hanhchinh@example.com",
        )
        assert channel.send(DUYEN, MESSAGE).ok
        assert FakeSMTP.instances[0].actions == ["send", "quit"]

    def test_nhan_su_thieu_email_thi_bao_ly_do(self, channel):
        khong_email = Recipient(employee_id="e9", display_name="Không có mail", email=None)
        result = channel.send(khong_email, MESSAGE)
        assert not result.ok
        assert "chưa có địa chỉ email" in result.error
        assert FakeSMTP.instances == [], "không được mở kết nối khi chưa có email"

    def test_smtp_hong_thi_tra_ve_that_bai_chu_khong_nem_loi(self, channel, monkeypatch):
        def no(*args, **kwargs):
            raise smtplib.SMTPAuthenticationError(535, b"sai tai khoan")

        monkeypatch.setattr(smtplib, "SMTP", no)
        result = channel.send(DUYEN, MESSAGE)
        assert not result.ok
        assert "SMTPAuthenticationError" in result.error

    def test_mat_mang_cung_khong_nem_loi(self, channel, monkeypatch):
        def no(*args, **kwargs):
            raise OSError("connection refused")

        monkeypatch.setattr(smtplib, "SMTP", no)
        assert not channel.send(DUYEN, MESSAGE).ok


class TestCauHinh:
    def test_thieu_host_thi_bao_ngay(self):
        with pytest.raises(ValueError, match="smtp_host"):
            EmailChannel(host="", sender="a@b.c")

    def test_thieu_nguoi_gui_thi_bao_ngay(self):
        with pytest.raises(ValueError, match="mail_from"):
            EmailChannel(host="smtp.example.com", sender="")

    def test_khong_duoc_bat_ca_ssl_lan_starttls(self):
        with pytest.raises(ValueError, match="một trong"):
            EmailChannel(host="h", sender="a@b.c", use_ssl=True, use_starttls=True)

    def test_chua_cau_hinh_smtp_thi_khong_dung_email(self, monkeypatch):
        """Chưa có SMTP_HOST thì giữ OutboxChannel, không tự dựng EmailChannel."""
        from app.platform.notification import email as email_module

        monkeypatch.setattr(email_module.settings, "smtp_host", "")
        assert build_channel_from_settings() is None

    def test_co_cau_hinh_thi_dung_email(self, monkeypatch):
        from app.platform.notification import email as email_module

        monkeypatch.setattr(email_module.settings, "smtp_host", "smtp.example.com")
        monkeypatch.setattr(email_module.settings, "mail_from", "hanhchinh@example.com")
        channel = build_channel_from_settings()
        assert channel is not None
        assert channel.name == "email"

    def test_cau_hinh_sai_thi_lui_ve_outbox_chu_khong_sap_app(self, monkeypatch):
        from app.platform.notification import email as email_module

        # Có host nhưng quên mail_from.
        monkeypatch.setattr(email_module.settings, "smtp_host", "smtp.example.com")
        monkeypatch.setattr(email_module.settings, "mail_from", "")
        assert build_channel_from_settings() is None
