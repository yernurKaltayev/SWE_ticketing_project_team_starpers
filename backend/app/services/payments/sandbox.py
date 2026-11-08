"""`SandboxProvider`: an internal, clearly labelled payment simulation [P6].

No money moves and no card data is ever accepted. The "provider" signs its own webhooks with an
HMAC derived from TICKET_SIGNING_SECRET (purpose-separated, see `app.core.security.sign_value`),
so the webhook endpoint verifies sandbox callbacks exactly as it would a real provider's.
"""

import json
import secrets
from typing import Any

from app.core.config import get_settings
from app.core.money import Money
from app.core.security import sign_value, verify_signature
from app.models.payment import PaymentProviderName, PaymentStatus
from app.services.payments.base import (
    PaymentIntent,
    PaymentProvider,
    ProviderEvent,
    ProviderRefund,
)

WEBHOOK_PURPOSE = "sandbox-webhook"
SIGNATURE_HEADER = "X-Sandbox-Signature"
_FINAL_STATUSES = {PaymentStatus.succeeded, PaymentStatus.failed}


def checkout_url_for(provider_ref: str) -> str:
    """The web app's simulated checkout page. It shows DEMO/SIMULATED and never asks for a card."""
    return f"{get_settings().web_base_url.rstrip('/')}/checkout/simulated/{provider_ref}"


class InvalidWebhookError(Exception):
    """The callback signature or body is not valid."""


class SandboxProvider(PaymentProvider):
    name = PaymentProviderName.sandbox

    async def create_intent(
        self, amount: Money, *, reference: str, metadata: dict[str, Any] | None = None
    ) -> PaymentIntent:
        if amount.amount <= 0:
            raise ValueError("a payment amount must be positive")
        provider_ref = f"sbx_{secrets.token_hex(16)}"
        return PaymentIntent(
            provider_ref=provider_ref,
            checkout_url=checkout_url_for(provider_ref),
            is_simulated=True,
        )

    @staticmethod
    def build_webhook(
        provider_ref: str, status: PaymentStatus, failure_reason: str | None = None
    ) -> tuple[bytes, str]:
        """What the sandbox "sends": a JSON body and its signature header value."""
        if status not in _FINAL_STATUSES:
            raise ValueError("a sandbox webhook reports succeeded or failed")
        body = json.dumps(
            {
                "provider_ref": provider_ref,
                "status": status.value,
                "failure_reason": failure_reason,
                "simulated": True,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return body, sign_value(body.decode(), purpose=WEBHOOK_PURPOSE)

    def parse_webhook(self, payload: bytes, signature: str) -> ProviderEvent:
        try:
            text = payload.decode()
        except UnicodeDecodeError as exc:
            raise InvalidWebhookError("body is not UTF-8") from exc
        if not signature or not verify_signature(text, signature, purpose=WEBHOOK_PURPOSE):
            raise InvalidWebhookError("bad signature")
        try:
            data = json.loads(text)
            status = PaymentStatus(data["status"])
            provider_ref = data["provider_ref"]
        except (ValueError, KeyError, TypeError) as exc:
            raise InvalidWebhookError("malformed body") from exc
        if status not in _FINAL_STATUSES or not isinstance(provider_ref, str):
            raise InvalidWebhookError("unsupported status")
        reason = data.get("failure_reason")
        return ProviderEvent(
            provider_ref=provider_ref,
            status=status,
            raw=data,
            failure_reason=reason if isinstance(reason, str) else None,
        )

    async def refund(self, provider_ref: str, amount: Money) -> ProviderRefund:
        if amount.amount <= 0:
            return ProviderRefund(provider_ref="", succeeded=False, failure_reason="invalid_amount")
        return ProviderRefund(provider_ref=f"sbx_rf_{secrets.token_hex(12)}", succeeded=True)
