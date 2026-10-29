import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
import pytest_asyncio

from app.models.token import TokenPurpose
from app.models.user import User, UserRole
from tests.test_auth import auth_header, issue_token


async def account(client, session_factory, email, role="attendee", verified=True):
    payload = {
        "email": email,
        "password": "report3-test-password",
        "full_name": email.split("@")[0],
    }
    response = await client.post(
        "/api/v1/auth/register",
        json={**payload, "role": "organizer" if role == "organizer" else "attendee"},
    )
    assert response.status_code == 201, response.text
    user_id = response.json()["id"]
    if role in {"event_admin", "platform_admin"}:
        async with session_factory() as db:
            user = await db.get(User, UUID(user_id))
            user.role = UserRole(role)
            await db.commit()
    if verified:
        token = await issue_token(session_factory, email, TokenPurpose.email_verification)
        assert (
            await client.post("/api/v1/auth/verify-email", json={"token": token})
        ).status_code == 200
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": payload["password"]}
    )
    assert response.status_code == 200
    return {"id": user_id, "headers": auth_header(response.json())}


@pytest_asyncio.fixture
async def owner(client, session_factory):
    return await account(client, session_factory, "owner@example.kz", "organizer")


@pytest_asyncio.fixture
async def buyer(client, session_factory):
    return await account(client, session_factory, "buyer@example.kz")


def event_input(price=0, quantity=10, **overrides):
    start = datetime.now(UTC) + timedelta(days=14)
    return {
        "title": "Report 3 meetup",
        "summary": "A university event",
        "description": "Demo",
        "category": "tech",
        "city": "Astana",
        "venueName": "University Hall",
        "venueAddress": "Campus",
        "startsAt": start.isoformat(),
        "endsAt": (start + timedelta(hours=3)).isoformat(),
        "visibility": "public",
        "posterHue": 45,
        "ticketTypes": [
            {
                "id": "",
                "name": "General admission",
                "description": "",
                "price": price,
                "quantity": quantity,
                "sold": 0,
                "perOrderLimit": 6,
                "hidden": False,
            }
        ],
        **overrides,
    }


