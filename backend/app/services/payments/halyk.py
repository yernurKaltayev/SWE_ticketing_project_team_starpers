"""`HalykProvider`: Halyk ePay's public TEST environment [P6].

A real bank sandbox: the buyer pays on Halyk's own payment form with a published test card, so
no card data ever reaches BiletFlow and no real money moves (`is_simulated=True`).

Flow:
1. `create_intent` picks a unique digits-only invoice ID (our `provider_ref`).
2. `payment_session` gets a per-invoice OAuth token. The browser passes the returned object to
   `halyk.pay()` from Halyk's payform script. The client secret never leaves the backend.
3. Halyk's postLink callback is not signed, so it is never trusted. Every settlement is decided by
   `fetch_status` (Halyk's check-status API, server to server).

Halyk docs: https://epayment.kz/en-US/docs. The docs list no statusName values; the ones below
were seen on the live test environment (2026-11-27): CHARGE, CANCEL, CANCEL_OLD, REFUND, REJECT.
AUTH is the documented pre-charge state. Anything unknown counts as "not final yet", so an
unexpected value never issues tickets.

| Halyk                                      | BiletFlow `PaymentStatus` |
| ------------------------------------------ | ------------------------- |
| resultCode 100 + statusName AUTH / CHARGE  | succeeded                 |
| resultCode 100 + REJECT / FAILED / CANCEL… | failed                    |
| resultCode 101 (reject)                    | failed                    |
| 102 (invoice not found yet), 103, 107, ... | pending (retry later)     |
"""

from __future__ import annotations

import secrets
import time
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.money import Money
from app.core.security import sign_value
from app.models.payment import PaymentProviderName, PaymentStatus
from app.services.payments.base import (
    PaymentIntent,
    PaymentProvider,
    ProviderEvent,
    ProviderRefund,
    ProviderUnavailableError,
)
from app.services.payments.sandbox import InvalidWebhookError

# One scope string covers the widget, check-status and operations (as in Halyk's examples).
SCOPE = "webapi usermanagement email_send verification statement statistics payment"
SECRET_HASH_PURPOSE = "halyk-secret-hash"  # noqa: S105 - an HMAC purpose label

RESULT_SUCCESS = "100"
RESULT_REJECT = "101"
SUCCEEDED_STATUSES = frozenset({"AUTH", "CHARGE"})
FAILED_STATUSES = frozenset({"REJECT", "FAILED", "FAIL", "CANCEL", "CANCEL_OLD", "REFUND"})
# Halyk: 125 Latin or 62 Cyrillic characters at most.
DESCRIPTION_MAX = 60
LANGUAGES = {"en": "eng", "ru": "rus", "kk": "kaz"}


def new_invoice_id() -> str:
    """15 digits. Halyk wants 6-15 digits and uniqueness in the last 6 (the test merchant is
    shared with every other team), so the last 9 digits are random and the first 6 come from the
    clock. The DB unique constraint on (provider, provider_ref) still catches a collision."""
    head = int(time.time()) % 10**6
    return f"{head:06d}{secrets.randbelow(10**9):09d}"


def to_major(amount: Money) -> int | float:
    """Halyk amounts are tenge, not tiyn: 250_000 tiyn -> 2500."""
    major: Decimal = amount.major
    return int(major) if major == major.to_integral_value() else float(major)


def secret_hash_for(invoice_id: str) -> str:
    """Per-invoice value Halyk echoes back to postLink. Informational only; we still pull status."""
    return sign_value(invoice_id, purpose=SECRET_HASH_PURPOSE)[:32]


def map_status(body: dict[str, Any]) -> tuple[PaymentStatus, str | None]:
    code = str(body.get("resultCode", ""))
    transaction = body.get("transaction") or {}
    name = str(transaction.get("statusName") or "").upper()
    if code == RESULT_SUCCESS and name in SUCCEEDED_STATUSES:
        return PaymentStatus.succeeded, None
    if code == RESULT_SUCCESS and name in FAILED_STATUSES:
        reason = transaction.get("reason") or name.lower()
        return PaymentStatus.failed, f"halyk:{reason}"
    if code == RESULT_REJECT:
        return PaymentStatus.failed, f"halyk:{body.get('resultMessage') or 'reject'}"
    return PaymentStatus.pending, None


