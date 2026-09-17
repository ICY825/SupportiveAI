"""Test danh mục nhân sự: chuẩn hóa khi lưu, đăng nhập, sự kiện nghỉ việc."""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.core.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.shared.employee.events import EmployeeDeactivated
from app.shared.employee.models import EmailSource, EmployeeStatus
from app.shared.employee.repository import EmployeeRepository
from app.shared.employee.schemas import EmployeeCreate, EmployeeUpdate
from app.shared.employee.service import EmployeeService, looks_like_upn


@pytest.fixture
def service(db, dispatcher) -> EmployeeService:
    return EmployeeService(db, dispatcher=dispatcher)


@pytest.fixture
def duyen(service):
    return service.create(
        EmployeeCreate(
            employee_code="NV001",
            full_name="  Phạm Thị  Duyên ",
            email="duyen@example.com",
            phone="+84 912 345 678",
            roles=["hc"],
        )
    )


class TestTaoNhanSu:
    def test_luu_ca_dang_tho_va_dang_chuan_hoa(self, duyen):
        assert duyen.full_name == "Phạm Thị  Duyên"
        assert duyen.full_name_normalized == "phạm thị duyên"
        assert duyen.phone == "+84 912 345 678"
        assert duyen.phone_normalized == "0912345678"
        assert duyen.phone_last4 == "5678"

    def test_gan_vai_tro(self, duyen):
        assert duyen.role_names == frozenset({"hc"})

    def test_mac_dinh_dang_lam_viec(self, duyen):
        assert duyen.is_active

    def test_tu_choi_ma_nhan_vien_trung(self, service, duyen):
        with pytest.raises(ConflictError, match="đã tồn tại"):
            service.create(EmployeeCreate(employee_code="NV001", full_name="Người khác"))

    def test_tu_choi_so_dien_thoai_trung(self, service, duyen):
        """§4.3: mỗi người một số, nên DB phải chặn số trùng."""
        with pytest.raises(ConflictError):
            service.create(
                EmployeeCreate(
                    employee_code="NV002",
                    full_name="Lưu Hải Nam",
                    phone="0912345678",  # cùng số với Duyên, viết khác kiểu
                )
            )


class TestTraCuu:
    def test_khop_bac_1_theo_so_dien_thoai(self, db, duyen):
        repo = EmployeeRepository(db)
        # Mọi cách viết đều tìm ra đúng một người.
        for written in ["0912345678", "+84912345678", "0912 345 678"]:
            assert repo.find_by_phone(written).id == duyen.id

    def test_khong_tim_thay_thi_tra_none(self, db, duyen):
        assert EmployeeRepository(db).find_by_phone("0900000000") is None

    def test_khop_bac_3_theo_ten(self, db, duyen):
        found = EmployeeRepository(db).find_by_name("phạm thị duyên")
        assert [e.id for e in found] == [duyen.id]

    def test_tim_goi_y_theo_ten_hoac_ma(self, db, duyen):
        repo = EmployeeRepository(db)
        assert [e.id for e in repo.search("duyên")] == [duyen.id]
        assert [e.id for e in repo.search("NV00")] == [duyen.id]

    def test_bo_qua_nguoi_da_nghi_khi_khop(self, db, service, duyen):
        service.deactivate(duyen.id)
        assert EmployeeRepository(db).find_by_phone("0912345678") is None
        # Vẫn tra được khi cố ý xin cả người đã nghỉ.
        assert EmployeeRepository(db).find_by_phone("0912345678", active_only=False) is not None


class TestDangNhap:
    def test_dang_nhap_thanh_cong(self, service, duyen):
        service.set_password(duyen.id, "matkhau-rat-dai")
        assert service.authenticate("NV001", "matkhau-rat-dai").id == duyen.id

    def test_sai_mat_khau(self, service, duyen):
        service.set_password(duyen.id, "matkhau-rat-dai")
        with pytest.raises(AuthenticationError):
            service.authenticate("NV001", "sai")

    def test_ma_khong_ton_tai_bao_loi_giong_het_sai_mat_khau(self, service):
        with pytest.raises(AuthenticationError, match="không đúng"):
            service.authenticate("KHONG-CO", "gi-do")

    def test_nguoi_da_nghi_khong_dang_nhap_duoc(self, service, duyen):
        service.set_password(duyen.id, "matkhau-rat-dai")
        service.deactivate(duyen.id)
        with pytest.raises(AuthenticationError):
            service.authenticate("NV001", "matkhau-rat-dai")

    def test_chua_dat_mat_khau_thi_khong_dang_nhap_duoc(self, service, duyen):
        with pytest.raises(AuthenticationError):
            service.authenticate("NV001", "")


