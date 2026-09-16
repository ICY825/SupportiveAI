"""Test chuẩn hóa số điện thoại và tên.

mail-tracking.md §4.1 nói bước này "quyết định phần lớn tỷ lệ khớp tự
động", nên nó là nền của mục ưu tiên kiểm thử số 1.
"""

from __future__ import annotations

import pytest

from app.shared.employee.normalization import normalize_name, normalize_phone, phone_last4


class TestNormalizePhone:
    @pytest.mark.parametrize(
        "raw",
        [
            "0912345678",
            "0912 345 678",
            "0912.345.678",
            "0912-345-678",
            "  0912345678  ",
            "(091) 234 5678",
            "+84912345678",
            "+84 912 345 678",
            "84912345678",
            "0084912345678",
        ],
    )
    def test_moi_cach_viet_deu_ve_mot_dang(self, raw):
        assert normalize_phone(raw) == "0912345678"

    def test_so_khong_co_tien_to(self):
        assert normalize_phone("912345678") == "0912345678"

    def test_giu_nguyen_so_da_dung_dang(self):
        assert normalize_phone("0987654321") == "0987654321"

    @pytest.mark.parametrize("raw", [None, "", "   ", "---", "abc"])
    def test_rong_hoac_khong_co_chu_so_tra_ve_none(self, raw):
        assert normalize_phone(raw) is None

    def test_khong_nham_840_thanh_ma_quoc_gia(self):
        """"840..." là số nội địa bắt đầu bằng 0, không phải +84 rồi 0."""
        assert normalize_phone("840912345678") == "0840912345678"


class TestPhoneLast4:
    def test_lay_4_so_cuoi_sau_khi_chuan_hoa(self):
        assert phone_last4("+84 912 345 678") == "5678"

    def test_so_qua_ngan_tra_ve_none(self):
        # "12" → "012", chưa đủ 4 ký tự.
        assert phone_last4("12") is None

    def test_none_tra_ve_none(self):
        assert phone_last4(None) is None

    def test_khong_kiem_tra_do_dai_so_dien_thoai(self):
        """Chuẩn hóa không kiêm việc kiểm tra tính hợp lệ.

        §4.1 chỉ mô tả cách chuẩn hóa, không nói số hợp lệ là thế nào, nên
        ở đây không tự đặt luật. Hệ quả: rác vào thì rác ra ("123" thành
        "0123"). Nếu cần chặn số sai định dạng thì đó là việc của khâu
        nhập liệu hoặc của importer, và cần chốt luật trước.
        """
        assert normalize_phone("123") == "0123"
        assert phone_last4("123") == "0123"


class TestNormalizeName:
    def test_bo_khoang_trang_thua_va_ve_chu_thuong(self):
        assert normalize_name("  Nguyễn   Văn  A ") == "nguyễn văn a"

    def test_giu_dau_tieng_viet(self):
        """Bỏ dấu sẽ làm "Hà" và "Hạ" trùng nhau — không được phép."""
        assert normalize_name("Hà") != normalize_name("Hạ")

    def test_chuan_hoa_unicode_ve_cung_mot_dang(self):
        # "ế" viết liền (NFC) và viết tách dấu (NFD) phải cho cùng kết quả.
        assert normalize_name("Tiến") == normalize_name("Tiến")

    @pytest.mark.parametrize("raw", [None, "", "   "])
    def test_rong_tra_ve_none(self, raw):
        assert normalize_name(raw) is None
