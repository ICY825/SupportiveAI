"""Cây exception dùng chung.

Tầng API bắt `AppError` và ánh xạ sang mã HTTP; nghiệp vụ không import
FastAPI để giữ nguyên tắc domain-first (README §13).
"""

from __future__ import annotations


class AppError(Exception):
    """Gốc của mọi lỗi có chủ đích trong hệ thống."""

    status_code: int = 400
    code: str = "app_error"

    def __init__(self, message: str, *, code: str | None = None, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if code:
            self.code = code


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    """Vi phạm ràng buộc duy nhất, hoặc trạng thái không cho phép thao tác."""

    status_code = 409
    code = "conflict"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class PermissionDeniedError(AppError):
    status_code = 403
    code = "permission_denied"


class AuthenticationError(AppError):
    status_code = 401
    code = "unauthenticated"


class WorkflowError(AppError):
    """Chuyển trạng thái không hợp lệ theo định nghĩa workflow."""

    status_code = 409
    code = "workflow_error"


class ModuleDisabledError(AppError):
    """Gọi tới module không nằm trong ENABLED_MODULES."""

    status_code = 404
    code = "module_disabled"
