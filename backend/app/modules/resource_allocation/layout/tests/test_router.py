"""Test API của phân hệ bố trí mặt bằng.

Trọng tâm là **phân quyền**: ai cũng xem được phương án bố trí, nhưng chỉ
Hành chính mới kéo bàn được. Kéo một cái bàn đi là sửa phương án của cả tầng.
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
from app.modules.resource_allocation.layout.permissions import (
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


def dat(entity_id: str, x: float, y: float, **kwargs) -> dict:
    return {"entity_id": entity_id, "x": x, "y": y, "width": 120.0, "depth": 60.0, **kwargs}


@pytest.fixture(autouse=True)
def bang_quyen():
    permission_registry.clear()
    grant_defaults()
    yield
    permission_registry.clear()


@pytest.fixture(autouse=True)
def bat_module_layout(monkeypatch):
    """Router chỉ được nạp khi `layout` nằm trong ENABLED_MODULES."""
    monkeypatch.setattr(settings, "enabled_modules", ["layout"])


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
    assert client.get(f"/api/layouts/floors/{FLOOR}").status_code == 401


def test_nhan_vien_xem_duoc_nhung_khong_keo_ban_duoc(client, nguoi_dung):
    headers = dang_nhap(client, "NV001")

    assert client.get(f"/api/layouts/floors/{FLOOR}", headers=headers).status_code == 200

    response = client.patch(
        f"/api/layouts/floors/{FLOOR}",
        headers=headers,
        json={"placements": [dat("ws-t-001", 1.0, 1.0)]},
    )
    assert response.status_code == 403


def test_hanh_chinh_luu_va_doc_lai(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")

    saved = client.patch(
        f"/api/layouts/floors/{FLOOR}",
        headers=headers,
        json={"placements": [dat("ws-t-001", 10.5, 20.25, rotation=45.0)]},
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["current_layout_version"] == LAYOUT
    assert len(body["placements"]) == 1
    assert body["placements"][0]["rotation"] == 45.0

    again = client.get(f"/api/layouts/floors/{FLOOR}", headers=headers)
    assert again.json()["placements"][0]["x"] == 10.5


def test_luu_lan_hai_khong_xoa_lan_mot(client, nguoi_dung):
    """API là PATCH: một lần lưu phủ một khu vực, không phủ cả tầng."""
    headers = dang_nhap(client, "HC001")
    client.patch(
        f"/api/layouts/floors/{FLOOR}",
        headers=headers,
        json={"placements": [dat("ws-t-001", 1.0, 1.0)]},
    )
    body = client.patch(
        f"/api/layouts/floors/{FLOOR}",
        headers=headers,
        json={"placements": [dat("ws-t-002", 2.0, 2.0)]},
    ).json()

    assert {p["entity_id"] for p in body["placements"]} == {"ws-t-001", "ws-t-002"}


def test_bo_vi_tri_tra_ve_204(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")
    client.patch(
        f"/api/layouts/floors/{FLOOR}",
        headers=headers,
        json={"placements": [dat("ws-t-001", 1.0, 1.0)]},
    )

    removed = client.delete(f"/api/layouts/floors/{FLOOR}/entities/ws-t-001", headers=headers)
    assert removed.status_code == 204
    assert client.get(f"/api/layouts/floors/{FLOOR}", headers=headers).json()["placements"] == []


def test_bo_vi_tri_chua_tung_luu_cung_tra_204(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")
    assert (
        client.delete(f"/api/layouts/floors/{FLOOR}/entities/ws-t-002", headers=headers).status_code
        == 204
    )


def test_nhan_vien_khong_bo_vi_tri_duoc(client, nguoi_dung):
    headers = dang_nhap(client, "NV001")
    assert (
        client.delete(f"/api/layouts/floors/{FLOOR}/entities/ws-t-001", headers=headers).status_code
        == 403
    )


def test_tang_khong_co_dataset_tra_404(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")
    assert client.get("/api/layouts/floors/floor-khong-co", headers=headers).status_code == 404


def test_doi_chieu_chi_doc(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")
    client.patch(
        f"/api/layouts/floors/{FLOOR}",
        headers=headers,
        json={"placements": [dat("ws-t-khong-co-trong-ban-ve", 1.0, 1.0)]},
    )

    report = client.get(f"/api/layouts/floors/{FLOOR}/reconcile", headers=headers).json()
    assert report["checked"] == 1
    assert report["stale"][0]["reason"] == "missing-entity"


def test_body_rong_bi_tu_choi(client, nguoi_dung):
    headers = dang_nhap(client, "HC001")
    assert (
        client.patch(
            f"/api/layouts/floors/{FLOOR}", headers=headers, json={"placements": []}
        ).status_code
        == 422
    )
