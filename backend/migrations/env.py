"""Cấu hình Alembic.

Một database dùng chung, **một thư mục migrations duy nhất**
(repository-structure.md §8). Quy ước đặt tên file cho biết migration
thuộc module nào.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.core.database import Base, UtcDateTime

# Import để mọi bảng có mặt trong Base.metadata trước khi autogenerate.
from app.modules.document_flow.mail.models import MailBatch, MailItem  # noqa: F401
from app.modules.resource_allocation.seat.models import SeatAssignment  # noqa: F401
from app.platform.audit.models import AuditLog  # noqa: F401
from app.platform.notification.models import Notification, NotificationItem  # noqa: F401
from app.platform.workflow.models import (  # noqa: F401
    SLAEvent,
    WorkflowHistory,
    WorkflowInstance,
)
from app.shared.department.models import Department  # noqa: F401
from app.shared.employee.models import Employee, EmployeeRole  # noqa: F401
from app.shared.location.models import Location  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):
    """Render kiểu tuỳ biến thành kiểu SQLAlchemy thuần.

    Migration đã sinh ra thì phải chạy được mãi, kể cả khi lớp
    `app.core.database.UtcDateTime` được đổi tên hay bỏ đi. Vì vậy không
    để autogenerate nhúng đường dẫn tới mã ứng dụng vào file migration —
    DDL sinh ra y hệt nhau.
    """
    if type_ == "type" and isinstance(obj, UtcDateTime):
        autogen_context.imports.add("import sqlalchemy as sa")
        return "sa.DateTime(timezone=True)"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_item=render_item,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
