"""Test khớp người nhận.

repository-structure.md §11 xếp đây là mục ưu tiên kiểm thử **số 1**:
"sai là gửi nhầm người".

Nguyên tắc xuyên suốt: **thà không khớp còn hơn khớp nhầm.** Hễ còn từ hai
ứng viên trở lên thì matcher không được tự chọn — phải đẩy danh sách cho
HC quyết định ở màn hình soát (CR-001 §4.2 bậc 3 và 5).

Thiết kế đổi theo CR-001 D3: file thật không có số điện thoại, nên bảng
`matching_alias` là cơ chế khớp chính chứ không phải tính năng phụ.
"""

from __future__ import annotations

import pytest

from app.core.database import utcnow
from app.modules.document_flow.mail.matcher import (
    RecipientMatcher,
    name_contains,
    name_similarity,
    name_similarity_plain,
)
from app.modules.document_flow.mail.models import (
    MailBatch,
    MailItem,
    MailStatus,
    MatchingAlias,
    MatchMethod,
    MatchTier,
)
from app.shared.department.schemas import DepartmentCreate
from app.shared.department.service import DepartmentService
from app.shared.employee.schemas import EmployeeCreate
from app.shared.employee.service import EmployeeService

# Danh mục nhân sự dùng chung cho cả file. Cố tình có hai người **trùng
# tên** và vài người tên gần giống — đó là hai tình huống thực tế hay gặp
# nhất và cũng là hai chỗ dễ gửi nhầm nhất.
#
#  mã     tên                      điện thoại    ghi chú
#  NV001  Nguyễn Văn An            0912345678
#  NV002  Nguyễn Văn An            0987651234    ← trùng tên NV001
#  NV003  Nguyễn Văn Ân            0888885678    ← chỉ khác một dấu
#  NV004  Lê Hải Nam               0333335678
#  NV005  Trần Thị Bình            0977770000    ← đã nghỉ việc
#  NV006  Nguyễn Thị Lương Hiền    0966660000    ← "Lương hiền" trên phong bì
#  NV007  Nguyễn Thị Thu           0955550000    ← "nguyen thi thu" bỏ dấu


@pytest.fixture
def danh_muc(db):
    departments = DepartmentService(db)
    hc = departments.create(DepartmentCreate(code="HC", name="Hành chính"))
    kt = departments.create(DepartmentCreate(code="KT", name="Kỹ thuật"))

    employees = EmployeeService(db)
    people = {
        "NV001": employees.create(EmployeeCreate(
            employee_code="NV001", full_name="Nguyễn Văn An",
            phone="0912345678", department_id=hc.id)),
        "NV002": employees.create(EmployeeCreate(
            employee_code="NV002", full_name="Nguyễn Văn An",
            phone="0987651234", department_id=kt.id)),
        "NV003": employees.create(EmployeeCreate(
            employee_code="NV003", full_name="Nguyễn Văn Ân",
            phone="0888885678", department_id=kt.id)),
        "NV004": employees.create(EmployeeCreate(
            employee_code="NV004", full_name="Lê Hải Nam",
            phone="0333335678", department_id=kt.id)),
        "NV005": employees.create(EmployeeCreate(
            employee_code="NV005", full_name="Trần Thị Bình",
            phone="0977770000", department_id=hc.id)),
        "NV006": employees.create(EmployeeCreate(
            employee_code="NV006", full_name="Nguyễn Thị Lương Hiền",
            phone="0966660000", department_id=hc.id)),
        "NV007": employees.create(EmployeeCreate(
            employee_code="NV007", full_name="Nguyễn Thị Thu",
            phone="0955550000", department_id=hc.id)),
    }
    employees.deactivate(people["NV005"].id)
    db.flush()
    return {"hc": hc, "kt": kt, **people}


@pytest.fixture
def matcher(db, danh_muc) -> RecipientMatcher:
    return RecipientMatcher(db)


def them_alias(db, raw_name_normalized: str, employee_id: str) -> MatchingAlias:
    alias = MatchingAlias(
        raw_name_normalized=raw_name_normalized, employee_id=employee_id, hit_count=1
    )
    db.add(alias)
    db.flush()
    return alias


