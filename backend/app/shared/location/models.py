"""Bảng vị trí vật lý: toà nhà, tầng, khu vực (README §5.1)."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, new_uuid


class Location(Base, TimestampMixin):
    __tablename__ = "location"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    building: Mapped[str | None] = mapped_column(String(128), nullable=True)
    floor: Mapped[str | None] = mapped_column(String(32), nullable=True)
    zone: Mapped[str | None] = mapped_column(String(128), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("location.id", ondelete="SET NULL"), nullable=True
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    parent: Mapped["Location | None"] = relationship(
        back_populates="children", remote_side=[id], foreign_keys=[parent_id]
    )
    children: Mapped[list["Location"]] = relationship(
        back_populates="parent", foreign_keys=[parent_id]
    )

    def __repr__(self) -> str:
        return f"<Location {self.code} {self.name}>"
