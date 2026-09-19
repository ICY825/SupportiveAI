"""Test API của phân hệ quy hoạch chỗ ngồi.

Trọng tâm là **phân quyền**: ai cũng xem được sơ đồ ai ngồi đâu, nhưng chỉ
Hành chính mới gán và thu hồi được.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import registry as permission_registry
from app.main import create_app
from app.modules.resource_allocation.common import floor_catalog as catalog
from app.modules.resource_allocation.seat.permissions import (
    ROLE_EMPLOYEE,
    ROLE_HC,
    grant_defaults,
)
from app.shared.department.schemas import DepartmentCreate
from app.shared.department.service import DepartmentService
from app.shared.employee.schemas import EmployeeCreate
from app.shared.employee.service import EmployeeService

MAT_KHAU = "matkhau-rat-dai-32"
FLOOR = "floor-test"
LAYOUT = "a" * 64


@pytest.fixture(autouse=True)
def bang_quyen():
    permission_registry.clear()
    grant_defaults()
    yield
    permission_registry.clear()


@pytest.fixture(autouse=True)
def bat_module_seat(monkeypatch):
    """Router chỉ được nạp khi `seat` nằm trong ENABLED_MODULES."""
    monkeypatch.setattr(settings, "enabled_modules", ["seat"])


@pytest.fixture(autouse=True)
def dataset(tmp_path, monkeypatch):
    directory = tmp_path / FLOOR
    directory.mkdir()
    (directory / "floortest.workstations.json").write_text(
        json.dumps(
            {
                "sourcePdfSha256": LAYOUT,
                "workstations": [{"id": "ws-t-001"}, {"id": "ws-t-002"}],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(catalog, "floor_data_root", lambda: tmp_path)
    catalog.reset_cache()
    yield tmp_path
    catalog.reset_cache()


@pytest.fixture
def nguoi_dung(db):
    hc_dept = DepartmentService(db).create(DepartmentCreate(code="HC", name="Hành chính"))
    employees = EmployeeService(db)
    huong = employees.create(
        EmployeeCreate(
            employee_code="HC001",
            full_name="Nguyễn Thị Thu Hương",
            email="huong@example.com",
            department_id=hc_dept.id,
            roles=[ROLE_HC],
        )
    )
    nam = employees.create(
        EmployeeCreate(
            employee_code="NV001",
            full_name="Lưu Hải Nam",
            email="nam@example.com",
            department_id=hc_dept.id,
            roles=[ROLE_EMPLOYEE],
        )
    )
    for person in (huong, nam):
        employees.set_password(person.id, MAT_KHAU)
    db.commit()
    return {"hc": huong, "nv": nam}


@pytest.fixture
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client


def dang_nhap(client, code: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"employee_code": code, "password": MAT_KHAU})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_chua_dang_nhap_thi_khong_xem_duoc(client):
    assert client.get(f"/api/seats/floors/{FLOOR}/assignments").status_code == 401


def test_nhan_vien_xem_duoc_nhung_khong_gan_duoc(client, nguoi_dung):
    headers = dang_nhap(client, "NV001")

    assert client.get(f"/api/seats/floors/{FLOOR}/assignments", headers=headers).status_code == 200

    response = client.post(
        "/api/seats/assignments",
        headers=headers,
        json={
            "floor_id": FLOOR,
            "workstation_id": "ws-t-001",
            "employee_id": nguoi_dung["nv"].id,
        },
    )
    assert response.status_code == 403


def test_hanh_chinh_gan_va_thu_hoi(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")

    created = client.post(
        "/api/seats/assignments",
        headers=headers,
        json={
            "floor_id": FLOOR,
            "workstation_id": "ws-t-001",
            "employee_id": nguoi_dung["nv"].id,
            "decision": "accept",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["employee"]["employee_code"] == "NV001"
    assert body["layout_version"] == LAYOUT
    assert body["assigned_by"] == nguoi_dung["hc"].id

    listed = client.get(f"/api/seats/floors/{FLOOR}/assignments", headers=headers).json()
    assert [a["workstation_id"] for a in listed] == ["ws-t-001"]

    released = client.post(
        f"/api/seats/assignments/{body['id']}/release", headers=headers, json={}
    )
    assert released.status_code == 200
    assert released.json()["released_at"] is not None

    assert client.get(f"/api/seats/floors/{FLOOR}/assignments", headers=headers).json() == []


def test_ma_cho_ngoi_la_tra_ve_404(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")
    response = client.post(
        "/api/seats/assignments",
        headers=headers,
        json={
            "floor_id": FLOOR,
            "workstation_id": "ws-t-404",
            "employee_id": nguoi_dung["nv"].id,
        },
    )
    assert response.status_code == 404
    assert "không tự tạo" in response.json()["message"]


def test_cho_dang_co_nguoi_tra_ve_409(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")
    payload = {
        "floor_id": FLOOR,
        "workstation_id": "ws-t-001",
        "employee_id": nguoi_dung["nv"].id,
    }
    assert client.post("/api/seats/assignments", headers=headers, json=payload).status_code == 201

    payload["employee_id"] = nguoi_dung["hc"].id
    assert client.post("/api/seats/assignments", headers=headers, json=payload).status_code == 409


def test_tinh_trang_dung_cho(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")
    client.post(
        "/api/seats/assignments",
        headers=headers,
        json={
            "floor_id": FLOOR,
            "workstation_id": "ws-t-001",
            "employee_id": nguoi_dung["nv"].id,
        },
    )
    occupancy = client.get(f"/api/seats/floors/{FLOOR}/occupancy", headers=headers).json()
    assert occupancy == {
        "floor_id": FLOOR,
        "layout_version": LAYOUT,
        "seats": 2,
        "occupied": 1,
        "free": 1,
    }


def test_doi_chieu_chi_doc(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")
    report = client.get(f"/api/seats/floors/{FLOOR}/reconcile", headers=headers)
    assert report.status_code == 200
    assert report.json()["stale"] == []
