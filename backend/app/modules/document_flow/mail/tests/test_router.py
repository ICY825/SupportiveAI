"""Test API của phân hệ chuyển phát nhanh.

Trọng tâm: **phân quyền** và **hai endpoint công khai tại khu để đơn** —
đó là chỗ nếu sai thì lộ dữ liệu hoặc cho người lạ xác nhận hộ.

Thêm theo CR-001: tải file lên (§1), gửi một phần (§6.1), màn hình "Chờ
khớp" xuyên lô (§6.2).
"""

from __future__ import annotations

import io
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import registry as permission_registry
from app.main import create_app
from app.modules.document_flow.mail.models import HandoverMethod, MailStatus, MatchTier
from app.modules.document_flow.mail.permissions import ROLE_EMPLOYEE, ROLE_HC, grant_defaults
from app.shared.department.schemas import DepartmentCreate
from app.shared.department.service import DepartmentService
from app.shared.employee.schemas import EmployeeCreate
from app.shared.employee.service import EmployeeService

MAT_KHAU = "matkhau-rat-dai-32"
NGAY = "17/09/2026"


@pytest.fixture(autouse=True)
def bang_quyen():
    permission_registry.clear()
    grant_defaults()
    yield
    permission_registry.clear()


@pytest.fixture
def nguoi_dung(db):
    hc_dept = DepartmentService(db).create(DepartmentCreate(code="HC", name="Hành chính"))
    employees = EmployeeService(db)

    duyen = employees.create(EmployeeCreate(
        employee_code="HC001", full_name="Phạm Thị Duyên", email="duyen@example.com",
        phone="0911111111", department_id=hc_dept.id, roles=[ROLE_HC]))
    an = employees.create(EmployeeCreate(
        employee_code="NV001", full_name="Nguyễn Văn An", email="an@example.com",
        phone="0912345678", department_id=hc_dept.id, roles=[ROLE_EMPLOYEE]))
    for person in (duyen, an):
        employees.set_password(person.id, MAT_KHAU)
    db.commit()
    return {"hc": duyen, "nv": an}


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


@pytest.fixture
def hc_headers(client, nguoi_dung):
    return dang_nhap(client, "HC001")


@pytest.fixture
def nv_headers(client, nguoi_dung):
    return dang_nhap(client, "NV001")


def rows(*senders, name="Nguyễn Văn An", ngay="2026-09-17", quantity=1):
    return [
        {"sender": sender, "recipient_name": name, "quantity": quantity,
         "content_type": "phong bì", "received_on": ngay}
        for sender in senders
    ]


def file_xlsx(rows_data) -> bytes:
    import openpyxl

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Trang_tính1"
    sheet.append(["stt", "người gửi", "ngày nhận", "số lượng", "nội dung", "người nhận"])
    for row in rows_data:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


@pytest.fixture
def lo_da_gui(client, hc_headers):
    created = client.post("/api/mail/batches", json=rows("cty nam hải", "cty hùng long"),
                          headers=hc_headers)
    assert created.status_code == 200, created.text
    batch_id = created.json()["batch_id"]
    sent = client.post(f"/api/mail/batches/{batch_id}/send", headers=hc_headers)
    assert sent.status_code == 200, sent.text
    return batch_id


# ----------------------------------------------------------------------


class TestPhanQuyen:
    def test_nhan_vien_thuong_khong_nap_duoc_danh_sach(self, client, nv_headers):
        response = client.post("/api/mail/batches", json=rows("cty nam hải"), headers=nv_headers)
        assert response.status_code == 403
        assert response.json()["code"] == "permission_denied"

    def test_nhan_vien_thuong_khong_tai_duoc_file(self, client, nv_headers):
        response = client.post(
            "/api/mail/batches/upload",
            files={"file": ("mau.xlsx", file_xlsx([]), "application/vnd.ms-excel")},
            headers=nv_headers,
        )
        assert response.status_code == 403

    def test_nhan_vien_thuong_khong_xem_duoc_man_hinh_qua_han(self, client, nv_headers):
        assert client.get("/api/mail/items", headers=nv_headers).status_code == 403

    def test_nhan_vien_thuong_khong_xem_duoc_man_hinh_cho_khop(self, client, nv_headers):
        assert client.get("/api/mail/items/pending-match", headers=nv_headers).status_code == 403

    def test_nhan_vien_thuong_khong_xem_duoc_bao_cao(self, client, nv_headers):
        assert client.get("/api/mail/reports", headers=nv_headers).status_code == 403

    def test_khong_dang_nhap_thi_bi_tu_choi(self, client):
        assert client.post("/api/mail/batches", json=rows("cty nam hải")).status_code == 401

    def test_hc_lam_duoc(self, client, hc_headers):
        assert client.post("/api/mail/batches", json=rows("cty nam hải"),
                           headers=hc_headers).status_code == 200


