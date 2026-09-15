from fastapi import APIRouter

from app.api.v1.endpoints.employees import router as employees_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.workflow import router as workflow_router
from app.modules.resource_allocation.routers import router as resource_router

api_router = APIRouter()

# Health & System
api_router.include_router(health_router, prefix="", tags=["Health"])

# Shared Domain: Employees, Departments, Locations
api_router.include_router(employees_router, prefix="", tags=["Shared Domain - Employees & Org"])

# Shared Workflow Engine
api_router.include_router(workflow_router, prefix="", tags=["Shared Workflow Engine"])

# Flow 1: Floor Layout & Seat Management (Resource Allocation)
api_router.include_router(resource_router, prefix="", tags=["Floor Layout & Seat Management"])
