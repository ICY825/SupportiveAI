"""Test chuyển trạng thái và SLA.

Mục 4 trong danh sách ưu tiên kiểm thử (repository-structure.md §11).

Workflow dùng trong file này là **giả lập**, cố tình không phải workflow
của thư hay công văn — engine phải chạy đúng với bất kỳ khai báo nào mà
không biết tên trạng thái cụ thể.
"""

from __future__ import annotations

from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest

from app.core.exceptions import NotFoundError, PermissionDeniedError, WorkflowError
from app.core.permissions import Principal, registry as permission_registry
from app.platform.workflow import SLA, Transition, WorkflowDefinition, WorkflowEngine
from app.platform.workflow.events import SLABreached, WorkflowTransitioned
from app.platform.workflow.models import WorkflowHistory

VN = ZoneInfo("Asia/Ho_Chi_Minh")

WIDGET = WorkflowDefinition(
    entity_type="widget",
    states=("draft", "open", "done", "dropped"),
    initial_state="draft",
    terminal_states=("done", "dropped"),
    transitions=(
        Transition(trigger="publish", source=("draft",), target="open"),
        Transition(trigger="finish", source=("open",), target="done"),
        Transition(trigger="drop", source=("draft", "open"), target="dropped",
                   required_permission="widget.drop"),
    ),
    sla=(
        SLA(state="open", action="remind", after_hours=24),
        SLA(state="open", action="escalate", after_hours=48),
    ),
)


@pytest.fixture
def engine(db, calendar, workflow_registry, dispatcher) -> WorkflowEngine:
    workflow_registry.register(WIDGET)
    return WorkflowEngine(db, calendar=calendar, registry=workflow_registry, dispatcher=dispatcher)


class TestKhaiBaoWorkflow:
    def test_bat_trang_thai_la_trong_transition(self):
        with pytest.raises(ValueError, match="trạng thái lạ"):
            WorkflowDefinition(
                entity_type="x", states=("a",), initial_state="a",
                transitions=(Transition(trigger="go", source=("a",), target="khong_ton_tai"),),
            )

    def test_bat_initial_state_la(self):
        with pytest.raises(ValueError, match="initial_state"):
            WorkflowDefinition(entity_type="x", states=("a",), initial_state="b")

    def test_bat_sla_gan_trang_thai_la(self):
        with pytest.raises(ValueError, match="SLA gắn với trạng thái lạ"):
            WorkflowDefinition(
                entity_type="x", states=("a",), initial_state="a",
                sla=(SLA(state="b", action="remind", after_hours=1),),
            )

    def test_sla_phai_dat_dung_mot_moc(self):
        with pytest.raises(ValueError, match="đúng một trong"):
            SLA(state="a", action="remind", after_hours=1, after_days=1)
        with pytest.raises(ValueError, match="đúng một trong"):
            SLA(state="a", action="remind")


class TestChuyenTrangThai:
    def test_start_dat_o_trang_thai_khoi_dau(self, engine):
        instance = engine.start("widget", "w1")
        assert instance.state == "draft"

    def test_khong_start_hai_lan(self, engine):
        engine.start("widget", "w1")
        with pytest.raises(WorkflowError, match="đã có workflow instance"):
            engine.start("widget", "w1")

    def test_chuyen_hop_le(self, engine):
        engine.start("widget", "w1")
        instance = engine.fire("widget", "w1", "publish")
        assert instance.state == "open"

    def test_tu_choi_chuyen_khong_hop_le(self, engine):
        engine.start("widget", "w1")
        with pytest.raises(WorkflowError) as exc:
            engine.fire("widget", "w1", "finish")  # chỉ đi được từ "open"
        assert exc.value.details["current_state"] == "draft"
        assert "publish" in exc.value.details["available"]

    def test_bao_loi_khi_chua_co_instance(self, engine):
        with pytest.raises(NotFoundError):
            engine.fire("widget", "chua-ton-tai", "publish")

    def test_ghi_lich_su_moi_lan_chuyen(self, engine, db):
        engine.start("widget", "w1", actor_id="u1")
        engine.fire("widget", "w1", "publish", actor_id="u2")
        rows = db.query(WorkflowHistory).order_by(WorkflowHistory.created_at).all()
        assert [(r.from_state, r.to_state, r.trigger) for r in rows] == [
            (None, "draft", "start"),
            ("draft", "open", "publish"),
        ]
        assert rows[1].actor_id == "u2"

    def test_transition_nhieu_nguon(self, engine):
        permission_registry.grant("hc", "widget.drop")
        principal = Principal(employee_id="u1", roles=frozenset({"hc"}))
        try:
            engine.start("widget", "w1")
            assert engine.fire("widget", "w1", "drop", principal=principal).state == "dropped"

            engine.start("widget", "w2")
            engine.fire("widget", "w2", "publish")
            assert engine.fire("widget", "w2", "drop", principal=principal).state == "dropped"
        finally:
            permission_registry.clear()

    def test_available_triggers(self, engine):
        engine.start("widget", "w1")
        assert set(engine.available_triggers("widget", "w1")) == {"publish", "drop"}


