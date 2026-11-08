import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import UnprocessableError
from app.models import Attendee, OrderItem, Ticket
from app.models.order import OrderStatus
from app.models.ticket import TicketStatus
from app.models.user import StaffRole
from app.services.ticket_qr import decode_qr_payload
from app.services.ticket_service import issue_tickets
from tests.factories import (
    _save,
    auth_header,
    make_event,
    make_order,
    make_organizer,
    make_seat,
    make_staff,
    make_ticket_type,
    make_user,
)


async def make_confirmed_order(
    db: AsyncSession, *, buyer=None, quantities=(2,), status=OrderStatus.free_confirmed, event=None
):
    """An order with one item per entry of `quantities` and one attendee per ticket."""
    event = event or await make_event(db)
    order = await make_order(db, event, status=status, buyer_user_id=buyer.id if buyer else None)
    ticket_type = await make_ticket_type(db, event, quantity_total=50)
    items = []
    for quantity in quantities:
        item = await _save(
            db,
            OrderItem(
                order_id=order.id,
                ticket_type_id=ticket_type.id,
                unit_price=0,
                quantity=quantity,
                line_total=0,
            ),
        )
        items.append(item)
        for n in range(quantity):
            await _save(
                db,
                Attendee(
                    order_id=order.id,
                    order_item_id=item.id,
                    full_name=f"Guest {len(items)}-{n}",
                    email="guest@example.com",
                ),
            )
    return event, order, items


async def test_issues_one_ticket_per_attendee(db):
    _, order, items = await make_confirmed_order(db, quantities=(2, 1))
    tickets = await issue_tickets(db, order)
    assert len(tickets) == 3
    assert {t.order_item_id for t in tickets} == {i.id for i in items}
    assert len({t.ticket_number for t in tickets}) == 3
    assert all(t.status == TicketStatus.valid for t in tickets)
    assert len({t.attendee_id for t in tickets}) == 3


async def test_qr_token_is_signed_for_its_own_ticket(db):
    _, order, _ = await make_confirmed_order(db)
    for ticket in await issue_tickets(db, order):
        assert decode_qr_payload(ticket.qr_token) == ticket.id


async def test_issuing_twice_returns_the_same_tickets(db):
    _, order, _ = await make_confirmed_order(db)
    first = await issue_tickets(db, order)
    second = await issue_tickets(db, order)
    assert {t.id for t in first} == {t.id for t in second}
    assert await db.scalar(select(func.count()).select_from(Ticket)) == 2


@pytest.mark.parametrize(
    "status",
    [OrderStatus.pending, OrderStatus.failed, OrderStatus.expired, OrderStatus.cancelled],
)
async def test_unconfirmed_order_gets_no_tickets(db, status):
    _, order, _ = await make_confirmed_order(db, status=status)
    with pytest.raises(UnprocessableError) as error:
        await issue_tickets(db, order)
    assert error.value.code == "order_not_confirmed"


async def test_paid_order_is_issued(db):
    _, order, _ = await make_confirmed_order(db, status=OrderStatus.paid)
    assert len(await issue_tickets(db, order)) == 2


async def test_missing_attendees_is_an_error_and_issues_nothing(db):
    _, order, items = await make_confirmed_order(db, quantities=(2,))
    items[0].quantity = 3
    await db.flush()
    with pytest.raises(UnprocessableError) as error:
        await issue_tickets(db, order)
    assert error.value.code == "attendees_missing"
    assert await db.scalar(select(func.count()).select_from(Ticket)) == 0


async def test_unlinked_attendees_fill_remaining_tickets(db):
    _, order, _ = await make_confirmed_order(db, quantities=(2,))
    for attendee in (await db.scalars(select(Attendee))).all():
        attendee.order_item_id = None
    await db.flush()
    tickets = await issue_tickets(db, order)
    assert len(tickets) == 2
    assert len({t.attendee_id for t in tickets}) == 2


async def test_seat_is_copied_onto_the_ticket(db):
    event = await make_event(db, seating_mode="assigned")
    seat = await make_seat(db, event)
    _, order, items = await make_confirmed_order(db, quantities=(1,), event=event)
    items[0].seat_id = seat.id
    items[0].section_name, items[0].row_label, items[0].seat_number = "A", "1", 1
    await db.flush()
    [ticket] = await issue_tickets(db, order)
    assert (ticket.seat_id, ticket.section_name, ticket.row_label, ticket.seat_number) == (
        seat.id,
        "A",
        "1",
        1,
    )


async def test_buyer_is_notified_once(db):
    buyer = await make_user(db)
    _, order, _ = await make_confirmed_order(db, buyer=buyer)
    with patch("app.services.ticket_service.notify", new=AsyncMock()) as notify:
        await issue_tickets(db, order)
    notify.assert_awaited_once()
    call_args = notify.await_args
    assert call_args is not None
    assert call_args.args[2] is buyer


