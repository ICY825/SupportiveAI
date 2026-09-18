"""Vai trò và quyền của phân hệ quy hoạch chỗ ngồi.

Cùng hai vai trò với Đề 3 (`hc`, `employee`): Phòng Hành chính vừa lập phương
án vừa duyệt, nên không có vai trò thứ ba. Tên quyền mang tiền tố `seat.` để
`ENABLED_MODULES` tắt phân hệ này mà không đụng tới quyền của ba đề còn lại.
"""

from __future__ import annotations

from app.core.permissions import registry

ROLE_HC = "hc"
ROLE_EMPLOYEE = "employee"

# Gán, thu hồi, chuyển chỗ.
PERM_MANAGE = "seat.manage"
# Xem sơ đồ ai ngồi đâu, xem tình trạng dùng chỗ, chạy đối chiếu.
PERM_VIEW = "seat.view"


def grant_defaults() -> None:
    """Nạp bảng quyền. Gọi từ `register()` của module."""
    registry.grant(ROLE_HC, PERM_MANAGE, PERM_VIEW)
    registry.grant(ROLE_EMPLOYEE, PERM_VIEW)
