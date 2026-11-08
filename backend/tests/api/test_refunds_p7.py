"""P7: full refunds, refund policy, event cancellation settling every order."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models.event import EventStatus, PaidSalesStatus
from app.models.order import Order, OrderItem, OrderStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.user import StaffRole
from app.services.payments.base import ProviderRefund
from app.services.payments.sandbox import SandboxProvider
from tests.factories import (
    auth_header,
    make_event,
    make_organizer,
    make_staff,
    make_ticket_type,
    make_user,
)

API = "/api/v1"


@pytest.fixture
async def scene(db):
    owner, profile = await make_organizer(db)
    event = await make_event(
        db,
        profile,
        status=EventStatus.published,
        paid_sales_status=PaidSalesStatus.active,
        capacity=50,
    )
    paid = await make_ticket_type(
        db, event, name="Paid", price_amount=400_000, is_free=False, quantity_total=10
    )
    free = await make_ticket_type(db, event, name="Free", is_free=True, quantity_total=10)
    buyer = await make_user(db)
    stranger = await make_user(db)
    manager = await make_staff(db, event, StaffRole.manager)
    checkin = await make_staff(db, event, StaffRole.checkin)
    await db.commit()
    return {
        "event_id": event.id,
        "paid_id": paid.id,
        "free_id": free.id,
        "paid": paid,
        "h": {
            name: auth_header(user)
            for name, user in {
                "owner": owner,
                "buyer": buyer,
                "stranger": stranger,
                "manager": manager,
                "checkin": checkin,
            }.items()
        },
    }


def _order(s, ticket_type_id, quantity=1):
    return {
        "event_id": str(s["event_id"]),
        "items": [{"ticket_type_id": str(ticket_type_id), "quantity": quantity}],
        "attendees": [
            {"full_name": f"G{i}", "email": f"g{i}@example.com"} for i in range(quantity)
        ],
    }


async def _paid_order(client, s, quantity=1) -> str:
    created = await client.post(
        f"{API}/orders", json=_order(s, s["paid_id"], quantity), headers=s["h"]["buyer"]
    )
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    payment = await client.post(f"{API}/orders/{order_id}/payments", headers=s["h"]["buyer"])
    assert payment.status_code == 201, payment.text
    done = await client.post(
        f"{API}/payments/{payment.json()['id']}/simulate",
        json={"outcome": "succeeded"},
        headers=s["h"]["buyer"],
    )
    assert done.json()["status"] == "succeeded", done.text
    return order_id


async def _tickets(db, order_id) -> list[Ticket]:
    return list(
        await db.scalars(
            select(Ticket)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(OrderItem.order_id == UUID(order_id))
            .execution_options(populate_existing=True)
        )
    )


async def test_full_refund_invalidates_tickets_and_restores_inventory(client, db, scene):
    s = scene
    order_id = await _paid_order(client, s, quantity=2)

    for who in ("buyer", "stranger", "checkin"):
        denied = await client.post(
            f"{API}/orders/{order_id}/refund", json={"reason": "x"}, headers=s["h"][who]
        )
        assert denied.status_code == 403, who

    refund = await client.post(
        f"{API}/orders/{order_id}/refund",
        json={"reason": "Customer request"},
        headers=s["h"]["manager"],
    )
    assert refund.status_code == 201, refund.text
    body = refund.json()
    assert body["status"] == "completed" and body["amount"] == 800_000
    assert body["currency"] == "KZT" and body["completed_at"] is not None

    order = (await client.get(f"{API}/orders/{order_id}", headers=s["h"]["buyer"])).json()
    assert order["status"] == "refunded"
    assert {t["status"] for t in order["tickets"]} == {"refunded"}
    await db.refresh(s["paid"])
    assert s["paid"].qty_sold == 2 and s["paid"].qty_refunded == 2

    retry = await client.post(
        f"{API}/orders/{order_id}/refund", json={"reason": "again"}, headers=s["h"]["owner"]
    )
    assert retry.status_code == 201 and retry.json()["id"] == body["id"]

    listed = await client.get(f"{API}/events/{s['event_id']}/refunds", headers=s["h"]["owner"])
    assert listed.json()["total"] == 1
    summary = await client.get(f"{API}/events/{s['event_id']}/financials", headers=s["h"]["owner"])
    assert summary.json()["refunds"] == 800_000
    assert summary.json()["estimated_payout"] == 0


async def test_checked_in_ticket_blocks_refund(client, db, scene):
    s = scene
    order_id = await _paid_order(client, s)
    ticket = (await _tickets(db, order_id))[0]
    ticket.status = TicketStatus.checked_in
    await db.commit()
    response = await client.post(
        f"{API}/orders/{order_id}/refund", json={"reason": "x"}, headers=s["h"]["owner"]
    )
    assert response.status_code == 409
    assert response.json()["code"] == "already_checked_in"


async def test_only_paid_orders_are_refundable(client, scene):
    s = scene
    free = await client.post(f"{API}/orders", json=_order(s, s["free_id"]), headers=s["h"]["buyer"])
    response = await client.post(
        f"{API}/orders/{free.json()['id']}/refund", json={"reason": "x"}, headers=s["h"]["owner"]
    )
    assert response.status_code == 409
    assert response.json()["code"] == "free_order_use_cancel"

    pending = await client.post(
        f"{API}/orders", json=_order(s, s["paid_id"]), headers=s["h"]["buyer"]
    )
    response = await client.post(
        f"{API}/orders/{pending.json()['id']}/refund",
        json={"reason": "x"},
        headers=s["h"]["owner"],
    )
    assert response.status_code == 409
    assert response.json()["code"] == "order_not_refundable"

    empty = await client.post(
        f"{API}/orders/{pending.json()['id']}/refund", json={"reason": ""}, headers=s["h"]["owner"]
    )
    assert empty.status_code == 422


async def test_provider_failure_keeps_tickets_valid(client, db, scene, monkeypatch):
    s = scene
    order_id = await _paid_order(client, s)

    async def refuse(self, provider_ref, amount):
        return ProviderRefund(provider_ref="", succeeded=False, failure_reason="declined")

    monkeypatch.setattr(SandboxProvider, "refund", refuse)
    response = await client.post(
        f"{API}/orders/{order_id}/refund", json={"reason": "x"}, headers=s["h"]["owner"]
    )
    assert response.status_code == 409
    assert response.json()["code"] == "refund_failed"
    assert {t.status for t in await _tickets(db, order_id)} == {TicketStatus.valid}
    order = await db.get(Order, UUID(order_id))
    await db.refresh(order)
    assert order.status == OrderStatus.paid


async def test_refund_policy_is_stored_and_shown_publicly(client, scene):
    s = scene
    until = (datetime.now(UTC) + timedelta(days=3)).replace(microsecond=0)
    url = f"{API}/events/{s['event_id']}/refund-policy"
    body = {"summary": "Full refund up to 3 days before.", "refundable_until": until.isoformat()}
    assert (await client.put(url, json=body, headers=s["h"]["stranger"])).status_code == 403
    saved = await client.put(url, json=body, headers=s["h"]["owner"])
    assert saved.status_code == 200, saved.text
    assert saved.json()["refund_policy"]["summary"] == body["summary"]

    public = await client.get(f"{API}/events/{s['event_id']}")
    assert public.status_code == 200
    policy = public.json()["refund_policy"]
    assert policy["summary"] == body["summary"]
    assert datetime.fromisoformat(policy["refundable_until"]) == until


async def test_event_cancellation_settles_every_order(client, db, scene):
    s = scene
    paid_id = await _paid_order(client, s)
    free = await client.post(f"{API}/orders", json=_order(s, s["free_id"]), headers=s["h"]["buyer"])
    pending = await client.post(
        f"{API}/orders", json=_order(s, s["paid_id"]), headers=s["h"]["buyer"]
    )
    # Checked-in tickets are refunded too when the whole event is cancelled.
    ticket = (await _tickets(db, paid_id))[0]
    ticket.status = TicketStatus.checked_in
    await db.commit()

    cancelled = await client.post(f"{API}/events/{s['event_id']}/cancel", headers=s["h"]["owner"])
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["paid_sales_status"] == "disabled"

    statuses = {
        oid: (await client.get(f"{API}/orders/{oid}", headers=s["h"]["buyer"])).json()["status"]
        for oid in (paid_id, free.json()["id"], pending.json()["id"])
    }
    assert statuses == {
        paid_id: "refunded",
        free.json()["id"]: "cancelled",
        pending.json()["id"]: "cancelled",
    }
    assert {t.status for t in await _tickets(db, paid_id)} == {TicketStatus.refunded}
    assert {t.status for t in await _tickets(db, free.json()["id"])} == {TicketStatus.cancelled}
    refunds = await client.get(f"{API}/events/{s['event_id']}/refunds", headers=s["h"]["owner"])
    assert refunds.json()["total"] == 1
    assert refunds.json()["items"][0]["reason"] == "Event cancelled by the organizer"
    await db.refresh(s["paid"])
    assert s["paid"].qty_reserved == 0
