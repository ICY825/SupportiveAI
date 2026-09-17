"""Test job quét SLA.

Job này là thứ duy nhất khiến mốc T+2 và T+5 thật sự xảy ra. Nếu nó hỏng
âm thầm thì không ai được nhắc, và không có gì báo cho biết.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.modules.document_flow.mail import jobs
from app.modules.document_flow.mail.jobs import JOB_ID, register_jobs, scan_sla
from app.modules.document_flow.mail.models import MailStatus
from app.modules.document_flow.mail.schemas import MailRow
from app.modules.document_flow.mail.service import MailService
from app.modules.document_flow.mail.workflow import MAIL_WORKFLOW
from app.platform.notification import NotificationService
from app.platform.notification.models import Notification
from app.platform.scheduler import SchedulerService
from app.platform.workflow import WorkflowEngine
from app.platform.workflow.models import WorkflowInstance
from app.shared.employee.schemas import EmployeeCreate
from app.shared.employee.service import EmployeeService


@pytest.fixture
def an(db):
    employee = EmployeeService(db).create(EmployeeCreate(
        employee_code="NV001", full_name="Nguyễn Văn An",
        email="an@example.com", phone="0912345678"))
    db.flush()
    return employee


@pytest.fixture
def service(db, calendar, workflow_registry, dispatcher, channels, an) -> MailService:
    workflow_registry.register(MAIL_WORKFLOW)
    engine = WorkflowEngine(db, calendar=calendar, registry=workflow_registry,
                            dispatcher=dispatcher)
    return MailService(db, engine=engine,
                       notifier=NotificationService(db, channels=channels),
                       dispatcher=dispatcher)


@pytest.fixture
def da_gui(service, an, db):
    batch = service.import_rows(
        [MailRow(row_index=1, sender="cty nam hải", recipient_name="Nguyễn Văn An",
                 quantity=1, content_type="phong bì", received_on=date(2026, 9, 17))],
        source_filename="le-tan.xlsx", uploaded_by=an.id)
    service.send_batch(batch.id)
    db.query(Notification).delete()
    db.flush()
    return batch


def lui(db, days: int) -> None:
    for instance in db.query(WorkflowInstance).all():
        instance.entered_state_at = instance.entered_state_at - timedelta(days=days)
    db.flush()


class TestDangKyJob:
    def test_job_duoc_dang_ky(self, monkeypatch):
        fake = SchedulerService()
        monkeypatch.setattr(jobs, "scheduler", fake)
        register_jobs()

        ids = [spec.job_id for spec in fake.registered()]
        assert ids == [JOB_ID]

    def test_chay_theo_chu_ky_chu_khong_phai_cron(self, monkeypatch):
        fake = SchedulerService()
        monkeypatch.setattr(jobs, "scheduler", fake)
        register_jobs()

        spec = fake.registered()[0]
        assert spec.interval_minutes and spec.cron is None


class TestQuetSLA:
    """`scan_sla` tự mở session riêng nên ở đây tiêm service dùng DB của test."""

    @pytest.fixture(autouse=True)
    def dung_db_cua_test(self, monkeypatch, db, service):
        class FakeSession:
            def __init__(self, *_a, **_kw):
                pass

            def commit(self):
                db.flush()

            def rollback(self):
                pass

            def close(self):
                pass

        monkeypatch.setattr(jobs, "SessionLocal", FakeSession)
        monkeypatch.setattr(jobs, "MailService", lambda _db: service)

    def test_chua_toi_han_thi_khong_lam_gi(self, db, da_gui):
        scan_sla()
        assert db.query(Notification).count() == 0
        assert da_gui.items[0].status == MailStatus.NOTIFIED

    def test_toi_moc_2_ngay_thi_nhac(self, db, da_gui):
        lui(db, 3)
        scan_sla()
        assert db.query(Notification).count() == 1
        assert da_gui.items[0].status == MailStatus.NOTIFIED

    def test_toi_moc_5_ngay_thi_nhac_roi_ton_dong(self, db, da_gui):
        """Hệ thống ngừng vài ngày: chạm cả hai mốc trong cùng một lượt.

        Nhắc trước rồi mới tồn đọng — người nhận vẫn nhận được lời nhắc
        muộn, và vì vẫn nhận được đơn sau khi tồn đọng nên nó còn có ích.
        """
        lui(db, 6)
        scan_sla()
        assert db.query(Notification).count() == 1
        assert da_gui.items[0].status == MailStatus.ABANDONED

    def test_chay_lai_khong_nhac_trung(self, db, da_gui):
        lui(db, 3)
        scan_sla()
        scan_sla()
        assert db.query(Notification).count() == 1

    def test_loi_khong_lam_sap_scheduler(self, db, da_gui, service, monkeypatch, caplog):
        """Job hỏng phải nuốt lỗi và ghi log, để lượt quét sau vẫn chạy."""
        def no() -> int:
            raise RuntimeError("DB rớt")

        that = service.run_reminders
        monkeypatch.setattr(service, "run_reminders", no)
        lui(db, 6)  # đủ chạm cả hai mốc

        scan_sla()  # không được ném ra ngoài

        assert "Quét SLA thư gặp lỗi" in caplog.text
        # Lỗi cắt ngang cả lượt quét, nên chưa chuyển tồn đọng.
        assert da_gui.items[0].status == MailStatus.NOTIFIED

        # Trả lại đúng một hàm (không dùng monkeypatch.undo() vì nó gỡ luôn
        # cả patch của fixture autouse) — lượt quét sau phải chạy bình thường.
        monkeypatch.setattr(service, "run_reminders", that)
        scan_sla()
        assert da_gui.items[0].status == MailStatus.ABANDONED
