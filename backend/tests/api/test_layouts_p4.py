"""POST /venues/{id}/layouts: organizers build a hall plan from sections [P4]."""

from sqlalchemy import func, select

from app.models.venue import VenueLayout
from app.services import seat_service
from tests.factories import auth_header, make_organizer, make_user, unique

PREFIX = "/api/v1"


async def _venue(client, organizer) -> str:
    body = {"name": unique("Hall"), "address": "1 Abay Ave", "city": "Almaty"}
    response = await client.post(f"{PREFIX}/venues", json=body, headers=auth_header(organizer))
    return response.json()["id"]


def plan(**overrides):
    return {
        "name": "Main hall",
        "sections": [
            {"name": "Parterre", "price_category": " Standard ", "rows": 3, "seats_per_row": 4},
            {"name": "Balcony", "price_category": "vip", "rows": 2, "seats_per_row": 2},
        ],
    } | overrides


async def test_an_organizer_builds_a_layout_from_sections(client, db):
    organizer, _ = await make_organizer(db)
    venue_id = await _venue(client, organizer)

    response = await client.post(
        f"{PREFIX}/venues/{venue_id}/layouts", json=plan(), headers=auth_header(organizer)
    )

    assert response.status_code == 201
    layout = response.json()
    assert layout["name"] == "Main hall"
    listed = (await client.get(f"{PREFIX}/venues/{venue_id}/layouts")).json()
    items = listed["items"] if isinstance(listed, dict) else listed
    assert layout["id"] in {x["id"] for x in items}

    seats = await seat_service._layout_seats(db, layout["id"])
    assert len(seats) == 3 * 4 + 2 * 2
    order = [(sec.name, row.label, seat.number) for seat, row, sec in seats]
    # Rows run 1..5 from the stage across both sections; seats by number within a row.
    assert order[:5] == [
        ("Parterre", "1", 1),
        ("Parterre", "1", 2),
        ("Parterre", "1", 3),
        ("Parterre", "1", 4),
        ("Parterre", "2", 1),
    ]
    assert order[-1] == ("Balcony", "5", 2)
    categories = {sec.name: seat.price_category for seat, _row, sec in seats}
    assert categories == {"Parterre": "standard", "Balcony": "vip"}


async def test_layout_names_are_unique_per_venue(client, db):
    organizer, _ = await make_organizer(db)
    venue_id = await _venue(client, organizer)
    url = f"{PREFIX}/venues/{venue_id}/layouts"
    await client.post(url, json=plan(), headers=auth_header(organizer))

    again = await client.post(url, json=plan(name=" main HALL "), headers=auth_header(organizer))

    assert again.status_code == 409
    assert again.json()["code"] == "layout_exists"


async def test_bad_plans_are_rejected_and_nothing_is_written(client, db):
    organizer, _ = await make_organizer(db)
    venue_id = await _venue(client, organizer)
    url = f"{PREFIX}/venues/{venue_id}/layouts"
    before = await db.scalar(select(func.count()).select_from(VenueLayout))
    same_names = plan(
        sections=[
            {"name": "A", "price_category": "x", "rows": 1, "seats_per_row": 1},
            {"name": "a", "price_category": "y", "rows": 1, "seats_per_row": 1},
        ]
    )
    too_big = plan(
        sections=[
            {"name": f"S{i}", "price_category": "x", "rows": 30, "seats_per_row": 50}
            for i in range(2)
        ]
    )
    for body in (same_names, too_big, plan(sections=[]), plan(name="  ")):
        response = await client.post(url, json=body, headers=auth_header(organizer))
        assert response.status_code == 422, body
    assert await db.scalar(select(func.count()).select_from(VenueLayout)) == before


async def test_only_organizers_and_admins_build_layouts(client, db):
    organizer, _ = await make_organizer(db)
    venue_id = await _venue(client, organizer)
    attendee = await make_user(db)
    url = f"{PREFIX}/venues/{venue_id}/layouts"

    assert (await client.post(url, json=plan())).status_code == 401
    assert (await client.post(url, json=plan(), headers=auth_header(attendee))).status_code == 403


async def test_unknown_venue_is_404(client, db):
    organizer, _ = await make_organizer(db)
    response = await client.post(
        f"{PREFIX}/venues/00000000-0000-0000-0000-000000000000/layouts",
        json=plan(),
        headers=auth_header(organizer),
    )
    assert response.status_code == 404
