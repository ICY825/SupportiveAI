"""Bọc APScheduler."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class JobSpec:
    """Khai báo một job. Module tạo JobSpec, scheduler lo phần chạy."""

    job_id: str
    func: Callable[[], None]
    # Đặt đúng một trong hai: cron (vd "0 8 * * 1-5") hoặc interval_minutes.
    cron: str | None = None
    interval_minutes: int | None = None
    description: str = ""

    def __post_init__(self) -> None:
        if (self.cron is None) == (self.interval_minutes is None):
            raise ValueError(f"JobSpec {self.job_id} phải đặt đúng một trong cron hoặc interval_minutes")


class SchedulerService:
    def __init__(self) -> None:
        self._scheduler = BackgroundScheduler(timezone=settings.timezone)
        self._specs: dict[str, JobSpec] = {}

    def register(self, spec: JobSpec) -> None:
        """Đăng ký một job.

        Trùng `job_id` trong cùng một lượt nạp là lỗi thật (hai module đặt
        trùng tên job), nên vẫn báo lỗi. Việc dựng lại ứng dụng thì gọi
        `clear()` trước — xem `create_app()`.
        """
        if spec.job_id in self._specs:
            raise ValueError(f"Job {spec.job_id!r} đã được đăng ký")
        self._specs[spec.job_id] = spec

    def clear(self) -> None:
        """Xoá danh sách job đã đăng ký (chưa chạy)."""
        self._specs.clear()

    def registered(self) -> tuple[JobSpec, ...]:
        return tuple(self._specs.values())

    def start(self) -> None:
        for spec in self._specs.values():
            trigger = (
                CronTrigger.from_crontab(spec.cron, timezone=settings.timezone)
                if spec.cron
                else IntervalTrigger(minutes=spec.interval_minutes, timezone=settings.timezone)
            )
            self._scheduler.add_job(
                spec.func, trigger=trigger, id=spec.job_id, replace_existing=True,
                coalesce=True, max_instances=1,
            )
            logger.info("Đăng ký job %s (%s)", spec.job_id, spec.cron or f"mỗi {spec.interval_minutes} phút")
        self._scheduler.start()

    def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def run_now(self, job_id: str) -> None:
        """Chạy tay một job — dùng khi test và khi HC bấm nhắc thủ công."""
        self._specs[job_id].func()


scheduler = SchedulerService()

# Ghi chú: `coalesce=True` + `max_instances=1` để job nhắc hạn chạy trễ
# (máy tắt, deploy lại) không dồn lại rồi bắn nhiều lượt nhắc cùng lúc.
# Phần chống nhắc trùng thật sự nằm ở bảng workflow_sla_event.
