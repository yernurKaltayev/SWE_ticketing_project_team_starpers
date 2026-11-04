"""docs/openapi.yaml is the source of truth: implemented routes must be declared there first."""

from pathlib import Path

import yaml
from fastapi import APIRouter, FastAPI
from openapi_spec_validator import validate

from app.core.config import get_settings
from app.main import create_app

HTTP_METHODS = {"get", "post", "put", "patch", "delete"}
CONTRACT = Path(__file__).resolve().parents[2] / "docs" / "openapi.yaml"


def _load_contract() -> dict:
    return yaml.safe_load(CONTRACT.read_text())


def _declared_operations(spec: dict) -> set[tuple[str, str]]:
    default_server = spec["servers"][0]["url"]
    operations = set()
    for path, item in spec["paths"].items():
        server = item.get("servers", [{"url": default_server}])[0]["url"].rstrip("/")
        for method in item.keys() & HTTP_METHODS:
            operations.add((method.upper(), f"{server}{path}"))
    return operations


def _undeclared_routes(app: FastAPI, spec: dict) -> set[tuple[str, str]]:
    # app.openapi() rather than app.routes: included routers are not flattened into app.routes.
    implemented = {
        (method.upper(), path)
        for path, item in app.openapi()["paths"].items()
        for method in item.keys() & HTTP_METHODS
    }
    return implemented - _declared_operations(spec)


def test_contract_is_valid_openapi():
    validate(_load_contract())


def test_every_implemented_route_is_in_the_contract():
    assert _undeclared_routes(create_app(), _load_contract()) == set()


def test_an_undeclared_route_on_an_included_router_is_detected():
    router = APIRouter()

    @router.get("/not-in-contract")
    async def undeclared():
        return {}

    app = create_app()
    prefix = get_settings().api_v1_prefix
    app.include_router(router, prefix=prefix)

    assert _undeclared_routes(app, _load_contract()) == {("GET", f"{prefix}/not-in-contract")}
