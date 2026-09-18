from typing import TYPE_CHECKING

from app.modules.resource_allocation.services import ResourceAllocationService

if TYPE_CHECKING:
    from app.modules.resource_allocation.routers import (
        router as resource_allocation_router,
    )


def __getattr__(name: str):
    if name == "resource_allocation_router":
        from app.modules.resource_allocation.routers import router

        return router
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["ResourceAllocationService", "resource_allocation_router"]


