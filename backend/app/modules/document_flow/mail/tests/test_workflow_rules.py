"""Đặc tả quy tắc SLA của Đề 3, viết thành test chạy được.

Chốt ngày 16/09/2026 (mail-tracking.md §8.3, §8.5):

    T+0   HC bấm gửi          → thông báo lần đầu
    T+2   vẫn chưa nhận       → nhắc lại một lần, không cc ai
    T+5   vẫn chưa nhận       → chuyển `Tồn đọng`

Điểm mấu chốt: **SLA gắn với TRẠNG THÁI, không phải với đồng hồ.** Kiện đã
xác nhận thì rời khỏi trạng thái `notified`, nên không còn lọt vào bất kỳ
mốc nào phía sau — không nhắc, không tồn đọng.

Khai báo thật nằm ở `mail/workflow.py`; file này chỉ kiểm hành vi của
nó, đặt cạnh code theo repository-structure.md §11.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.modules.document_flow.mail.models import MailStatus
from app.modules.document_flow.mail.workflow import (
    MAIL_WORKFLOW,
    TRIGGER_ABANDON,
    TRIGGER_COLLECT,
    TRIGGER_NOTIFY,
)
from app.platform.workflow import WorkflowEngine
from app.modules.document_flow.mail.workflow import ENTITY_TYPE


@pytest.fixture
def engine(db, calendar, workflow_registry, dispatcher) -> WorkflowEngine:
    workflow_registry.register(MAIL_WORKFLOW)
    return WorkflowEngine(db, calendar=calendar, registry=workflow_registry, dispatcher=dispatcher)


@pytest.fixture
def da_gui(engine, db):
    """Một kiện đã khớp người nhận và đã gửi thông báo. Trả về mốc T+0."""
    engine.start(ENTITY_TYPE, "VN001")
    instance = engine.fire(ENTITY_TYPE, "VN001", TRIGGER_NOTIFY)
    db.flush()
    return instance.entered_state_at


def ngay(goc, n: float):
    return goc + timedelta(days=n)


class TestNhacLanHai:
    def test_xac_nhan_truoc_ngay_2_thi_khong_nhac(self, engine, da_gui):
        """Trả lời trực tiếp câu hỏi: đã nhận rồi thì KHÔNG nhắc nữa."""
        engine.fire(ENTITY_TYPE, "VN001", TRIGGER_COLLECT)

        assert engine.find_due(ENTITY_TYPE, action="remind", now=ngay(da_gui, 2)) == []
        assert engine.find_due(ENTITY_TYPE, action="remind", now=ngay(da_gui, 30)) == []

    def test_chua_nhan_den_ngay_2_thi_nhac(self, engine, da_gui):
        due = engine.find_due(ENTITY_TYPE, action="remind", now=ngay(da_gui, 2))
        assert [item.instance.entity_id for item in due] == ["VN001"]

    def test_chua_toi_ngay_2_thi_chua_nhac(self, engine, da_gui):
        assert engine.find_due(ENTITY_TYPE, action="remind", now=ngay(da_gui, 1.9)) == []

    def test_chi_nhac_dung_mot_lan(self, engine, da_gui):
        """Scheduler chạy mỗi ngày cũng không bắn nhắc lặp lại."""
        due = engine.find_due(ENTITY_TYPE, action="remind", now=ngay(da_gui, 2))
        assert len(due) == 1
        engine.mark_fired(due[0])

        for n in (2, 3, 4, 5, 10):
            assert engine.find_due(ENTITY_TYPE, action="remind", now=ngay(da_gui, n)) == [], (
                f"ngày {n} không được nhắc lại"
            )


class TestChuyenTonDong:
    def test_xac_nhan_sau_khi_nhac_thi_khong_ton_dong(self, engine, da_gui):
        """Lấy đơn ngày thứ 3 — sau lần nhắc, trước mốc 5 ngày."""
        due = engine.find_due(ENTITY_TYPE, action="remind", now=ngay(da_gui, 2))
        engine.mark_fired(due[0])
        engine.fire(ENTITY_TYPE, "VN001", TRIGGER_COLLECT)

        assert engine.find_due(ENTITY_TYPE, action="abandon", now=ngay(da_gui, 5)) == []

    def test_chua_nhan_den_ngay_5_thi_ton_dong(self, engine, da_gui):
        due = engine.find_due(ENTITY_TYPE, action="abandon", now=ngay(da_gui, 5))
        assert len(due) == 1

        engine.fire(ENTITY_TYPE, "VN001", TRIGGER_ABANDON)
        engine.mark_fired(due[0])
        assert engine.get(ENTITY_TYPE, "VN001").state == MailStatus.ABANDONED

    def test_ton_dong_roi_thi_thoi_nhac(self, engine, da_gui):
        engine.fire(ENTITY_TYPE, "VN001", TRIGGER_ABANDON)
        assert engine.find_due(ENTITY_TYPE, now=ngay(da_gui, 30)) == []

    def test_van_nhan_duoc_sau_khi_da_ton_dong(self, engine, da_gui):
        """Người ta xuống lấy muộn thì vẫn phải ghi nhận được."""
        engine.fire(ENTITY_TYPE, "VN001", TRIGGER_ABANDON)
        assert engine.fire(ENTITY_TYPE, "VN001", TRIGGER_COLLECT).state == MailStatus.COLLECTED


class TestToanBoVongDoi:
    def test_lay_ngay_trong_ngay_thi_khong_co_nhac_nao(self, engine, da_gui):
        engine.fire(ENTITY_TYPE, "VN001", TRIGGER_COLLECT)
        assert engine.find_due(ENTITY_TYPE, now=ngay(da_gui, 365)) == []

    def test_kien_da_nhan_khong_bao_gio_vao_danh_sach_qua_han(self, engine, db, da_gui):
        engine.fire(ENTITY_TYPE, "VN001", TRIGGER_COLLECT)
        db.flush()
        for n in (0, 1, 2, 3, 5, 7, 30):
            assert engine.find_due(ENTITY_TYPE, now=ngay(da_gui, n)) == []

    def test_chua_khop_nguoi_nhan_thi_khong_bi_nhac(self, engine, db):
        """Kiện còn ở `pending_match` chưa gửi cho ai — không có mốc nào."""
        instance = engine.start(ENTITY_TYPE, "VN999")
        db.flush()
        goc = instance.entered_state_at
        assert engine.find_due(ENTITY_TYPE, now=ngay(goc, 30)) == []

    def test_moi_kien_tinh_moc_rieng_theo_luc_gui(self, engine, db):
        """Lô hôm nay và lô hôm kia có mốc khác nhau."""
        engine.start(ENTITY_TYPE, "CU")
        cu = engine.fire(ENTITY_TYPE, "CU", TRIGGER_NOTIFY)
        goc = cu.entered_state_at
        cu.entered_state_at = ngay(goc, -3)  # gửi từ 3 ngày trước

        engine.start(ENTITY_TYPE, "MOI")
        engine.fire(ENTITY_TYPE, "MOI", TRIGGER_NOTIFY)
        db.flush()

        due = engine.find_due(ENTITY_TYPE, action="remind", now=goc)
        assert [item.instance.entity_id for item in due] == ["CU"]
