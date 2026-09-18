"""Job định kỳ của phân hệ chuyển phát nhanh.

Quét các mốc SLA ở §8.3: nhắc lại ở T+2, chuyển tồn đọng ở T+5.

Mốc "sau 2 ngày" trên thực tế là **lần quét đầu tiên sau khi quá 2 ngày**
— chu kỳ quét đặt ở `MAIL_JOB_INTERVAL_MINUTES`.
"""

from __future__ import annotations

import logging

from app.core.config import settings
from app.core.database import SessionLocal
from app.modules.document_flow.mail.service import MailService
from app.platform.scheduler import JobSpec, scheduler

logger = logging.getLogger(__name__)

JOB_ID = "mail.sla_scan"


def scan_sla() -> None:
    """Một lượt quét. Chạy nhắc trước, tồn đọng sau.

    Thứ tự này có chủ đích: nếu hệ thống ngừng vài ngày rồi chạy lại, một
    kiện có thể chạm cả hai mốc cùng lúc. Nhắc trước thì người nhận vẫn
    nhận được lời nhắc muộn — và vì §7 cho phép nhận đơn sau khi đã tồn
    đọng nên lời nhắc đó vẫn có ích.
    """
    db = SessionLocal()
    try:
        service = MailService(db)
        reminded = service.run_reminders()
        abandoned = service.run_abandonment()
        db.commit()
        if reminded or abandoned:
            logger.info("Quét SLA thư: nhắc %d kiện, chuyển tồn đọng %d kiện",
                        reminded, abandoned)
    except Exception:
        db.rollback()
        # Job hỏng không được làm sập scheduler — lượt quét sau vẫn chạy,
        # và bảng workflow_sla_event bảo đảm không nhắc trùng.
        logger.exception("Quét SLA thư gặp lỗi")
    finally:
        db.close()


def register_jobs() -> None:
    scheduler.register(
        JobSpec(
            job_id=JOB_ID,
            func=scan_sla,
            interval_minutes=settings.mail_job_interval_minutes,
            description="Nhắc hạn và chuyển tồn đọng cho thư chuyển phát",
        )
    )
