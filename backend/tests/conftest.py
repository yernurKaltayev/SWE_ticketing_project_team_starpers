import os

os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production-0123456789")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402


@pytest_asyncio.fixture
async def session_factory():
    url = os.environ.get("TEST_DATABASE_URL") or "sqlite+aiosqlite:///:memory:"
    if not url.startswith("sqlite") and not (make_url(url).database or "").endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must use a dedicated database ending in _test")
    options = (
        {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}
        if url.startswith("sqlite")
        else {}
    )
    engine = create_async_engine(url, **options)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    await engine.dispose()


@pytest.fixture(autouse=True)
def disable_external_email(monkeypatch):
    monkeypatch.setattr(settings, "smtp_enabled", False)


@pytest_asyncio.fixture
async def client(session_factory):
    async def override_get_db():
        async with session_factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client
    fastapi_app.dependency_overrides.clear()
