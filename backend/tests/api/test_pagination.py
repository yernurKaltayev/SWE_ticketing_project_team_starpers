import pytest
from fastapi import FastAPI
from sqlalchemy import select

from app.core.deps import DbSession
from app.core.pagination import Page, Pagination, paginate
from app.models import Venue
from app.schemas.venue import VenueOut


@pytest.fixture
def routes(app: FastAPI) -> FastAPI:
    @app.get("/_test/venues")
    async def venues(db: DbSession, page: Pagination) -> Page[VenueOut]:
        return await paginate(db, select(Venue).order_by(Venue.name), page)

    return app


async def test_pages_through_results(routes, client, db):
    db.add_all(Venue(name=f"Hall {i}", address="Addr", city="Almaty") for i in range(5))
    await db.flush()

    body = (await client.get("/_test/venues", params={"limit": 2, "offset": 2})).json()

    assert body["total"] == 5
    assert (body["limit"], body["offset"]) == (2, 2)
    assert [venue["name"] for venue in body["items"]] == ["Hall 2", "Hall 3"]


async def test_defaults(routes, client):
    body = (await client.get("/_test/venues")).json()
    assert (body["items"], body["total"], body["limit"], body["offset"]) == ([], 0, 20, 0)


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"offset": -1}])
async def test_out_of_range_values_are_rejected(routes, client, params):
    response = await client.get("/_test/venues", params=params)
    assert response.status_code == 422
