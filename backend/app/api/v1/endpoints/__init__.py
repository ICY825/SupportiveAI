from app.api.v1.endpoints.employees import router as employees_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.workflow import router as workflow_router

__all__ = ["employees_router", "workflow_router", "health_router"]
