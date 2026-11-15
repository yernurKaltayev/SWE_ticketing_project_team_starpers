"""P12: event history endpoint, filters, authorization, lifecycle and append-only audit log."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.models import AuditLog
from app.models.event import EventStatus
from app.models.user import StaffRole, UserRole
from app.services.audit_service import audit
from tests.factories import auth_header, make_event, make_organizer, make_staff, make_user

PREFIX = "/api/v1"


def _url(event) -> str:
    return f"{PREFIX}/events/{event.id}/history"


def _log(db, event, action_type, when=None, **fields):
    entry = audit(
        db,
        action_type=action_type,
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        description=action_type,
        **fields,
    )
    if when is not None:
        entry.occurred_at = when
    return entry


async def _owned_event(db, **overrides):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, **overrides)
    return owner, event


# --------------------------------------------------------------- authorization


async def test_history_requires_a_signed_in_user(client, db):
    _, event = await _owned_event(db)
    assert (await client.get(_url(event))).status_code == 401


async def test_history_access_rules(client, db):
    owner, event = await _owned_event(db)
    _log(db, event, "event_created")
    await db.flush()
    manager = await make_staff(db, event, StaffRole.manager)
    admin = await make_user(db, role=UserRole.platform_admin)
    for allowed in (owner, manager, admin):
        response = await client.get(_url(event), headers=auth_header(allowed))
        assert response.status_code == 200, allowed.role
        assert response.json()["total"] == 1

    other_owner, _ = await make_organizer(db)
    forbidden = [
        await make_user(db),
        other_owner,
        await make_staff(db, event, StaffRole.checkin),
        await make_staff(db, event, StaffRole.support),
    ]
    for user in forbidden:
        response = await client.get(_url(event), headers=auth_header(user))
        assert response.status_code == 403
        assert response.json()["code"] == "event_access_denied"


async def test_history_of_unknown_event_is_404(client, db):
    admin = await make_user(db, role=UserRole.platform_admin)
    response = await client.get(
        f"{PREFIX}/events/{uuid.uuid4()}/history", headers=auth_header(admin)
    )
    assert response.status_code == 404


async def test_history_has_no_write_routes(client, db):
    owner, event = await _owned_event(db)
    for method in ("put", "patch", "delete", "post"):
        response = await getattr(client, method)(_url(event), headers=auth_header(owner))
        assert response.status_code == 405


# ----------------------------------------------------------------------- content


async def test_history_only_shows_this_events_entries_newest_first(client, db):
    owner, event = await _owned_event(db)
    other = await make_event(db)
    now = datetime.now(UTC)
    _log(db, event, "event_created", now - timedelta(hours=2))
    _log(db, event, "event_published", now - timedelta(hours=1), actor=owner)
    _log(db, other, "event_created", now)
    await db.flush()

    body = (await client.get(_url(event), headers=auth_header(owner))).json()
    assert [e["action_type"] for e in body["items"]] == ["event_published", "event_created"]
    entry = body["items"][0]
    assert entry["actor_id"] == str(owner.id)
    assert "metadata" in entry and "meta" not in entry
    assert body["total"] == 2


async def test_history_paginates(client, db):
    owner, event = await _owned_event(db)
    now = datetime.now(UTC)
    for index in range(5):
        _log(db, event, "event_updated", now - timedelta(minutes=index))
    await db.flush()
    page = (
        await client.get(_url(event), params={"limit": 2, "offset": 2}, headers=auth_header(owner))
    ).json()
    assert page["total"] == 5 and len(page["items"]) == 2
    assert (page["limit"], page["offset"]) == (2, 2)


# ----------------------------------------------------------------------- filters


async def test_date_range_is_inclusive_start_exclusive_end(client, db):
    owner, event = await _owned_event(db)
    base = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)
    for hours in (0, 1, 2):
        _log(db, event, "event_updated", base + timedelta(hours=hours), metadata={"h": hours})
    await db.flush()
    response = await client.get(
        _url(event),
        params={
            "date_from": base.isoformat(),
            "date_to": (base + timedelta(hours=2)).isoformat(),
        },
        headers=auth_header(owner),
    )
    assert sorted(e["metadata"]["h"] for e in response.json()["items"]) == [0, 1]


async def test_reversed_date_range_is_422(client, db):
    owner, event = await _owned_event(db)
    now = datetime.now(UTC)
    response = await client.get(
        _url(event),
        params={"date_from": now.isoformat(), "date_to": (now - timedelta(days=1)).isoformat()},
        headers=auth_header(owner),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_date_range"


async def test_action_type_and_category_filters(client, db):
    owner, event = await _owned_event(db)
    for name in (
        "event_published",
        "event_cancelled",
        "order.paid",
        "payment.succeeded",
        "checkin.accepted",
        "event_report.created",
    ):
        _log(db, event, name)
    await db.flush()
    headers = auth_header(owner)

    exact = (
        await client.get(_url(event), params={"action_type": "order.paid"}, headers=headers)
    ).json()
    assert [e["action_type"] for e in exact["items"]] == ["order.paid"]

    events = (await client.get(_url(event), params={"category": "event"}, headers=headers)).json()
    assert sorted(e["action_type"] for e in events["items"]) == [
        "event_cancelled",
        "event_published",
    ]
    payments = (
        await client.get(_url(event), params={"category": "payment"}, headers=headers)
    ).json()
    assert [e["action_type"] for e in payments["items"]] == ["payment.succeeded"]
    admin_cat = (
        await client.get(_url(event), params={"category": "admin"}, headers=headers)
    ).json()
    assert [e["action_type"] for e in admin_cat["items"]] == ["event_report.created"]

    both = await client.get(
        _url(event), params={"category": "event", "action_type": "order.paid"}, headers=headers
    )
    assert both.json()["total"] == 0


async def test_unknown_category_is_422(client, db):
    owner, event = await _owned_event(db)
    response = await client.get(
        _url(event), params={"category": "nope"}, headers=auth_header(owner)
    )
    assert response.status_code == 422
    assert response.json()["code"] == "unknown_category"
    assert "event" in response.json()["details"]["categories"]


# --------------------------------------------------------------------- lifecycle


@pytest.mark.parametrize(
    ("overrides", "lifecycle", "status"),
    [
        ({"status": EventStatus.published}, "upcoming", "published"),
        (
            {
                "status": EventStatus.published,
                "starts_at": datetime.now(UTC) - timedelta(hours=1),
                "ends_at": datetime.now(UTC) + timedelta(hours=1),
            },
            "active",
            "published",
        ),
        (
            {
                "status": EventStatus.published,
                "starts_at": datetime.now(UTC) - timedelta(days=2),
                "ends_at": datetime.now(UTC) - timedelta(days=1),
            },
            "completed",
            "published",
        ),
        ({"status": EventStatus.cancelled}, "cancelled", "cancelled"),
    ],
)
async def test_history_stays_readable_and_reports_lifecycle(
    client, db, overrides, lifecycle, status
):
    owner, event = await _owned_event(db, **overrides)
    _log(db, event, "event_created")
    await db.flush()
    response = await client.get(_url(event), headers=auth_header(owner))
    assert response.status_code == 200
    body = response.json()
    assert (body["lifecycle"], body["event_status"]) == (lifecycle, status)
    assert body["total"] == 1


# -------------------------------------------------------------- end to end flow


async def test_real_event_actions_appear_in_history(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, capacity=100)
    headers = auth_header(owner)
    ticket = await client.post(
        f"{PREFIX}/events/{event.id}/ticket-types",
        json={"name": "GA", "quantity_total": 10, "price_amount": 0},
        headers=headers,
    )
    assert ticket.status_code == 201, ticket.text
    assert (
        await client.post(f"{PREFIX}/events/{event.id}/publish", headers=headers)
    ).status_code == 200
    assert (
        await client.patch(f"{PREFIX}/events/{event.id}", json={"capacity": 50}, headers=headers)
    ).status_code == 200
    assert (
        await client.patch(
            f"{PREFIX}/events/{event.id}/ticket-types/{ticket.json()['id']}",
            json={"quantity_total": 20},
            headers=headers,
        )
    ).status_code == 200
    assert (
        await client.post(f"{PREFIX}/events/{event.id}/cancel", headers=headers)
    ).status_code == 200

    body = (await client.get(_url(event), headers=headers)).json()
    names = [e["action_type"] for e in body["items"]]
    assert names[0] == "event_cancelled"
    for expected in (
        "ticket_type_created",
        "event_published",
        "event_updated",
        "ticket_type_updated",
    ):
        assert expected in names
    assert body["lifecycle"] == "cancelled"
    assert all(e["actor_id"] == str(owner.id) for e in body["items"])

    updated = next(e for e in body["items"] if e["action_type"] == "ticket_type_updated")
    assert updated["metadata"]["changes"]["quantity_total"] == {"from": 10, "to": 20}
    capacity = next(e for e in body["items"] if e["action_type"] == "event_updated")
    assert capacity["metadata"]["capacity_to"] == 50

    cancelled_only = (
        await client.get(_url(event), params={"action_type": "event_cancelled"}, headers=headers)
    ).json()
    assert cancelled_only["total"] == 1


# ------------------------------------------------------------------ append-only


async def test_audit_log_rejects_update_delete_and_truncate(db):
    event = await make_event(db)
    entry = _log(db, event, "event_created")
    await db.flush()

    for statement in (
        "UPDATE audit_logs SET description = 'tampered'",
        "DELETE FROM audit_logs",
        "TRUNCATE audit_logs",
    ):
        with pytest.raises(DBAPIError, match="append-only"):
            async with db.begin_nested():
                await db.execute(text(statement))

    await db.refresh(entry)
    assert entry.description == "event_created"
    # Appending still works.
    _log(db, event, "event_updated")
    await db.flush()
    assert len(list(await db.scalars(select(AuditLog).where(AuditLog.event_id == event.id)))) == 2


async def test_audit_rejects_metadata_that_is_not_json(db):
    event = await make_event(db)
    with pytest.raises(TypeError, match="JSON-serializable"):
        audit(
            db,
            action_type="event_updated",
            entity_type="event",
            entity_id=event.id,
            description="x",
            metadata={"id": uuid.uuid4()},
        )
