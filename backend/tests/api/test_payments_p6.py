"""P6: simulated payments, webhook idempotency, paid-sales activation, payout accounts/payouts."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.models.event import EventStatus, PaidSalesStatus
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentStatus, Payout, PayoutAccount, PayoutStatus
from app.models.setting import PlatformSetting
from app.models.ticket import Ticket
from app.models.ticket_type import TicketType
from app.services.payments.activation import suspend_paid_sales
from app.services.payments.payout import run_payout_schedule
from app.services.payments.sandbox import SIGNATURE_HEADER, SandboxProvider
from tests.factories import auth_header, make_event, make_organizer, make_ticket_type, make_user

VALID_IBAN = "KZ86125KZT5004100100"
API = "/api/v1"


@pytest.fixture
async def scene(db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, status=EventStatus.published, capacity=10)
    paid = await make_ticket_type(
        db, event, name="Paid", price_amount=250_000, is_free=False, quantity_total=5
    )
    buyer = await make_user(db)
    stranger = await make_user(db)
    await db.commit()
    # Plain values: a request that rolls back expires ORM objects shared with the test.
    return {
        "event_id": event.id,
        "paid_id": paid.id,
        "h": {
            name: auth_header(user)
            for name, user in {"owner": owner, "buyer": buyer, "stranger": stranger}.items()
        },
        "owner": owner,
        "profile": profile,
        "event": event,
        "paid": paid,
        "buyer": buyer,
        "stranger": stranger,
    }


def _order_payload(event_id, ticket_type_id, quantity=1):
    return {
        "event_id": str(event_id),
        "items": [{"ticket_type_id": str(ticket_type_id), "quantity": quantity}],
        "attendees": [
            {"full_name": f"Guest {i}", "email": f"g{i}@example.com"} for i in range(quantity)
        ],
    }


async def _activate(client, s) -> None:
    owner = s["h"]["owner"]
    account = await client.post(
        f"{API}/organizers/me/payout-accounts",
        json={"bank_name": "Demo Bank", "iban": VALID_IBAN, "holder_name": "Org"},
        headers=owner,
    )
    assert account.status_code == 201, account.text
    url = f"{API}/events/{s['event_id']}/activation"
    assert (await client.post(f"{url}/verify-identity", headers=owner)).status_code == 200
    patched = await client.patch(
        url, json={"payout_account_id": account.json()["id"], "accept_terms": True}, headers=owner
    )
    assert patched.status_code == 200, patched.text
    fee = await client.post(f"{url}/pay", headers=owner)
    assert fee.status_code == 201, fee.text
    done = await client.post(
        f"{API}/payments/{fee.json()['id']}/simulate", json={"outcome": "succeeded"}, headers=owner
    )
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "succeeded"


async def _pending_order(client, s, quantity=1) -> str:
    response = await client.post(
        f"{API}/orders",
        json=_order_payload(s["event_id"], s["paid_id"], quantity),
        headers=s["h"]["buyer"],
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "pending"
    return response.json()["id"]


async def _start_payment(client, s, order_id) -> dict:
    response = await client.post(f"{API}/orders/{order_id}/payments", headers=s["h"]["buyer"])
    assert response.status_code == 201, response.text
    return response.json()


async def _ticket_count(db, order_id) -> int:
    from app.models.order import OrderItem

    return (
        await db.scalar(
            select(func.count(Ticket.id))
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(OrderItem.order_id == UUID(order_id))
        )
        or 0
    )


async def test_activation_checklist_enables_only_this_event(client, db, scene):
    s = scene
    other = await make_event(db, s["profile"], status=EventStatus.published)
    await db.commit()
    owner = s["h"]["owner"]

    blocked = await client.post(
        f"{API}/orders",
        json=_order_payload(s["event_id"], s["paid_id"]),
        headers=s["h"]["buyer"],
    )
    assert blocked.status_code == 409

    checklist = await client.get(f"{API}/events/{s['event_id']}/activation", headers=owner)
    assert checklist.status_code == 200, checklist.text
    body = checklist.json()
    assert body["status"] == "incomplete" and body["is_simulated"] is True
    assert set(body["missing_steps"]) == {
        "identity_verification",
        "payout_account",
        "activation_fee",
        "terms",
    }

    await _activate(client, s)

    final = (await client.get(f"{API}/events/{s['event_id']}/activation", headers=owner)).json()
    assert final["status"] == "active" and final["missing_steps"] == []
    assert final["activation_fee_paid"] is True
    await db.refresh(s["event"])
    await db.refresh(other)
    assert s["event"].paid_sales_status == PaidSalesStatus.active
    assert other.paid_sales_status == PaidSalesStatus.disabled

    again = await client.post(f"{API}/events/{s['event_id']}/activation/pay", headers=owner)
    assert again.status_code == 409
    assert again.json()["code"] == "activation_fee_already_paid"


async def test_activation_fee_uses_platform_setting(client, db, scene):
    db.add(PlatformSetting(key="activation_fee_amount", value=777_700))
    await db.commit()
    owner = scene["h"]["owner"]
    url = f"{API}/events/{scene['event_id']}/activation/pay"
    first = await client.post(url, headers=owner)
    assert first.status_code == 201
    assert first.json()["amount"] == 777_700
    assert first.json()["kind"] == "activation_fee"
    assert first.json()["checkout_url"]
    # A retry resumes the open intent instead of opening a second one.
    second = await client.post(url, headers=owner)
    assert second.json()["id"] == first.json()["id"]


async def test_activation_requires_event_access(client, scene):
    url = f"{API}/events/{scene['event_id']}/activation"
    response = await client.get(url, headers=scene["h"]["stranger"])
    assert response.status_code == 403
    response = await client.post(f"{url}/pay", headers=scene["h"]["buyer"])
    assert response.status_code == 403


async def test_paid_checkout_success_issues_tickets_and_fee(client, db, scene):
    s = scene
    await _activate(client, s)
    order_id = await _pending_order(client, s, quantity=2)
    assert await _ticket_count(db, order_id) == 0

    payment = await _start_payment(client, s, order_id)
    assert payment["status"] == "pending"
    assert payment["amount"] == 500_000
    assert payment["fee_amount"] == 15_000  # default 3 %, deducted from the organizer
    assert payment["is_simulated"] is True

    # Starting again resumes the same intent.
    assert (await _start_payment(client, s, order_id))["id"] == payment["id"]

    done = await client.post(
        f"{API}/payments/{payment['id']}/simulate",
        json={"outcome": "succeeded"},
        headers=s["h"]["buyer"],
    )
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "succeeded"
    assert done.json()["checkout_url"] is None

    order = (await client.get(f"{API}/orders/{order_id}", headers=s["h"]["buyer"])).json()
    assert order["status"] == "paid"
    assert order["processing_fee"] == 0  # no fee is added to the buyer's total
    assert len(order["tickets"]) == 2
    await db.refresh(s["paid"])
    assert s["paid"].qty_sold == 2 and s["paid"].qty_reserved == 0

    paid_again = await client.post(f"{API}/orders/{order_id}/payments", headers=s["h"]["buyer"])
    assert paid_again.status_code == 409
    assert paid_again.json()["code"] == "order_already_paid"

    summary = await client.get(f"{API}/events/{s['event_id']}/financials", headers=s["h"]["owner"])
    assert summary.status_code == 200
    assert summary.json() == {
        "gross": 500_000,
        "fees": 15_000,
        "refunds": 0,
        "estimated_payout": 485_000,
        "currency": "KZT",
        "is_simulated": True,
    }
    status = await client.get(f"{API}/payments/{payment['id']}", headers=s["h"]["owner"])
    assert status.status_code == 200
    denied = await client.get(f"{API}/payments/{payment['id']}", headers=s["h"]["stranger"])
    assert denied.status_code == 403


async def test_duplicate_signed_webhook_issues_a_single_ticket_set(client, db, scene):
    s = scene
    await _activate(client, s)
    order_id = await _pending_order(client, s)
    payment = await _start_payment(client, s, order_id)
    row = await db.get(Payment, UUID(payment["id"]))
    assert row is not None
    body, signature = SandboxProvider.build_webhook(row.provider_ref, PaymentStatus.succeeded)

    for _ in range(3):
        response = await client.post(
            f"{API}/payments/webhooks/sandbox",
            content=body,
            headers={SIGNATURE_HEADER: signature, "Content-Type": "application/json"},
        )
        assert response.status_code == 204, response.text

    assert await _ticket_count(db, order_id) == 1
    await db.refresh(s["paid"])
    assert s["paid"].qty_sold == 1


async def test_webhook_rejects_bad_signature_and_unknown_payment(client, scene):
    body, signature = SandboxProvider.build_webhook("sbx_unknown", PaymentStatus.succeeded)
    forged = await client.post(
        f"{API}/payments/webhooks/sandbox", content=body, headers={SIGNATURE_HEADER: "0" * 64}
    )
    assert forged.status_code == 422
    assert forged.json()["code"] == "invalid_webhook"
    tampered = await client.post(
        f"{API}/payments/webhooks/sandbox",
        content=body.replace(b"succeeded", b"failed"),
        headers={SIGNATURE_HEADER: signature},
    )
    assert tampered.status_code == 422
    unknown = await client.post(
        f"{API}/payments/webhooks/sandbox", content=body, headers={SIGNATURE_HEADER: signature}
    )
    assert unknown.status_code == 404
    provider = await client.post(
        f"{API}/payments/webhooks/stripe", content=body, headers={SIGNATURE_HEADER: signature}
    )
    assert provider.status_code == 404


async def test_failed_payment_releases_inventory_and_issues_nothing(client, db, scene):
    s = scene
    await _activate(client, s)
    order_id = await _pending_order(client, s)
    payment = await _start_payment(client, s, order_id)

    failed = await client.post(
        f"{API}/payments/{payment['id']}/simulate",
        json={"outcome": "failed", "failure_reason": "insufficient_funds"},
        headers=s["h"]["buyer"],
    )
    assert failed.status_code == 200, failed.text
    assert failed.json()["status"] == "failed"
    assert failed.json()["failure_reason"] == "insufficient_funds"

    order = await db.get(Order, UUID(order_id))
    await db.refresh(order)
    assert order.status == OrderStatus.failed
    assert await _ticket_count(db, order_id) == 0
    await db.refresh(s["paid"])
    assert s["paid"].qty_reserved == 0 and s["paid"].qty_sold == 0

    # A late success for the same payment changes nothing.
    late = await client.post(
        f"{API}/payments/{payment['id']}/simulate",
        json={"outcome": "succeeded"},
        headers=s["h"]["buyer"],
    )
    assert late.json()["status"] == "failed"
    assert await _ticket_count(db, order_id) == 0


async def test_success_after_reservation_expiry_is_voided(client, db, scene):
    s = scene
    await _activate(client, s)
    order_id = await _pending_order(client, s)
    payment = await _start_payment(client, s, order_id)
    order = await db.get(Order, UUID(order_id))
    order.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()

    done = await client.post(
        f"{API}/payments/{payment['id']}/simulate",
        json={"outcome": "succeeded"},
        headers=s["h"]["buyer"],
    )
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "cancelled"
    assert done.json()["failure_reason"] == "order_no_longer_payable_voided"
    await db.refresh(order)
    assert order.status == OrderStatus.expired
    assert await _ticket_count(db, order_id) == 0
    await db.refresh(s["paid"])
    assert s["paid"].qty_reserved == 0 and s["paid"].qty_sold == 0


async def test_only_buyer_can_pay_or_simulate(client, scene):
    s = scene
    await _activate(client, s)
    order_id = await _pending_order(client, s)
    denied = await client.post(f"{API}/orders/{order_id}/payments", headers=s["h"]["stranger"])
    assert denied.status_code == 403
    payment = await _start_payment(client, s, order_id)
    sim = await client.post(
        f"{API}/payments/{payment['id']}/simulate",
        json={"outcome": "succeeded"},
        headers=s["h"]["owner"],
    )
    assert sim.status_code == 403


async def test_suspended_event_cannot_start_payment(client, db, scene):
    s = scene
    await _activate(client, s)
    order_id = await _pending_order(client, s)
    await suspend_paid_sales(db, s["event"], "admin review")
    await db.commit()
    response = await client.post(f"{API}/orders/{order_id}/payments", headers=s["h"]["buyer"])
    assert response.status_code == 409
    assert response.json()["code"] == "paid_sales_inactive"


async def test_payout_accounts_are_masked_validated_and_owned(client, db, scene):
    s = scene
    owner = s["h"]["owner"]
    bad = await client.post(
        f"{API}/organizers/me/payout-accounts",
        json={"bank_name": "B", "iban": "KZ00125KZT5004100100", "holder_name": "X"},
        headers=owner,
    )
    assert bad.status_code == 422
    created = await client.post(
        f"{API}/organizers/me/payout-accounts",
        json={"bank_name": "B", "iban": "kz86 125K ZT50 0410 0100", "holder_name": "X"},
        headers=owner,
    )
    assert created.status_code == 201, created.text
    account = created.json()
    assert account["iban_last4"] == "0100"
    assert account["is_verified"] is True and account["is_simulated"] is True
    assert VALID_IBAN not in created.text
    stored = await db.get(PayoutAccount, UUID(account["id"]))
    assert VALID_IBAN not in stored.iban_encrypted

    listed = await client.get(f"{API}/organizers/me/payout-accounts", headers=owner)
    assert [a["id"] for a in listed.json()] == [account["id"]]

    other_owner, _ = await make_organizer(db)
    await db.commit()
    foreign = await client.delete(
        f"{API}/organizers/me/payout-accounts/{account['id']}", headers=auth_header(other_owner)
    )
    assert foreign.status_code == 404
    attendee = await client.get(f"{API}/organizers/me/payout-accounts", headers=s["h"]["buyer"])
    assert attendee.status_code == 403

    linked = await client.patch(
        f"{API}/events/{s['event_id']}/activation",
        json={"payout_account_id": account["id"]},
        headers=owner,
    )
    assert linked.status_code == 200
    in_use = await client.delete(
        f"{API}/organizers/me/payout-accounts/{account['id']}", headers=owner
    )
    assert in_use.status_code == 409

    spare = await client.post(
        f"{API}/organizers/me/payout-accounts",
        json={"bank_name": "C", "iban": VALID_IBAN, "holder_name": "Y"},
        headers=owner,
    )
    edited = await client.patch(
        f"{API}/organizers/me/payout-accounts/{spare.json()['id']}",
        json={"bank_name": "C2", "iban": VALID_IBAN, "holder_name": "Y2"},
        headers=owner,
    )
    assert edited.status_code == 200 and edited.json()["holder_name"] == "Y2"
    removed = await client.delete(
        f"{API}/organizers/me/payout-accounts/{spare.json()['id']}", headers=owner
    )
    assert removed.status_code == 204


async def test_payout_schedule_after_event_ends(client, db, scene):
    s = scene
    await _activate(client, s)
    order_id = await _pending_order(client, s)
    payment = await _start_payment(client, s, order_id)
    await client.post(
        f"{API}/payments/{payment['id']}/simulate",
        json={"outcome": "succeeded"},
        headers=s["h"]["buyer"],
    )
    await db.refresh(s["event"])
    ends_at = s["event"].ends_at

    assert await run_payout_schedule(db, now=ends_at - timedelta(minutes=1)) == 0
    assert await run_payout_schedule(db, now=ends_at + timedelta(hours=1)) == 1
    payout = await db.scalar(select(Payout).where(Payout.event_id == s["event_id"]))
    assert payout.status == PayoutStatus.scheduled
    assert payout.gross == 250_000 and payout.fees == 7_500 and payout.net == 242_500
    # Idempotent: no second payout for the same event.
    assert await run_payout_schedule(db, now=ends_at + timedelta(hours=2)) == 0

    assert await run_payout_schedule(db, now=ends_at + timedelta(days=4)) == 1
    await db.refresh(payout)
    assert payout.status == PayoutStatus.paid and payout.paid_at is not None

    page = await client.get(f"{API}/organizers/me/payouts", headers=s["h"]["owner"])
    assert page.status_code == 200
    assert page.json()["total"] == 1
    assert page.json()["items"][0]["status"] == "paid"


async def test_free_only_event_cannot_complete_activation(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    await make_ticket_type(db, event, is_free=True)
    await db.commit()
    body = (
        await client.get(f"{API}/events/{event.id}/activation", headers=auth_header(owner))
    ).json()
    assert "paid_ticket_type" in body["missing_steps"]
    assert await db.scalar(select(func.count(TicketType.id))) >= 1
