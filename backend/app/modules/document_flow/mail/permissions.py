"""Vai trò và quyền của phân hệ chuyển phát nhanh.

Hai vai trò, chốt 16/09/2026 (mail-tracking.md §12): HC kiêm luôn vai trò
quản lý, nên không có vai trò thứ ba.
"""

from __future__ import annotations

from app.core.permissions import registry

ROLE_HC = "hc"
ROLE_EMPLOYEE = "employee"

# Tải file, soát, sửa người nhận, bấm gửi, đối chiếu tờ ký giấy.
PERM_MANAGE = "mail.manage"
# Màn hình kiện quá hạn và báo cáo tổng hợp.
PERM_REPORT = "mail.report"
# Xem kiện của chính mình.
PERM_VIEW_OWN = "mail.view_own"


def grant_defaults() -> None:
    """Nạp bảng quyền. Gọi từ `register()` của module."""
    registry.grant(ROLE_HC, PERM_MANAGE, PERM_REPORT, PERM_VIEW_OWN)
    registry.grant(ROLE_EMPLOYEE, PERM_VIEW_OWN)