async def create(client, owner, **kwargs):
    response = await client.post(
        "/api/v1/events", headers=owner["headers"], json=event_input(**kwargs)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def publish(client, owner, event):
    response = await client.post(f"/api/v1/events/{event['id']}/publish", headers=owner["headers"])
    assert response.status_code == 200, response.text
    return response.json()


async def activate(client, owner, event):
    response = await client.post(
        f"/api/v1/events/{event['id']}/activation",
        headers=owner["headers"],
        json={"payoutIban": "KZ001234567890123456", "termsAccepted": True},
    )
    assert response.status_code == 200, response.text


async def buy(client, buyer, event, quantity=1, outcome="approve", key=None, promo=None):
    return await client.post(
        f"/api/v1/events/{event['id']}/checkout",
        headers=buyer["headers"],
        json={
            "selection": {event["ticketTypes"][0]["id"]: quantity},
            "outcome": outcome,
            "promoCode": promo,
            "idempotencyKey": key or str(uuid4()),
        },
    )


async def test_draft_owner_and_public_visibility(client, owner):
    event = await create(client, owner)
    assert event["status"] == "draft" and event["organizerId"] == owner["id"]
    assert (await client.get("/api/v1/events")).json() == []
    assert (await client.get(f"/api/v1/events/{event['id']}")).status_code == 404
    assert (
        len((await client.get("/api/v1/events?scope=mine", headers=owner["headers"])).json()) == 1
    )
    await publish(client, owner, event)
    assert len((await client.get("/api/v1/events?q=meetup&city=Astana&category=tech")).json()) == 1
    assert (await client.get("/api/v1/events?city=Almaty")).json() == []


@pytest.mark.parametrize(
    "visibility,listed,direct",
    [("public", True, 200), ("unlisted", False, 200), ("private", False, 404)],
)
async def test_visibility_modes(client, owner, visibility, listed, direct):
    event = await create(client, owner, visibility=visibility)
    await publish(client, owner, event)
    assert bool((await client.get("/api/v1/events")).json()) == listed
    assert (await client.get(f"/api/v1/events/{event['id']}")).status_code == direct


async def test_permissions_cover_all_owner_data(client, session_factory, owner, buyer):
    event = await create(client, owner)
    other = await account(client, session_factory, "other@example.kz", "organizer")
    assert (
        await client.post("/api/v1/events", json=event_input(), headers=buyer["headers"])
    ).status_code == 403
    assert (await client.post("/api/v1/events", json=event_input())).status_code == 401
    base = f"/api/v1/events/{event['id']}"
    assert (await client.put(base, json=event_input(), headers=other["headers"])).status_code == 403
    for suffix in ["/orders", "/tickets", "/promos", "/audit"]:
        assert (await client.get(base + suffix, headers=other["headers"])).status_code == 403
    assert (
        await client.get("/api/v1/events?scope=all", headers=owner["headers"])
    ).status_code == 403
    assert (await client.get("/api/v1/analytics", headers=buyer["headers"])).status_code == 403


@pytest.mark.parametrize(
    "change",
    [
        {"endsAt": "2020-01-01T00:00:00Z"},
        {"startsAt": "2026-11-01T19:00:00"},
        {"title": "   "},
        {"paidSalesActive": True},
        {"ticketTypes": [{"name": "Bad", "quantity": 3, "price": -1}]},
        {"ticketTypes": [{"name": "Bad", "quantity": 3.5, "price": 0}]},
    ],
)
async def test_event_input_validation(client, owner, change):
    response = await client.post(
        "/api/v1/events", headers=owner["headers"], json=event_input(**change)
    )
    assert response.status_code == 422, response.text


async def test_server_owns_inventory_and_preserves_issued_types(client, owner, buyer):
    body = event_input()
    body["ticketTypes"][0]["sold"] = 999
    created = await client.post("/api/v1/events", headers=owner["headers"], json=body)
    event = created.json()
    assert event["ticketTypes"][0]["sold"] == 0
    await publish(client, owner, event)
    assert (await buy(client, buyer, event, quantity=2)).status_code == 200
    event = (await client.get(f"/api/v1/events/{event['id']}")).json()
    ticket_type = {**event["ticketTypes"][0], "sold": 0}
    response = await client.put(
        f"/api/v1/events/{event['id']}/ticket-types", headers=owner["headers"], json=[ticket_type]
    )
    assert response.status_code == 200 and response.json()[0]["sold"] == 2
    ticket_type["quantity"] = 1
    assert (
        await client.put(
            f"/api/v1/events/{event['id']}/ticket-types",
            headers=owner["headers"],
            json=[ticket_type],
        )
    ).status_code == 409
    replacement = {"name": "Replacement", "quantity": 10, "price": 0}
    assert (
        await client.put(
            f"/api/v1/events/{event['id']}/ticket-types",
            headers=owner["headers"],
            json=[replacement],
        )
    ).status_code == 409
    ticket_type["quantity"] = 10
    ticket_type["hidden"] = True
    assert (
        await client.put(
            f"/api/v1/events/{event['id']}/ticket-types",
            headers=owner["headers"],
            json=[ticket_type],
        )
    ).status_code == 200
    assert (await buy(client, buyer, event)).status_code == 422


async def test_paid_activation_and_email_gates(client, session_factory, owner, buyer):
    event = await create(client, owner, price=2000)
    await publish(client, owner, event)
    assert (await buy(client, buyer, event)).status_code == 409
    response = await client.post(
        f"/api/v1/events/{event['id']}/activation",
        headers=owner["headers"],
        json={"payoutIban": "KZ001234567890123456", "termsAccepted": False},
    )
    assert response.status_code == 422
    await activate(client, owner, event)
    unverified = await account(client, session_factory, "unverified@example.kz", verified=False)
    assert (await buy(client, unverified, event)).status_code == 403
    assert (await buy(client, buyer, event)).status_code == 200


async def test_declined_payment_issues_nothing_and_free_registration_works(client, owner, buyer):
    event = await create(client, owner, price=1000)
    await publish(client, owner, event)
    await activate(client, owner, event)
    result = await buy(client, buyer, event, outcome="decline")
    assert result.status_code == 200, result.text
    assert result.json()["order"]["status"] == "failed" and result.json()["tickets"] == []
    current = (await client.get(f"/api/v1/events/{event['id']}")).json()
    assert current["ticketTypes"][0]["sold"] == 0
    free = await publish(client, owner, await create(client, owner))
    assert len((await buy(client, buyer, free, outcome="decline")).json()["tickets"]) == 1


async def test_idempotency_prevents_duplicate_issuance(client, owner, buyer):
    event = await publish(client, owner, await create(client, owner))
    key = str(uuid4())
    first = await buy(client, buyer, event, key=key)
    second = await buy(client, buyer, event, key=key)
    assert first.status_code == second.status_code == 200
    assert first.json()["order"]["id"] == second.json()["order"]["id"]
    assert first.json()["tickets"][0]["id"] == second.json()["tickets"][0]["id"]
    assert (await buy(client, buyer, event, quantity=2, key=key)).status_code == 409
    current = (await client.get(f"/api/v1/events/{event['id']}")).json()
    assert current["ticketTypes"][0]["sold"] == 1


async def test_inventory_and_per_order_limits(client, owner, buyer):
    event = await publish(client, owner, await create(client, owner, quantity=1))
    assert (await buy(client, buyer, event, quantity=7)).status_code == 422
    assert (await buy(client, buyer, event)).status_code == 200
    assert (await buy(client, buyer, event)).status_code == 409
    orders = (await client.get("/api/v1/orders/me", headers=buyer["headers"])).json()
    assert len(orders) == 1 and len(orders[0]["tickets"]) == 1


async def test_promo_prices_are_authoritative_and_redemptions_limited(client, owner, buyer):
    event = await publish(client, owner, await create(client, owner, price=2500))
    await activate(client, owner, event)
    promo = {
        "code": "STUDENT20",
        "kind": "percent",
        "value": 20,
        "maxRedemptions": 1,
        "campaignName": "University posters",
    }
    response = await client.post(
        f"/api/v1/events/{event['id']}/promos", headers=owner["headers"], json=promo
    )
    assert response.status_code == 201, response.text
    quote = await client.post(
        f"/api/v1/events/{event['id']}/quote",
        json={"selection": {event["ticketTypes"][0]["id"]: 2}, "promoCode": "student20"},
    )
    assert quote.json()["subtotal"] == 5000 and quote.json()["total"] == 4000
    purchase = (await buy(client, buyer, event, quantity=2, promo="STUDENT20")).json()
    assert purchase["order"]["discount"] == 1000 and len(purchase["tickets"]) == 2
    assert (await buy(client, buyer, event, promo="STUDENT20")).status_code == 422
    response = await client.post(
        f"/api/v1/events/{event['id']}/checkout",
        headers=buyer["headers"],
        json={
            "selection": {event["ticketTypes"][0]["id"]: 1},
            "idempotencyKey": str(uuid4()),
            "total": 0,
        },
    )
    assert response.status_code == 422
    stats = (await client.get("/api/v1/analytics", headers=owner["headers"])).json()
    assert stats["net"] == 4000 and stats["sold"] == 2 and stats["campaigns"][0]["redemptions"] == 1


async def test_duplicate_copies_setup_without_transactions(client, owner, buyer):
    event = await publish(client, owner, await create(client, owner, price=1000))
    await activate(client, owner, event)
    assert (await buy(client, buyer, event)).status_code == 200
    duplicate = await client.post(
        f"/api/v1/events/{event['id']}/duplicate", headers=owner["headers"]
    )
    assert duplicate.status_code == 201, duplicate.text
    copied = duplicate.json()
    assert copied["status"] == "draft" and copied["paidSalesActive"] is False
    assert copied["ticketTypes"][0]["sold"] == 0
    assert copied["ticketTypes"][0]["id"] != event["ticketTypes"][0]["id"]
    assert (
        await client.get(f"/api/v1/events/{copied['id']}/orders", headers=owner["headers"])
    ).json() == []


async def test_refund_and_cancel_invalidate_tickets_and_restore_inventory(client, owner, buyer):
    event = await publish(client, owner, await create(client, owner))
    order = (await buy(client, buyer, event)).json()
    assert (
        await client.post(f"/api/v1/orders/{order['order']['id']}/refund", headers=owner["headers"])
    ).status_code == 404
    assert (
        await client.post(f"/api/v1/orders/{order['order']['id']}/refund", headers=buyer["headers"])
    ).status_code == 200
    ticket = (
        await client.get(f"/api/v1/tickets/{order['tickets'][0]['id']}", headers=buyer["headers"])
    ).json()
    assert ticket["ticket"]["status"] == "refunded"
    assert (
        await client.post(f"/api/v1/orders/{order['order']['id']}/refund", headers=buyer["headers"])
    ).status_code == 409
    again = (await buy(client, buyer, event)).json()
    cancelled = await client.post(f"/api/v1/events/{event['id']}/cancel", headers=owner["headers"])
    assert cancelled.status_code == 200 and cancelled.json()["ticketTypes"][0]["sold"] == 0
    ticket = (
        await client.get(f"/api/v1/tickets/{again['tickets'][0]['id']}", headers=buyer["headers"])
    ).json()
    assert ticket["ticket"]["status"] == "cancelled"
    assert (await buy(client, buyer, event)).status_code == 409
    assert (
        await client.post(f"/api/v1/events/{event['id']}/publish", headers=owner["headers"])
    ).status_code == 409


async def test_registration_and_ticket_sale_windows(client, owner, buyer):
    event = await create(
        client, owner, registrationStartsAt=(datetime.now(UTC) + timedelta(days=1)).isoformat()
    )
    await publish(client, owner, event)
    assert (await buy(client, buyer, event)).status_code == 409
    body = event_input()
    body["ticketTypes"][0]["saleEndsAt"] = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    event = (await client.post("/api/v1/events", headers=owner["headers"], json=body)).json()
    await publish(client, owner, event)
    assert (await buy(client, buyer, event)).status_code == 409


async def test_assigned_checkin_rejects_campaign_and_duplicate_admission(
    client, session_factory, owner, buyer
):
    event = await publish(client, owner, await create(client, owner))
    staff = await account(client, session_factory, "staff@example.kz", "event_admin")
    other = await account(client, session_factory, "unassigned@example.kz", "event_admin")
    assigned = await client.post(
        f"/api/v1/events/{event['id']}/staff",
        headers=owner["headers"],
        json={"email": "staff@example.kz"},
    )
    assert assigned.status_code == 200, assigned.text
    assert len((await client.get("/api/v1/checkin/events", headers=staff["headers"])).json()) == 1
    assert (await client.get("/api/v1/checkin/events", headers=other["headers"])).json() == []
    order = (await buy(client, buyer, event)).json()
    ticket = order["tickets"][0]
    path = f"/api/v1/checkin/{event['id']}"
    assert (
        await client.post(path, headers=other["headers"], json={"code": ticket["code"]})
    ).status_code == 403
    assert (
        await client.post(
            path,
            headers=staff["headers"],
            json={"code": "https://example.test/events/1?promo=STUDENT20"},
        )
    ).status_code == 400
    assert (
        await client.post(path, headers=staff["headers"], json={"code": ticket["code"]})
    ).json()["status"] == "checked_in"
    assert (
        await client.post(path, headers=staff["headers"], json={"code": ticket["code"]})
    ).status_code == 409
    assert (
        await client.post(f"/api/v1/orders/{order['order']['id']}/refund", headers=buyer["headers"])
    ).status_code == 409
    assert (
        await client.delete(path + f"/{ticket['id']}", headers=staff["headers"])
    ).status_code == 200
    assert (
        await client.post(f"/api/v1/orders/{order['order']['id']}/refund", headers=buyer["headers"])
    ).status_code == 200
    assert (
        await client.post(path, headers=staff["headers"], json={"code": ticket["code"]})
    ).status_code == 409
    await client.delete(
        f"/api/v1/events/{event['id']}/staff/{staff['id']}", headers=owner["headers"]
    )
    assert (
        await client.post(path, headers=staff["headers"], json={"code": ticket["code"]})
    ).status_code == 403


async def test_suspension_stops_sales_and_is_admin_only(client, session_factory, owner, buyer):
    event = await publish(client, owner, await create(client, owner))
    path = f"/api/v1/events/{event['id']}/suspension"
    assert (
        await client.post(path, headers=owner["headers"], json={"suspended": True})
    ).status_code == 403
    admin = await account(client, session_factory, "admin@example.kz", "platform_admin")
    assert (
        await client.post(path, headers=admin["headers"], json={"suspended": True})
    ).status_code == 200
    assert (await buy(client, buyer, event)).status_code == 404
    restored = await client.post(path, headers=admin["headers"], json={"suspended": False})
    assert restored.json()["status"] == "draft"


@pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="requires separate PostgreSQL connections",
)
async def test_concurrent_buyers_cannot_oversell(client, session_factory, owner, buyer):
    other = await account(client, session_factory, "secondbuyer@example.kz")
    event = await publish(client, owner, await create(client, owner, quantity=1))
    results = await asyncio.gather(buy(client, buyer, event), buy(client, other, event))
    assert sorted(r.status_code for r in results) == [200, 409]
    current = (await client.get(f"/api/v1/events/{event['id']}")).json()
    assert current["ticketTypes"][0]["sold"] == 1