class TestPhanQuyenKhiChuyen:
    def test_tu_choi_khi_thieu_quyen(self, engine):
        engine.start("widget", "w1")
        principal = Principal(employee_id="u1", roles=frozenset({"nhan_vien"}))
        with pytest.raises(PermissionDeniedError):
            engine.fire("widget", "w1", "drop", principal=principal)

    def test_tu_choi_khi_khong_biet_ai_goi(self, engine):
        engine.start("widget", "w1")
        with pytest.raises(WorkflowError, match="không biết ai đang gọi"):
            engine.fire("widget", "w1", "drop")


class TestSuKien:
    def test_phat_su_kien_moi_lan_chuyen(self, engine, dispatcher):
        seen: list[WorkflowTransitioned] = []
        dispatcher.subscribe(WorkflowTransitioned, seen.append)

        engine.start("widget", "w1")
        engine.fire("widget", "w1", "publish")

        assert [(e.from_state, e.to_state) for e in seen] == [(None, "draft"), ("draft", "open")]

    def test_handler_loi_khong_lam_hong_chuyen_trang_thai(self, engine, dispatcher):
        def no(_event):
            raise RuntimeError("kênh thông báo chết")

        dispatcher.subscribe(WorkflowTransitioned, no)
        instance = engine.start("widget", "w1")
        # Chuyển trạng thái vẫn thành công dù handler ném lỗi.
        assert instance.state == "draft"


class TestSLA:
    def test_due_at_tinh_theo_gio_lam_viec(self, engine, calendar):
        instance = engine.start("widget", "w1")
        engine.fire("widget", "w1", "publish")
        sla = WIDGET.sla[0]  # 24 giờ làm việc
        due = engine.due_at(instance, sla)
        # 24 giờ làm việc = 3 ngày làm việc, không phải 1 ngày đồng hồ.
        assert due - instance.entered_state_at >= timedelta(days=3)

    def test_khong_doi_trang_thai_khi_qua_han(self, engine, db):
        """§8.2: quá hạn là thuộc tính suy ra, không phải trạng thái."""
        instance = engine.start("widget", "w1")
        engine.fire("widget", "w1", "publish")
        instance.entered_state_at = instance.entered_state_at - timedelta(days=30)
        db.flush()

        due = engine.find_due("widget")
        assert due, "phải thấy bản ghi quá hạn"
        # Engine chỉ báo, không tự sửa trạng thái.
        assert instance.state == "open"

    def test_find_due_bo_qua_ban_ghi_chua_toi_han(self, engine):
        engine.start("widget", "w1")
        engine.fire("widget", "w1", "publish")
        assert engine.find_due("widget") == []

    def test_find_due_loc_theo_action(self, engine, db):
        instance = engine.start("widget", "w1")
        engine.fire("widget", "w1", "publish")
        instance.entered_state_at = instance.entered_state_at - timedelta(days=30)
        db.flush()

        remind = engine.find_due("widget", action="remind")
        assert len(remind) == 1
        assert remind[0].sla.action == "remind"

    def test_khong_nhac_lai_moc_da_chay(self, engine, db):
        """Chống spam khi scheduler chạy lại (§6.1, §14)."""
        instance = engine.start("widget", "w1")
        engine.fire("widget", "w1", "publish")
        instance.entered_state_at = instance.entered_state_at - timedelta(days=30)
        db.flush()

        first = engine.find_due("widget", action="remind")
        assert len(first) == 1
        engine.mark_fired(first[0])

        assert engine.find_due("widget", action="remind") == []
        # Vẫn lấy lại được khi cần xem toàn bộ.
        assert len(engine.find_due("widget", action="remind", include_fired=True)) == 1

    def test_phat_su_kien_sla(self, engine, db, dispatcher):
        seen: list[SLABreached] = []
        dispatcher.subscribe(SLABreached, seen.append)

        instance = engine.start("widget", "w1")
        engine.fire("widget", "w1", "publish")
        instance.entered_state_at = instance.entered_state_at - timedelta(days=30)
        db.flush()

        for item in engine.find_due("widget", action="remind"):
            engine.publish_breach(item)

        assert [e.action for e in seen] == ["remind"]

    def test_doi_trang_thai_thi_dat_lai_moc_sla(self, engine, db):
        """Vào trạng thái mới thì đồng hồ SLA bắt đầu lại từ đầu."""
        instance = engine.start("widget", "w1")
        engine.fire("widget", "w1", "publish")
        # Giả lập đã nằm ở "open" 10 ngày.
        instance.entered_state_at = instance.entered_state_at - timedelta(days=10)
        db.flush()
        cu = instance.entered_state_at

        engine.fire("widget", "w1", "finish")

        # So khoảng cách chứ không so hai mốc utcnow() liên tiếp — hai lần
        # gọi sát nhau có thể ra cùng một giá trị và làm test lúc xanh lúc đỏ.
        assert instance.entered_state_at - cu > timedelta(days=9)
