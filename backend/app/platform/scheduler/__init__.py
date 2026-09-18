"""Job định kỳ.

README §8: APScheduler, đủ nếu tải chỉ vài chục job/ngày. Bọc lại để
module đăng ký job mà không phụ thuộc trực tiếp vào thư viện.
"""

from app.platform.scheduler.service import JobSpec, SchedulerService, scheduler

__all__ = ["JobSpec", "SchedulerService", "scheduler"]
