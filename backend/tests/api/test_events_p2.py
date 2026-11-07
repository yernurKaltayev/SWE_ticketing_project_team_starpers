"""P2 API tests; use the repository's real-PostgreSQL fixtures.

Run from backend/: uv run pytest tests/api/test_events_p2.py -q
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select

from app.models.event import Event, EventStatus, EventVisibility
from app.models.order import Order
from app.models.ticket_type import TicketType
from app.models.venue import Venue
from tests.factories import (
    auth_header,
    make_event,
    make_order,
    make_organizer,
    make_ticket_type,
    make_user,
)

PREFIX = "/api/v1"


def event_payload(venue_id: str) -> dict:
    start = datetime.now(UTC) + timedelta(days=7)
    return {
        "title": "Astana Tech Meetup",
        "description": "Talks and networking",
        "category": "conference",
        "venue_id": venue_id,
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(hours=2)).isoformat(),
        "timezone": "Asia/Almaty",
        "capacity": 50,
    }


async def test_organizer_creates_draft_event(client, db):
    owner, profile = await make_organizer(db)
    venue = Venue(name="Test Hall", address="10 Example St", city="Astana")
    db.add(venue)
    await db.flush()
    response = await client.post(
        f"{PREFIX}/events", json=event_payload(str(venue.id)), headers=auth_header(owner)
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["title"] == "Astana Tech Meetup"
    assert body["status"] == "draft"
    assert body["share_token"]
    assert body["images"] == []
    assert (await db.get(Event, UUID(body["id"]))).organizer_id == profile.id


async def test_attendee_cannot_create_event(client, db):
    attendee = await make_user(db)
    response = await client.post(
        f"{PREFIX}/events",
        json=event_payload("00000000-0000-0000-0000-000000000000"),
        headers=auth_header(attendee),
    )
    assert response.status_code == 403


async def test_invalid_date_or_timezone_is_rejected(client, db):
    owner, _ = await make_organizer(db)
    venue = Venue(name="Test Hall", address="10 Example St", city="Astana")
    db.add(venue)
    await db.flush()
    payload = event_payload(str(venue.id))
    payload["timezone"] = "Mars/Phobos"
    response = await client.post(f"{PREFIX}/events", json=payload, headers=auth_header(owner))
    assert response.status_code == 422
    payload["timezone"] = "Asia/Almaty"
    payload["ends_at"] = payload["starts_at"]
    response = await client.post(f"{PREFIX}/events", json=payload, headers=auth_header(owner))
    assert response.status_code == 422


async def test_public_list_hides_drafts_and_non_public_events(client, db):
    _, profile = await make_organizer(db)
    visible = await make_event(db, profile, status=EventStatus.published)
    await make_event(db, profile, status=EventStatus.draft)
    await make_event(db, profile, status=EventStatus.published, visibility=EventVisibility.private)
    response = await client.get(f"{PREFIX}/events")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(visible.id)
    assert body["items"][0]["share_token"] == ""


async def test_private_event_is_only_visible_to_owner_or_share_token(client, db):
    owner, profile = await make_organizer(db)
    attendee = await make_user(db)
    event = await make_event(
        db, profile, status=EventStatus.published, visibility=EventVisibility.unlisted
    )
    anonymous = await client.get(f"{PREFIX}/events/{event.id}")
    assert anonymous.status_code == 404
    wrong_user = await client.get(f"{PREFIX}/events/{event.id}", headers=auth_header(attendee))
    assert wrong_user.status_code == 404
    owned = await client.get(f"{PREFIX}/events/{event.id}", headers=auth_header(owner))
    assert owned.status_code == 200
    by_token = await client.get(f"{PREFIX}/events/by-token/{event.share_token}")
    assert by_token.status_code == 200
    assert by_token.json()["id"] == str(event.id)


async def test_publish_requires_ticket_types_and_enough_capacity(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, capacity=5)
    no_tickets = await client.post(
        f"{PREFIX}/events/{event.id}/publish", headers=auth_header(owner)
    )
    assert no_tickets.status_code == 422
    await make_ticket_type(db, event, quantity_total=10)
    too_small = await client.post(f"{PREFIX}/events/{event.id}/publish", headers=auth_header(owner))
    assert too_small.status_code == 422
    event.capacity = 15
    await db.flush()
    good = await client.post(f"{PREFIX}/events/{event.id}/publish", headers=auth_header(owner))
    assert good.status_code == 200, good.text
    assert good.json()["status"] == "published"


async def test_organizer_cannot_patch_another_organizers_event(client, db):
    owner, profile = await make_organizer(db)
    other, _ = await make_organizer(db)
    event = await make_event(db, profile)
    forbidden = await client.patch(
        f"{PREFIX}/events/{event.id}", json={"title": "Stolen"}, headers=auth_header(other)
    )
    assert forbidden.status_code == 403
    changed = await client.patch(
        f"{PREFIX}/events/{event.id}", json={"title": "Renamed"}, headers=auth_header(owner)
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["title"] == "Renamed"


async def test_unpublish_returns_event_to_draft(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, status=EventStatus.published)
    response = await client.post(
        f"{PREFIX}/events/{event.id}/unpublish", headers=auth_header(owner)
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "draft"


async def test_patch_invalid_dates_returns_422_instead_of_500(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    bad = await client.patch(
        f"{PREFIX}/events/{event.id}",
        json={"ends_at": "2020-01-01T01:00:00Z"},
        headers=auth_header(owner),
    )
    assert bad.status_code == 422, bad.text
    assert bad.json()["code"] == "invalid_event_update"


async def test_patch_blank_title_returns_422(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    result = await client.patch(
        f"{PREFIX}/events/{event.id}",
        json={"title": "  "},
        headers=auth_header(owner),
    )
    assert result.status_code == 422, result.text


async def test_invalid_date_filter_returns_422(client):
    response = await client.get(f"{PREFIX}/events?date_from=2026-01-01T12:00:00")
    assert response.status_code == 422, response.text
    response = await client.get(
        f"{PREFIX}/events?date_from=2027-01-01T00:00:00Z&date_to=2026-01-01T00:00:00Z"
    )
    assert response.status_code == 422, response.text


async def test_duplicated_event_is_new_draft_without_orders(client, db):
    owner, profile = await make_organizer(db)
    source = await make_event(db, profile, status=EventStatus.published)
    await make_ticket_type(db, source, quantity_total=20)
    await make_order(db, source)
    response = await client.post(
        f"{PREFIX}/events/{source.id}/duplicate", headers=auth_header(owner)
    )
    assert response.status_code == 201, response.text
    clone = response.json()
    assert clone["id"] != str(source.id)
    assert clone["status"] == "draft"
    assert clone["paid_sales_status"] == "disabled"
    clone_id = UUID(clone["id"])
    order_count = await db.scalar(
        select(func.count()).select_from(Order).where(Order.event_id == clone_id)
    )
    assert order_count == 0
    types = (await db.scalars(select(TicketType).where(TicketType.event_id == clone_id))).all()
    assert len(types) == 1
    assert types[0].quantity_total == 20
    assert types[0].qty_reserved == 0 and types[0].qty_sold == 0
    assert (await db.get(Event, clone_id)).duplicated_from_id == source.id


async def test_cancel_without_orders_and_block_cancel_with_orders(client, db):
    owner, profile = await make_organizer(db)
    empty = await make_event(db, profile, status=EventStatus.published)
    response = await client.post(f"{PREFIX}/events/{empty.id}/cancel", headers=auth_header(owner))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
    assert (await db.get(Event, empty.id)).cancelled_at is not None
    occupied = await make_event(db, profile, status=EventStatus.published)
    await make_order(db, occupied)
    denied = await client.post(f"{PREFIX}/events/{occupied.id}/cancel", headers=auth_header(owner))
    assert denied.status_code == 409, denied.text
    assert (await db.get(Event, occupied.id)).status == EventStatus.published


async def test_unpublish_with_orders_returns_409(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, status=EventStatus.published)
    await make_order(db, event)
    result = await client.post(f"{PREFIX}/events/{event.id}/unpublish", headers=auth_header(owner))
    assert result.status_code == 409, result.text
