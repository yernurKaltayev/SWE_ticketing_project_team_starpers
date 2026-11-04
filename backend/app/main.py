"""FastAPI application: middleware, error handlers, routers and the health check."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.deps import DbSession
from app.core.errors import ServiceUnavailableError, register_exception_handlers
from app.core.logging import REQUEST_ID_HEADER, RequestContextMiddleware, configure_logging
from app.core.rate_limit import RateLimiter
from app.db.session import engine
from app.routers import api_router, public_router


class HealthOut(BaseModel):
    status: str
    database: str
    version: str


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.log_json)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        docs_url=f"{settings.api_v1_prefix}/docs",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.rate_limiter = RateLimiter()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER],
    )
    # Added last so it is outermost: CORS and error responses also get a request ID.
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    app.include_router(public_router)

    @app.get("/health", tags=["health"])
    async def health(db: DbSession) -> HealthOut:
        try:
            await db.execute(text("SELECT 1"))
        except (SQLAlchemyError, OSError) as exc:
            raise ServiceUnavailableError(
                "The database is unavailable.", code="database_unavailable"
            ) from exc
        return HealthOut(status="ok", database="ok", version=settings.app_version)

    return app


app = create_app()
