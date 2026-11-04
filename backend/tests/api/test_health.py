from app.core.deps import get_db


async def test_health_reports_ok(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "ok"


async def test_health_reports_a_database_outage(app, client):
    class BrokenSession:
        async def execute(self, *_):
            raise OSError("connection refused")

    async def broken_db():
        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db
    response = await client.get("/health")
    assert response.status_code == 503
    assert response.json()["code"] == "database_unavailable"