def lich_su_nhan_hang(db, *, sender_normalized: str, employee_id: str, uploaded_by: str):
    """Dựng một dòng đã hoàn tất, để matcher có lịch sử mà xếp hạng (§4.3)."""
    batch = MailBatch(
        source_filename="cu.xlsx", uploaded_by=uploaded_by, uploaded_at=utcnow(), row_count=1
    )
    db.add(batch)
    db.flush()
    db.add(MailItem(
        batch_id=batch.id, sender_normalized=sender_normalized, employee_id=employee_id,
        recipient_name_normalized="nguyễn văn an", quantity=1,
        status=MailStatus.COLLECTED, match_method=MatchMethod.MANUAL,
        match_tier=MatchTier.CONFIRMED, received_at=utcnow(),
    ))
    db.flush()


# ----------------------------------------------------------------------
# Bậc 0 — số điện thoại (D7: mặc định TẮT vì file không có cột này)
# ----------------------------------------------------------------------

class TestBac0SoDienThoai:
    def test_mac_dinh_tat_vi_file_khong_co_cot_nay(self, matcher, danh_muc):
        """File mẫu thật không có số điện thoại — nhánh này phải im lặng.

        Nếu bật sẵn thì mọi dòng sẽ trượt qua một truy vấn vô nghĩa, và tệ
        hơn là che mất việc khớp theo tên đang làm gì.
        """
        result = matcher.match(name_raw="Lê Hải Nam", phone_raw="0912345678")
        assert result.method != MatchMethod.PHONE
        assert result.employee_id == danh_muc["NV004"].id

    def test_bat_bang_cau_hinh_thi_khop_ngay(self, db, danh_muc):
        """D7 — lễ tân thêm cột thì bật lên bằng cấu hình, không sửa code."""
        matcher = RecipientMatcher(db, match_by_phone=True)
        result = matcher.match(name_raw="Gõ Sai Tên", phone_raw="0912345678")
        assert result.method == MatchMethod.PHONE
        assert result.tier == MatchTier.CONFIRMED
        assert result.employee_id == danh_muc["NV001"].id

    def test_thang_moi_bac_con_lai(self, db, danh_muc):
        """Có số điện thoại thì không bao giờ rơi xuống đoán theo tên."""
        matcher = RecipientMatcher(db, match_by_phone=True)
        result = matcher.match(name_raw="Nguyễn Văn An", phone_raw="0987651234")
        assert result.employee_id == danh_muc["NV002"].id


# ----------------------------------------------------------------------
# Bậc 1 — alias học từ lần HC chọn (CR-001 §3.3)
# ----------------------------------------------------------------------

class TestBac1Alias:
    def test_alias_da_co_thi_khop_thang(self, matcher, db, danh_muc):
        them_alias(db, "hùng mạnh", danh_muc["NV004"].id)
        result = matcher.match(name_raw="Hùng Mạnh")

        assert result.method == MatchMethod.ALIAS
        assert result.tier == MatchTier.CONFIRMED
        assert result.employee_id == danh_muc["NV004"].id
        assert not result.needs_review, "alias là trí nhớ về lần HC đã chọn — không hỏi lại"

    def test_alias_thang_ca_khop_ten_chinh_xac(self, matcher, db, danh_muc):
        """Tên trùng hai người, nhưng alias đã ghi rõ là ai thì không hỏi nữa."""
        them_alias(db, "nguyễn văn an", danh_muc["NV002"].id)
        result = matcher.match(name_raw="Nguyễn Văn An")

        assert result.method == MatchMethod.ALIAS
        assert result.employee_id == danh_muc["NV002"].id

    def test_alias_khong_phan_biet_hoa_thuong(self, matcher, db, danh_muc):
        them_alias(db, "hùng mạnh", danh_muc["NV004"].id)
        assert matcher.match(name_raw="  HÙNG   mạnh ").employee_id == danh_muc["NV004"].id

    def test_alias_tro_toi_nguoi_da_nghi_viec_thi_bo_qua(self, matcher, db, danh_muc):
        """Người nghỉ việc rồi thì alias cũ không dùng được nữa."""
        them_alias(db, "bình cũ", danh_muc["NV005"].id)
        result = matcher.match(name_raw="Bình cũ")
        assert result.method == MatchMethod.NONE


