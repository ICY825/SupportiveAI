"""Truy vấn vị trí vật lý."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.shared.location.models import Location


class LocationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, location_id: str) -> Location | None:
        return self.db.get(Location, location_id)

    def get_by_code(self, code: str) -> Location | None:
        return self.db.execute(
            select(Location).where(Location.code == code)
        ).scalar_one_or_none()

    def list_all(self, *, active_only: bool = True) -> Sequence[Location]:
        stmt = select(Location).order_by(Location.code)
        if active_only:
            stmt = stmt.where(Location.active.is_(True))
        return self.db.execute(stmt).scalars().all()

    def add(self, location: Location) -> Location:
        self.db.add(location)
        self.db.flush()
        return location
