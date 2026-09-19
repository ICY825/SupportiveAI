"""Test xuyên tầng: dựng app thật, gọi qua HTTP.

Xác nhận lõi chung nối được với nhau — cấu hình, DB, auth, router, và
việc bật/tắt module qua ENABLED_MODULES.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import create_app
from app.shared.employee.schemas import EmployeeCreate
from app.shared.employee.service import EmployeeService


@pytest.fixture
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def duyen(db):
    service = EmployeeService(db)
    employee = service.create(
        EmployeeCreate(
            employee_code="NV001",
            full_name="Phạm Thị Duyên",
            email="duyen@example.com",
            phone="0912345678",
            roles=["hc"],
        )
    )
    service.set_password(employee.id, "matkhau-rat-dai")
    db.commit()
    return employee


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_dang_nhap_roi_goi_me(client, duyen):
    login = client.post(
        "/api/auth/login",
        json={"employee_code": "NV001", "password": "matkhau-rat-dai"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["employee_code"] == "NV001"


def test_sai_mat_khau_tra_401(client, duyen):
    response = client.post(
        "/api/auth/login",
        json={"employee_code": "NV001", "password": "sai"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


def test_khong_co_token_thi_tu_choi(client):
    assert client.get("/api/me").status_code == 401


def test_tim_nhan_su_can_dang_nhap(client, duyen):
    assert client.get("/api/employees/search", params={"q": "duyên"}).status_code == 401

    login = client.post(
        "/api/auth/login", json={"employee_code": "NV001", "password": "matkhau-rat-dai"}
    )
    token = login.json()["access_token"]
    response = client.get(
        "/api/employees/search",
        params={"q": "duyên"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert [row["employee_code"] for row in response.json()] == ["NV001"]


def test_health_liet_ke_module_dang_bat(client):
    """Bốn đề bài đều có tên hợp lệ dù chưa module nào viết xong.

    Năm tên, không phải bốn: Đề 1 tách làm `seat` và `layout`.
    """
    enabled = client.get("/health").json()["enabled_modules"]
    assert set(enabled) == {"seat", "layout", "locker", "mail", "document"}