class TestTaiFileLen:
    """CR-001 §1 — luồng chính: HC tải file `.xlsx` của lễ tân."""

    def test_doc_file_va_dung_lo(self, client, hc_headers):
        content = file_xlsx([
            [1, "cty nam hải", datetime(2026, 9, 17), 1, "phong bì", "Nguyễn Văn An"],
            [2, "an nguyễn", datetime(2026, 9, 17), 2, "phong bì", "Phạm Thị Duyên"],
        ])
        response = client.post(
            "/api/mail/batches/upload",
            files={"file": ("mau.xlsx", content, "application/vnd.ms-excel")},
            headers=hc_headers,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["row_count"] == 2
        assert body["matched_count"] == 2
        assert body["summary"]["total_parcels"] == 3

    def test_thieu_cot_bat_buoc_thi_bao_loi_ro_rang(self, client, hc_headers):
        import openpyxl

        workbook = openpyxl.Workbook()
        workbook.active.append(["stt", "người gửi"])
        buffer = io.BytesIO()
        workbook.save(buffer)

        response = client.post(
            "/api/mail/batches/upload",
            files={"file": ("thieu-cot.xlsx", buffer.getvalue(), "application/vnd.ms-excel")},
            headers=hc_headers,
        )
        assert response.status_code == 422
        assert "người nhận" in response.json()["message"]

    def test_dinh_dang_la_thi_tu_choi(self, client, hc_headers):
        response = client.post(
            "/api/mail/batches/upload",
            files={"file": ("le-tan.pdf", b"%PDF-1.4", "application/pdf")},
            headers=hc_headers,
        )
        assert response.status_code == 422


class TestManHinhSoat:
    def test_nap_danh_sach_tra_ve_tong_quan(self, client, hc_headers):
        response = client.post(
            "/api/mail/batches",
            json=rows("cty nam hải", "cty hùng long")
            + rows("an nguyễn", name="Người Lạ Hoắc"),
            headers=hc_headers,
        )
        body = response.json()
        assert body["matched_count"] == 2
        assert body["summary"]["total_rows"] == 3
        assert body["summary"]["confirmed"] == 2
        assert body["summary"]["choose"] == 1

    def test_hien_toan_bo_dong_kem_muc_chac_chan(self, client, hc_headers, nguoi_dung):
        """CR-001 §6 (D6) — hiện cả lô, không chỉ dòng có vấn đề."""
        batch_id = client.post(
            "/api/mail/batches",
            json=rows("cty nam hải") + rows("an nguyễn", name="Người Lạ Hoắc"),
            headers=hc_headers,
        ).json()["batch_id"]

        detail = client.get(f"/api/mail/batches/{batch_id}", headers=hc_headers).json()
        assert len(detail["items"]) == 2
        tiers = [i["match_tier"] for i in detail["items"]]
        assert MatchTier.CONFIRMED in tiers
        assert MatchTier.CHOOSE in tiers

    def test_dong_phai_chon_kem_ung_vien_da_xep_hang(self, client, hc_headers, nguoi_dung):
        batch_id = client.post(
            "/api/mail/batches", json=rows("cty nam hải", name="nguyen van an"),
            headers=hc_headers,
        ).json()["batch_id"]

        detail = client.get(f"/api/mail/batches/{batch_id}", headers=hc_headers).json()
        item = detail["items"][0]
        assert item["needs_review"]
        assert [c["employee_code"] for c in item["candidates"]] == ["NV001"]

    def test_canh_bao_lo_cung_ngay(self, client, hc_headers):
        """CR-001 §5.3 — cảnh báo, không chặn."""
        client.post("/api/mail/batches", json=rows("cty nam hải"), headers=hc_headers)
        second = client.post("/api/mail/batches", json=rows("cty hùng long"),
                             headers=hc_headers).json()
        assert len(second["same_date_batches"]) == 1

    def test_hc_sua_nguoi_nhan_roi_gui_duoc(self, client, hc_headers, nguoi_dung):
        batch_id = client.post(
            "/api/mail/batches", json=rows("cty nam hải", name="Người Lạ Hoắc"),
            headers=hc_headers,
        ).json()["batch_id"]
        item_id = client.get(f"/api/mail/batches/{batch_id}",
                             headers=hc_headers).json()["items"][0]["id"]

        patched = client.patch(f"/api/mail/items/{item_id}",
                               json={"employee_id": nguoi_dung["nv"].id}, headers=hc_headers)
        assert patched.status_code == 200
        assert patched.json()["match_method"] == "manual"

        assert client.post(f"/api/mail/batches/{batch_id}/send",
                           headers=hc_headers).status_code == 200

    def test_xac_nhan_nhanh_dong_review(self, client, hc_headers, nguoi_dung):
        batch_id = client.post(
            "/api/mail/batches", json=rows("cty nam hải", name="nguyen van an"),
            headers=hc_headers,
        ).json()["batch_id"]
        item_id = client.get(f"/api/mail/batches/{batch_id}",
                             headers=hc_headers).json()["items"][0]["id"]

        response = client.post(f"/api/mail/items/{item_id}/confirm",
                               json={"confirmed": True}, headers=hc_headers)
        assert response.status_code == 200
        assert response.json()["review_confirmed"]

    def test_gui_gop_theo_nguoi(self, client, hc_headers):
        batch_id = client.post("/api/mail/batches",
                               json=rows("cty nam hải", "cty hùng long"),
                               headers=hc_headers).json()["batch_id"]
        result = client.post(f"/api/mail/batches/{batch_id}/send", headers=hc_headers).json()
        assert result["notified_items"] == 2
        assert result["notifications_sent"] == 1


class TestGuiMotPhan:
    """CR-001 §6.1 — endpoint gửi gọi lại được nhiều lần."""

    def test_dong_chua_khop_khong_chan_ca_lo(self, client, hc_headers):
        batch_id = client.post(
            "/api/mail/batches",
            json=rows("cty nam hải") + rows("an nguyễn", name="Người Lạ Hoắc"),
            headers=hc_headers,
        ).json()["batch_id"]

        result = client.post(f"/api/mail/batches/{batch_id}/send", headers=hc_headers)
        assert result.status_code == 200
        assert result.json()["notified_items"] == 1
        assert result.json()["pending_match"] == 1

    def test_goi_lai_sau_khi_xu_ly_xong(self, client, hc_headers, nguoi_dung):
        batch_id = client.post(
            "/api/mail/batches",
            json=rows("cty nam hải") + rows("an nguyễn", name="Người Lạ Hoắc"),
            headers=hc_headers,
        ).json()["batch_id"]
        client.post(f"/api/mail/batches/{batch_id}/send", headers=hc_headers)

        con_lai = [
            i for i in client.get(f"/api/mail/batches/{batch_id}",
                                  headers=hc_headers).json()["items"]
            if i["status"] == MailStatus.PENDING_MATCH
        ]
        client.patch(f"/api/mail/items/{con_lai[0]['id']}",
                     json={"employee_id": nguoi_dung["nv"].id}, headers=hc_headers)

        lan_hai = client.post(f"/api/mail/batches/{batch_id}/send", headers=hc_headers).json()
        assert lan_hai["notified_items"] == 1
        assert lan_hai["pending_match"] == 0

    def test_khong_con_gi_de_gui_thi_bao_loi(self, client, hc_headers):
        batch_id = client.post(
            "/api/mail/batches", json=rows("cty nam hải", name="Người Lạ Hoắc"),
            headers=hc_headers,
        ).json()["batch_id"]

        response = client.post(f"/api/mail/batches/{batch_id}/send", headers=hc_headers)
        assert response.status_code == 422
        assert "sẵn sàng" in response.json()["message"]


class TestManHinhChoKhop:
    """CR-001 §6.2 — xuyên lô, không phân biệt lô nào."""

    def test_liet_ke_dong_cho_khop_cua_moi_lo(self, client, hc_headers):
        client.post("/api/mail/batches", json=rows("cty nam hải", name="Khách Vãng Lai"),
                    headers=hc_headers)
        client.post("/api/mail/batches", json=rows("an nguyễn", name="Thực Tập Sinh"),
                    headers=hc_headers)

        items = client.get("/api/mail/items/pending-match", headers=hc_headers).json()
        assert len(items) == 2
        assert all("waiting_days" in i and "batch_filename" in i for i in items)

    def test_loc_qua_endpoint_items(self, client, hc_headers):
        client.post("/api/mail/batches", json=rows("cty nam hải", name="Khách Vãng Lai"),
                    headers=hc_headers)
        items = client.get("/api/mail/items", params={"status": "pending_match"},
                           headers=hc_headers).json()
        assert len(items) == 1
        assert items[0]["status"] == MailStatus.PENDING_MATCH

    def test_gan_nguoi_nhan_roi_gui_ngay_tai_cho(self, client, hc_headers, nguoi_dung):
        client.post("/api/mail/batches", json=rows("cty nam hải", name="Khách Vãng Lai"),
                    headers=hc_headers)
        item_id = client.get("/api/mail/items/pending-match",
                             headers=hc_headers).json()[0]["id"]

        client.patch(f"/api/mail/items/{item_id}",
                     json={"employee_id": nguoi_dung["nv"].id}, headers=hc_headers)
        response = client.post(f"/api/mail/items/{item_id}/send", headers=hc_headers)

        assert response.status_code == 200
        assert response.json()["status"] == MailStatus.NOTIFIED
        assert client.get("/api/mail/items/pending-match", headers=hc_headers).json() == []


class TestBaoCao:
    def test_man_hinh_qua_han(self, client, hc_headers, lo_da_gui):
        items = client.get("/api/mail/items", headers=hc_headers).json()
        assert len(items) == 2
        assert all(i["status"] == MailStatus.NOTIFIED for i in items)

    def test_bao_cao(self, client, hc_headers, lo_da_gui):
        report = client.get("/api/mail/reports", headers=hc_headers).json()
        assert report["by_status"][MailStatus.NOTIFIED] == 2
        assert report["by_match_method"]["name_exact"] == 2

    def test_ty_le_khop_tu_dong_bao_theo_tuan(self, client, hc_headers, lo_da_gui):
        """CR-001 §8.2 — trung bình cả kỳ làm hệ thống trông tệ hơn thực lực."""
        report = client.get("/api/mail/reports", headers=hc_headers).json()
        tuan = report["auto_match_rate_by_week"]
        assert len(tuan) == 1
        assert tuan[0]["total"] == 2
        assert tuan[0]["rate"] == 1.0

    def test_dem_so_lan_hc_phai_can_thiep(self, client, hc_headers, nguoi_dung):
        """Căn cứ bằng số để đi đòi lễ tân thêm cột SĐT (CR-001 §8.1)."""
        batch_id = client.post(
            "/api/mail/batches", json=rows("cty nam hải", name="Khách Vãng Lai"),
            headers=hc_headers,
        ).json()["batch_id"]
        item_id = client.get(f"/api/mail/batches/{batch_id}",
                             headers=hc_headers).json()["items"][0]["id"]
        client.patch(f"/api/mail/items/{item_id}",
                     json={"employee_id": nguoi_dung["nv"].id}, headers=hc_headers)

        report = client.get("/api/mail/reports", headers=hc_headers).json()
        assert report["hc_interventions"]["total_interventions"] == 1
        assert report["hc_interventions"]["machine_had_no_suggestion"] == 1
        assert report["hc_interventions"]["alias_learned"] == 1


class TestKhuDeDon:
    """Hai endpoint công khai — người nhận không có tài khoản (§7.2).

    CR-001 §9 xác nhận phần này **không đổi**: 4 số cuối lấy từ danh mục
    nhân sự, không lấy từ file lễ tân.
    """

    def test_tra_cuu_khong_can_dang_nhap(self, client, lo_da_gui):
        response = client.post("/api/mail/station/lookup", json={"phone_last4": "5678"})
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["recipient_name"] == "Nguyễn Văn An"
        assert body[0]["sender"] in ("cty nam hải", "cty hùng long")

    def test_tra_cuu_sai_so_thi_khong_ra_gi(self, client, lo_da_gui):
        response = client.post("/api/mail/station/lookup", json={"phone_last4": "0000"})
        assert response.json() == []

    def test_phai_dung_4_chu_so(self, client):
        assert client.post("/api/mail/station/lookup",
                           json={"phone_last4": "abc"}).status_code == 422
        assert client.post("/api/mail/station/lookup",
                           json={"phone_last4": "12345"}).status_code == 422

    def test_xac_nhan_khong_can_dang_nhap(self, client, lo_da_gui):
        item_id = client.post("/api/mail/station/lookup",
                              json={"phone_last4": "5678"}).json()[0]["item_id"]

        response = client.post(f"/api/mail/station/collect/{item_id}")
        assert response.status_code == 200
        assert response.json()["status"] == MailStatus.COLLECTED
        assert response.json()["handover_method"] == HandoverMethod.SELF_QR_STATION

    def test_da_nhan_thi_khong_con_trong_danh_sach_tra_cuu(self, client, lo_da_gui):
        item_id = client.post("/api/mail/station/lookup",
                              json={"phone_last4": "5678"}).json()[0]["item_id"]
        client.post(f"/api/mail/station/collect/{item_id}")

        con_lai = client.post("/api/mail/station/lookup", json={"phone_last4": "5678"}).json()
        assert item_id not in [r["item_id"] for r in con_lai]


class TestMaTram:
    """`MAIL_STATION_TOKEN` chặn người không đứng trước tấm biển QR."""

    @pytest.fixture(autouse=True)
    def bat_ma_tram(self, monkeypatch):
        monkeypatch.setattr(settings, "mail_station_token", "ma-tram-bi-mat")

    def test_thieu_ma_thi_tu_choi(self, client, lo_da_gui):
        response = client.post("/api/mail/station/lookup", json={"phone_last4": "5678"})
        assert response.status_code == 403

    def test_sai_ma_thi_tu_choi(self, client, lo_da_gui):
        response = client.post("/api/mail/station/lookup", json={"phone_last4": "5678"},
                               headers={"X-Station-Token": "doan-bua"})
        assert response.status_code == 403

    def test_dung_ma_thi_qua(self, client, lo_da_gui):
        response = client.post("/api/mail/station/lookup", json={"phone_last4": "5678"},
                               headers={"X-Station-Token": "ma-tram-bi-mat"})
        assert response.status_code == 200

    def test_xac_nhan_cung_can_ma(self, client, lo_da_gui):
        headers = {"X-Station-Token": "ma-tram-bi-mat"}
        item_id = client.post("/api/mail/station/lookup", json={"phone_last4": "5678"},
                              headers=headers).json()[0]["item_id"]
        assert client.post(f"/api/mail/station/collect/{item_id}").status_code == 403
        assert client.post(f"/api/mail/station/collect/{item_id}",
                           headers=headers).status_code == 200


class TestNhanVienThuong:
    def test_xem_kien_cua_chinh_minh(self, client, nv_headers, lo_da_gui):
        items = client.get("/api/mail/items/mine", headers=nv_headers).json()
        assert len(items) == 2

    def test_tu_xac_nhan_qua_link(self, client, nv_headers, lo_da_gui):
        item_id = client.get("/api/mail/items/mine", headers=nv_headers).json()[0]["id"]
        response = client.post(f"/api/mail/items/{item_id}/collect-mine", headers=nv_headers)
        assert response.status_code == 200
        assert response.json()["handover_method"] == HandoverMethod.SELF_LINK

    def test_khong_xac_nhan_ho_kien_nguoi_khac(self, client, hc_headers, nv_headers, lo_da_gui):
        """Kiện của người khác phải trả 404, không được lộ là nó có tồn tại."""
        batch_id = client.post(
            "/api/mail/batches", json=rows("cty nam hải", name="Phạm Thị Duyên"),
            headers=hc_headers,
        ).json()["batch_id"]
        client.post(f"/api/mail/batches/{batch_id}/send", headers=hc_headers)
        cua_duyen = client.get(f"/api/mail/batches/{batch_id}",
                               headers=hc_headers).json()["items"][0]["id"]

        response = client.post(f"/api/mail/items/{cua_duyen}/collect-mine", headers=nv_headers)
        assert response.status_code == 404


class TestXoaLo:
    def test_hc_xoa_lo_chua_gui(self, client, hc_headers):
        batch_id = client.post("/api/mail/batches", json=rows("cty nam hải"),
                               headers=hc_headers).json()["batch_id"]

        response = client.delete(f"/api/mail/batches/{batch_id}", headers=hc_headers)
        assert response.status_code == 204
        assert client.get(f"/api/mail/batches/{batch_id}", headers=hc_headers).status_code == 404

    def test_lo_da_gui_tra_409(self, client, hc_headers, lo_da_gui):
        response = client.delete(f"/api/mail/batches/{lo_da_gui}", headers=hc_headers)
        assert response.status_code == 409

    def test_nhan_vien_thuong_khong_xoa_duoc(self, client, hc_headers, nv_headers):
        batch_id = client.post("/api/mail/batches", json=rows("cty nam hải"),
                               headers=hc_headers).json()["batch_id"]
        response = client.delete(f"/api/mail/batches/{batch_id}", headers=nv_headers)
        assert response.status_code == 403


class TestLinkXacNhan:
    """Link trong email — công khai, xác thực bằng token (§7.2, đường phụ)."""

    @pytest.fixture
    def token(self, db, lo_da_gui):
        import re

        from app.platform.notification.models import Notification

        mail = db.query(Notification).one()
        return re.search(r"/confirm\?token=(\S+)", mail.body).group(1)

    def test_mo_link_khong_can_dang_nhap(self, client, token):
        response = client.post("/api/mail/confirm/lookup", json={"token": token})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["recipient_name"] == "Nguyễn Văn An"
        assert len(body["items"]) == 2

    def test_xac_nhan_qua_link(self, client, token):
        items = client.post("/api/mail/confirm/lookup", json={"token": token}).json()["items"]
        response = client.post("/api/mail/confirm/collect",
                               json={"token": token, "item_ids": [items[0]["item_id"]]})
        assert response.status_code == 200, response.text
        statuses = {i["item_id"]: i["status"] for i in response.json()["items"]}
        assert statuses[items[0]["item_id"]] == MailStatus.COLLECTED
        assert statuses[items[1]["item_id"]] == MailStatus.NOTIFIED

    def test_token_sai_tra_401(self, client):
        response = client.post("/api/mail/confirm/lookup", json={"token": "x" * 40})
        assert response.status_code == 401

    def test_khong_can_ma_tram(self, client, token, monkeypatch):
        monkeypatch.setattr(settings, "mail_station_token", "bi-mat")
        response = client.post("/api/mail/confirm/lookup", json={"token": token})
        assert response.status_code == 200


class TestBienQr:
    def test_hc_lay_duoc_ma_qr(self, client, hc_headers):
        response = client.get("/api/mail/station/sign", headers=hc_headers)
        assert response.status_code == 200
        assert response.json()["svg"].startswith("<svg")

    def test_nhan_vien_thuong_khong_xem_duoc(self, client, nv_headers):
        """URL trong QR chứa mã trạm."""
        assert client.get("/api/mail/station/sign", headers=nv_headers).status_code == 403
