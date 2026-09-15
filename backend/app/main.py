import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.api import api_router
from app.core.config import settings
from app.core.database import async_session_factory, init_db
from app.core.exceptions import (
    EntityNotFoundError,
    ResourceConflictError,
    SupportiveAIException,
    WorkflowTransitionError,
)
from app.modules.resource_allocation.services import ResourceAllocationService
from app.notification.service import NotificationService

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("supportive_ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize database, event listeners, and seed First Flow layout."""
    logger.info("Initializing SupportiveAI backend stack...")
    await init_db()
    logger.info("Database schema initialized.")

    # Register domain event listeners
    NotificationService.register_event_listeners()

    # Pre-seed First Flow (Floor 19 Layout & Seat Management)
    async with async_session_factory() as session:
        svc = ResourceAllocationService(session)
        await svc.seed_floor_19()
        await session.commit()
    logger.info("Floor 19 layout seeded and ready for Flow 1.")

    yield
    logger.info("Shutting down SupportiveAI backend...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="SupportiveAI Unified Administrative Platform — Flow 1: Floor Layout & Seat Management",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS] or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Standardized Exception Handlers
@app.exception_handler(SupportiveAIException)
async def supportive_ai_exception_handler(request: Request, exc: SupportiveAIException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "details": exc.details},
    )


@app.exception_handler(EntityNotFoundError)
async def entity_not_found_handler(request: Request, exc: EntityNotFoundError):
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": exc.message, "details": exc.details},
    )


@app.exception_handler(WorkflowTransitionError)
async def workflow_transition_handler(request: Request, exc: WorkflowTransitionError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.message, "details": exc.details},
    )


@app.exception_handler(ResourceConflictError)
async def resource_conflict_handler(request: Request, exc: ResourceConflictError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": exc.message},
    )


# Mount API Router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs_url": f"{settings.API_V1_STR}/docs",
        "first_flow": "Floor Layout and Management",
        "first_flow_endpoint": f"{settings.API_V1_STR}/layout/floor-19",
    }