# ----------------------------------------------------------------------
# Bậc 2/3 — tên chuẩn hóa khớp chính xác
# ----------------------------------------------------------------------

class TestBac23TenChinhXac:
    def test_ten_duy_nhat_thi_confirmed(self, matcher, danh_muc):
        result = matcher.match(name_raw="Lê Hải Nam")
        assert result.method == MatchMethod.NAME_EXACT
        assert result.tier == MatchTier.CONFIRMED
        assert result.employee_id == danh_muc["NV004"].id

    def test_trung_ten_thi_phai_chon(self, matcher, danh_muc):
        """Hai người cùng tên "Nguyễn Văn An" — không đoán, đưa HC chọn."""
        result = matcher.match(name_raw="Nguyễn Văn An")
        assert result.tier == MatchTier.CHOOSE
        assert not result.matched
        ids = {c.employee_id for c in result.candidates}
        assert ids == {danh_muc["NV001"].id, danh_muc["NV002"].id}

    @pytest.mark.parametrize("cach_viet", ["Lương hiền", "lương hiền", "LƯƠNG HIỀN",
                                           "  Lương   Hiền  "])
    def test_hoa_thuong_va_khoang_trang_cho_cung_ket_qua(self, matcher, db, danh_muc, cach_viet):
        them_alias(db, "lương hiền", danh_muc["NV006"].id)
        assert matcher.match(name_raw=cach_viet).employee_id == danh_muc["NV006"].id

    def test_bo_qua_nguoi_da_nghi_viec(self, matcher):
        result = matcher.match(name_raw="Trần Thị Bình")
        assert result.method == MatchMethod.NONE


# ----------------------------------------------------------------------
# Bậc 4/5 — khớp gần đúng
# ----------------------------------------------------------------------

class TestBac45GanDung:
    def test_bo_dau_van_khop_duoc(self, matcher, danh_muc):
        """"nguyen thi thu" phải tìm ra "Nguyễn Thị Thu" (CR-001 §11)."""
        result = matcher.match(name_raw="nguyen thi thu")
        assert result.employee_id == danh_muc["NV007"].id
        assert result.method == MatchMethod.NAME_FUZZY

    def test_gan_dung_thi_phai_soat_chu_khong_gui_thang(self, matcher, danh_muc):
        """`review`: điền sẵn nhưng đánh dấu — đủ tin để đề xuất, không đủ để gửi."""
        result = matcher.match(name_raw="nguyen thi thu")
        assert result.tier == MatchTier.REVIEW
        assert result.needs_review

    def test_thieu_ho_van_tim_ra_nguoi(self, matcher, danh_muc):
        """Tên trên phong bì hay thiếu họ — đó là kiểu viết phổ biến nhất."""
        result = matcher.match(name_raw="Lương Hiền")
        assert result.employee_id == danh_muc["NV006"].id
        assert result.tier == MatchTier.REVIEW

    def test_chuoi_ngan_khong_duoc_khop_bua(self, matcher):
        """"An" nằm trong rất nhiều tên — không được vì thế mà khớp."""
        result = matcher.match(name_raw="An")
        assert not result.matched

    def test_nhieu_ung_vien_gan_dung_thi_phai_chon(self, matcher, danh_muc):
        """"nguyen van an" bỏ dấu ra cả NV001, NV002 lẫn NV003."""
        result = matcher.match(name_raw="nguyen van an")
        assert result.tier == MatchTier.CHOOSE
        assert not result.matched
        ids = {c.employee_id for c in result.candidates}
        assert {danh_muc["NV001"].id, danh_muc["NV003"].id} <= ids


# ----------------------------------------------------------------------
# Bậc 6 — không khớp
# ----------------------------------------------------------------------

class TestBac6KhongKhop:
    def test_khong_co_ai_trung(self, matcher):
        result = matcher.match(name_raw="Người Không Có Thật")
        assert result.method == MatchMethod.NONE
        assert result.tier == MatchTier.CHOOSE
        assert result.candidates == ()

    def test_thieu_het_du_lieu(self, matcher):
        assert matcher.match(name_raw=None).method == MatchMethod.NONE

    def test_ten_rong(self, matcher):
        assert matcher.match(name_raw="   ").method == MatchMethod.NONE


