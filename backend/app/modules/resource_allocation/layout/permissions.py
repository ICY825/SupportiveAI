"""Vai trò và quyền của phân hệ bố trí mặt bằng.

Cùng hai vai trò với phần chỗ ngồi (`hc`, `employee`): Phòng Hành chính vừa
lập phương án vừa duyệt. Khác một điểm quan trọng — **nhân viên chỉ được
xem**. Kéo một cái bàn đi là sửa phương án của cả tầng, không phải sửa hồ sơ
của riêng mình.

Tên quyền mang tiền tố `layout.` để `ENABLED_MODULES` tắt phân hệ này mà
không đụng tới quyền của các phân hệ còn lại.
"""

from __future__ import annotations

from app.core.permissions import registry

ROLE_HC = "hc"
ROLE_EMPLOYEE = "employee"

# Lưu vị trí bàn, xóa vị trí đã lưu.
PERM_MANAGE = "layout.manage"
# Xem vị trí đã lưu, chạy đối chiếu.
PERM_VIEW = "layout.view"


def grant_defaults() -> None:
    """Nạp bảng quyền. Gọi từ `register()` của module."""
    registry.grant(ROLE_HC, PERM_MANAGE, PERM_VIEW)
    registry.grant(ROLE_EMPLOYEE, PERM_VIEW)
