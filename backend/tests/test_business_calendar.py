"""Test tính SLA theo giờ làm việc.

Đây là mục số 2 trong danh sách ưu tiên kiểm thử của
repository-structure.md §11: "dễ sai và khó phát hiện".

Lịch dùng trong các test này: T2–T6, 08:00–17:00, nghỉ trưa 12:00–13:00,
ngày lễ 02/09/2026 (xem fixture `calendar`).
"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

VN = ZoneInfo("Asia/Ho_Chi_Minh")


def at(year, month, day, hour=0, minute=0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=VN)


class TestAddBusinessHours:
    def test_trong_cung_buoi_sang(self, calendar):
        # Thứ Tư 16/09/2026, 09:00 + 2h = 11:00 cùng ngày.
        assert calendar.add_business_hours(at(2026, 9, 16, 9), 2) == at(2026, 9, 16, 11)

    def test_nhay_qua_gio_nghi_trua(self, calendar):
        # 11:00 + 2h: 1h trước trưa, 1h còn lại tính từ 13:00 → 14:00.
        assert calendar.add_business_hours(at(2026, 9, 16, 11), 2) == at(2026, 9, 16, 14)

    def test_tran_sang_ngay_hom_sau(self, calendar):
        # 16:00 thứ Tư + 2h: còn 1h tới 17:00, 1h nữa sang 08:00 thứ Năm.
        assert calendar.add_business_hours(at(2026, 9, 16, 16), 2) == at(2026, 9, 17, 9)

    def test_thu_sau_chieu_nhay_qua_cuoi_tuan(self, calendar):
        """Trường hợp mail-tracking.md §8.4 nêu đích danh.

        Thư đến chiều thứ Sáu, nhắc sau 24 giờ làm việc thì phải rơi vào
        giữa tuần sau, không phải sáng Chủ Nhật.
        """
        # Thứ Sáu 18/09/2026 16:00 + 24h làm việc:
        #   thứ Sáu còn 1h   → dư 23h
        #   T7 + CN nghỉ
        #   thứ Hai   8h     → dư 15h
        #   thứ Ba    8h     → dư  7h
        #   thứ Tư: 08–12 hết 4h → dư 3h; tính tiếp từ 13:00 → 16:00
        due = calendar.add_business_hours(at(2026, 9, 18, 16), 24)
        assert due == at(2026, 9, 23, 16)
        assert due.weekday() == 2  # thứ Tư

    def test_bo_qua_ngay_le(self, calendar):
        # 01/09/2026 là thứ Ba, 02/09 là ngày lễ trong fixture.
        # 16:00 thứ Ba + 2h: 1h còn lại của thứ Ba, 1h sang 03/09 lúc 08:00.
        due = calendar.add_business_hours(at(2026, 9, 1, 16), 2)
        assert due == at(2026, 9, 3, 9)

    def test_bat_dau_ngoai_gio_lam_viec(self, calendar):
        # 22:00 thứ Tư + 1h → 09:00 thứ Năm (tính từ lúc mở cửa).
        assert calendar.add_business_hours(at(2026, 9, 16, 22), 1) == at(2026, 9, 17, 9)

    def test_bat_dau_giua_gio_nghi_trua(self, calendar):
        # 12:30 + 1h → 14:00, vì 12:00–13:00 không tính.
        assert calendar.add_business_hours(at(2026, 9, 16, 12, 30), 1) == at(2026, 9, 16, 14)

    def test_bat_dau_ngay_nghi(self, calendar):
        # Chủ Nhật 20/09 + 1h → 09:00 thứ Hai 21/09.
        assert calendar.add_business_hours(at(2026, 9, 20, 10), 1) == at(2026, 9, 21, 9)

    def test_giu_nguyen_mui_gio_dau_vao(self, calendar):
        start = datetime(2026, 9, 16, 2, 0, tzinfo=timezone.utc)  # 09:00 giờ VN
        due = calendar.add_business_hours(start, 2)
        assert due.tzinfo == timezone.utc
        assert due == datetime(2026, 9, 16, 4, 0, tzinfo=timezone.utc)

    def test_khong_cong_gi_khi_hours_bang_0(self, calendar):
        start = at(2026, 9, 16, 9)
        assert calendar.add_business_hours(start, 0) == start

    def test_bat_loi_khi_thieu_tzinfo(self, calendar):
        with pytest.raises(ValueError, match="tzinfo"):
            calendar.add_business_hours(datetime(2026, 9, 16, 9), 1)


class TestBusinessHoursBetween:
    def test_trong_mot_buoi(self, calendar):
        assert calendar.business_hours_between(at(2026, 9, 16, 9), at(2026, 9, 16, 11)) == 2

    def test_tru_gio_nghi_trua(self, calendar):
        # 11:00 → 14:00 là 3 giờ đồng hồ nhưng chỉ 2 giờ làm việc.
        assert calendar.business_hours_between(at(2026, 9, 16, 11), at(2026, 9, 16, 14)) == 2

    def test_bo_qua_cuoi_tuan(self, calendar):
        # Thứ Sáu 16:00 → thứ Hai 09:00: 1h thứ Sáu + 1h thứ Hai.
        assert calendar.business_hours_between(at(2026, 9, 18, 16), at(2026, 9, 21, 9)) == 2

    def test_khoang_am_tra_ve_0(self, calendar):
        assert calendar.business_hours_between(at(2026, 9, 16, 14), at(2026, 9, 16, 9)) == 0

    def test_ca_khoang_nam_ngoai_gio_lam(self, calendar):
        # Cả hai mốc đều trong đêm cùng một ngày.
        assert calendar.business_hours_between(at(2026, 9, 16, 20), at(2026, 9, 16, 23)) == 0


class TestKhopNguocVoiAddBusinessHours:
    """`between` và `add` phải nhất quán với nhau."""

    @pytest.mark.parametrize("hours", [1, 4, 8, 24, 48])
    def test_cong_roi_do_lai_ra_dung_so_gio(self, calendar, hours):
        start = at(2026, 9, 16, 9)
        due = calendar.add_business_hours(start, hours)
        assert calendar.business_hours_between(start, due) == pytest.approx(hours)


def test_so_gio_lam_viec_moi_ngay(calendar):
    # 08:00–17:00 trừ 1 tiếng nghỉ trưa = 8 giờ.
    assert calendar.working_seconds_per_day() == 8 * 3600
