"""P3 API and inventory checks. Uses the repository's PostgreSQL test fixtures."""

from uuid import UUID

from app.models.event import EventStatus
from app.services.ticket_type_service import (
    check_in_inventory,
    confirm_inventory,
    refund_inventory,
    release_inventory,
    reserve_inventory,
)
from tests.factories import auth_header, make_event, make_organizer

PREFIX = "/api/v1"


def payload(**changes):
    data = {
        "name": "General admission",
        "description": "Standing room",
        "price_amount": "0",
        "currency": "KZT",
        "quantity_total": 10,
        "is_free": True,
        "max_per_order": 5,
    }
    data.update(changes)
    return data


async def test_owner_can_create_and_list_ticket_types(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, capacity=20)
    result = await client.post(
        f"{PREFIX}/events/{event.id}/ticket-types", headers=auth_header(owner), json=payload()
    )
    assert result.status_code == 201, result.text
    assert result.json()["qty_available"] == 10
    listed = await client.get(
        f"{PREFIX}/events/{event.id}/ticket-types", headers=auth_header(owner)
    )
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1


async def test_cannot_overfill_event_or_change_other_organizers_tickets(client, db):
    owner, profile = await make_organizer(db)
    stranger, _ = await make_organizer(db)
    event = await make_event(db, profile, capacity=10)
    created = await client.post(
        f"{PREFIX}/events/{event.id}/ticket-types", headers=auth_header(owner), json=payload()
    )
    assert created.status_code == 201, created.text
    denied = await client.patch(
        f"{PREFIX}/events/{event.id}/ticket-types/{created.json()['id']}",
        headers=auth_header(stranger),
        json={"quantity_total": 5},
    )
    assert denied.status_code == 403
    over = await client.post(
        f"{PREFIX}/events/{event.id}/ticket-types",
        headers=auth_header(owner),
        json=payload(name="Extra", quantity_total=1, max_per_order=1),
    )
    assert over.status_code == 422, over.text


async def test_anonymous_availability_excludes_hidden_and_unpublished(client, db):
    owner, profile = await make_organizer(db)
    draft = await make_event(db, profile)
    hidden = await client.post(
        f"{PREFIX}/events/{draft.id}/ticket-types",
        headers=auth_header(owner),
        json=payload(is_hidden=True),
    )
    assert hidden.status_code == 201, hidden.text
    before = await client.get(f"{PREFIX}/events/{draft.id}/availability")
    assert before.status_code == 404
    draft.status = EventStatus.published
    await db.flush()
    after = await client.get(f"{PREFIX}/events/{draft.id}/availability")
    assert after.status_code == 200, after.text
    assert after.json()["ticket_types"] == []


async def test_paid_sales_disabled_returns_zero_public_availability(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, status=EventStatus.published)
    result = await client.post(
        f"{PREFIX}/events/{event.id}/ticket-types",
        headers=auth_header(owner),
        json=payload(is_free=False, price_amount="5000"),
    )
    assert result.status_code == 201, result.text
    available = await client.get(f"{PREFIX}/events/{event.id}/availability")
    assert available.status_code == 200, available.text
    item = available.json()["ticket_types"][0]
    assert item["quantity_available"] == 0 and item["sales_open"] is False


async def test_inventory_transitions_and_sold_out(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, status=EventStatus.published)
    result = await client.post(
        f"{PREFIX}/events/{event.id}/ticket-types",
        headers=auth_header(owner),
        json=payload(quantity_total=2, max_per_order=2),
    )
    assert result.status_code == 201, result.text
    ticket_id = UUID(result.json()["id"])
    assert await reserve_inventory(db, event.id, ticket_id, 2)
    assert not await reserve_inventory(db, event.id, ticket_id, 1)
    assert await release_inventory(db, ticket_id, 1)
    assert await reserve_inventory(db, event.id, ticket_id, 1)
    assert await confirm_inventory(db, ticket_id, 2)
    assert await check_in_inventory(db, ticket_id, 1)
    assert not await refund_inventory(db, ticket_id, 2)  # one already checked-in
    assert await refund_inventory(db, ticket_id, 1)
    await db.rollback()  # primitives never commit; transaction belongs to checkout


async def test_cannot_reduce_quantity_below_allocated(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, status=EventStatus.published)
    created = await client.post(
        f"{PREFIX}/events/{event.id}/ticket-types", headers=auth_header(owner), json=payload()
    )
    assert created.status_code == 201, created.text
    ticket_id = UUID(created.json()["id"])
    assert await reserve_inventory(db, event.id, ticket_id, 5)
    response = await client.patch(
        f"{PREFIX}/events/{event.id}/ticket-types/{ticket_id}",
        headers=auth_header(owner),
        json={"quantity_total": 4, "max_per_order": 4},
    )
    assert response.status_code == 409, response.text
    await db.rollback()


async def test_paid_reservations_remain_blocked_until_p6_activation(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, status=EventStatus.published)
    created = await client.post(
        f"{PREFIX}/events/{event.id}/ticket-types",
        headers=auth_header(owner),
        json=payload(is_free=False, price_amount="2000"),
    )
    assert created.status_code == 201, created.text
    import pytest

    from app.core.errors import ConflictError
    from app.services.ticket_type_service import reserve_inventory

    with pytest.raises(ConflictError):
        await reserve_inventory(db, event.id, UUID(created.json()["id"]), 1)
    await db.rollback()
