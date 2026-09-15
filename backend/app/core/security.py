from enum import Enum
from typing import Optional
from fastapi import Header, HTTPException, status


class UserRole(str, Enum):
    ADMIN = "admin"
    STAFF = "staff"
    MANAGER = "manager"
    CLERK = "clerk"


class CurrentUser:
    def __init__(self, user_id: int, username: str, role: UserRole, department_id: Optional[int] = None):
        self.user_id = user_id
        self.username = username
        self.role = role
        self.department_id = department_id


async def get_current_user(
    x_user_id: Optional[str] = Header("1", alias="X-User-Id"),
    x_user_role: Optional[str] = Header("admin", alias="X-User-Role"),
    x_department_id: Optional[str] = Header(None, alias="X-Department-Id"),
) -> CurrentUser:
    """
    Lightweight user extraction for pilot phase.
    Extracts current authenticated identity and RBAC role.
    """
    try:
        uid = int(x_user_id) if x_user_id else 1
        role = UserRole(x_user_role.lower()) if x_user_role else UserRole.ADMIN
        dept_id = int(x_department_id) if x_department_id else None
        return CurrentUser(user_id=uid, username=f"user_{uid}", role=role, department_id=dept_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication headers.",
        )
