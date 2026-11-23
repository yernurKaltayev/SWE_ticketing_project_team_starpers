"""POST /venues: organizers type a venue that is not in the list yet [P2]."""

from sqlalchemy import func, select

from app.models.user import UserRole
from app.models.venue import Venue
from tests.factories import auth_header, make_organizer, make_user, unique

PREFIX = "/api/v1"


def new_venue(**overrides: str) -> dict[str, str]:
    return {"name": unique("Hall"), "address": "1 Abay Ave", "city": "Almaty"} | overrides


async def test_an_organizer_creates_a_venue_that_joins_the_shared_list(client, db):
    organizer, _ = await make_organizer(db)
    body = new_venue(name="  Steppe Arena  ", city=" Astana ")

    response = await client.post(f"{PREFIX}/venues", json=body, headers=auth_header(organizer))

    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Steppe Arena"
    assert created["city"] == "Astana"
    listed = (await client.get(f"{PREFIX}/venues")).json()
    items = listed["items"] if isinstance(listed, dict) else listed
    assert created["id"] in {venue["id"] for venue in items}


async def test_the_same_venue_typed_again_is_reused_not_duplicated(client, db):
    organizer, _ = await make_organizer(db)
    other, _ = await make_organizer(db)
    name = unique("Hall")
    first = await client.post(
        f"{PREFIX}/venues", json=new_venue(name=name), headers=auth_header(organizer)
    )

    again = await client.post(
        f"{PREFIX}/venues",
        json=new_venue(name=f" {name.upper()} ", address="1 ABAY AVE", city="almaty"),
        headers=auth_header(other),
    )

    assert again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    count = await db.scalar(select(func.count()).select_from(Venue).where(Venue.name == name))
    assert count == 1


async def test_a_platform_admin_can_create_a_venue(client, db):
    admin = await make_user(db, role=UserRole.platform_admin)
    response = await client.post(f"{PREFIX}/venues", json=new_venue(), headers=auth_header(admin))
    assert response.status_code == 201


async def test_an_attendee_cannot_create_a_venue(client, db):
    attendee = await make_user(db)
    response = await client.post(
        f"{PREFIX}/venues", json=new_venue(), headers=auth_header(attendee)
    )
    assert response.status_code == 403


async def test_creating_a_venue_needs_a_signed_in_user(client):
    assert (await client.post(f"{PREFIX}/venues", json=new_venue())).status_code == 401


async def test_blank_or_overlong_fields_are_rejected(client, db):
    organizer, _ = await make_organizer(db)
    headers = auth_header(organizer)
    for body in (
        new_venue(name="   "),
        new_venue(address=""),
        new_venue(city=" "),
        new_venue(name="x" * 201),
    ):
        response = await client.post(f"{PREFIX}/venues", json=body, headers=headers)
        assert response.status_code == 422, body
