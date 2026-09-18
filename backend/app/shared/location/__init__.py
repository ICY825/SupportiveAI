"""Danh mục vị trí vật lý."""

from app.shared.location.models import Location
from app.shared.location.repository import LocationRepository
from app.shared.location.service import LocationService

__all__ = ["Location", "LocationRepository", "LocationService"]