# --- endpoints ---------------------------------------------------------------


async def test_owner_reads_ticket(client, db):
    buyer = await make_user(db)
    _, order, _ = await make_confirmed_order(db, buyer=buyer)
    [ticket, _] = await issue_tickets(db, order)
    response = await client.get(f"/api/v1/tickets/{ticket.id}", headers=auth_header(buyer))
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(ticket.id)
    assert body["ticket_type"] == "General"
    assert body["status"] == "valid"
    assert body["seat"] is None
    assert body["qr_url"].endswith(f"/tickets/{ticket.id}/qr")
    assert "qr_token" not in body


async def test_stranger_is_refused(client, db):
    buyer = await make_user(db)
    _, order, _ = await make_confirmed_order(db, buyer=buyer)
    [ticket, _] = await issue_tickets(db, order)
    stranger = await make_user(db)
    for suffix in ("", "/qr", "/pdf"):
        response = await client.get(
            f"/api/v1/tickets/{ticket.id}{suffix}", headers=auth_header(stranger)
        )
        assert response.status_code == 403, suffix
        assert response.json()["code"] == "ticket_access_denied"


async def test_event_organizer_and_staff_can_read(client, db):
    organizer, profile = await make_organizer(db)
    event = await make_event(db, profile)
    buyer = await make_user(db)
    _, order, _ = await make_confirmed_order(db, buyer=buyer, event=event)
    [ticket, _] = await issue_tickets(db, order)
    staff = await make_staff(db, event, StaffRole.checkin)
    for user in (organizer, staff):
        response = await client.get(f"/api/v1/tickets/{ticket.id}", headers=auth_header(user))
        assert response.status_code == 200


async def test_anonymous_and_unknown(client, db):
    user = await make_user(db)
    assert (await client.get(f"/api/v1/tickets/{uuid.uuid4()}")).status_code == 401
    response = await client.get(f"/api/v1/tickets/{uuid.uuid4()}", headers=auth_header(user))
    assert response.status_code == 404
    assert response.json()["code"] == "ticket_not_found"


async def test_qr_image(client, db):
    buyer = await make_user(db)
    _, order, _ = await make_confirmed_order(db, buyer=buyer)
    [ticket, _] = await issue_tickets(db, order)
    response = await client.get(f"/api/v1/tickets/{ticket.id}/qr", headers=auth_header(buyer))
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.content.startswith(b"\x89PNG")


async def test_pdf_is_a4(client, db):
    buyer = await make_user(db)
    _, order, _ = await make_confirmed_order(db, buyer=buyer)
    [ticket, _] = await issue_tickets(db, order)
    response = await client.get(f"/api/v1/tickets/{ticket.id}/pdf", headers=auth_header(buyer))
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert b"/MediaBox [ 0 0 595.27" in response.content


@pytest.mark.parametrize("status", [TicketStatus.refunded, TicketStatus.cancelled])
async def test_dead_ticket_has_no_qr_or_pdf(client, db, status):
    buyer = await make_user(db)
    _, order, _ = await make_confirmed_order(db, buyer=buyer)
    [ticket, _] = await issue_tickets(db, order)
    ticket.status = status
    await db.flush()
    for suffix in ("/qr", "/pdf"):
        response = await client.get(
            f"/api/v1/tickets/{ticket.id}{suffix}", headers=auth_header(buyer)
        )
        assert response.status_code == 409
        assert response.json()["code"] == "ticket_not_valid"
    # ...but the details stay readable, showing the new status.
    response = await client.get(f"/api/v1/tickets/{ticket.id}", headers=auth_header(buyer))
    assert response.json()["status"] == status.value


async def test_my_tickets_lists_only_own_and_paginates(client, db):
    me, other = await make_user(db), await make_user(db)
    _, mine, _ = await make_confirmed_order(db, buyer=me, quantities=(3,))
    _, theirs, _ = await make_confirmed_order(db, buyer=other)
    await issue_tickets(db, mine)
    await issue_tickets(db, theirs)

    response = await client.get("/api/v1/me/tickets?limit=2", headers=auth_header(me))
    body = response.json()
    assert response.status_code == 200
    assert (body["total"], len(body["items"]), body["limit"]) == (3, 2, 2)
    rest = await client.get("/api/v1/me/tickets?limit=2&offset=2", headers=auth_header(me))
    assert len(rest.json()["items"]) == 1
    seen = {t["id"] for t in body["items"] + rest.json()["items"]}
    assert len(seen) == 3

    assert (await client.get("/api/v1/me/tickets")).status_code == 401


async def test_my_tickets_empty(client, db):
    user = await make_user(db)
    response = await client.get("/api/v1/me/tickets", headers=auth_header(user))
    assert response.json()["items"] == []
