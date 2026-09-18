"""Đề 3 — Chuyển phát nhanh.

Phân hệ này **không có thành phần AI** (mail-tracking.md §1.3): dữ liệu
vào đã có cấu trúc nên không cần OCR hay trích xuất.

Bật/tắt bằng biến môi trường:

    ENABLED_MODULES=mail
"""

from app.modules.registry import ModuleSpec
from app.platform.workflow import registry as workflow_registry


def register() -> None:
    """Nạp workflow, bảng quyền và job định kỳ của phân hệ vào lõi chung."""
    from app.modules.document_flow.mail.jobs import register_jobs
    from app.modules.document_flow.mail.permissions import grant_defaults
    from app.modules.document_flow.mail.workflow import MAIL_WORKFLOW

    workflow_registry.register(MAIL_WORKFLOW)
    grant_defaults()
    register_jobs()


def _router():
    from app.modules.document_flow.mail.router import router

    return router


MODULE = ModuleSpec(name="mail", router=_router(), register=register)

__all__ = ["MODULE", "register"]
