"""P6: buyers' ticket payments through Halyk ePay's TEST environment (fake Halyk, no network).

Halyk callbacks are unsigned, so every settlement must come from check-status.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from pydantic import SecretStr

from app.core.config import get_settings
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentProviderName, PaymentStatus
from app.services.payments import get_provider
from app.services.payments.payment_service import sync_pending_payments
from tests.api import test_payments_p6
from tests.api.test_payments_p6 import (
    API,
    _pending_order,
    _start_payment,
    _ticket_count,
)
from tests.halyk_fake import TEST_SECRET, FakeHalyk

scene = test_payments_p6.scene  # reuse the P6 fixture


@pytest.fixture
def halyk(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "payment_provider", "halyk")
    monkeypatch.setattr(settings, "halyk_client_secret", SecretStr(TEST_SECRET))
    fake = FakeHalyk()
    provider = get_provider(PaymentProviderName.halyk)
    monkeypatch.setattr(provider, "transport", fake.transport())
    monkeypatch.setattr(provider, "_token", None)
    return fake


async def _halyk_payment(client, s) -> dict:
    order_id = await _pending_order(client, s)
    payment = await _start_payment(client, s, order_id)
    payment["order_id"] = order_id
    return payment


async def _invoice(db, payment) -> str:
    row = await db.get(Payment, UUID(payment["id"]))
    return row.provider_ref


async def test_start_payment_uses_halyk_and_links_the_checkout_page(client, db, scene, halyk):
    payment = await _halyk_payment(client, scene)
    assert payment["provider"] == "halyk"
    assert payment["status"] == "pending" and payment["is_simulated"] is True
    assert payment["checkout_url"].endswith(f"/checkout/pay/{payment['id']}")
    assert (await _invoice(db, payment)).isdigit()


async def test_session_is_for_the_buyer_only_and_never_leaks_the_secret(client, scene, halyk):
    s = scene
    payment = await _halyk_payment(client, s)
    url = f"{API}/payments/{payment['id']}/halyk-session"

    stranger = await client.post(url, headers=s["h"]["stranger"])
    assert stranger.status_code == 403

    ok = await client.post(f"{url}?locale=en&client=app", headers=s["h"]["buyer"])
    assert ok.status_code == 200, ok.text
    body = ok.json()
    obj = body["payment_object"]
    assert obj["amount"] == 2500 and obj["currency"] == "KZT"  # 250 000 tiyn
    assert obj["language"] == "eng"
    assert obj["backLink"].endswith(f"/checkout/pay/{payment['id']}/return?app=1")
    assert obj["failureBackLink"].endswith("?app=1&failed=1")
    assert obj["postLink"].endswith("/api/v1/payments/webhooks/halyk")
    assert obj["auth"]["access_token"].startswith("tok-")
    assert body["script_url"] == get_settings().halyk_payform_js_url
    assert TEST_SECRET not in ok.text
    assert halyk.token_forms[-1]["invoiceID"] == obj["invoiceId"]


async def test_sync_success_issues_one_ticket_set(client, db, scene, halyk):
    s = scene
    payment = await _halyk_payment(client, s)
    url = f"{API}/payments/{payment['id']}/sync"

    still = await client.post(url, headers=s["h"]["buyer"])
    assert still.status_code == 200 and still.json()["status"] == "pending"

    halyk.set(await _invoice(db, payment), "AUTH")
    for _ in range(3):  # repeated return-page loads and callbacks
        done = await client.post(url, headers=s["h"]["buyer"])
        assert done.status_code == 200, done.text
        assert done.json()["status"] == "succeeded"
        assert done.json()["checkout_url"] is None
    callback = await client.post(
        f"{API}/payments/webhooks/halyk", json={"invoiceId": await _invoice(db, payment)}
    )
    assert callback.status_code == 204

    order = await db.get(Order, UUID(payment["order_id"]))
    await db.refresh(order)
    assert order.status == OrderStatus.paid
    assert await _ticket_count(db, payment["order_id"]) == 1
    row = await db.get(Payment, UUID(payment["id"]))
    await db.refresh(row)
    assert row.raw_event["transaction_id"] == "tx-1"


async def test_forged_callback_cannot_mark_a_payment_paid(client, db, scene, halyk):
    payment = await _halyk_payment(client, scene)
    invoice = await _invoice(db, payment)
    # Halyk has no record of a payment, whatever the callback body claims.
    forged = await client.post(
        f"{API}/payments/webhooks/halyk",
        json={"invoiceId": invoice, "code": "ok", "reason": "success", "amount": 2500},
    )
    assert forged.status_code == 204
    row = await db.get(Payment, UUID(payment["id"]))
    await db.refresh(row)
    assert row.status == PaymentStatus.pending
    assert await _ticket_count(db, payment["order_id"]) == 0


async def test_callback_settles_via_check_status(client, db, scene, halyk):
    payment = await _halyk_payment(client, scene)
    invoice = await _invoice(db, payment)
    halyk.set(invoice, "CHARGE")
    # Form-encoded body and a foreign invoice (shared test merchant) are both fine.
    other = await client.post(f"{API}/payments/webhooks/halyk", json={"invoiceId": "777"})
    assert other.status_code == 204
    done = await client.post(
        f"{API}/payments/webhooks/halyk",
        content=f"invoiceId={invoice}&code=ok",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert done.status_code == 204
    assert await _ticket_count(db, payment["order_id"]) == 1


async def test_declined_payment_fails_and_releases_inventory(client, db, scene, halyk):
    s = scene
    payment = await _halyk_payment(client, s)
    halyk.set(await _invoice(db, payment), "", result_code="101")
    done = await client.post(f"{API}/payments/{payment['id']}/sync", headers=s["h"]["buyer"])
    assert done.json()["status"] == "failed"
    assert done.json()["failure_reason"].startswith("halyk:")
    order = await db.get(Order, UUID(payment["order_id"]))
    await db.refresh(order)
    assert order.status == OrderStatus.failed
    await db.refresh(s["paid"])
    assert s["paid"].qty_reserved == 0 and s["paid"].qty_sold == 0


async def test_late_success_after_expiry_is_voided_at_halyk(client, db, scene, halyk):
    s = scene
    payment = await _halyk_payment(client, s)
    order = await db.get(Order, UUID(payment["order_id"]))
    order.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    halyk.set(await _invoice(db, payment), "AUTH", transaction_id="tx-late")

    done = await client.post(f"{API}/payments/{payment['id']}/sync", headers=s["h"]["buyer"])
    assert done.json()["status"] == "cancelled"
    assert done.json()["failure_reason"] == "order_no_longer_payable_voided"
    assert halyk.operations() == ["/operation/tx-late/cancel"]
    assert await _ticket_count(db, payment["order_id"]) == 0


async def test_simulate_is_refused_for_halyk_payments(client, scene, halyk):
    payment = await _halyk_payment(client, scene)
    response = await client.post(
        f"{API}/payments/{payment['id']}/simulate",
        json={"outcome": "succeeded"},
        headers=scene["h"]["buyer"],
    )
    assert response.status_code == 409


async def test_halyk_down_answers_503_and_changes_nothing(client, db, scene, halyk):
    payment = await _halyk_payment(client, scene)
    halyk.fail_network = True
    response = await client.post(
        f"{API}/payments/{payment['id']}/sync", headers=scene["h"]["buyer"]
    )
    assert response.status_code == 503
    assert response.json()["code"] == "payment_provider_unavailable"


async def test_worker_sweep_settles_and_abandons(client, db, scene, halyk):
    first = await _halyk_payment(client, scene)
    halyk.set(await _invoice(db, first), "CHARGE")
    assert await sync_pending_payments(db) == 1
    assert await _ticket_count(db, first["order_id"]) == 1

    # A buyer who never paid: once the order has expired and enough time passed, give up.
    second = await _halyk_payment(client, scene)
    order = await db.get(Order, UUID(second["order_id"]))
    order.status = OrderStatus.expired
    await db.commit()
    assert await sync_pending_payments(db, now=datetime.now(UTC) + timedelta(hours=4)) == 1
    row = await db.get(Payment, UUID(second["id"]))
    await db.refresh(row)
    assert row.status == PaymentStatus.cancelled and row.failure_reason == "checkout_abandoned"


async def test_refund_of_a_halyk_payment_goes_to_halyk(client, db, scene, halyk):
    s = scene
    payment = await _halyk_payment(client, s)
    halyk.set(await _invoice(db, payment), "CHARGE", transaction_id="tx-r")
    await client.post(f"{API}/payments/{payment['id']}/sync", headers=s["h"]["buyer"])

    refund = await client.post(
        f"{API}/orders/{payment['order_id']}/refund",
        json={"reason": "test"},
        headers=s["h"]["owner"],
    )
    assert refund.status_code in (200, 201), refund.text
    assert halyk.operations() == ["/operation/tx-r/refund"]


async def test_config_reports_the_ticket_provider(client, monkeypatch, halyk):
    response = await client.get(f"{API}/payments/config")
    assert response.json() == {"ticket_provider": "halyk", "is_simulated": True}
    monkeypatch.setattr(get_settings(), "payment_provider", "sandbox")
    assert (await client.get(f"{API}/payments/config")).json()["ticket_provider"] == "sandbox"
