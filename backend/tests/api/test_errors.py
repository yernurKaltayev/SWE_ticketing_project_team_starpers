import pytest
from fastapi import FastAPI
from pydantic import BaseModel

from app.core.errors import ConflictError, NotFoundError


class Body(BaseModel):
    password: int


@pytest.fixture
def routes(app: FastAPI) -> FastAPI:
    @app.get("/_test/conflict")
    async def conflict():
        raise ConflictError("Seat taken.", code="seat_taken", details={"seat": "A1"})

    @app.get("/_test/not-found")
    async def not_found():
        raise NotFoundError()

    @app.get("/_test/crash")
    async def crash():
        raise RuntimeError("secret internal detail")

    @app.post("/_test/body")
    async def body(_: Body):
        return {}

    return app


async def test_app_error_format(routes, client):
    response = await client.get("/_test/conflict")
    assert response.status_code == 409
    assert response.json() == {
        "code": "seat_taken",
        "message": "Seat taken.",
        "details": {"seat": "A1"},
    }


async def test_app_error_defaults(routes, client):
    response = await client.get("/_test/not-found")
    assert response.status_code == 404
    assert response.json() == {
        "code": "not_found",
        "message": "The resource was not found.",
        "details": None,
    }


async def test_unknown_route_uses_the_error_format(client):
    response = await client.get("/nope")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    assert set(response.json()) == {"code", "message", "details"}


async def test_wrong_method_uses_the_error_format(client):
    response = await client.post("/health")
    assert response.status_code == 405
    assert response.json()["code"] == "method_not_allowed"


async def test_validation_error_lists_fields_without_echoing_input(routes, client):
    response = await client.post("/_test/body", json={"password": "hunter2"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["details"][0]["field"] == "body.password"
    assert "hunter2" not in response.text


async def test_unhandled_exception_hides_details_and_keeps_the_request_id(routes, client):
    response = await client.get("/_test/crash", headers={"X-Request-ID": "trace-1"})
    assert response.status_code == 500
    assert response.json()["code"] == "internal_error"
    assert "secret internal detail" not in response.text
    assert response.headers["X-Request-ID"] == "trace-1"
