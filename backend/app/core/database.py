"""Session, engine và base model dùng chung."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import DateTime, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.core.config import settings


def utcnow() -> datetime:
    """Thời điểm hiện tại, luôn kèm tzinfo. Dùng thay cho datetime.utcnow()."""
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class UtcDateTime(TypeDecorator):
    """Mốc thời gian luôn kèm `tzinfo`, ở cả chiều ghi lẫn chiều đọc.

    Không phải backend nào cũng giữ được múi giờ: Postgres trả về datetime
    có tzinfo, còn SQLite trả về datetime trần. Nếu để nguyên thì cùng một
    đoạn code so sánh mốc hạn sẽ chạy trên Postgres và ném
    `TypeError: can't compare offset-naive and offset-aware datetimes`
    trên SQLite — kiểu lỗi chỉ lộ ra khi đã có dữ liệu thật.

    Ghi thì bắt buộc có tzinfo (datetime trần là lỗi lập trình, không đoán
    hộ), đọc thì luôn trả về UTC.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError(
                "Datetime lưu xuống DB phải có tzinfo — dùng app.core.database.utcnow()"
            )
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


engine = create_engine(settings.database_url, echo=settings.db_echo, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Dependency cho FastAPI: mở session, commit khi thành công, rollback khi lỗi."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
