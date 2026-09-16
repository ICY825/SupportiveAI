"""Test đọc cấu hình từ biến môi trường.

Danh sách trong `.env` viết dạng `a,b,c`. pydantic-settings mặc định cố
đọc trường list bằng JSON nên dạng này hỏng — đã chặn bằng `NoDecode`.
Có test ở đây vì lỗi đó làm hỏng đúng cơ chế bật/tắt module (§7) mà
không báo gì cho tới lúc khởi động.
"""

from __future__ import annotations

from datetime import time

import pytest

from app.core.config import Settings
from app.modules.registry import MODULE_PACKAGES


class TestEnabledModules:
    def test_doc_danh_sach_dang_phay(self, monkeypatch):
        monkeypatch.setenv("ENABLED_MODULES", "mail,locker")
        assert Settings().enabled_modules == ["mail", "locker"]

    def test_bo_khoang_trang_thua(self, monkeypatch):
        monkeypatch.setenv("ENABLED_MODULES", " mail , locker ")
        assert Settings().enabled_modules == ["mail", "locker"]

    def test_mot_module_duy_nhat(self, monkeypatch):
        """Demo riêng một đề bài cho đầu mối nghiệp vụ (§7)."""
        monkeypatch.setenv("ENABLED_MODULES", "mail")
        assert Settings().enabled_modules == ["mail"]

    def test_tat_het_module(self, monkeypatch):
        monkeypatch.setenv("ENABLED_MODULES", "")
        assert Settings().enabled_modules == []

    def test_mac_dinh_bat_ca_bon_de_bai(self):
        assert set(Settings().enabled_modules) == set(MODULE_PACKAGES)


class TestBusinessDays:
    def test_doc_danh_sach_so(self, monkeypatch):
        monkeypatch.setenv("BUSINESS_DAYS", "0,1,2,3,4,5")
        assert Settings().business_days == [0, 1, 2, 3, 4, 5]

    def test_sap_xep_va_bo_trung(self, monkeypatch):
        monkeypatch.setenv("BUSINESS_DAYS", "4,0,0,2")
        assert Settings().business_days == [0, 2, 4]

    def test_tu_choi_ngay_ngoai_khoang(self, monkeypatch):
        monkeypatch.setenv("BUSINESS_DAYS", "0,7")
        with pytest.raises(ValueError, match="0..6"):
            Settings()

    def test_tu_choi_danh_sach_rong(self, monkeypatch):
        monkeypatch.setenv("BUSINESS_DAYS", "")
        with pytest.raises(ValueError, match="không được rỗng"):
            Settings()


def test_doc_gio_lam_viec(monkeypatch):
    monkeypatch.setenv("BUSINESS_START", "07:30")
    monkeypatch.setenv("BUSINESS_END", "16:30")
    settings = Settings()
    assert settings.business_start == time(7, 30)
    assert settings.business_end == time(16, 30)


def test_file_env_example_doc_duoc():
    """`.env.example` phải luôn nạp được — nó là thứ người mới copy ra dùng."""
    settings = Settings(_env_file=".env.example")
    assert settings.enabled_modules == ["seat", "locker", "mail", "document"]
    assert settings.business_days == [0, 1, 2, 3, 4]
    # HS256 cần khóa từ 32 byte trở lên.
    assert len(settings.secret_key) >= 32
