"""API tra cứu phòng ban.

Chỉ đọc. Danh mục phòng ban nhập bằng `scripts/seed_departments.py` chứ không
tạo qua API: nó là dữ liệu nền, mỗi lần đổi là một quyết định của tổ chức, và
không nên sửa được bằng một lần bấm nhầm trên giao diện.

Mã phòng ban (`code`) là thứ nối bản vẽ với danh mục này: mỗi khu vực trong
`data/floors/<tầng>/*.zones.json` mang `departmentCode` trỏ về đây.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.exceptions import NotFoundError
from app.shared.department.repository import DepartmentRepository
from app.shared.department.schemas import DepartmentRead
from app.shared.employee.dependencies import CurrentEmployee, DbSession

router = APIRouter(prefix="/departments", tags=["shared"])


@router.get("", response_model=list[DepartmentRead])
def list_departments(
    db: DbSession, _: CurrentEmployee, include_inactive: bool = False
) -> list[DepartmentRead]:
    found = DepartmentRepository(db).list_all(active_only=not include_inactive)
    return [DepartmentRead.model_validate(item) for item in found]


@router.get("/{code}", response_model=DepartmentRead)
def get_department(code: str, db: DbSession, _: CurrentEmployee) -> DepartmentRead:
    """Tra theo **mã**, không phải id.

    Bản vẽ chỉ biết mã; uuid là chuyện nội bộ của cơ sở dữ liệu.
    """
    found = DepartmentRepository(db).get_by_code(code)
    if found is None:
        raise NotFoundError(f"Không có phòng ban mã {code!r}")
    return DepartmentRead.model_validate(found)
