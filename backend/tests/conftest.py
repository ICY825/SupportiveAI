"""Fixture dùng chung cho test.

Test chạy trên SQLite in-memory để không cần Postgres. Chỗ nào phụ thuộc
đặc thù Postgres thì phải có integration test riêng — xem ghi chú cuối file.
"""

from __future__ import annotations

from datetime import date, time
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.platform.events import Dispatcher
from app.platform.notification.channels import ChannelRegistry, OutboxChannel
from app.platform.workflow.calendar import BusinessCalendar
from app.platform.workflow.registry import WorkflowRegistry

# Import để mọi bảng có trong Base.metadata.
from app.platform.audit.models import AuditLog  # noqa: F401
from app.platform.notification.models import Notification, NotificationItem  # noqa: F401
from app.platform.workflow.models import SLAEvent, WorkflowHistory, WorkflowInstance  # noqa: F401
from app.shared.department.models import Department  # noqa: F401
from app.shared.employee.models import Employee, EmployeeRole  # noqa: F401
from app.shared.location.models import Location  # noqa: F401


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(eng, "connect")
    def _enable_fk(dbapi_connection, _record):
        # SQLite mặc định tắt kiểm tra khóa ngoại.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        Base.metadata.drop_all(eng)
        eng.dispose()


@pytest.fixture
def db(engine) -> Session:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = factory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def calendar() -> BusinessCalendar:
    """Lịch cố định cho test: T2–T6, 08:00–17:00, nghỉ trưa 12:00–13:00.

    Đặt tường minh ở đây thay vì đọc settings, để test không đổi kết quả
    khi lịch thật của công ty được chốt.
    """
    return BusinessCalendar(
        workdays=frozenset({0, 1, 2, 3, 4}),
        start=time(8, 0),
        end=time(17, 0),
        break_start=time(12, 0),
        break_end=time(13, 0),
        holidays=frozenset({date(2026, 9, 2)}),
        tz=ZoneInfo("Asia/Ho_Chi_Minh"),
    )


@pytest.fixture
def dispatcher() -> Dispatcher:
    """Dispatcher riêng cho mỗi test, không đụng vào cái toàn cục."""
    return Dispatcher()


@pytest.fixture
def workflow_registry() -> WorkflowRegistry:
    return WorkflowRegistry()


@pytest.fixture
def channels() -> ChannelRegistry:
    reg = ChannelRegistry()
    reg.register(OutboxChannel(), default=True)
    return reg


# Ghi chú: SQLite không có JSONB và không ép ràng buộc giống Postgres
# trong mọi trường hợp. Migration vì vậy được kiểm riêng bằng
# `alembic upgrade head --sql` với URL Postgres, và cần một lần chạy thật
# trên Postgres trước khi lên môi trường chung.
