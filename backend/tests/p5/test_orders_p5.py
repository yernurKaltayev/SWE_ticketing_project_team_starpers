"""P5 API and transaction tests (uses the project's PostgreSQL db/client fixtures)."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.core.deps import get_current_user
from app.models.event import Event, EventStatus, EventVisibility, PaidSalesStatus, SeatingMode
from app.models.order import Order, OrderItem, OrderStatus
from app.models.seat_hold import SeatHold, SeatHoldGroup, SeatHoldStatus
from app.models.ticket import Ticket
from app.models.ticket_type import TicketType
from app.models.user import OrganizerProfile, User, UserRole
from app.models.venue import Seat, Venue, VenueLayout, VenueRow, VenueSection
from app.services.order_service import confirm_paid_order, expire_due_orders, fail_pending_order


@pytest.fixture
async def order_scene(db, app):
    buyer = User(
        email=f"buyer-{uuid4().hex[:12]}@example.org",
        password_hash="unused",
        full_name="Buyer Test",
        role=UserRole.attendee,
        is_suspended=False,
    )
    owner = User(
        email=f"owner-{uuid4().hex[:12]}@example.org",
        password_hash="unused",
        full_name="Organizer Test",
        role=UserRole.organizer,
        is_suspended=False,
    )
    stranger = User(
        email=f"stranger-{uuid4().hex[:12]}@example.org",
        password_hash="unused",
        full_name="Stranger Test",
        role=UserRole.attendee,
        is_suspended=False,
    )
    db.add_all((buyer, owner, stranger))
    await db.flush()
    profile = OrganizerProfile(
        user_id=owner.id,
        organization_name="P5 Demo",
        contact_email=owner.email,
        contact_phone="+77000000000",
    )
    venue = Venue(name="P5 Theater", address="Example 1", city="Astana")
    db.add_all((profile, venue))
    await db.flush()
    start = datetime.now(UTC) + timedelta(days=3)
    event = Event(
        organizer_id=profile.id,
        title="P5 Test Event",
        description="Test",
        category="other",
        venue_id=venue.id,
        starts_at=start,
        ends_at=start + timedelta(hours=2),
        timezone="Asia/Almaty",
        status=EventStatus.published,
        visibility=EventVisibility.public,
        seating_mode=SeatingMode.general_admission,
        capacity=10,
        refund_policy={},
        paid_sales_status=PaidSalesStatus.disabled,
    )
    db.add(event)
    await db.flush()
    free = TicketType(
        event_id=event.id,
        name="Free GA",
        description="",
        price_amount=0,
        quantity_total=4,
        is_free=True,
        max_per_order=4,
        qty_reserved=0,
        qty_sold=0,
        qty_refunded=0,
        qty_checked_in=0,
        is_hidden=False,
    )
    paid = TicketType(
        event_id=event.id,
        name="Paid GA",
        description="",
        price_amount=250000,
        quantity_total=5,
        is_free=False,
        max_per_order=5,
        qty_reserved=0,
        qty_sold=0,
        qty_refunded=0,
        qty_checked_in=0,
        is_hidden=False,
    )
    db.add_all((free, paid))
    await db.commit()

    async def as_buyer():
        return buyer

    app.dependency_overrides[get_current_user] = as_buyer
    return {
        "buyer": buyer,
        "owner": owner,
        "stranger": stranger,
        "event": event,
        "free": free,
        "paid": paid,
    }


def _payload(event_id, ticket_id, *, quantity=1, names=None, **extras):
    names = names or [f"Attendee {i}" for i in range(quantity)]
    return {
        "event_id": str(event_id),
        "items": [{"ticket_type_id": str(ticket_id), "quantity": quantity}],
        "attendees": [
            {"full_name": name, "email": f"a{i}@example.com"} for i, name in enumerate(names)
        ],
        **extras,
    }


@pytest.mark.asyncio
async def test_free_checkout_issues_tickets_once(client, db, order_scene):
    scene = order_scene
    payload = _payload(scene["event"].id, scene["free"].id, quantity=2)
    response = await client.post(
        "/api/v1/orders", json=payload, headers={"Idempotency-Key": "test-p5-001"}
    )
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["status"] == "free_confirmed"
    assert order["total"] == 0
    assert len(order["tickets"]) == 2
    assert order["is_simulated"] is True
    replay = await client.post(
        "/api/v1/orders", json=payload, headers={"Idempotency-Key": "test-p5-001"}
    )
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == order["id"]
    assert {t["id"] for t in replay.json()["tickets"]} == {t["id"] for t in order["tickets"]}
    await db.refresh(scene["free"])
    assert scene["free"].qty_sold == 2
    assert scene["free"].qty_reserved == 0
    changed = _payload(scene["event"].id, scene["free"].id, quantity=1)
    conflict = await client.post(
        "/api/v1/orders", json=changed, headers={"Idempotency-Key": "test-p5-001"}
    )
    assert conflict.status_code == 409


@pytest.mark.asyncio
async def test_free_cancellation_releases_capacity_and_revokes_tickets(
    client, db, order_scene, app
):
    s = order_scene
    payload = _payload(s["event"].id, s["free"].id, names=["=SUM(1,2)"])
    created = await client.post("/api/v1/orders", json=payload)
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    cancel = await client.post(f"/api/v1/orders/{order_id}/cancel")
    assert cancel.status_code == 200, cancel.text
    assert cancel.json()["status"] == "cancelled"
    assert cancel.json()["tickets"][0]["status"] == "cancelled"
    again = await client.post(f"/api/v1/orders/{order_id}/cancel")
    assert again.status_code == 200
    await db.refresh(s["free"])
    assert s["free"].qty_refunded == 1
    assert s["free"].qty_sold == 1
    get_mine = await client.get("/api/v1/me/orders")
    assert get_mine.status_code == 200
    assert any(item["id"] == order_id for item in get_mine.json()["items"])

    async def as_owner():
        return s["owner"]

    app.dependency_overrides[get_current_user] = as_owner
    attendee_list = await client.get(f"/api/v1/events/{s['event'].id}/attendees?status=cancelled")
    assert attendee_list.status_code == 200, attendee_list.text
    assert attendee_list.json()["total"] == 1
    download = await client.get(f"/api/v1/events/{s['event'].id}/attendees.csv")
    assert download.status_code == 200, download.text
    assert "'=SUM(1,2)" in download.text


@pytest.mark.asyncio
async def test_paid_pending_and_p6_hook(client, db, order_scene):
    s = order_scene
    s["event"].paid_sales_status = PaidSalesStatus.active
    await db.commit()
    payload = _payload(s["event"].id, s["paid"].id)
    response = await client.post("/api/v1/orders", json=payload)
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "pending"
    assert response.json()["total"] == 250000
    assert response.json()["tickets"] == []
    order_id = response.json()["id"]
    await db.refresh(s["paid"])
    assert s["paid"].qty_reserved == 1
    order = await confirm_paid_order(db, UUID(order_id))
    assert order.status == OrderStatus.paid
    await db.commit()
    await confirm_paid_order(db, UUID(order_id))  # idempotent webhook retry
    await db.commit()
    tickets = list(
        await db.scalars(
            select(Ticket)
            .join(OrderItem, Ticket.order_item_id == OrderItem.id)
            .where(OrderItem.order_id == order_id)
        )
    )
    assert len(tickets) == 1
    await db.refresh(s["paid"])
    assert s["paid"].qty_reserved == 0 and s["paid"].qty_sold == 1


@pytest.mark.asyncio
async def test_pending_order_expiry_and_idempotent_release(client, db, order_scene):
    s = order_scene
    s["event"].paid_sales_status = PaidSalesStatus.active
    await db.commit()
    response = await client.post("/api/v1/orders", json=_payload(s["event"].id, s["paid"].id))
    assert response.status_code == 201, response.text
    row = await db.get(Order, UUID(response.json()["id"]))
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    assert await expire_due_orders(db) == 1
    assert await expire_due_orders(db) == 0
    await db.refresh(s["paid"])
    assert s["paid"].qty_reserved == 0 and s["paid"].qty_sold == 0
    assert row.status == OrderStatus.expired


@pytest.mark.asyncio
async def test_access_guard_and_promos_fail_closed(client, db, order_scene, app):
    s = order_scene
    response = await client.post(
        "/api/v1/orders", json=_payload(s["event"].id, s["free"].id, promo_code="SAVE50")
    )
    assert response.status_code == 422
    await db.refresh(s["event"])
    await db.refresh(s["stranger"])

    async def as_stranger():
        return s["stranger"]

    app.dependency_overrides[get_current_user] = as_stranger
    denied = await client.get(f"/api/v1/events/{s['event'].id}/orders")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_assigned_seat_checkout_consumes_existing_p4_hold(client, db, order_scene):
    s = order_scene
    layout = VenueLayout(venue_id=s["event"].venue_id, name="Test Layout")
    db.add(layout)
    await db.flush()
    section = VenueSection(layout_id=layout.id, name="VIP", price_category="VIP")
    db.add(section)
    await db.flush()
    row = VenueRow(section_id=section.id, label="A", position=1)
    db.add(row)
    await db.flush()
    seat = Seat(row_id=row.id, number=1, price_category="VIP", is_accessible=False)
    db.add(seat)
    s["event"].seating_mode = SeatingMode.assigned
    s["event"].layout_id = layout.id
    s["free"].price_category = "VIP"
    await db.flush()
    group = SeatHoldGroup(
        event_id=s["event"].id,
        user_id=s["buyer"].id,
        status="held",
        expires_at=datetime.now(UTC) + timedelta(minutes=9),
    )
    db.add(group)
    await db.flush()
    hold = SeatHold(
        event_id=s["event"].id,
        seat_id=seat.id,
        user_id=s["buyer"].id,
        ticket_type_id=s["free"].id,
        hold_group_id=group.id,
        status=SeatHoldStatus.held,
        expires_at=group.expires_at,
    )
    db.add(hold)
    s["free"].qty_reserved = 1  # P4 already reserved inventory when creating hold
    await db.commit()
    data = _payload(s["event"].id, s["free"].id)
    data["items"][0]["seat_ids"] = [str(seat.id)]
    data["hold_ids"] = [str(group.id)]
    response = await client.post("/api/v1/orders", json=data)
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "free_confirmed"
    assert response.json()["tickets"][0]["seat"]["seat_id"] == str(seat.id)
    await db.refresh(hold)
    await db.refresh(group)
    await db.refresh(s["free"])
    assert hold.status == SeatHoldStatus.converted
    assert group.status == "sold"
    assert s["free"].qty_reserved == 0 and s["free"].qty_sold == 1


@pytest.mark.asyncio
async def test_paid_sale_requires_activation_and_cancel_restores_reservation(
    client, db, order_scene
):
    s = order_scene
    payload = _payload(s["event"].id, s["paid"].id)
    denied = await client.post("/api/v1/orders", json=payload)
    assert denied.status_code == 409
    await db.refresh(s["event"])
    await db.refresh(s["buyer"])
    s["event"].paid_sales_status = PaidSalesStatus.active
    await db.commit()
    pending = await client.post("/api/v1/orders", json=payload)
    assert pending.status_code == 201, pending.text
    order_id = pending.json()["id"]
    cancel = await client.post(f"/api/v1/orders/{order_id}/cancel")
    assert cancel.status_code == 200, cancel.text
    assert cancel.json()["status"] == "cancelled"
    assert cancel.json()["tickets"] == []
    await db.refresh(s["paid"])
    assert s["paid"].qty_reserved == 0 and s["paid"].qty_sold == 0


@pytest.mark.asyncio
async def test_p6_failure_is_idempotent(client, db, order_scene):
    s = order_scene
    s["event"].paid_sales_status = PaidSalesStatus.active
    await db.commit()
    pending = await client.post("/api/v1/orders", json=_payload(s["event"].id, s["paid"].id))
    assert pending.status_code == 201, pending.text
    order_id = UUID(pending.json()["id"])
    await fail_pending_order(db, order_id)
    await db.commit()
    await fail_pending_order(db, order_id)
    await db.commit()
    assert (await db.get(Order, order_id)).status == OrderStatus.failed
    await db.refresh(s["paid"])
    assert s["paid"].qty_reserved == 0
