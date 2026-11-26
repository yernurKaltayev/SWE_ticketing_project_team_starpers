"""P6 unit tests: the Halyk ePay test-environment provider against a fake Halyk server."""

import pytest
from pydantic import SecretStr

from app.core.config import get_settings
from app.core.money import Money
from app.models.payment import PaymentStatus
from app.services.payments.halyk import (
    HalykProvider,
    map_status,
    new_invoice_id,
    to_major,
)
from app.services.payments.sandbox import InvalidWebhookError
from tests.halyk_fake import TEST_SECRET, FakeHalyk


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setattr(get_settings(), "halyk_client_secret", SecretStr(TEST_SECRET))
    return FakeHalyk()


@pytest.fixture
def provider(fake):
    return HalykProvider(transport=fake.transport())


def test_invoice_ids_are_digits_in_range_and_unique():
    ids = {new_invoice_id() for _ in range(500)}
    assert len(ids) == 500
    assert all(i.isdigit() and len(i) == 15 for i in ids)
    # Halyk asks for uniqueness in the last 6 digits: they are random, not the clock.
    assert len({i[-6:] for i in ids}) > 490


def test_amounts_go_to_halyk_in_tenge():
    assert to_major(Money(250_000)) == 2500
    assert to_major(Money(250_050)) == 2500.5


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"resultCode": "100", "transaction": {"statusName": "AUTH"}}, PaymentStatus.succeeded),
        ({"resultCode": "100", "transaction": {"statusName": "CHARGE"}}, PaymentStatus.succeeded),
        ({"resultCode": "100", "transaction": {"statusName": "REJECT"}}, PaymentStatus.failed),
        ({"resultCode": "101", "transaction": None}, PaymentStatus.failed),
        ({"resultCode": "102", "transaction": None}, PaymentStatus.pending),
        ({"resultCode": "107"}, PaymentStatus.pending),
        # An unknown status never issues tickets.
        (
            {"resultCode": "100", "transaction": {"statusName": "SOMETHING_NEW"}},
            PaymentStatus.pending,
        ),
        ({}, PaymentStatus.pending),
    ],
)
def test_status_mapping(body, expected):
    assert map_status(body)[0] == expected


async def test_intent_is_local_and_simulated(provider, fake):
    intent = await provider.create_intent(Money(250_000), reference="x")
    assert intent.is_simulated is True and intent.provider_ref.isdigit()
    assert fake.requests == []  # nothing reaches Halyk until the buyer opens the form


async def test_intent_rejects_zero_amount(provider):
    with pytest.raises(ValueError):
        await provider.create_intent(Money(0), reference="x")


async def test_payment_session_binds_token_to_invoice_and_hides_secret(provider, fake):
    session = await provider.payment_session(
        invoice_id="123456789012",
        amount=Money(250_000),
        description="BiletFlow order " + "x" * 200,
        locale="en",
        back_link="https://web/return",
        failure_back_link="https://web/return?failed=1",
        post_link="https://api/payments/webhooks/halyk",
    )
    form = fake.token_forms[-1]
    assert form["invoiceID"] == "123456789012"
    assert form["amount"] == "2500" and form["currency"] == "KZT"
    assert form["terminal"] == get_settings().halyk_terminal_id
    assert form["postLink"] == "https://api/payments/webhooks/halyk"
    assert session["amount"] == 2500 and session["language"] == "eng"
    assert session["auth"]["access_token"].startswith("tok-")
    assert len(session["description"]) <= 60
    assert TEST_SECRET not in repr(session)


async def test_fetch_status_reports_transaction_id(provider, fake):
    fake.set("111111222222", "CHARGE", transaction_id="tx-9")
    event = await provider.fetch_status("111111222222")
    assert event.status == PaymentStatus.succeeded
    assert event.raw["transaction_id"] == "tx-9"
    assert (await provider.fetch_status("999999999999")).status == PaymentStatus.pending


async def test_api_token_is_reused(provider, fake):
    await provider.fetch_status("1")
    await provider.fetch_status("2")
    assert len(fake.token_forms) == 1


async def test_callbacks_are_never_trusted(provider):
    with pytest.raises(InvalidWebhookError):
        provider.parse_webhook(b'{"invoiceId":"1","code":"ok"}', "")


async def test_refund_charged_payment_calls_refund(provider, fake):
    fake.set("1", "CHARGE", transaction_id="tx-1")
    result = await provider.refund("1", Money(250_000))
    assert result.succeeded
    assert fake.operations() == ["/operation/tx-1/refund"]
    refund_request = next(r for r in fake.requests if r.url.path.endswith("/refund"))
    assert refund_request.url.params["amount"] == "2500"


async def test_refund_authorized_payment_cancels_it(provider, fake):
    fake.set("1", "AUTH", transaction_id="tx-2")
    assert (await provider.refund("1", Money(250_000))).succeeded
    assert fake.operations() == ["/operation/tx-2/cancel"]


async def test_refund_failures_are_reported_not_raised(provider, fake):
    assert not (await provider.refund("404404404404", Money(100))).succeeded
    fake.set("1", "CHARGE")
    fake.operation_status = 400
    assert (await provider.refund("1", Money(100))).failure_reason == "halyk_http_400"
    fake.fail_network = True
    failed = await provider.refund("1", Money(100))
    assert not failed.succeeded and failed.failure_reason.startswith("halyk_unavailable")
