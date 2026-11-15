"""P14 calendar API tests (use real PostgreSQL fixtures from tests/conftest.py).

Run from backend/: uv run pytest tests/api/test_calendar_p14.py -q
"""

import uuid
from datetime import UTC, datetime, timedelta

from icalendar import Calendar

from app.models.event import EventStatus, EventVisibility
from tests.factories import auth_header, make_event, make_organizer, make_user

PREFIX = "/api/v1"


def _read_calendar(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/calendar")
    assert "attachment" in response.headers["content-disposition"]
    document = Calendar.from_ical(response.content)
    entries = document.walk("VEVENT")
    assert len(entries) == 1
    return document, entries[0]


async def test_export_contains_local_times_venue_url_and_vtimezone(client, db):
    _, owner_profile = await make_organizer(db)
    starts_at = datetime(2026, 12, 15, 14, 30, tzinfo=UTC)
    event = await make_event(
        db,
        owner_profile,
        status=EventStatus.published,
        title="Winter Festival, Astana",
        description="Talks, networking\nBring a friend!",
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        timezone="Asia/Almaty",
    )

    response = await client.get(f"{PREFIX}/events/{event.id}/calendar.ics")
    calendar, entry = _read_calendar(response)
    assert len(calendar.walk("VTIMEZONE")) == 1
    assert str(calendar.walk("VTIMEZONE")[0]["TZID"]) == "Asia/Almaty"
    assert str(entry["UID"]) == f"{event.id}@biletflow.kz"
    assert int(entry["SEQUENCE"]) == 0
    assert entry.decoded("DTSTART").hour == 19
    assert entry.decoded("DTSTART").minute == 30
    assert entry.decoded("DTEND").hour == 21
    assert entry["DTSTART"].params["TZID"] == "Asia/Almaty"
    assert str(entry["SUMMARY"]) == "Winter Festival, Astana"
    assert str(entry["DESCRIPTION"]) == "Talks, networking\nBring a friend!"
    assert "Hall" in str(entry["LOCATION"])
    assert "1 Abay Avenue" in str(entry["LOCATION"])
    assert str(entry["URL"]).endswith(f"/events/{event.id}")
    assert str(entry["STATUS"]) == "CONFIRMED"
    assert "X-Request-ID" in response.headers


async def test_uid_stays_stable_and_sequence_increases_on_edit_and_cancel(client, db):
    owner, owner_profile = await make_organizer(db)
    event = await make_event(db, owner_profile, status=EventStatus.published)
    url = f"{PREFIX}/events/{event.id}/calendar.ics"
    _, initial = _read_calendar(await client.get(url))

    patch = await client.patch(
        f"{PREFIX}/events/{event.id}",
        json={"title": "Updated Festival"},
        headers=auth_header(owner),
    )
    assert patch.status_code == 200, patch.text
    _, changed = _read_calendar(await client.get(url))
    assert str(changed["UID"]) == str(initial["UID"])
    assert int(changed["SEQUENCE"]) == int(initial["SEQUENCE"]) + 1
    assert str(changed["SUMMARY"]) == "Updated Festival"

    cancel = await client.post(f"{PREFIX}/events/{event.id}/cancel", headers=auth_header(owner))
    assert cancel.status_code == 200, cancel.text
    _, cancelled = _read_calendar(await client.get(url))
    assert str(cancelled["UID"]) == str(initial["UID"])
    assert int(cancelled["SEQUENCE"]) == int(changed["SEQUENCE"]) + 1
    assert str(cancelled["STATUS"]) == "CANCELLED"


async def test_hidden_events_are_not_disclosed_to_anonymous_users(client, db):
    owner, owner_profile = await make_organizer(db)
    stranger = await make_user(db)
    draft = await make_event(db, owner_profile, status=EventStatus.draft)
    private = await make_event(
        db, owner_profile, status=EventStatus.published, visibility=EventVisibility.private
    )
    unlisted = await make_event(
        db, owner_profile, status=EventStatus.published, visibility=EventVisibility.unlisted
    )
    for event in (draft, private, unlisted):
        url = f"{PREFIX}/events/{event.id}/calendar.ics"
        assert (await client.get(url)).status_code == 404
        assert (await client.get(url, headers=auth_header(stranger))).status_code == 404
        _, owned_entry = _read_calendar(await client.get(url, headers=auth_header(owner)))
        if event.status == EventStatus.draft:
            assert str(owned_entry["STATUS"]) == "TENTATIVE"

    unlisted_url = f"{PREFIX}/events/{unlisted.id}/calendar.ics"
    assert (await client.get(unlisted_url, params={"share_token": "wrong"})).status_code == 404
    _, unlisted_entry = _read_calendar(
        await client.get(unlisted_url, params={"share_token": unlisted.share_token})
    )
    assert unlisted.share_token in str(unlisted_entry["URL"])


async def test_missing_event_and_invalid_authorization(client):
    missing = uuid.uuid4()
    url = f"{PREFIX}/events/{missing}/calendar.ics"
    response = await client.get(url)
    assert response.status_code == 404
    assert response.json()["code"] == "event_not_found"
    response = await client.get(url, headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401


async def test_utc_event_has_z_times_without_spurious_vtimezone(client, db):
    _, profile = await make_organizer(db)
    starts = datetime(2026, 12, 1, 10, tzinfo=UTC)
    event = await make_event(
        db,
        profile,
        status=EventStatus.published,
        starts_at=starts,
        ends_at=starts + timedelta(hours=1),
        timezone="UTC",
    )
    response = await client.get(f"{PREFIX}/events/{event.id}/calendar.ics")
    document, entry = _read_calendar(response)
    assert document.walk("VTIMEZONE") == []
    assert entry.decoded("DTSTART") == starts
    assert b"DTSTART:20261201T100000Z" in response.content
