"""Truy vấn bảng vị trí bàn."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.resource_allocation.layout.models import LayoutPlacement


class LayoutRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for_floor(self, floor_id: str) -> Sequence[LayoutPlacement]:
        return (
            self.db.execute(
                select(LayoutPlacement)
                .where(LayoutPlacement.floor_id == floor_id)
                .order_by(LayoutPlacement.entity_id)
            )
            .scalars()
            .all()
        )

    def get(self, floor_id: str, entity_id: str) -> LayoutPlacement | None:
        return self.db.execute(
            select(LayoutPlacement).where(
                LayoutPlacement.floor_id == floor_id,
                LayoutPlacement.entity_id == entity_id,
            )
        ).scalar_one_or_none()

    def by_entity_id(self, floor_id: str, entity_ids: Sequence[str]) -> dict[str, LayoutPlacement]:
        """Đọc trước cả đợt: một lần lưu chạm nhiều bàn, không nên n truy vấn."""
        if not entity_ids:
            return {}
        rows = (
            self.db.execute(
                select(LayoutPlacement).where(
                    LayoutPlacement.floor_id == floor_id,
                    LayoutPlacement.entity_id.in_(list(entity_ids)),
                )
            )
            .scalars()
            .all()
        )
        return {row.entity_id: row for row in rows}

    def add(self, placement: LayoutPlacement) -> LayoutPlacement:
        self.db.add(placement)
        self.db.flush()
        return placement

    def delete(self, placement: LayoutPlacement) -> None:
        self.db.delete(placement)
        self.db.flush()
