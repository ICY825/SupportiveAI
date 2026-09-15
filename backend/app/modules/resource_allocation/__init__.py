from app.modules.resource_allocation.routers import router as resource_allocation_router
from app.modules.resource_allocation.services import ResourceAllocationService

__all__ = ["resource_allocation_router", "ResourceAllocationService"]
