"""Migration có theo kịp model không.

Vì sao phải có file này: `conftest.py` dựng schema cho test bằng
`Base.metadata.create_all` trên SQLite, tức là **alembic không bao giờ được
chạy trong test**. Một model mới mà quên viết migration vẫn xanh hết bộ test,
rồi đổ 500 ngay lần gọi đầu tiên trên môi trường thật. Đúng chuyện đó đã xảy
ra với bảng `layout_placement` ngày 19/09/2026.

Hai lớp kiểm, cố ý khác nhau:

1. **Tĩnh, luôn chạy.** Không cần database, không phụ thuộc dialect. Bắt được
   lỗi "quên migration" và "quên import vào `migrations/env.py`" — hai lỗi
   thật sự hay gặp, và là hai lỗi đã xảy ra.
2. **Thật, cần Postgres.** Chạy `upgrade head` lên một database trống rồi so
   với `Base.metadata`. Chỉ cái này mới bắt được cột lệch kiểu hay thiếu chỉ
   mục. Không chạy được trên SQLite: `0002` dùng `op.create_foreign_key`, mà
   SQLite không ALTER được ràng buộc.

   Bật bằng:

       TEST_DATABASE_URL=postgresql+psycopg://user:pass@localhost:5433/postgres pytest

   Biến này trỏ tới một database **quản trị** (thường là `postgres`); test tự
   tạo một database tạm rồi xóa đi, không đụng vào dữ liệu đang có.
"""

from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

from app.core.database import Base

# Import để mọi bảng có mặt trong Base.metadata — cùng danh sách với conftest.
from app.modules.document_flow.mail.models import MailBatch, MailItem  # noqa: F401
from app.modules.resource_allocation.layout.models import LayoutPlacement  # noqa: F401
from app.modules.resource_allocation.seat.models import SeatAssignment  # noqa: F401
from app.platform.audit.models import AuditLog  # noqa: F401
from app.platform.notification.models import Notification, NotificationItem  # noqa: F401
from app.platform.workflow.models import SLAEvent, WorkflowHistory, WorkflowInstance  # noqa: F401
from app.shared.department.models import Department  # noqa: F401
from app.shared.employee.models import Employee, EmployeeRole  # noqa: F401
from app.shared.location.models import Location  # noqa: F401

BACKEND = Path(__file__).resolve().parents[1]
VERSIONS = BACKEND / "migrations" / "versions"
ENV_PY = BACKEND / "migrations" / "env.py"

#: `op.create_table(` xuống dòng rồi mới tới tên bảng, nên không grep một dòng được.
CREATE_TABLE = re.compile(r"""op\.create_table\(\s*['"]([a-zA-Z_]+)['"]""")


def migrated_tables() -> set[str]:
    """Tên mọi bảng từng được một migration tạo ra."""
    names: set[str] = set()
    for path in sorted(VERSIONS.glob("*.py")):
        names |= set(CREATE_TABLE.findall(path.read_text(encoding="utf-8")))
    return names


def model_modules() -> list[Path]:
    """Mọi file khai báo bảng, tính theo `__tablename__`."""
    return sorted(
        path
        for path in (BACKEND / "app").rglob("models.py")
        if "__tablename__" in path.read_text(encoding="utf-8")
    )


class TestTinh:
    """Không cần database. Chạy ở mọi máy, mọi CI."""

    def test_moi_bang_trong_model_deu_co_migration(self):
        missing = sorted(set(Base.metadata.tables) - migrated_tables())
        assert missing == [], (
            f"Bảng {missing} có trong model nhưng không migration nào tạo ra. "
            "Thêm model mà quên migration thì test vẫn xanh (conftest dùng "
            "create_all), rồi 500 trên môi trường thật."
        )

    def test_khong_co_migration_tao_bang_khong_ai_dung(self):
        orphans = sorted(migrated_tables() - set(Base.metadata.tables))
        assert orphans == [], (
            f"Migration tạo bảng {orphans} mà không model nào khai báo. "
            "Hoặc thiếu import ở file test này, hoặc bảng đã bị bỏ mà migration còn."
        )

    def test_env_py_import_moi_file_model(self):
        """Thiếu import thì `alembic revision --autogenerate` không thấy bảng mới.

        Đây là lỗi im lặng nhất trong cả chuỗi: autogenerate chạy xong, sinh ra
        một migration rỗng, và không báo gì cả.
        """
        source = ENV_PY.read_text(encoding="utf-8")
        missing = [
            str(path.relative_to(BACKEND))
            for path in model_modules()
            if str(path.relative_to(BACKEND).with_suffix("")).replace("/", ".") not in source
        ]
        assert missing == [], (
            f"`migrations/env.py` chưa import {missing}. Autogenerate sẽ không "
            "thấy các bảng trong đó, và sinh ra migration thiếu mà không báo lỗi."
        )


@pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="Cần TEST_DATABASE_URL trỏ tới một Postgres quản trị — xem docstring đầu file",
)
class TestThat:
    """Chạy migration thật rồi so schema. Chỉ Postgres mới chạy được."""

    @pytest.fixture
    def database_url(self):
        """Một database trống, dùng xong xóa."""
        admin_url = os.environ["TEST_DATABASE_URL"]
        name = f"supportive_migration_test_{uuid.uuid4().hex[:8]}"
        admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
        try:
            yield admin_url.rsplit("/", 1)[0] + f"/{name}"
        finally:
            with admin.connect() as conn:
                conn.execute(
                    text(
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                        "WHERE datname = :name"
                    ),
                    {"name": name},
                )
                conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
            admin.dispose()

    @staticmethod
    def _upgrade(database_url: str) -> None:
        from alembic import command
        from alembic.config import Config

        from app.core.config import settings

        # `migrations/env.py` đọc URL từ settings chứ không từ alembic.ini, nên
        # đặt ở đây mới ăn. Đặt vào Config là vô ích — env.py ghi đè ngay sau đó.
        original = settings.database_url
        settings.database_url = database_url
        try:
            command.upgrade(Config(str(BACKEND / "alembic.ini")), "head")
        finally:
            settings.database_url = original

    def test_upgrade_head_dung_len_tu_database_trong(self, database_url):
        self._upgrade(database_url)

        engine = create_engine(database_url)
        try:
            actual = set(inspect(engine).get_table_names()) - {"alembic_version"}
        finally:
            engine.dispose()
        assert actual == set(Base.metadata.tables)

    def test_schema_sau_migration_khop_voi_model(self, database_url):
        """Cái duy nhất bắt được cột lệch kiểu, thiếu cột hay thiếu chỉ mục."""
        from alembic.autogenerate import compare_metadata
        from alembic.migration import MigrationContext

        self._upgrade(database_url)

        engine = create_engine(database_url)
        try:
            with engine.connect() as conn:
                context = MigrationContext.configure(conn, opts={"compare_type": True})
                differences = compare_metadata(context, Base.metadata)
        finally:
            engine.dispose()

        assert differences == [], (
            "Schema sau `upgrade head` khác Base.metadata. Mỗi dòng bên dưới là "
            f"một thứ migration chưa làm: {differences}"
        )
