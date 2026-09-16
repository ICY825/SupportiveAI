"""RBAC primitives.

Thuần cơ chế: ai đang gọi (`Principal`), quyền là chuỗi, vai trò ánh xạ
sang tập quyền. File này **không** khai báo vai trò hay quyền cụ thể của
nghiệp vụ — module tự đăng ký quyền của mình qua `registry`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.exceptions import PermissionDeniedError

Permission = str
Role = str


@dataclass(frozen=True)
class Principal:
    """Người đang thực hiện thao tác."""

    employee_id: str
    roles: frozenset[Role] = field(default_factory=frozenset)
    department_id: str | None = None

    def has_role(self, role: Role) -> bool:
        return role in self.roles


class PermissionRegistry:
    """Ánh xạ vai trò → tập quyền, nạp lúc khởi động."""

    def __init__(self) -> None:
        self._role_permissions: dict[Role, set[Permission]] = {}

    def grant(self, role: Role, *permissions: Permission) -> None:
        self._role_permissions.setdefault(role, set()).update(permissions)

    def permissions_of(self, roles: frozenset[Role]) -> set[Permission]:
        result: set[Permission] = set()
        for role in roles:
            result |= self._role_permissions.get(role, set())
        return result

    def allows(self, principal: Principal, permission: Permission) -> bool:
        return permission in self.permissions_of(principal.roles)

    def known_roles(self) -> set[Role]:
        return set(self._role_permissions)

    def clear(self) -> None:
        self._role_permissions.clear()


registry = PermissionRegistry()


def require_permission(principal: Principal, permission: Permission) -> None:
    """Ném `PermissionDeniedError` nếu principal không có quyền."""
    if not registry.allows(principal, permission):
        raise PermissionDeniedError(
            f"Thiếu quyền '{permission}'",
            details={"permission": permission, "roles": sorted(principal.roles)},
        )


# ⚠️ HAI ĐIỂM CHƯA CHỐT — chưa tự đặt, chờ xác nhận:
#
# 1. Danh sách vai trò. Hai tài liệu đang nói khác nhau:
#      - mail-tracking.md §12: Nhân viên HC / Nhân viên / Quản lý
#      - SupportiveAI_Architecture_v2.md §18: Admin / Staff / Manager / Clerk
#    Vì vậy registry để rỗng, chưa nạp sẵn vai trò nào.
#
# 2. Phân quyền theo dòng (row-level). README C1 ghi công văn cần phân quyền
#    theo phòng ban và độ mật, tức không đủ nếu chỉ có role-level như ở đây.
#    `Principal.department_id` đã để sẵn làm chỗ bám, nhưng cơ chế lọc theo
#    dòng chưa thiết kế vì C1 chưa có câu trả lời.