# ----------------------------------------------------------------------
# Xếp hạng ứng viên theo lịch sử người gửi (CR-001 §4.3, D4)
# ----------------------------------------------------------------------

class TestXepHangTheoNguoiGui:
    def test_nguoi_tung_nhan_tu_cung_nguoi_gui_len_dau(self, matcher, db, danh_muc):
        """Tín hiệu thay cho "đơn vị" đã mất: ai từng nhận từ "cty nam hải"
        thì lần sau nhiều khả năng vẫn là họ."""
        lich_su_nhan_hang(db, sender_normalized="cty nam hải",
                          employee_id=danh_muc["NV002"].id,
                          uploaded_by=danh_muc["NV001"].id)

        result = matcher.match(name_raw="Nguyễn Văn An", sender_raw="Cty Nam Hải")
        assert [c.employee_id for c in result.candidates][0] == danh_muc["NV002"].id
        assert result.candidates[0].sender_history == 1

    def test_khong_co_lich_su_thi_xep_theo_bang_chu_cai(self, matcher, danh_muc):
        result = matcher.match(name_raw="Nguyễn Văn An", sender_raw="Người Gửi Lạ")
        assert len(result.candidates) == 2
        # Vẫn là `choose` — lịch sử chỉ xếp hạng, không được tự quyết hộ HC.
        assert result.tier == MatchTier.CHOOSE

    def test_lich_su_khong_duoc_tu_chon_ho(self, matcher, db, danh_muc):
        """Xếp lên đầu ≠ chọn sẵn. Trùng tên thì vẫn phải để HC bấm."""
        lich_su_nhan_hang(db, sender_normalized="cty nam hải",
                          employee_id=danh_muc["NV002"].id,
                          uploaded_by=danh_muc["NV001"].id)
        result = matcher.match(name_raw="Nguyễn Văn An", sender_raw="cty nam hải")
        assert not result.matched


class TestDoGiongTen:
    def test_giong_het_thi_bang_1(self):
        assert name_similarity("Nguyễn Văn An", "nguyễn  văn  an") == 1.0

    def test_khac_dau_thi_gan_1_nhung_khong_bang_1(self):
        score = name_similarity("Nguyễn Văn An", "Nguyễn Văn Ân")
        assert 0.85 <= score < 1.0

    def test_co_dau_thi_van_phan_biet_duoc(self):
        """Hàm này giữ dấu có chủ đích — nó còn dùng để xếp hạng ứng viên."""
        assert name_similarity("nguyen thi thu", "Nguyễn Thị Thu") < 0.99


    def test_khac_han_thi_thap(self):
        assert name_similarity("Nguyễn Văn An", "Hoàng Minh Tuấn") < 0.5

    def test_thieu_du_lieu_thi_bang_0(self):
        assert name_similarity(None, "Nguyễn Văn An") == 0.0
        assert name_similarity("", "Nguyễn Văn An") == 0.0


class TestBoDauVaChuaNhau:
    """Hai điều kiện độc lập của bậc fuzzy (CR-001 §4.2 bậc 4)."""

    def test_bo_dau_thi_khop_hoan_toan(self):
        assert name_similarity_plain("nguyen thi thu", "Nguyễn Thị Thu") == 1.0

    def test_bo_dau_gop_an_va_ân_lam_mot(self):
        """Đánh đổi đã biết: ra nhiều ứng viên thì kết quả là `choose`."""
        assert name_similarity_plain("Nguyễn Văn An", "Nguyễn Văn Ân") == 1.0

    def test_thieu_ho_van_coi_la_chua_nhau(self):
        assert name_contains("Lương hiền", "Nguyễn Thị Lương Hiền")

    def test_mot_tu_khong_du_de_coi_la_chua_nhau(self):
        """"An" nằm trong rất nhiều tên — một từ thì không tính."""
        assert not name_contains("An", "Nguyễn Văn An")

    def test_phai_khop_o_ranh_gioi_tu(self):
        assert not name_contains("uong hien", "Nguyễn Thị Lương Hiền")

    def test_thieu_du_lieu_thi_false(self):
        assert not name_contains(None, "Nguyễn Văn An")
        assert not name_contains("  ", "Nguyễn Văn An")
