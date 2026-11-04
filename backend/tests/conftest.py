"""Test setup. The suite runs against real PostgreSQL: partial indexes, citext and enums
are part of what is being tested, and SQLite has none of them.

Each test runs inside a transaction that is rolled back, so tests cannot see each other's data.
"""

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path

# Must be set before anything from `app` is imported: settings are read at import time.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://biletflow:biletflow@localhost:5432/biletflow_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-0123456789abcdef0123")
os.environ.setdefault("TICKET_SIGNING_SECRET", "test-only-ticket-secret-0123456789abcdef")

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.deps import get_db
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
async def engine():
    database = make_url(TEST_DATABASE_URL).database or ""
    if not database.endswith("_test"):
        pytest.exit(f"Refusing to wipe {database!r}: the name must end in _test", returncode=1)

    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as connection:
        await connection.execute(text("DROP SCHEMA public CASCADE"))
        await connection.execute(text("CREATE SCHEMA public"))
    # A subprocess because alembic/env.py starts its own event loop.
    await asyncio.to_thread(
        subprocess.run,
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        check=True,
    )
    yield engine
    await engine.dispose()


@pytest.fixture
async def db(engine) -> AsyncIterator[AsyncSession]:
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            expire_on_commit=False,
            # commit() inside the code under test only releases a savepoint.
            join_transaction_mode="create_savepoint",
        )
        yield session
        await session.close()
        await transaction.rollback()


@pytest.fixture
def app(db: AsyncSession) -> FastAPI:
    application = create_app()

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        yield db

    application.dependency_overrides[get_db] = override_get_db
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    # raise_app_exceptions=False: tests see the 500 response a real client would get.
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
