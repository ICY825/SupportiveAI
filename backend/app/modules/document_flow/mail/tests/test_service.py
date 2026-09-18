"""Test logic nghiệp vụ của phân hệ chuyển phát nhanh.

Phủ hai mục ưu tiên kiểm thử của repository-structure.md §11:

* mục 3 — khử trùng lặp ("sai là spam người dùng")
* mục 4 — chuyển trạng thái workflow

Và bốn nhóm tiêu chí nghiệm thu của CR-001 §11: khử trùng mềm, gửi một
phần, học alias, áp cả lô.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.core.database import utcnow
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.document_flow.mail.models import (
    BatchStatus,
    HandoverMethod,
    MailStatus,
    MatchingAlias,
    MatchMethod,
    MatchTier,
)
from app.modules.document_flow.mail.schemas import MailRow
from app.modules.document_flow.mail.service import MailService, dedup_key
from app.modules.document_flow.mail.workflow import MAIL_WORKFLOW
from app.platform.notification import NotificationService
from app.platform.notification.models import Notification, NotificationItem
from app.platform.workflow import WorkflowEngine
from app.shared.department.schemas import DepartmentCreate
from app.shared.department.service import DepartmentService
from app.shared.employee.schemas import EmployeeCreate
from app.shared.employee.service import EmployeeService

NGAY_NHAN = date(2026, 9, 17)


@pytest.fixture
def nhan_su(db):
    hc = DepartmentService(db).create(DepartmentCreate(code="HC", name="Hành chính"))
    employees = EmployeeService(db)
    an = employees.create(EmployeeCreate(
        employee_code="NV001", full_name="Nguyễn Văn An",
        email="an@example.com", phone="0912345678", department_id=hc.id))
    binh = employees.create(EmployeeCreate(
        employee_code="NV002", full_name="Trần Thị Bình",
        email="binh@example.com", phone="0987654321", department_id=hc.id))
    db.flush()
    return {"an": an, "binh": binh}


@pytest.fixture
def service(db, calendar, workflow_registry, dispatcher, channels, nhan_su) -> MailService:
    workflow_registry.register(MAIL_WORKFLOW)
    engine = WorkflowEngine(db, calendar=calendar, registry=workflow_registry,
                            dispatcher=dispatcher)
    return MailService(
        db,
        engine=engine,
        notifier=NotificationService(db, channels=channels),
        dispatcher=dispatcher,
    )


def row(*, name="Nguyễn Văn An", sender="cty nam hải", quantity=1,
        content="phong bì", ngay=NGAY_NHAN, stt=None):
    return MailRow(row_index=stt, sender=sender, recipient_name=name,
                   quantity=quantity, content_type=content, received_on=ngay)


def nap(service, rows, *, uploaded_by, filename="le-tan.xlsx"):
    return service.import_rows(rows, source_filename=filename, uploaded_by=uploaded_by)


# ----------------------------------------------------------------------
# CR-001 §5 — khử trùng lặp mềm
# ----------------------------------------------------------------------

class TestKhuTrungLap:
    def test_khoa_dung_ba_thanh_phan(self):
        """`người gửi + người nhận + ngày nhận` (CR-001 §5.1)."""
        goc = row()
        assert dedup_key(goc) == dedup_key(row())
        assert dedup_key(goc) != dedup_key(row(sender="cty hùng long"))
        assert dedup_key(goc) != dedup_key(row(name="Trần Thị Bình"))
        assert dedup_key(goc) != dedup_key(row(ngay=date(2026, 9, 18)))

    def test_khoa_bo_qua_hoa_thuong_va_khoang_trang(self):
        assert dedup_key(row(name="nguyễn  văn an")) == dedup_key(row(name="Nguyễn Văn An"))

    def test_thieu_ten_hoac_ngay_thi_khong_dung_khoa(self):
        """Khóa dựng từ dữ liệu khuyết sẽ gom nhầm những dòng chẳng liên quan."""
        assert dedup_key(row(name=None)) is None
        assert dedup_key(row(ngay=None)) is None

    def test_trung_trong_cung_mot_lo_chua_gui_thi_khong_tinh(self, service, nhan_su):
        """HC đang soát dở, không phải tải lại file (CR-001 §11)."""
        batch = nap(service, [row(), row()], uploaded_by=nhan_su["an"].id)
        assert len(batch.items) == 2
        assert batch.duplicate_suspect_count == 0
        assert all(not i.duplicate_suspect for i in batch.items)

    def test_tai_lai_dung_file_cu_thi_moi_dong_bi_danh_dau(self, service, nhan_su):
        lo1 = nap(service, [row(), row(name="Trần Thị Bình")], uploaded_by=nhan_su["an"].id)
        service.send_batch(lo1.id)

        lo2 = nap(service, [row(), row(name="Trần Thị Bình")], uploaded_by=nhan_su["an"].id)
        assert lo2.duplicate_suspect_count == 2
        assert all(i.duplicate_suspect for i in lo2.items)

    def test_dong_nghi_trung_van_duoc_tao_chu_khong_bi_nuot(self, service, nhan_su):
        """Âm thầm bỏ dòng là kiểu hỏng tệ nhất (CR-001 §5.2)."""
        lo1 = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        service.send_batch(lo1.id)

        lo2 = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        assert len(lo2.items) == 1
        assert lo2.row_count == 1

    def test_dong_nghi_trung_mac_dinh_khong_gui(self, service, nhan_su):
        lo1 = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        service.send_batch(lo1.id)

        lo2 = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        with pytest.raises(ValidationError, match="Không có dòng nào sẵn sàng"):
            service.send_batch(lo2.id)

    def test_hc_giu_lai_duoc_dong_nghi_trung(self, service, nhan_su):
        lo1 = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        service.send_batch(lo1.id)

        lo2 = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        service.keep_duplicate(lo2.items[0].id, keep=True)

        result = service.send_batch(lo2.id)
        assert result["notified_items"] == 1

    def test_tham_chieu_toi_dong_cu_de_hc_quyet(self, service, nhan_su):
        """Phải biết lô nào, ngày nào, số lượng bao nhiêu (CR-001 §5.2)."""
        lo1 = nap(service, [row(quantity=1)], uploaded_by=nhan_su["an"].id)
        service.send_batch(lo1.id)

        lo2 = nap(service, [row(quantity=1)], uploaded_by=nhan_su["an"].id)
        moi = lo2.items[0]
        assert moi.duplicate_of_id == lo1.items[0].id
        assert str(lo1.id) in (moi.note or "")

    def test_so_luong_doi_thi_hien_ca_hai_con_so(self, service, nhan_su):
        """Không tự cộng dồn, không tự ghi đè (CR-001 §5.3)."""
        lo1 = nap(service, [row(quantity=1)], uploaded_by=nhan_su["an"].id)
        service.send_batch(lo1.id)

        lo2 = nap(service, [row(quantity=3)], uploaded_by=nhan_su["an"].id)
        note = lo2.items[0].note or ""
        assert "số lượng 1" in note
        assert "là 3" in note


class TestTaiLaiCungNgay:
    """CR-001 §5.3 — cảnh báo ở đầu màn hình soát, không chặn."""

    def test_lo_ghi_lai_ngay_nhan_chung(self, service, nhan_su):
        batch = nap(service, [row(), row(name="Trần Thị Bình")], uploaded_by=nhan_su["an"].id)
        assert batch.receipt_date == NGAY_NHAN

    def test_lo_lan_nhieu_ngay_thi_khong_dat_ngay_chung(self, service, nhan_su):
        """Lẫn nhiều ngày thì bỏ cảnh báo còn hơn cảnh báo sai."""
        batch = nap(service, [row(), row(ngay=date(2026, 9, 18))],
                    uploaded_by=nhan_su["an"].id)
        assert batch.receipt_date is None

    def test_tim_ra_lo_cu_cung_ngay(self, service, db, nhan_su):
        from app.modules.document_flow.mail.repository import MailRepository

        lo1 = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        lo2 = nap(service, [row(name="Trần Thị Bình")], uploaded_by=nhan_su["an"].id)

        cu = MailRepository(db).batches_on_date(NGAY_NHAN, exclude_batch_id=lo2.id)
        assert [b.id for b in cu] == [lo1.id]


# ----------------------------------------------------------------------
# Nạp danh sách và khớp
# ----------------------------------------------------------------------

class TestNapDanhSach:
    def test_giu_nguyen_du_lieu_tho_sau_cot(self, service, nhan_su):
        batch = nap(service, [row(stt=7, quantity=2, content="phong bì")],
                    uploaded_by=nhan_su["an"].id)
        item = batch.items[0]
        assert item.row_index == 7
        assert item.sender_raw == "cty nam hải"
        assert item.recipient_name_raw == "Nguyễn Văn An"
        assert item.quantity == 2
        assert item.content_type == "phong bì"
        assert item.received_at.date() == NGAY_NHAN

    def test_khop_ten_duy_nhat_thi_confirmed(self, service, nhan_su):
        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        item = batch.items[0]
        assert item.employee_id == nhan_su["an"].id
        assert item.match_method == MatchMethod.NAME_EXACT
        assert item.match_tier == MatchTier.CONFIRMED
        assert item.status == MailStatus.PENDING_MATCH

    def test_khong_khop_thi_van_nhan_vao(self, service, nhan_su):
        batch = nap(service, [row(name="Người Lạ Hoắc")], uploaded_by=nhan_su["an"].id)
        assert batch.items[0].employee_id is None
        assert batch.items[0].match_tier == MatchTier.CHOOSE
        assert batch.matched_count == 0

    def test_dem_so_dong_khop_duoc(self, service, nhan_su):
        batch = nap(service, [
            row(),
            row(name="Trần Thị Bình"),
            row(name="Người Lạ Hoắc"),
        ], uploaded_by=nhan_su["an"].id)
        assert batch.row_count == 3
        assert batch.matched_count == 2
        assert batch.pending_match_count == 3   # chưa gửi thì đều đang chờ


# ----------------------------------------------------------------------
# CR-001 §3.3, §4.4 — học alias và áp cả lô
# ----------------------------------------------------------------------

class TestHocAlias:
    def test_hc_chon_thi_ghi_alias(self, service, db, nhan_su):
        batch = nap(service, [row(name="Hùng Mạnh")], uploaded_by=nhan_su["an"].id)
        service.assign_recipient(batch.items[0].id, nhan_su["binh"].id,
                                 actor_id=nhan_su["an"].id)

        alias = db.query(MatchingAlias).one()
        assert alias.raw_name_normalized == "hùng mạnh"
        assert alias.employee_id == nhan_su["binh"].id
        assert alias.created_by == nhan_su["an"].id

    def test_lan_sau_khop_thang_khong_hoi_lai(self, service, nhan_su):
        lo1 = nap(service, [row(name="Hùng Mạnh")], uploaded_by=nhan_su["an"].id)
        service.assign_recipient(lo1.items[0].id, nhan_su["binh"].id)

        lo2 = nap(service, [row(name="hùng mạnh", ngay=date(2026, 9, 18))],
                  uploaded_by=nhan_su["an"].id)
        item = lo2.items[0]
        assert item.employee_id == nhan_su["binh"].id
        assert item.match_method == MatchMethod.ALIAS
        assert item.match_tier == MatchTier.CONFIRMED

    def test_hc_sua_dong_da_khop_bang_alias_thi_ghi_de(self, service, db, nhan_su):
        lo1 = nap(service, [row(name="Hùng Mạnh")], uploaded_by=nhan_su["an"].id)
        service.assign_recipient(lo1.items[0].id, nhan_su["binh"].id)

        lo2 = nap(service, [row(name="Hùng Mạnh", ngay=date(2026, 9, 18))],
                  uploaded_by=nhan_su["an"].id)
        service.assign_recipient(lo2.items[0].id, nhan_su["an"].id)

        alias = db.query(MatchingAlias).one()
        assert alias.employee_id == nhan_su["an"].id, "lần chọn mới nhất là lần đúng nhất"

    def test_chon_lai_dung_nguoi_cu_thi_tang_hit_count(self, service, db, nhan_su):
        lo1 = nap(service, [row(name="Hùng Mạnh")], uploaded_by=nhan_su["an"].id)
        service.assign_recipient(lo1.items[0].id, nhan_su["binh"].id)
        lo2 = nap(service, [row(name="Hùng Mạnh", ngay=date(2026, 9, 18))],
                  uploaded_by=nhan_su["an"].id)
        service.assign_recipient(lo2.items[0].id, nhan_su["binh"].id)

        assert db.query(MatchingAlias).one().hit_count == 2


class TestApCaLo:
    def test_chon_mot_dong_thi_cac_dong_cung_ten_tu_cap_nhat(self, service, nhan_su):
        """CR-001 §4.4 — mười dòng của cùng một người thì chọn một lần."""
        batch = nap(service, [
            row(name="Hùng Mạnh", sender="cty nam hải"),
            row(name="hùng  mạnh", sender="cty hùng long"),
            row(name="Người Khác Hẳn"),
        ], uploaded_by=nhan_su["an"].id)

        service.assign_recipient(batch.items[0].id, nhan_su["binh"].id)

        assert batch.items[1].employee_id == nhan_su["binh"].id
        assert batch.items[1].match_method == MatchMethod.MANUAL
        assert batch.items[2].employee_id is None

    def test_tat_di_thi_chi_sua_mot_dong(self, service, nhan_su):
        batch = nap(service, [row(name="Hùng Mạnh"), row(name="Hùng Mạnh")],
                    uploaded_by=nhan_su["an"].id)
        service.assign_recipient(batch.items[0].id, nhan_su["binh"].id, apply_to_batch=False)
        assert batch.items[1].employee_id is None

    def test_khong_dung_toi_dong_da_gui(self, service, nhan_su):
        """Đã gửi email rồi thì đổi người nhận cũng không rút lại được."""
        batch = nap(service, [row(), row(name="Nguyễn Văn An")],
                    uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        assert all(i.status == MailStatus.NOTIFIED for i in batch.items)


# ----------------------------------------------------------------------
# §5 — màn hình soát
# ----------------------------------------------------------------------

class TestManHinhSoat:
    def test_hc_gan_nguoi_nhan_cho_dong_khong_khop(self, service, nhan_su):
        batch = nap(service, [row(name="Người Lạ Hoắc")], uploaded_by=nhan_su["an"].id)
        item = service.assign_recipient(batch.items[0].id, nhan_su["binh"].id)

        assert item.employee_id == nhan_su["binh"].id
        # Ghi `manual` để KPI khớp tự động không tính nhầm (§4.4).
        assert item.match_method == MatchMethod.MANUAL
        assert item.match_tier == MatchTier.CONFIRMED
        assert batch.matched_count == 1

    def test_gan_nguoi_khong_ton_tai_thi_bao_loi(self, service, nhan_su):
        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        with pytest.raises(NotFoundError):
            service.assign_recipient(batch.items[0].id, "khong-co-that")

    def test_bo_qua_mot_dong(self, service, nhan_su):
        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        item = service.assign_recipient(batch.items[0].id, None, note="Không rõ người nhận")
        assert item.employee_id is None
        assert item.match_method == MatchMethod.NONE
        assert not item.ready_to_send

    def test_khong_sua_duoc_sau_khi_da_gui(self, service, nhan_su):
        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        with pytest.raises(ConflictError, match="Đã gửi"):
            service.assign_recipient(batch.items[0].id, nhan_su["binh"].id)

    def test_dong_review_phai_xac_nhan_moi_gui(self, service, nhan_su):
        """Khớp gần đúng: điền sẵn nhưng không tự gửi (CR-001 §4.2 bậc 4)."""
        batch = nap(service, [row(name="nguyen van an")], uploaded_by=nhan_su["an"].id)
        item = batch.items[0]
        assert item.match_tier == MatchTier.REVIEW
        assert item.employee_id == nhan_su["an"].id
        assert not item.ready_to_send

        service.confirm_review(item.id)
        assert item.ready_to_send

    def test_xac_nhan_dong_chua_co_nguoi_nhan_thi_bao_loi(self, service, nhan_su):
        batch = nap(service, [row(name="Người Lạ Hoắc")], uploaded_by=nhan_su["an"].id)
        with pytest.raises(ValidationError, match="chưa có người nhận"):
            service.confirm_review(batch.items[0].id)

    def test_tong_quan_dem_ca_dong_va_kien(self, service, db, nhan_su):
        """CR-001 §7.1 — hai con số này khác nhau."""
        from app.modules.document_flow.mail.repository import MailRepository

        batch = nap(service, [row(quantity=1), row(name="Trần Thị Bình", quantity=3)],
                    uploaded_by=nhan_su["an"].id)
        summary = MailRepository(db).review_summary(batch.id)
        assert summary["total_rows"] == 2
        assert summary["total_parcels"] == 4


# ----------------------------------------------------------------------
# CR-001 §6 — gửi một phần
# ----------------------------------------------------------------------

class TestGuiMotPhan:
    def test_dong_chua_khop_khong_chan_ca_lo(self, service, nhan_su):
        """Lô 3 dòng, 1 dòng chưa khớp: gửi được 2 (CR-001 §11)."""
        batch = nap(service, [
            row(),
            row(name="Trần Thị Bình"),
            row(name="Người Lạ Hoắc"),
        ], uploaded_by=nhan_su["an"].id)

        result = service.send_batch(batch.id)
        assert result["notified_items"] == 2
        assert result["pending_match"] == 1
        assert batch.items[2].status == MailStatus.PENDING_MATCH

    def test_goi_lai_sau_khi_hc_xu_ly_xong(self, service, db, nhan_su):
        batch = nap(service, [row(), row(name="Người Lạ Hoắc")],
                    uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        db.query(Notification).delete()
        db.flush()

        service.assign_recipient(batch.items[1].id, nhan_su["binh"].id)
        lan_hai = service.send_batch(batch.id)

        assert lan_hai["notified_items"] == 1, "8 dòng cũ không được gửi lại"
        assert lan_hai["pending_match"] == 0
        assert all(i.status == MailStatus.NOTIFIED for i in batch.items)

    def test_sent_at_chi_ghi_o_lan_goi_dau(self, service, nhan_su):
        batch = nap(service, [row(), row(name="Người Lạ Hoắc")],
                    uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        lan_dau = batch.sent_at

        service.assign_recipient(batch.items[1].id, nhan_su["binh"].id)
        service.send_batch(batch.id)
        assert batch.sent_at == lan_dau

    def test_khong_con_dong_nao_san_sang_thi_bao_loi(self, service, nhan_su):
        batch = nap(service, [row(name="Người Lạ Hoắc")], uploaded_by=nhan_su["an"].id)
        with pytest.raises(ValidationError, match="Không có dòng nào sẵn sàng"):
            service.send_batch(batch.id)

    def test_bo_dem_cua_lo_cap_nhat_sau_moi_dot(self, service, nhan_su):
        batch = nap(service, [row(), row(name="Người Lạ Hoắc")],
                    uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        assert batch.sent_count == 1
        assert batch.pending_match_count == 1

    def test_sla_cua_dot_bo_sung_tinh_tu_luc_gui_bo_sung(self, service, db, nhan_su):
        batch = nap(service, [row(), row(name="Người Lạ Hoắc")],
                    uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        dot_dau = batch.items[0].notified_at

        service.assign_recipient(batch.items[1].id, nhan_su["binh"].id)
        service.send_batch(batch.id)

        assert batch.items[1].notified_at >= dot_dau

    def test_mot_nguoi_o_ca_hai_dot_nhan_hai_thong_bao_rieng(self, service, db, nhan_su):
        """Đúng, vì hai đợt cách nhau về thời gian (CR-001 §11)."""
        batch = nap(service, [row(), row(name="Người Lạ Hoắc")],
                    uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        service.assign_recipient(batch.items[1].id, nhan_su["an"].id)
        service.send_batch(batch.id)

        cua_an = [n for n in db.query(Notification).all()
                  if n.recipient_employee_id == nhan_su["an"].id]
        assert len(cua_an) == 2


class TestManHinhChoKhopXuyenLo:
    """CR-001 §6.2, §6.3."""

    def test_liet_ke_moi_dong_cho_khop_khong_phan_biet_lo(self, service, nhan_su):
        lo1 = nap(service, [row(name="Người Lạ Hoắc")], uploaded_by=nhan_su["an"].id)
        lo2 = nap(service, [row(name="Khách Vãng Lai", ngay=date(2026, 9, 18))],
                  uploaded_by=nhan_su["an"].id)

        rows = service.pending_match_items()
        ids = {item.id for item, _, _ in rows}
        assert ids == {lo1.items[0].id, lo2.items[0].id}

    def test_dong_da_gui_khong_con_trong_danh_sach(self, service, nhan_su):
        batch = nap(service, [row(), row(name="Người Lạ Hoắc")],
                    uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        ids = {item.id for item, _, _ in service.pending_match_items()}
        assert ids == {batch.items[1].id}

    def test_cho_qua_lau_thi_bi_danh_dau(self, service, db, nhan_su):
        cu = (utcnow() - timedelta(days=5)).date()
        nap(service, [row(name="Người Lạ Hoắc", ngay=cu)], uploaded_by=nhan_su["an"].id)
        _, waited, overdue = service.pending_match_items()[0]
        assert waited >= 2
        assert overdue

    def test_khong_tu_chuyen_sang_ton_dong(self, service, db, nhan_su):
        """"Chưa biết báo cho ai" khác hẳn "đã báo nhưng không ai lấy"."""
        cu = (utcnow() - timedelta(days=30)).date()
        batch = nap(service, [row(name="Người Lạ Hoắc", ngay=cu)],
                    uploaded_by=nhan_su["an"].id)
        assert service.run_abandonment() == 0
        assert batch.items[0].status == MailStatus.PENDING_MATCH

    def test_gan_nguoi_nhan_roi_gui_ngay_tai_cho(self, service, nhan_su):
        batch = nap(service, [row(name="Người Lạ Hoắc")], uploaded_by=nhan_su["an"].id)
        service.assign_recipient(batch.items[0].id, nhan_su["binh"].id)
        item = service.send_item(batch.items[0].id)

        assert item.status == MailStatus.NOTIFIED
        assert item.notified_at is not None

    def test_khong_gui_duoc_dong_chua_co_nguoi_nhan(self, service, nhan_su):
        batch = nap(service, [row(name="Người Lạ Hoắc")], uploaded_by=nhan_su["an"].id)
        with pytest.raises(ValidationError, match="chưa sẵn sàng"):
            service.send_item(batch.items[0].id)


# ----------------------------------------------------------------------
# §6 — gửi thông báo
# ----------------------------------------------------------------------

class TestGuiThongBao:
    def test_gui_xong_thi_chuyen_trang_thai(self, service, nhan_su, db):
        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)

        assert batch.status == BatchStatus.SENT
        assert batch.sent_at is not None
        assert batch.items[0].status == MailStatus.NOTIFIED
        assert batch.items[0].notified_at is not None

    def test_mot_nguoi_nhieu_dong_chi_mot_email(self, service, nhan_su, db):
        """§6.1 — ba email cho ba dòng của cùng một người là spam."""
        batch = nap(service, [
            row(sender="cty nam hải"),
            row(sender="cty hùng long"),
            row(sender="an nguyễn"),
        ], uploaded_by=nhan_su["an"].id)
        result = service.send_batch(batch.id)

        assert result["notified_items"] == 3
        assert result["notifications_sent"] == 1
        assert db.query(Notification).count() == 1
        # Cả ba dòng vẫn truy ngược được từ thông báo đó.
        assert db.query(NotificationItem).count() == 3

    def test_moi_nguoi_mot_email(self, service, nhan_su, db):
        batch = nap(service, [
            row(sender="cty nam hải"),
            row(sender="cty hùng long"),
            row(name="Trần Thị Bình"),
        ], uploaded_by=nhan_su["an"].id)
        result = service.send_batch(batch.id)

        assert result["notified_items"] == 3
        assert result["notifications_sent"] == 2

    def test_noi_dung_email_co_du_thong_tin(self, service, nhan_su, db):
        batch = nap(service, [row(sender="cty nam hải", quantity=2, content="phong bì")],
                    uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)

        mail = db.query(Notification).one()
        assert "cty nam hải" in mail.body
        assert "phong bì" in mail.body
        assert "Nguyễn Văn An" in mail.body
        assert "Nơi lấy" in mail.body
        assert "Vui lòng nhận trước" in mail.body

    def test_dem_kien_chu_khong_dem_dong(self, service, nhan_su, db):
        """Nói "1 kiện" khi thật ra có 3 là người nhận lấy một kiện rồi về."""
        batch = nap(service, [row(quantity=3)], uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        assert "3 kiện" in db.query(Notification).one().subject


# ----------------------------------------------------------------------
# §7 — xác nhận đã nhận (CR-001 §9: KHÔNG đổi)
# ----------------------------------------------------------------------

class TestXacNhanDaNhan:
    @pytest.fixture
    def da_gui(self, service, nhan_su):
        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        return batch.items[0]

    def test_tra_cuu_bang_4_so_cuoi(self, service, da_gui, nhan_su):
        rows = service.lookup_station("5678")
        assert [r.item_id for r in rows] == [da_gui.id]
        assert rows[0].recipient_name == "Nguyễn Văn An"
        assert rows[0].sender == "cty nam hải"

    def test_tra_cuu_khong_ra_gi(self, service, da_gui):
        assert service.lookup_station("0000") == []

    def test_xac_nhan_qua_qr(self, service, da_gui):
        item = service.confirm_collect(da_gui.id, handover_method=HandoverMethod.SELF_QR_STATION)
        assert item.status == MailStatus.COLLECTED
        assert item.collected_at is not None
        assert item.handover_method == HandoverMethod.SELF_QR_STATION

    def test_bam_hai_lan_khong_sao(self, service, da_gui):
        first = service.confirm_collect(da_gui.id)
        second = service.confirm_collect(da_gui.id)
        assert second.collected_at == first.collected_at

    def test_cach_xac_nhan_la_thi_bao_loi(self, service, da_gui):
        with pytest.raises(ValidationError):
            service.confirm_collect(da_gui.id, handover_method="tu_bia_ra")

    def test_chua_gui_thi_chua_nhan_duoc(self, service, nhan_su):
        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        with pytest.raises(ConflictError, match="chưa được gửi"):
            service.confirm_collect(batch.items[0].id)

    def test_hc_doi_chieu_to_ky_giay(self, service, da_gui, nhan_su):
        item = service.confirm_collect(
            da_gui.id, handover_method=HandoverMethod.HC_RECONCILED,
            collected_by=nhan_su["an"].id)
        assert item.handover_method == HandoverMethod.HC_RECONCILED


# ----------------------------------------------------------------------
# §8.3 — job nhắc hạn và tồn đọng (CR-001 §9: KHÔNG đổi)
# ----------------------------------------------------------------------

class TestJobDinhKy:
    @pytest.fixture
    def da_gui_hai_dong_mot_nguoi(self, service, nhan_su, db):
        batch = nap(service, [row(sender="cty nam hải"), row(sender="cty hùng long")],
                    uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)
        db.query(Notification).delete()   # bỏ email lần đầu cho dễ đếm
        db.flush()
        return batch

    def _lui_thoi_gian(self, db, batch, days):
        from app.platform.workflow.models import WorkflowInstance

        for instance in db.query(WorkflowInstance).all():
            instance.entered_state_at = instance.entered_state_at - timedelta(days=days)
        db.flush()

    def test_chua_toi_han_thi_khong_nhac(self, service, da_gui_hai_dong_mot_nguoi):
        assert service.run_reminders() == 0

    def test_nhac_lai_gop_theo_nguoi(self, service, db, da_gui_hai_dong_mot_nguoi):
        """§8.4 — một người hai kiện chưa lấy chỉ nhận một lời nhắc."""
        self._lui_thoi_gian(db, da_gui_hai_dong_mot_nguoi, 3)

        assert service.run_reminders() == 2          # hai dòng
        assert db.query(Notification).count() == 1   # một email

    def test_khong_nhac_lai_lan_hai(self, service, db, da_gui_hai_dong_mot_nguoi):
        self._lui_thoi_gian(db, da_gui_hai_dong_mot_nguoi, 3)
        service.run_reminders()
        assert service.run_reminders() == 0

    def test_da_nhan_thi_khong_bi_nhac(self, service, db, da_gui_hai_dong_mot_nguoi):
        batch = da_gui_hai_dong_mot_nguoi
        service.confirm_collect(batch.items[0].id)
        self._lui_thoi_gian(db, batch, 3)

        assert service.run_reminders() == 1          # chỉ dòng còn lại
        assert db.query(Notification).count() == 1

    def test_chuyen_ton_dong_sau_5_ngay(self, service, db, da_gui_hai_dong_mot_nguoi):
        self._lui_thoi_gian(db, da_gui_hai_dong_mot_nguoi, 6)

        assert service.run_abandonment() == 2
        assert all(i.status == MailStatus.ABANDONED for i in da_gui_hai_dong_mot_nguoi.items)

    def test_ton_dong_khong_gui_email_cho_nguoi_nhan(self, service, db, da_gui_hai_dong_mot_nguoi):
        self._lui_thoi_gian(db, da_gui_hai_dong_mot_nguoi, 6)
        service.run_abandonment()
        assert db.query(Notification).count() == 0

    def test_da_nhan_thi_khong_ton_dong(self, service, db, da_gui_hai_dong_mot_nguoi):
        batch = da_gui_hai_dong_mot_nguoi
        for item in batch.items:
            service.confirm_collect(item.id)
        self._lui_thoi_gian(db, batch, 6)

        assert service.run_abandonment() == 0

    def test_van_nhan_duoc_sau_khi_ton_dong(self, service, db, da_gui_hai_dong_mot_nguoi):
        """Người xuống lấy muộn vẫn phải ghi nhận được."""
        batch = da_gui_hai_dong_mot_nguoi
        self._lui_thoi_gian(db, batch, 6)
        service.run_abandonment()

        item = service.confirm_collect(batch.items[0].id)
        assert item.status == MailStatus.COLLECTED


# ----------------------------------------------------------------------
# Xóa lô tải nhầm
# ----------------------------------------------------------------------

class TestXoaLo:
    def test_xoa_lo_chua_gui(self, service, db, nhan_su):
        from app.modules.document_flow.mail.models import MailBatch, MailItem
        from app.platform.workflow.models import WorkflowInstance

        batch = nap(service, [row(), row(name="Trần Thị Bình")], uploaded_by=nhan_su["an"].id)
        item_ids = [i.id for i in batch.items]

        service.delete_batch(batch.id, actor_id=nhan_su["an"].id)

        assert db.get(MailBatch, batch.id) is None
        assert db.query(MailItem).filter(MailItem.id.in_(item_ids)).count() == 0
        assert db.query(WorkflowInstance).filter(
            WorkflowInstance.entity_id.in_(item_ids)).count() == 0

    def test_ghi_audit_khi_xoa(self, service, db, nhan_su):
        from app.platform.audit.models import AuditLog

        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id, filename="nham.xlsx")
        service.delete_batch(batch.id, actor_id=nhan_su["an"].id)

        log = db.query(AuditLog).filter_by(entity_id=batch.id, action="delete").one()
        assert log.actor_id == nhan_su["an"].id
        assert log.data["source_filename"] == "nham.xlsx"

    def test_giu_alias_va_feedback_da_hoc(self, service, db, nhan_su):
        """Lựa chọn của HC vẫn đúng dù file tải nhầm."""
        from app.modules.document_flow.mail.models import MatchFeedback

        batch = nap(service, [row(name="anh an")], uploaded_by=nhan_su["an"].id)
        service.assign_recipient(batch.items[0].id, nhan_su["an"].id)

        service.delete_batch(batch.id)

        assert db.query(MatchingAlias).filter_by(raw_name_normalized="anh an").count() == 1
        feedback = db.query(MatchFeedback).one()
        assert feedback.mail_item_id is None and feedback.batch_id is None

    def test_da_gui_thi_khong_xoa_duoc(self, service, nhan_su):
        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)

        with pytest.raises(ConflictError):
            service.delete_batch(batch.id)

    def test_gui_mot_phan_cung_khong_xoa_duoc(self, service, nhan_su):
        batch = nap(service, [row(), row(name="người lạ")], uploaded_by=nhan_su["an"].id)
        service.send_batch(batch.id)

        with pytest.raises(ConflictError):
            service.delete_batch(batch.id)

    def test_xoa_roi_tai_lai_khong_bi_nghi_trung(self, service, nhan_su):
        batch = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        service.delete_batch(batch.id)

        lai = nap(service, [row()], uploaded_by=nhan_su["an"].id)
        assert lai.duplicate_suspect_count == 0

    def test_lo_khong_ton_tai(self, service):
        with pytest.raises(NotFoundError):
            service.delete_batch("khong-co")
