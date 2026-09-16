"""Test audit log thật sự được ghi khi có chuyển trạng thái.

README §5.5: "Mọi chuyển đổi trạng thái đều ghi lại". Audit nghe qua
dispatcher nên rất dễ tưởng là chạy mà thực ra chưa nối — file này chặn
đúng chỗ đó.
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import sessionmaker

from app.platform.audit import make_transition_listener
from app.platform.audit.models import AuditLog
from app.platform.workflow import Transition, WorkflowDefinition, WorkflowEngine
from app.platform.workflow.events import WorkflowTransitioned

TICKET = WorkflowDefinition(
    entity_type="ticket",
    states=("new", "doing", "done"),
    initial_state="new",
    transitions=(
        Transition(trigger="take", source=("new",), target="doing"),
        Transition(trigger="close", source=("doing",), target="done"),
    ),
)


@pytest.fixture
def wired_engine(db, engine, calendar, workflow_registry, dispatcher):
    """Engine đã nối với audit, dùng đúng DB của test."""
    workflow_registry.register(TICKET)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    dispatcher.subscribe(WorkflowTransitioned, make_transition_listener(session_factory))
    return WorkflowEngine(db, calendar=calendar, registry=workflow_registry, dispatcher=dispatcher)


def _audit_rows(db):
    return db.query(AuditLog).order_by(AuditLog.occurred_at).all()


def test_ghi_audit_khi_start(wired_engine, db):
    wired_engine.start("ticket", "t1", actor_id="u1")
    db.commit()

    rows = _audit_rows(db)
    assert len(rows) == 1
    assert (rows[0].entity_type, rows[0].entity_id) == ("ticket", "t1")
    assert (rows[0].from_state, rows[0].to_state) == (None, "new")
    assert rows[0].actor_id == "u1"


def test_ghi_audit_moi_lan_chuyen(wired_engine, db):
    wired_engine.start("ticket", "t1")
    wired_engine.fire("ticket", "t1", "take", actor_id="u2")
    wired_engine.fire("ticket", "t1", "close", actor_id="u3")
    db.commit()

    rows = _audit_rows(db)
    assert [(r.from_state, r.to_state, r.action, r.actor_id) for r in rows] == [
        (None, "new", "start", None),
        ("new", "doing", "take", "u2"),
        ("doing", "done", "close", "u3"),
    ]


def test_chuyen_that_bai_thi_khong_ghi_audit(wired_engine, db):
    from app.core.exceptions import WorkflowError

    wired_engine.start("ticket", "t1")
    db.commit()

    with pytest.raises(WorkflowError):
        wired_engine.fire("ticket", "t1", "close")  # chưa "take"
    db.rollback()

    # Chỉ còn đúng dòng của start.
    assert len(_audit_rows(db)) == 1
