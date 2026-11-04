"""Async engine and session factory."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_settings = get_settings()

engine = create_async_engine(
    _settings.database_url,
    pool_size=_settings.database_pool_size,
    pool_pre_ping=True,
    connect_args={"timeout": 5},
)
SessionFactory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
