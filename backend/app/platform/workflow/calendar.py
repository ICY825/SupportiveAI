"""Tính thời gian theo giờ làm việc.

mail-tracking.md §8.4: SLA phải tính theo giờ làm việc, không theo giờ
đồng hồ — "thư đến chiều thứ sáu mà nhắc vào sáng chủ nhật là vô nghĩa".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings

# Chặn vòng lặp vô hạn nếu lịch bị cấu hình sai (ví dụ toàn ngày nghỉ).
_MAX_DAYS_SCAN = 3650


@dataclass(frozen=True)
class BusinessCalendar:
    """Lịch làm việc: ngày làm trong tuần, giờ vào/ra, giờ nghỉ trưa, ngày lễ."""

    workdays: frozenset[int]          # 0 = Thứ Hai ... 6 = Chủ Nhật
    start: time
    end: time
    break_start: time | None = None
    break_end: time | None = None
    holidays: frozenset[date] = frozenset()
    tz: ZoneInfo = ZoneInfo("Asia/Ho_Chi_Minh")

    @classmethod
    def from_settings(cls, holidays: frozenset[date] = frozenset()) -> BusinessCalendar:
        return cls(
            workdays=frozenset(settings.business_days),
            start=settings.business_start,
            end=settings.business_end,
            break_start=settings.business_break_start,
            break_end=settings.business_break_end,
            holidays=holidays,
            tz=ZoneInfo(settings.timezone),
        )

    # --- Khung giờ trong ngày ---

    def is_working_day(self, day: date) -> bool:
        return day.weekday() in self.workdays and day not in self.holidays

    def _windows(self, day: date) -> list[tuple[datetime, datetime]]:
        """Các khoảng làm việc của một ngày, đã tách giờ nghỉ trưa."""
        if not self.is_working_day(day):
            return []

        def at(t: time) -> datetime:
            return datetime.combine(day, t, tzinfo=self.tz)

        if self.break_start and self.break_end and self.start < self.break_start < self.break_end < self.end:
            return [(at(self.start), at(self.break_start)), (at(self.break_end), at(self.end))]
        return [(at(self.start), at(self.end))]

    def working_seconds_per_day(self) -> float:
        """Số giây làm việc của một ngày làm việc đầy đủ."""
        total = (
            datetime.combine(date(2000, 1, 1), self.end)
            - datetime.combine(date(2000, 1, 1), self.start)
        ).total_seconds()
        if self.break_start and self.break_end:
            total -= (
                datetime.combine(date(2000, 1, 1), self.break_end)
                - datetime.combine(date(2000, 1, 1), self.break_start)
            ).total_seconds()
        return total

    # --- Phép tính chính ---

    def add_business_hours(self, start: datetime, hours: float) -> datetime:
        """Cộng `hours` giờ **làm việc** vào `start`, trả về mốc hạn."""
        if start.tzinfo is None:
            raise ValueError("start phải có tzinfo")
        remaining = hours * 3600
        if remaining <= 0:
            return start

        original_tz = start.tzinfo
        cursor = start.astimezone(self.tz)
        day = cursor.date()

        for _ in range(_MAX_DAYS_SCAN):
            for window_start, window_end in self._windows(day):
                if cursor >= window_end:
                    continue
                position = max(cursor, window_start)
                available = (window_end - position).total_seconds()
                if remaining <= available:
                    return (position + timedelta(seconds=remaining)).astimezone(original_tz)
                remaining -= available
                cursor = window_end
            day += timedelta(days=1)
            cursor = datetime.combine(day, time.min, tzinfo=self.tz)

        raise ValueError(
            f"Không tìm được mốc hạn trong {_MAX_DAYS_SCAN} ngày — kiểm tra lại cấu hình lịch làm việc"
        )

    def business_hours_between(self, begin: datetime, end: datetime) -> float:
        """Số giờ làm việc giữa hai mốc. Trả 0 nếu `end` không sau `begin`."""
        if begin.tzinfo is None or end.tzinfo is None:
            raise ValueError("begin và end phải có tzinfo")
        if end <= begin:
            return 0.0

        begin_local = begin.astimezone(self.tz)
        end_local = end.astimezone(self.tz)
        total = 0.0
        day = begin_local.date()
        while day <= end_local.date():
            for window_start, window_end in self._windows(day):
                overlap_start = max(begin_local, window_start)
                overlap_end = min(end_local, window_end)
                if overlap_end > overlap_start:
                    total += (overlap_end - overlap_start).total_seconds()
            day += timedelta(days=1)
        return total / 3600


# ⚠️ Nguồn dữ liệu lịch làm việc chưa chốt.
#
# Giờ mặc định trong core/config.py (T2–T6, 08:00–17:00, nghỉ trưa 12:00–13:00)
# là TẠM ĐẶT để engine chạy được — chưa lấy từ quy định thật của công ty.
# `holidays` hiện phải truyền vào từ ngoài; chưa có bảng ngày lễ vì chưa
# biết ai là nguồn dữ liệu đó. Xem báo cáo cuối Tuần 1.
