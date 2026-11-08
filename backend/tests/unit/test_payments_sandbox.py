"""P6 unit tests: sandbox webhook signing and field encryption."""

import pytest

from app.core.crypto import decrypt_field, encrypt_field
from app.core.money import Money
from app.models.payment import PaymentStatus
from app.schemas.payment import PayoutAccountIn
from app.services.payments.sandbox import InvalidWebhookError, SandboxProvider


def test_signed_webhook_round_trips():
    body, signature = SandboxProvider.build_webhook("sbx_1", PaymentStatus.failed, "declined")
    event = SandboxProvider().parse_webhook(body, signature)
    assert event.provider_ref == "sbx_1"
    assert event.status == PaymentStatus.failed
    assert event.failure_reason == "declined"
    assert event.raw["simulated"] is True


@pytest.mark.parametrize(
    "mutate",
    [
        lambda body, sig: (body, ""),
        lambda body, sig: (body, "a" * 64),
        lambda body, sig: (body + b" ", sig),
        lambda body, sig: (b"\xff", sig),
    ],
)
def test_webhook_rejects_tampering(mutate):
    body, signature = SandboxProvider.build_webhook("sbx_1", PaymentStatus.succeeded)
    with pytest.raises(InvalidWebhookError):
        SandboxProvider().parse_webhook(*mutate(body, signature))


def test_webhook_only_reports_final_statuses():
    with pytest.raises(ValueError):
        SandboxProvider.build_webhook("sbx_1", PaymentStatus.pending)


async def test_intent_is_simulated_and_unique():
    provider = SandboxProvider()
    first = await provider.create_intent(Money(100), reference="r")
    second = await provider.create_intent(Money(100), reference="r")
    assert first.is_simulated and first.provider_ref != second.provider_ref
    assert first.checkout_url.endswith(first.provider_ref)
    with pytest.raises(ValueError):
        await provider.create_intent(Money(0), reference="r")


def test_field_encryption_round_trips_and_hides_plaintext():
    token = encrypt_field("KZ86125KZT5004100100")
    assert "KZ86125KZT5004100100" not in token
    assert decrypt_field(token) == "KZ86125KZT5004100100"
    with pytest.raises(ValueError):
        decrypt_field("not-a-token")


def test_iban_checksum_and_normalisation():
    data = PayoutAccountIn(bank_name="B", iban="kz86 125k zt50 0410 0100", holder_name="H")
    assert data.iban == "KZ86125KZT5004100100"
    with pytest.raises(ValueError):
        PayoutAccountIn(bank_name="B", iban="KZ87125KZT5004100100", holder_name="H")
