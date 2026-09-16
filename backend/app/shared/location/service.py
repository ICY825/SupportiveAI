"""Logic nghiệp vụ của danh mục vị trí."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.shared.location.models import Location
from app.shared.location.repository import LocationRepository
from app.shared.location.schemas import LocationCreate, LocationUpdate


class LocationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = LocationRepository(db)

    def get(self, location_id: str) -> Location:
        location = self.repo.get(location_id)
        if location is None:
            raise NotFoundError(f"Không có vị trí {location_id}")
        return location

    def create(self, payload: LocationCreate) -> Location:
        if self.repo.get_by_code(payload.code):
            raise ConflictError(f"Mã vị trí {payload.code} đã tồn tại")
        location = Location(
            code=payload.code.strip(),
            name=payload.name.strip(),
            building=payload.building,
            floor=payload.floor,
            zone=payload.zone,
            parent_id=payload.parent_id,
        )
        return self.repo.add(location)

    def update(self, location_id: str, payload: LocationUpdate) -> Location:
        location = self.get(location_id)
        if payload.name is not None:
            location.name = payload.name.strip()
        if payload.building is not None:
            location.building = payload.building
        if payload.floor is not None:
            location.floor = payload.floor
        if payload.zone is not None:
            location.zone = payload.zone
        if payload.parent_id is not None:
            if payload.parent_id == location_id:
                raise ValidationError("Vị trí không thể là cha của chính nó")
            location.parent_id = payload.parent_id
        if payload.active is not None:
            location.active = payload.active
        self.db.flush()
        return location