class TestNghiViec:
    def test_phat_su_kien_employee_deactivated(self, service, duyen, dispatcher):
        """Locker và seat nghe sự kiện này để thu hồi tài nguyên (§6)."""
        seen: list[EmployeeDeactivated] = []
        dispatcher.subscribe(EmployeeDeactivated, seen.append)

        service.deactivate(duyen.id, actor_id="admin")

        assert len(seen) == 1
        assert seen[0].entity_id == duyen.id
        assert seen[0].employee_code == "NV001"
        assert seen[0].actor_id == "admin"

    def test_goi_lai_lan_hai_khong_phat_them_su_kien(self, service, duyen, dispatcher):
        seen: list[EmployeeDeactivated] = []
        dispatcher.subscribe(EmployeeDeactivated, seen.append)

        service.deactivate(duyen.id)
        service.deactivate(duyen.id)

        assert len(seen) == 1

    def test_doi_status_qua_update_cung_phat_su_kien(self, service, duyen, dispatcher):
        seen: list[EmployeeDeactivated] = []
        dispatcher.subscribe(EmployeeDeactivated, seen.append)

        service.update(duyen.id, EmployeeUpdate(status=EmployeeStatus.INACTIVE))

        assert len(seen) == 1


def test_get_bao_loi_khi_khong_co(service):
    with pytest.raises(NotFoundError):
        service.get("khong-ton-tai")


# ----------------------------------------------------------------------
# CR-001 §3.5 (D8) — tách hộp thư thật khỏi tài khoản AD
# ----------------------------------------------------------------------

class TestEmailVaTaiKhoanAD:
    """Lấy nhầm cột tài khoản AD sang cột email là **lỗi im lặng nguy hiểm
    nhất** trong cả hệ thống: thư không tới ai, nhưng SMTP vẫn nhận và hệ
    thống vẫn báo gửi thành công. Đồng hồ SLA chạy, kiện chuyển tồn đọng,
    còn người nhận thì không bao giờ biết mình có hàng.
    """

    @pytest.fixture(autouse=True)
    def ten_mien_ad(self, monkeypatch):
        monkeypatch.setattr(settings, "upn_domain_hint", "vingroup.net")

    def test_luu_ca_hai_chuoi_rieng_nhau(self, service):
        person = service.create(EmployeeCreate(
            employee_code="NV100", full_name="Trần Anh Trung",
            email="v.trungab1@vinsmartfuture.tech", upn="trungab1@vingroup.net"))
        assert person.email == "v.trungab1@vinsmartfuture.tech"
        assert person.upn == "trungab1@vingroup.net"
        assert person.email_source == EmailSource.CONFIRMED

    def test_email_dung_ten_mien_ad_thi_canh_bao(self, service):
        person = service.create(EmployeeCreate(
            employee_code="NV101", full_name="Trần Anh Trung",
            email="trungab1@vingroup.net"))
        warnings = service.data_warnings(person)
        assert any("tài khoản AD" in w for w in warnings)

    def test_canh_bao_khong_chan_viec_ghi(self, service):
        """HR vẫn nhập được — cảnh báo là để nhìn, không phải để chặn."""
        person = service.create(EmployeeCreate(
            employee_code="NV102", full_name="Trần Anh Trung",
            email="trungab1@vingroup.net"))
        assert service.get(person.id).email == "trungab1@vingroup.net"

    def test_email_dung_ten_mien_khac_thi_khong_canh_bao(self, service):
        person = service.create(EmployeeCreate(
            employee_code="NV103", full_name="Trần Anh Trung",
            email="v.trungab1@vinsmartfuture.tech"))
        assert service.data_warnings(person) == []

    def test_thieu_email_thi_canh_bao_rieng(self, service):
        person = service.create(EmployeeCreate(
            employee_code="NV104", full_name="Trần Anh Trung"))
        assert any("chưa có email" in w for w in service.data_warnings(person))

    def test_sua_email_sang_ten_mien_ad_cung_bi_bat(self, service):
        person = service.create(EmployeeCreate(
            employee_code="NV105", full_name="Trần Anh Trung",
            email="v.trungab1@vinsmartfuture.tech"))
        service.update(person.id, EmployeeUpdate(email="trungab1@vingroup.net"))
        assert service.data_warnings(person)


def test_khong_dat_upn_domain_hint_thi_khong_kiem_tra(service, monkeypatch):
    """Chưa biết tên miền AD thì đoán bừa còn tệ hơn là không kiểm tra."""
    monkeypatch.setattr(settings, "upn_domain_hint", "")
    assert not looks_like_upn("trungab1@vingroup.net")
