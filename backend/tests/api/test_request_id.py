import logging


async def test_request_id_is_generated(client):
    assert len((await client.get("/health")).headers["X-Request-ID"]) == 32


async def test_safe_request_id_is_kept(client):
    response = await client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert response.headers["X-Request-ID"] == "abc-123"


async def test_unsafe_request_id_is_replaced(client):
    response = await client.get("/health", headers={"X-Request-ID": "bad id; drop\ttable"})
    assert response.headers["X-Request-ID"] != "bad id; drop\ttable"


async def test_error_responses_have_a_request_id(client):
    assert "X-Request-ID" in (await client.get("/nope")).headers


async def test_requests_are_logged(client, caplog):
    with caplog.at_level(logging.INFO, logger="biletflow.access"):
        await client.get("/health")
    record = next(r for r in caplog.records if r.name == "biletflow.access")
    assert (record.method, record.path, record.status) == ("GET", "/health", 200)