class HalykProvider(PaymentProvider):
    name = PaymentProviderName.halyk
    supports_pull = True

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        # Tests pass an httpx.MockTransport; production uses the default network transport.
        self.transport = transport
        self._token: tuple[str, float] | None = None

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=get_settings().halyk_timeout_seconds, transport=self.transport
        )

    async def _request_token(self, extra: dict[str, str] | None = None) -> dict[str, Any]:
        settings = get_settings()
        if settings.halyk_client_secret is None:
            raise ProviderUnavailableError("Halyk is not configured")
        form = {
            "grant_type": "client_credentials",
            "scope": SCOPE,
            "client_id": settings.halyk_client_id,
            "client_secret": settings.halyk_client_secret.get_secret_value(),
            "terminal": settings.halyk_terminal_id,
            **(extra or {}),
        }
        try:
            async with self._client() as client:
                response = await client.post(settings.halyk_oauth_url, data=form)
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"token request failed: {type(exc).__name__}") from exc
        if response.status_code != 200:
            raise ProviderUnavailableError(f"token request returned {response.status_code}")
        try:
            token = response.json()
        except ValueError as exc:
            raise ProviderUnavailableError("token response is not JSON") from exc
        if not isinstance(token, dict) or not token.get("access_token"):
            raise ProviderUnavailableError("token response has no access_token")
        return token

    async def _api_token(self) -> str:
        """A general (not invoice-bound) token for check-status and operations, reused until
        shortly before it expires."""
        now = time.monotonic()
        if self._token is not None and self._token[1] > now:
            return self._token[0]
        token = await self._request_token()
        ttl = int(token.get("expires_in") or 0)
        access = str(token["access_token"])
        self._token = (access, now + max(ttl - 60, 0))
        return access

    async def _api(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        headers = {"Authorization": f"Bearer {await self._api_token()}"}
        url = f"{get_settings().halyk_api_url.rstrip('/')}{path}"
        try:
            async with self._client() as client:
                response = await client.request(method, url, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"{path} failed: {type(exc).__name__}") from exc
        if response.status_code == 401:
            self._token = None  # expired early: the next call fetches a new one
        return response

    async def create_intent(
        self, amount: Money, *, reference: str, metadata: dict[str, Any] | None = None
    ) -> PaymentIntent:
        if amount.amount <= 0:
            raise ValueError("a payment amount must be positive")
        if amount.currency != "KZT":
            raise ValueError("the Halyk test terminal takes KZT only")
        # Nothing is sent to Halyk yet: the invoice is registered when the buyer opens the form.
        return PaymentIntent(provider_ref=new_invoice_id(), checkout_url="", is_simulated=True)

    async def payment_session(
        self,
        *,
        invoice_id: str,
        amount: Money,
        description: str,
        locale: str,
        back_link: str,
        failure_back_link: str,
        post_link: str,
    ) -> dict[str, Any]:
        """The object the browser passes to `halyk.pay()`. Contains a short-lived, invoice-bound
        token, never the client secret."""
        major = to_major(amount)
        secret_hash = secret_hash_for(invoice_id)
        token = await self._request_token(
            {
                "invoiceID": invoice_id,
                "amount": str(major),
                "currency": amount.currency,
                "postLink": post_link,
                "failurePostLink": post_link,
                "secret_hash": secret_hash,
            }
        )
        settings = get_settings()
        return {
            "invoiceId": invoice_id,
            "backLink": back_link,
            "failureBackLink": failure_back_link,
            "postLink": post_link,
            "failurePostLink": post_link,
            "language": LANGUAGES.get(locale, "rus"),
            "description": description[:DESCRIPTION_MAX],
            "terminal": settings.halyk_terminal_id,
            "amount": major,
            "currency": amount.currency,
            "auth": {
                "access_token": token["access_token"],
                "expires_in": token.get("expires_in"),
                "refresh_token": token.get("refresh_token", ""),
                "scope": token.get("scope", SCOPE),
                "token_type": token.get("token_type", "Bearer"),
            },
        }

    async def _check_status(self, invoice_id: str) -> dict[str, Any]:
        response = await self._api("GET", f"/check-status/payment/transaction/{invoice_id}")
        try:
            body = response.json()
        except ValueError as exc:
            raise ProviderUnavailableError(f"check-status returned {response.status_code}") from exc
        if not isinstance(body, dict):
            raise ProviderUnavailableError("check-status body is not an object")
        return body

    async def fetch_status(self, provider_ref: str) -> ProviderEvent:
        body = await self._check_status(provider_ref)
        status, reason = map_status(body)
        transaction = body.get("transaction") or {}
        return ProviderEvent(
            provider_ref=provider_ref,
            status=status,
            raw={
                "source": "halyk.check-status",
                "resultCode": body.get("resultCode"),
                "resultMessage": body.get("resultMessage"),
                # The transaction ID (not the invoice ID) is what refund/cancel take.
                "transaction_id": transaction.get("id"),
                "statusName": transaction.get("statusName"),
                "amount": transaction.get("amount"),
                "currency": transaction.get("currency"),
                "cardMask": transaction.get("cardMask"),
                "reference": transaction.get("reference"),
                "simulated": True,
            },
            failure_reason=reason,
        )

    def parse_webhook(self, payload: bytes, signature: str) -> ProviderEvent:
        raise InvalidWebhookError("Halyk callbacks are unsigned: settle via fetch_status")

    async def refund(self, provider_ref: str, amount: Money) -> ProviderRefund:
        """Give the money back. An AUTH (two-stage, not yet charged) payment is cancelled
        instead, because Halyk refunds only charged transactions."""
        if amount.amount <= 0:
            return ProviderRefund(provider_ref="", succeeded=False, failure_reason="invalid_amount")
        try:
            body = await self._check_status(provider_ref)
            transaction = body.get("transaction") or {}
            transaction_id = transaction.get("id")
            state = str(transaction.get("statusName") or "").upper()
            if not transaction_id:
                return ProviderRefund("", False, "halyk_transaction_not_found")
            if state == "AUTH":
                response = await self._api("POST", f"/operation/{transaction_id}/cancel")
            elif state == "CHARGE":
                response = await self._api(
                    "POST",
                    f"/operation/{transaction_id}/refund",
                    params={"amount": str(to_major(amount))},
                )
            elif state in {"CANCEL", "CANCEL_OLD", "REFUND"}:
                return ProviderRefund(f"halyk_{state.lower()}_{transaction_id}", True)
            else:
                label = state.lower() or "unknown"
                return ProviderRefund("", False, f"halyk_not_refundable_{label}")
        except ProviderUnavailableError as exc:
            return ProviderRefund("", False, f"halyk_unavailable:{exc}")
        if response.status_code != 200:
            return ProviderRefund("", False, f"halyk_http_{response.status_code}")
        action = "cancel" if state == "AUTH" else "refund"
        return ProviderRefund(f"halyk_{action}_{transaction_id}", True)
