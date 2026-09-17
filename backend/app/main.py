"""Khởi tạo FastAPI, nối lõi chung và nạp các module đang bật."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.exceptions import AppError
from app.modules.registry import enabled_module_names, load_enabled_modules
from app.platform.audit import make_transition_listener
from app.platform.events import dispatcher
from app.platform.notification import build_channel_from_settings
from app.platform.notification.channels import registry as notification_channels
from app.platform.scheduler import scheduler
from app.platform.workflow.events import WorkflowTransitioned
from app.shared.employee.router import router as employee_router

logger = logging.getLogger(__name__)

# Import để SQLAlchemy đăng ký mapper trước khi cấu hình quan hệ.
# Thứ tự không quan trọng, nhưng thiếu một cái là relationship gãy.
from app.platform.audit.models import AuditLog  # noqa: E402,F401
from app.platform.notification.models import Notification, NotificationItem  # noqa: E402,F401
from app.platform.workflow.models import SLAEvent, WorkflowHistory, WorkflowInstance  # noqa: E402,F401
from app.shared.department.models import Department  # noqa: E402,F401
from app.shared.employee.models import Employee, EmployeeRole  # noqa: E402,F401
from app.shared.location.models import Location  # noqa: E402,F401


_audit_listener = None


def wire_platform() -> None:
    """Nối các thành phần lõi lại với nhau.

    Audit nghe sự kiện chuyển trạng thái thay vì để module gọi trực tiếp
    (repository-structure.md §6).

    Chỉ nối một lần cho mỗi tiến trình: `create_app()` gọi được nhiều lần
    (test dựng app sạch mỗi lần) mà không nhân đôi handler.
    """
    global _audit_listener
    if _audit_listener is not None:
        return
    _audit_listener = make_transition_listener(SessionLocal)
    dispatcher.subscribe(WorkflowTransitioned, _audit_listener)

    email_channel = build_channel_from_settings()
    if email_channel is not None:
        notification_channels.register(email_channel, default=True)
        logger.info("Kênh thông báo: email qua %s", email_channel.host)
    else:
        logger.warning(
            "Chưa cấu hình SMTP_HOST — thông báo chỉ lưu vào bảng notification, KHÔNG gửi đi"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    logger.info(
        "Khởi động %s — module bật: %s",
        settings.app_name,
        ", ".join(enabled_module_names()) or "(chưa có module nào)",
    )
    try:
        yield
    finally:
        scheduler.shutdown()


async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    """Đổi `AppError` thành mã HTTP tương ứng.

    Nhờ handler này mà tầng nghiệp vụ chỉ cần ném exception của mình,
    không phải import FastAPI (README §13: domain-first).
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message, "details": exc.details},
    )


def create_app() -> FastAPI:
    """Dựng ứng dụng.

    Route và exception handler phải đăng ký ở đây chứ không ở cấp module
    hay trong `lifespan`: OpenAPI schema dựng một lần từ bảng route, và
    test cần dựng được app sạch nhiều lần.
    """
    wire_platform()
    # Module đăng ký lại job của mình ở dưới; xoá trước để dựng lại ứng dụng
    # nhiều lần trong một tiến trình không bị báo trùng job_id.
    scheduler.clear()
    application = FastAPI(title=settings.app_name, lifespan=lifespan)
    application.add_exception_handler(AppError, handle_app_error)
    application.include_router(employee_router, prefix=settings.api_prefix)

    for spec in load_enabled_modules():
        if spec.router is not None:
            application.include_router(spec.router, prefix=settings.api_prefix)

    @application.get("/health")
    def health() -> dict:
        return {
            "status": "ok",
            "app": settings.app_name,
            "enabled_modules": enabled_module_names(),
        }

    return application


app = create_app()
