"""API phòng ban.

Danh mục phòng ban là dữ liệu nền: bản vẽ trỏ về nó bằng `departmentCode`, và
sơ đồ chỗ ngồi dựa vào đó để biết ai ngồi ở khu của phòng ban nào. Nên chỉ cần
bảo đảm ba điều: đọc được khi đã đăng nhập, tra được theo **mã** (thứ bản vẽ
biết, khác với uuid nội bộ), và không lộ ra cho người chưa đăng nhập.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import create_app
from app.shared.department.schemas import DepartmentCreate
from app.shared.department.service import DepartmentService
from app.shared.employee.schemas import EmployeeCreate
from app.shared.employee.service import EmployeeService

MAT_KHAU = "matkhau-rat-dai-32"


@pytest.fixture
def phong_ban(db):
    service = DepartmentService(db)
    service.create(DepartmentCreate(code="AI", name="MÔ HÌNH & NỀN TẢNG AI"))
    service.create(DepartmentCreate(code="GSM", name="KINH DOANH & VẬN HÀNH GSM"))
    employees = EmployeeService(db)
    person = employees.create(
        EmployeeCreate(employee_code="HC001", full_name="Nguyễn Thị Thu Hương")
    )
    employees.set_password(person.id, MAT_KHAU)
    db.commit()
    return person


@pytest.fixture
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client


def dang_nhap(client) -> dict[str, str]:
    response = client.post(
        "/api/auth/login", json={"employee_code": "HC001", "password": MAT_KHAU}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_chua_dang_nhap_thi_khong_doc_duoc(client, phong_ban):
    assert client.get("/api/departments").status_code == 401


def test_liet_ke_phong_ban(client, phong_ban):
    headers = dang_nhap(client)
    body = client.get("/api/departments", headers=headers).json()
    assert sorted(d["code"] for d in body) == ["AI", "GSM"]


def test_tra_theo_ma_chu_khong_phai_uuid(client, phong_ban):
    """Bản vẽ chỉ mang mã; uuid là chuyện nội bộ của cơ sở dữ liệu."""
    headers = dang_nhap(client)
    response = client.get("/api/departments/AI", headers=headers)
    assert response.status_code == 200
    assert response.json()["name"] == "MÔ HÌNH & NỀN TẢNG AI"


def test_ma_khong_co_thi_404(client, phong_ban):
    headers = dang_nhap(client)
    assert client.get("/api/departments/KHONG-CO", headers=headers).status_code == 404
